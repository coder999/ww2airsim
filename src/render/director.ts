import { sceneAt, type SceneEye } from '../sim/scene/camera.js'
import { deleteKey, dropKey, recordPath } from '../sim/scene/keyframes.js'
import { parseScene, type Keyframe, type Scene } from '../sim/scene/schema.js'

export type DirectorState = {
  readonly scene: Scene
  readonly tSeconds: number
  readonly selected: number | null
  readonly playing: boolean
  readonly samples: readonly Keyframe[] | null
}

export type DirectorAction =
  | { readonly kind: 'drop'; readonly eye: SceneEye }
  | { readonly kind: 'delete' }
  | { readonly kind: 'scrub'; readonly tSeconds: number }
  | { readonly kind: 'select'; readonly index: number }
  /** Drag a key along the timeline. `minGapS` keeps it a label's width clear of both neighbors. */
  | { readonly kind: 'move'; readonly index: number; readonly tSeconds: number; readonly minGapS: number }
  | { readonly kind: 'ease' }
  | { readonly kind: 'play' }
  | { readonly kind: 'record'; readonly eye: SceneEye }
  | { readonly kind: 'stop' }
  | { readonly kind: 'advance'; readonly dtS: number; readonly eye?: SceneEye }

export function directorModel(scene: Scene): DirectorState {
  return { scene: structuredClone(scene), tSeconds: 0, selected: null, playing: false, samples: null }
}

function keyAt(t: number, eye: SceneEye): Keyframe {
  return { t, position: [...eye.position], yawDeg: eye.yawDeg, pitchDeg: eye.pitchDeg, ease: 'inOut' }
}

function stopRecording(state: DirectorState): DirectorState {
  if (!state.samples?.length) return { ...state, playing: false, samples: null }
  // Thin to 0.25 s, 3 feet of travel or 1 degree of turn; retain endpoints.
  const keys = recordPath(state.samples, 0.25, 0.9144, 1)
  const first = keys[0]!
  const last = keys[keys.length - 1]!
  const camera = [...state.scene.camera.filter((k) => k.t < first.t || k.t > last.t), ...keys]
    .sort((a, b) => a.t - b.t)
  return {
    ...state, scene: { ...state.scene, camera }, selected: camera.indexOf(last),
    playing: false, samples: null,
  }
}

/** Reducer inputs and prior states are never mutated. */
export function reduceDirector(state: DirectorState, action: DirectorAction): DirectorState {
  const { scene } = state
  if (state.samples !== null && action.kind !== 'advance' && action.kind !== 'stop') return state
  switch (action.kind) {
    case 'drop': {
      const key = keyAt(state.tSeconds, action.eye)
      const camera = dropKey(scene.camera, key)
      return { ...state, scene: { ...scene, camera }, selected: camera.findIndex((k) => k.t === key.t), playing: false }
    }
    case 'delete':
      return state.selected === null ? state : {
        ...state, scene: { ...scene, camera: deleteKey(scene.camera, state.selected) }, selected: null, playing: false,
      }
    case 'scrub': {
      if (!Number.isFinite(action.tSeconds)) return state
      const tSeconds = Math.max(0, Math.min(scene.durationS, action.tSeconds))
      const index = scene.camera.findIndex((k) => Math.abs(k.t - tSeconds) <= 1e-3)
      return { ...state, tSeconds, selected: index < 0 ? null : index, playing: false }
    }
    case 'select': {
      const key = scene.camera[action.index]
      return key ? { ...state, selected: action.index, tSeconds: key.t, playing: false } : state
    }
    case 'move': {
      const key = scene.camera[action.index]
      if (key === undefined || !Number.isFinite(action.tSeconds)) return state
      const prev = scene.camera[action.index - 1]
      const next = scene.camera[action.index + 1]
      const lo = prev === undefined ? 0 : prev.t + action.minGapS
      const hi = next === undefined ? scene.durationS : next.t - action.minGapS
      // A scene too short for the gap leaves no room: the key stays where it is.
      if (lo > hi) return state
      const t = Math.max(lo, Math.min(hi, action.tSeconds))
      if (t === key.t) return state
      const camera = scene.camera.map((k, i): Keyframe => i === action.index ? { ...k, t } : k)
      return { ...state, scene: { ...scene, camera }, selected: action.index, playing: false }
    }
    case 'ease': {
      if (state.selected === null) return state
      const camera = scene.camera.map((k, i): Keyframe => i === state.selected
        ? { ...k, ease: k.ease === 'linear' ? 'inOut' : 'linear' } : k)
      return { ...state, scene: { ...scene, camera }, playing: false }
    }
    case 'play':
      return scene.camera.length === 0 ? state : {
        ...state, playing: !state.playing, tSeconds: state.tSeconds >= scene.durationS ? 0 : state.tSeconds,
      }
    case 'record':
      return state.tSeconds >= scene.durationS ? state : {
        ...state, playing: false, samples: [keyAt(state.tSeconds, action.eye)],
      }
    case 'stop':
      return stopRecording(state)
    case 'advance': {
      if (!Number.isFinite(action.dtS) || action.dtS < 0 || (!state.playing && state.samples === null)) return state
      const tSeconds = Math.min(scene.durationS, state.tSeconds + action.dtS)
      if (state.samples !== null) {
        if (!action.eye) return state
        // A zero-duration tick replaces its sample instead of adding a duplicate.
        const samples = [...state.samples.filter((k) => k.t !== tSeconds), keyAt(tSeconds, action.eye)]
        const next = { ...state, tSeconds, samples }
        return tSeconds >= scene.durationS ? stopRecording(next) : next
      }
      return { ...state, tSeconds, playing: tSeconds < scene.durationS }
    }
  }
}

