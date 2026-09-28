/**
 * The replay's screen (instant replay spec §6): a REPLAY label in the top
 * corner and a bottom bar with the timeline, the transport, speed, the six
 * cameras, Spin / Lock and Skip. Split as `pauseBadge.ts` is: a pure model
 * the node-environment suite asserts on, and thin DOM under it.
 *
 * The flight HUD is hidden by ONE class on `root` and ONE injected CSS rule
 * (plan ruling R-5): every child of `root` except the canvas and anything
 * marked `data-replay-ui` is `display:none` while the class is on. The HUD
 * modules have no `setVisible`, and one rule cannot miss one of them. The
 * debrief is hidden by the same rule and reappears by itself when the class
 * comes off.
 */
import { keyLabel } from './legend.js'
import { REPLAY_CAMERA_KEYS } from '../replay/keys.js'
import { REPLAY_CAMERAS, effectiveCamera, type ReplayCameraId, type ReplayCameraState } from '../replay/cameras.js'
import { recordingEndS } from '../replay/recorder.js'
import type { ReplayCommand, ReplayPlayer, ReplaySpeed } from '../replay/player.js'

export const REPLAYING_CLASS = 'replaying'
export const REPLAY_SPEEDS: readonly ReplaySpeed[] = [0.5, 1, 3]

const CAMERA_LABELS: Readonly<Record<ReplayCameraId, string>> = {
  auto: 'Auto', orbit: 'Orbit', flyby: 'Flyby', target: 'Target', cockpit: 'Cockpit', manual: 'Manual',
}

export type ReplayBarCamera = {
  readonly id: ReplayCameraId
  readonly label: string
  /** The key as printed on the keycap: '4'..'9'. */
  readonly key: string
  readonly selected: boolean
  readonly disabled: boolean
}

