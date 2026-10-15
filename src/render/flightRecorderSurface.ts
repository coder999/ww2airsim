import { decodeFlightRecord } from '../flightRecorder/codec.js'
import type { FlightRecordV1 } from '../flightRecorder/schema.js'

export const flightRecorderSurfaceFromQuery = (search: string): boolean =>
  new URLSearchParams(search).get('flightRecorder') === '1'

export type FlightRecorderInspectResult = {
  readonly message: string
  readonly inspectedTick: number
}

/** N2's explicit Dev reproduction surface. It is absent unless the Dev-only
 * `?flightRecorder=1` route is requested, so import never leaks into normal
 * menus or a production build. */
export function createFlightRecorderSurface(
  root: HTMLElement,
  inspect: (record: FlightRecordV1, endTick: number | undefined) => Promise<FlightRecorderInspectResult>,
): void {
  const panel = document.createElement('details')
  panel.dataset.ww2FlightRecorder = ''
  panel.style.cssText =
    'position:fixed;right:12px;top:12px;z-index:30;width:min(430px,calc(100vw - 24px));' +
    'padding:12px;background:#d9c69b;color:#18150f;border:1px solid #806b42;box-shadow:0 6px 20px rgba(0,0,0,.35)'
  const title = document.createElement('summary')
  title.style.cursor = 'pointer'
  title.textContent = 'Dev Flight Recorder Reproduction'
  const copy = document.createElement('p')
  copy.style.margin = '6px 0 10px'
  copy.textContent = 'Choose a .ww2flight record. Leave Inspect through tick blank for the final ten seconds, or enter any tick to inspect the ten seconds ending there.'
  const file = document.createElement('input')
  file.type = 'file'
  file.accept = '.ww2flight,application/gzip'
  file.setAttribute('aria-label', 'Flight record file')
  const tick = document.createElement('input')
  tick.type = 'number'
  tick.min = '1'
  tick.placeholder = 'Inspect through tick (optional)'
  tick.setAttribute('aria-label', 'Inspect through tick')
  tick.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin:8px 0'
  const run = document.createElement('button')
  run.className = 'ink-button'
  run.textContent = 'Verify and inspect'
  const status = document.createElement('p')
  status.setAttribute('role', 'status')
  status.style.margin = '8px 0 0'
  run.addEventListener('click', () => {
    const selected = file.files?.[0]
    if (selected === undefined) { status.textContent = 'Choose a .ww2flight file first.'; return }
    run.disabled = true
    status.textContent = 'Decoding and re-simulating…'
    void (async () => {
      const record = await decodeFlightRecord(new Uint8Array(await selected.arrayBuffer()))
      const requested = tick.value === '' ? undefined : Number(tick.value)
      if (requested !== undefined && (!Number.isInteger(requested) || requested < 1)) throw new Error('Inspect through tick must be a positive whole tick.')
      const result = await inspect(record, requested)
      status.textContent = result.message
    })().catch((error: unknown) => {
      status.textContent = error instanceof Error ? error.message : String(error)
    }).finally(() => { run.disabled = false })
  })
  panel.append(title, copy, file, tick, run, status)
  root.appendChild(panel)
}