export function directorEye(state: DirectorState): SceneEye | null {
  return state.scene.camera.length ? sceneAt(state.scene, state.tSeconds) : null
}

export type DirectorSerialization = { readonly ok: true; readonly json: string } | { readonly ok: false; readonly error: string }

export function serializeDirector(state: DirectorState): DirectorSerialization {
  try {
    if (state.samples !== null) return { ok: false, error: 'Stop recording before saving.' }
    return { ok: true, json: JSON.stringify(parseScene(state.scene), null, 2) + '\n' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export type DirectorDeps = {
  scene: Scene
  getFlownEye(): SceneEye
  onEye(eye: SceneEye, tSeconds: number): void
  onPlayingChange?(playing: boolean): void
}

export type DirectorHandle = {
  dispose(): void
  currentScene(): Scene
  advance(dtS: number): void
  /** Scene time now, and what the bar is doing: the shell keeps the world in step with it. */
  time(): number
  mode(): 'edit' | 'preview' | 'record'
}

const CSS = `
[data-director] { position:fixed;left:0;right:0;bottom:0;z-index:21;padding:8px 14px 10px;
  background:rgba(12,14,18,.94);color:#eceff3;font:13px/1.3 ui-monospace,Menlo,monospace; }
[data-director] .director-row { display:flex;flex-wrap:wrap;align-items:center;gap:8px; }
[data-director] button { padding:5px 9px;border:1px solid #596575;border-radius:4px;
  background:#1e242c;color:inherit;font:inherit;cursor:pointer; }
[data-director] button:hover:enabled { background:#344052; }
[data-director] button[aria-pressed="true"] { background:#5d8fd6;color:#0c0e12; }
[data-director] button:disabled { opacity:.45;cursor:default; }
[data-director] :focus-visible { outline:2px solid #aacbff;outline-offset:2px; }
[data-director] .director-help { margin:0 0 6px;color:#aab4c2;font-size:12px; }
[data-director] .director-markers { position:relative;height:26px;margin:0 10px; }
[data-director] .director-key { position:absolute;top:2px;transform:translateX(-50%);padding:0;touch-action:none;
  width:20px;height:22px;border-radius:3px;font-size:10px; }
[data-director] input[type="range"] { display:block;width:100%;margin:4px 0 10px;accent-color:#5d8fd6; }
[data-director] output { font-variant-numeric:tabular-nums; }
[data-director] .director-status { margin-top:8px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:6em;overflow:auto; }
[data-director] .director-status:empty { display:none; }
[data-director] .director-status[data-error] { color:#ffb7ac; }
`

/** The shell owns the Dev-only gate and free camera; advance uses scene seconds. */
export function createDirector(root: HTMLElement, deps: DirectorDeps): DirectorHandle {
  let state = directorModel(deps.scene)
  let disposed = false
  let saving = false
  const doc = root.ownerDocument
  const ui = doc.createElement('section')
  ui.setAttribute('data-director', '')
  ui.setAttribute('data-replay-ui', '')
  ui.setAttribute('aria-label', 'Scene director')
  const style = doc.createElement('style')
  style.textContent = CSS
  ui.appendChild(style)
  const help = doc.createElement('div')
  help.className = 'director-help'
  help.textContent = 'Fly: W/S forward and back, A/D strafe, Q/E down and up, drag to look (the view follows your finger: drag right turns left, drag up turns down). Wheel: 500 ft per notch along the view (scroll up is forward). Drop key stores the view you see.'
  ui.appendChild(help)
  const markers = doc.createElement('div')
  markers.className = 'director-markers'
  ui.appendChild(markers)
  const scrub = doc.createElement('input')
  scrub.type = 'range'
  scrub.min = '0'
  scrub.max = String(state.scene.durationS)
  scrub.step = 'any'
  scrub.setAttribute('aria-label', 'Scene time in seconds')
  ui.appendChild(scrub)
  const row = doc.createElement('div')
  row.className = 'director-row'
  ui.appendChild(row)
  const label = doc.createElement('strong')
  label.textContent = `DIRECTOR · ${state.scene.id}`
  row.appendChild(label)
  const time = doc.createElement('output')
  row.appendChild(time)
  const status = doc.createElement('div')
  status.className = 'director-status'
  status.setAttribute('role', 'status')
  const message = (text: string, error = false): void => {
    if (disposed) return
    status.textContent = text
    status.toggleAttribute('data-error', error)
  }
  const button = (text: string, click: () => void): HTMLButtonElement => {
    const b = doc.createElement('button')
    b.type = 'button'
    b.textContent = text
    b.addEventListener('click', click)
    row.appendChild(b)
    return b
  }
  const emitEye = (): void => {
    const eye = directorEye(state)
    if (eye) deps.onEye(eye, state.tSeconds)
  }
  const dispatch = (action: DirectorAction, preview = false): void => {
    if (disposed) return
    const previous = state
    state = reduceDirector(state, action)
    if (state === previous) return
    if (state.scene !== previous.scene) message('')
    render()
    if (!previous.playing && state.playing) deps.onPlayingChange?.(true)
    if (preview) emitEye()
    if (previous.playing && !state.playing) deps.onPlayingChange?.(false)
  }
  const drop = button('Drop key', () => dispatch({ kind: 'drop', eye: deps.getFlownEye() }))
  const remove = button('Delete key', () => dispatch({ kind: 'delete' }))
  const ease = button('Ease', () => dispatch({ kind: 'ease' }, true))
  ease.title = 'Ease into the selected key; off uses linear motion'
  const play = button('Play preview', () => dispatch({ kind: 'play' }, true))
  const record = button('Record path', () => {
    dispatch(state.samples !== null ? { kind: 'stop' } : { kind: 'record', eye: deps.getFlownEye() })
  })
  const save = button('Save', () => { void saveScene() })
  ui.appendChild(status)
  root.appendChild(ui)
  scrub.addEventListener('input', () => dispatch({ kind: 'scrub', tSeconds: Number(scrub.value) }, true))
  // Focused controls must not also steer the free camera or activate shell shortcuts.
  for (const name of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'click'] as const) {
    ui.addEventListener(name, (event) => event.stopPropagation())
  }

  let drawnKeys: Scene['camera'] | null = null
  function render(): void {
    const recording = state.samples !== null
    const editing = !recording && !state.playing
    const labelKey = (b: HTMLElement, key: Keyframe, index: number): void => {
      b.style.left = `${100 * key.t / state.scene.durationS}%`
      b.setAttribute('aria-label', `Key ${index + 1} at ${key.t.toFixed(3)} seconds`)
      b.title = `Key ${index + 1} · ${key.t.toFixed(3)} s`
    }
    if (drawnKeys !== null && drawnKeys !== state.scene.camera && drawnKeys.length === state.scene.camera.length) {
      // Same keys, new times or easing (a drag): move the markers in place, since replacing them would drop the pointer a drag holds.
      drawnKeys = state.scene.camera
      drawnKeys.forEach((key, index) => labelKey(markers.children[index] as HTMLElement, key, index))
    } else if (drawnKeys !== state.scene.camera) {
      drawnKeys = state.scene.camera
      markers.replaceChildren(...drawnKeys.map((key, index) => {
        const b = doc.createElement('button')
        b.type = 'button'
        b.className = 'director-key'
        b.textContent = String(index + 1)
        labelKey(b, key, index)
        // A press that travels more than a few pixels drags the key along the timeline; a press that does not is a click.
        let drag: { startX: number; moved: boolean } | null = null
        b.addEventListener('pointerdown', (event) => {
          if (b.disabled) return
          drag = { startX: event.clientX, moved: false }
          b.setPointerCapture(event.pointerId)
        })
        b.addEventListener('pointermove', (event) => {
          if (drag === null) return
          if (!drag.moved && Math.abs(event.clientX - drag.startX) < 4) return
          drag.moved = true
          const track = markers.getBoundingClientRect()
          if (track.width <= 0) return
          const t = ((event.clientX - track.left) / track.width) * state.scene.durationS
          // One label's width, in scene seconds, so a key stops against its neighbor's label instead of overlapping it.
          const minGapS = (b.offsetWidth / track.width) * state.scene.durationS
          dispatch({ kind: 'move', index, tSeconds: t, minGapS })
        })
        const end = (event: PointerEvent): void => {
          if (b.hasPointerCapture(event.pointerId)) b.releasePointerCapture(event.pointerId)
          const wasDrag = drag?.moved === true
          drag = null
          if (!wasDrag && event.type === 'pointerup') dispatch({ kind: 'select', index }, true)
        }
        b.addEventListener('pointerup', end)
        b.addEventListener('pointercancel', end)
        // Keyboard activation (Enter/Space) arrives as a click with no pointer; pointer clicks are handled above.
        b.addEventListener('click', (event) => { if (event.detail === 0) dispatch({ kind: 'select', index }, true) })
        return b
      }))
    }
    Array.from(markers.children).forEach((node, index) => {
      const b = node as HTMLButtonElement
      b.disabled = recording
      b.setAttribute('aria-pressed', String(index === state.selected))
    })
    scrub.value = String(state.tSeconds)
    scrub.disabled = recording
    time.textContent = `${state.tSeconds.toFixed(2)} / ${state.scene.durationS.toFixed(2)} s`
    drop.disabled = !editing
    remove.disabled = !editing || state.selected === null
    ease.disabled = !editing || state.selected === null
    ease.setAttribute('aria-pressed', String(state.selected !== null && state.scene.camera[state.selected]?.ease === 'inOut'))
    play.disabled = recording || state.scene.camera.length === 0
    play.textContent = state.playing ? 'Pause preview' : 'Play preview'
    play.setAttribute('aria-pressed', String(state.playing))
    record.disabled = !recording && state.tSeconds >= state.scene.durationS
    record.textContent = recording ? 'Stop recording' : 'Record path'
    record.setAttribute('aria-pressed', String(recording))
    save.disabled = recording || saving
  }

  async function saveScene(): Promise<void> {
    if (disposed || saving) return
    const result = serializeDirector(state)
    if (!result.ok) { message(result.error, true); return }
    message('Saving…')
    saving = true
    render()
    const failures: string[] = []
    try {
      const url = URL.createObjectURL(new Blob([result.json], { type: 'application/json' }))
      const link = doc.createElement('a')
      try {
        link.href = url
        link.download = `${state.scene.id}.json`
        link.hidden = true
        ui.appendChild(link)
        link.click()
      } finally {
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch (error) {
      failures.push(`Download failed: ${String(error)}`)
    }
    try {
      if (!doc.defaultView?.navigator.clipboard) throw new Error('Clipboard is unavailable')
      await doc.defaultView.navigator.clipboard.writeText(result.json)
    } catch (error) {
      failures.push(`Clipboard failed: ${String(error)}`)
    }
    saving = false
    if (disposed) return
    render()
    message(failures.length ? failures.join('\n') : 'Download started; JSON copied to clipboard.', failures.length > 0)
  }

  render()
  return {
    dispose() {
      if (disposed) return
      disposed = true
      ui.remove()
      if (state.playing) deps.onPlayingChange?.(false)
    },
    currentScene: () => structuredClone(state.scene),
    time: () => state.tSeconds,
    mode: () => state.samples !== null ? 'record' : state.playing ? 'preview' : 'edit',
    advance(dtS) {
      if (disposed || (!state.playing && state.samples === null)) return
      const preview = state.playing
      const action: DirectorAction = state.samples === null
        ? { kind: 'advance', dtS } : { kind: 'advance', dtS, eye: deps.getFlownEye() }
      dispatch(action, preview)
    },
  }
}