export type ReplayBarModel = {
  readonly label: 'REPLAY'
  /** 0 at the window's start, 1 at its end; 1 for an empty window. */
  readonly progress: number
  /** Where the event (the last recorded tick, R-11) sits in the window, or null outside it. */
  readonly eventMarker: number | null
  readonly speed: ReplaySpeed
  readonly playing: boolean
  readonly cameras: readonly ReplayBarCamera[]
  readonly showSpin: boolean
  readonly spinOn: boolean
  readonly showLock: boolean
  readonly lockOn: boolean
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

export function replayBarModel(player: ReplayPlayer, camera: ReplayCameraState): ReplayBarModel {
  const span = player.endS - player.startS
  const eventS = recordingEndS(player.recording)
  const effective = effectiveCamera(camera)
  return {
    label: 'REPLAY',
    progress: span > 0 ? clamp01((player.tS - player.startS) / span) : 1,
    eventMarker: eventS < player.startS - 1e-9 || eventS > player.endS + 1e-9
      ? null
      : span > 0 ? clamp01((eventS - player.startS) / span) : 1,
    speed: player.speed,
    playing: player.playing,
    cameras: REPLAY_CAMERAS.map((id) => ({
      id,
      label: CAMERA_LABELS[id],
      key: keyLabel(REPLAY_CAMERA_KEYS[id]),
      selected: camera.selected === id,
      disabled: id === 'target' && camera.targetId === null,
    })),
    showSpin: effective === 'orbit',
    spinOn: camera.spin,
    showLock: effective === 'manual',
    lockOn: camera.manual.lock,
  }
}

export type ReplayBarHandlers = {
  readonly onCommand: (c: ReplayCommand) => void
  /** A click or drag on the timeline, as a fraction of the window; main.ts maps it to a `seek`. */
  readonly onSeek: (fraction: number) => void
  readonly onCamera: (id: ReplayCameraId) => void
  readonly onSpin: () => void
  readonly onLock: () => void
}

export type ReplayBarHandle = {
  show(model: ReplayBarModel): void
  hide(): void
}

let cssInjected = false
/** R-5's one rule, injected once per page. `!important` beats the HUD modules' inline `display`. */
function injectCss(): void {
  if (cssInjected) return
  cssInjected = true
  const style = document.createElement('style')
  style.textContent = `.${REPLAYING_CLASS} > :not(canvas):not([data-replay-ui]) { display: none !important; }`
  document.head.appendChild(style)
}

const BUTTON_CSS =
  'margin:0 2px;padding:4px 9px;border:1px solid #2b3440;border-radius:4px;background:rgba(30,36,44,.9);' +
  'color:#eceff3;font:13px/1.2 ui-monospace,Menlo,monospace;cursor:pointer'

export function createReplayBar(root: HTMLElement, handlers: ReplayBarHandlers): ReplayBarHandle {
  injectCss()
  const ui = document.createElement('div')
  ui.setAttribute('data-replay-ui', '')
  ui.style.display = 'none'
  root.appendChild(ui)

  const label = document.createElement('div')
  label.setAttribute('data-replay-label', '')
  label.style.cssText =
    'position:fixed;left:14px;top:12px;padding:6px 14px;border:1px solid #7a2b2b;border-radius:4px;' +
    'background:rgba(40,10,10,.78);color:#ffdede;font:bold 18px/1.2 ui-monospace,Menlo,monospace;' +
    'letter-spacing:.2em;pointer-events:none;z-index:20'
  ui.appendChild(label)

  const bar = document.createElement('div')
  bar.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;padding:8px 14px 10px;background:rgba(12,14,18,.82);' +
    'color:#eceff3;font:13px/1.2 ui-monospace,Menlo,monospace;z-index:20;user-select:none'
  ui.appendChild(bar)

  // The timeline: click or drag anywhere on it to scrub.
  const track = document.createElement('div')
  track.setAttribute('data-replay-timeline', '')
  track.style.cssText = 'position:relative;height:14px;margin-bottom:8px;border-radius:3px;background:#2b3440;cursor:pointer;touch-action:none'
  const fill = document.createElement('div')
  fill.style.cssText = 'position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:#5d8fd6;pointer-events:none'
  const marker = document.createElement('div')
  marker.style.cssText = 'position:absolute;top:-3px;bottom:-3px;width:3px;margin-left:-1px;background:#ff5a4a;pointer-events:none'
  track.append(fill, marker)
  bar.appendChild(track)
  const fractionAt = (clientX: number): number => {
    const r = track.getBoundingClientRect()
    return r.width > 0 ? clamp01((clientX - r.left) / r.width) : 0
  }
  let scrubbing: number | null = null
  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    scrubbing = e.pointerId
    track.setPointerCapture(e.pointerId)
    handlers.onSeek(fractionAt(e.clientX))
  })
  track.addEventListener('pointermove', (e) => {
    if (e.pointerId === scrubbing) handlers.onSeek(fractionAt(e.clientX))
  })
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    track.addEventListener(type, (e) => { if (e.pointerId === scrubbing) scrubbing = null })
  }

  const row = document.createElement('div')
  row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px'
  bar.appendChild(row)
  const group = (): HTMLDivElement => {
    const g = document.createElement('div')
    g.style.cssText = 'display:flex;align-items:center'
    row.appendChild(g)
    return g
  }
  const button = (parent: HTMLElement, text: string, title: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = text
    b.title = title
    b.style.cssText = BUTTON_CSS
    // Never focusable: while a replay is up the keyboard is the replay's, and
    // a focused button would otherwise also answer Space.
    b.tabIndex = -1
    b.addEventListener('mousedown', (e) => e.preventDefault())
    b.addEventListener('click', onClick)
    parent.appendChild(b)
    return b
  }
  const transport = group()
  button(transport, '◀◀', 'Step back (Left; Shift: one tick)', () => handlers.onCommand({ kind: 'step', seconds: -1 }))
  const play = button(transport, '', 'Play / pause (Space)', () => handlers.onCommand({ kind: 'togglePlay' }))
  button(transport, '▶▶', 'Step forward (Right; Shift: one tick)', () => handlers.onCommand({ kind: 'step', seconds: 1 }))
  const speeds = group()
  const speedButtons = REPLAY_SPEEDS.map((speed, i) =>
    button(speeds, `${speed}×`, `Speed (${i + 1})`, () => handlers.onCommand({ kind: 'speed', speed })))
  const cameras = group()
  const cameraButtons = REPLAY_CAMERAS.map((id) =>
    button(cameras, '', '', () => handlers.onCamera(id)))
  const toggles = group()
  const spin = button(toggles, 'Spin', 'Orbit spin (O)', () => handlers.onSpin())
  const lock = button(toggles, 'Lock', 'Look at the airplane (L)', () => handlers.onLock())
  const end = group()
  end.style.marginLeft = 'auto'
  button(end, 'Skip', 'Leave the replay (Esc)', () => handlers.onCommand({ kind: 'skip' }))

  const highlight = (b: HTMLButtonElement, on: boolean): void => {
    b.style.background = on ? '#5d8fd6' : 'rgba(30,36,44,.9)'
    b.style.color = on ? '#0c0e12' : '#eceff3'
  }

  let lastKey = ''
  return {
    show(model) {
      ui.style.display = 'block'
      // Written every frame by main.ts; touch the DOM only when something changed.
      const key = JSON.stringify(model)
      if (key === lastKey) return
      lastKey = key
      label.textContent = model.label
      fill.style.width = `${(model.progress * 100).toFixed(3)}%`
      marker.style.display = model.eventMarker === null ? 'none' : 'block'
      if (model.eventMarker !== null) marker.style.left = `${(model.eventMarker * 100).toFixed(3)}%`
      play.textContent = model.playing ? '❚❚' : '▶'
      speedButtons.forEach((b, i) => highlight(b, REPLAY_SPEEDS[i] === model.speed))
      model.cameras.forEach((c, i) => {
        const b = cameraButtons[i]!
        b.textContent = `${c.key} ${c.label}`
        b.title = `${c.label} camera (${c.key})`
        b.disabled = c.disabled
        b.style.opacity = c.disabled ? '0.35' : '1'
        b.style.cursor = c.disabled ? 'default' : 'pointer'
        highlight(b, c.selected)
      })
      spin.style.display = model.showSpin ? '' : 'none'
      highlight(spin, model.spinOn)
      lock.style.display = model.showLock ? '' : 'none'
      highlight(lock, model.lockOn)
    },
    hide() {
      ui.style.display = 'none'
      lastKey = ''
      scrubbing = null
    },
  }
}
