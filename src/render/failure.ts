/**
 * Visible, explanatory failure states.
 *
 * The day-0 spike taught this expensively: the loop to the reference platform
 * is long -- nexus is headless, so a browser means walking to another machine
 * -- and a page that fails silently costs a whole round trip to diagnose. Every
 * failure therefore says what happened AND what to do about it. Never a blank
 * canvas.
 */
export type FailureKind =
  | 'no-webgpu'
  | 'no-adapter'
  | 'software-adapter'
  | 'device-lost'
  | 'bad-content'
  | 'unknown'

export type FailureMessage = { readonly title: string; readonly detail: string }

export type RecoveryGuide = {
  readonly intro: string
  readonly steps: readonly string[]
  readonly advanced: readonly string[]
}

export function failureMessage(kind: FailureKind, detail: string): FailureMessage {
  switch (kind) {
    case 'no-webgpu':
      return {
        title: 'The browser cannot use WebGPU',
        detail:
          'The WebGPU entry point is absent. This does not mean the computer has no GPU; ' +
          'the browser did not expose WebGPU to this page. WebGPU also requires a secure ' +
          'HTTPS or localhost origin. ' + detail,
      }
    case 'no-adapter':
      return {
        title: 'No usable graphics adapter was exposed',
        detail:
          'WebGPU is present, but the browser returned no adapter. The computer may still ' +
          'have a GPU; graphics acceleration, browser policy, a driver or the browser GPU ' +
          'process can prevent it from being exposed. ' + detail,
      }
    case 'software-adapter':
      return {
        title: 'Hardware graphics acceleration is not active',
        detail:
          'The browser exposed a software renderer rather than a hardware adapter. ' + detail,
      }
    case 'device-lost':
      return {
        title: 'The GPU device was lost',
        detail:
          'Usually a driver reset (Windows TDR) after a long or hung GPU operation. ' +
          'Reload to recreate the device. ' + detail,
      }
    case 'bad-content':
      return {
        title: 'Aircraft content failed validation',
        detail:
          'Content is schema-validated at load so a malformed value fails here rather ' +
          'than becoming a NaN in the integrator. ' +
          // Not always a field: this kind also carries a 404 from the fetch and a
          // JSON parse error, and labelling those "Offending field:" was a false
          // statement rendered to the operator (review 2026-09-13). The label is
          // now applied only when the detail looks like zod's `path: message`.
          (detail
            ? /^[A-Za-z_$][\w$.[\]]*: /.test(detail)
              ? 'Offending field: ' + detail
              : detail
            : '(none reported)'),
      }
    case 'unknown':
      return {
        title: 'Startup failed',
        detail: detail || 'No further detail was captured. Check the browser console.',
      }
  }
}

export function recoveryGuide(kind: FailureKind, userAgent: string, platform: string): RecoveryGuide | null {
  if (kind !== 'no-webgpu' && kind !== 'no-adapter' && kind !== 'software-adapter') return null
  const edge = /Edg\//.test(userAgent)
  const browser = edge ? 'Edge' : 'Chrome'
  const scheme = edge ? 'edge' : 'chrome'
  const windows = /Win/i.test(platform) || /Windows/i.test(userAgent)
  const steps = [
    `Update ${browser}, fully quit every ${browser} window, then reopen it.`,
    `Open ${scheme}://settings/system and turn on “Use graphics acceleration when available”, then relaunch ${browser}.`,
    `Open ${scheme}://gpu in a new tab. WebGPU should say “Hardware accelerated”; save that page if you need support.`,
    'Install the current graphics driver from the computer or GPU manufacturer, then restart the computer.',
  ]
  if (windows) {
    steps.push(
      `Windows with more than one GPU: Settings → System → Display → Graphics → add ${browser} → Options → High performance, then fully restart ${browser}.`,
    )
  }
  steps.push(`If ${browser} says the setting is managed, open ${scheme}://policy and contact the organization that manages this device.`)
  return {
    intro: 'Try these in order, then return here and choose Try again.',
    steps,
    advanced: [
      `${scheme}://flags/#enable-unsafe-webgpu can bypass an unsupported-platform or adapter blocklist check.`,
      `${scheme}://flags/#ignore-gpu-blocklist can override the browser GPU blocklist.`,
      'Flags are temporary diagnostic switches and can reduce stability or security. Change one at a time and restore Default if it does not help.',
    ],
  }
}

/** Replaces the page with a failure report. Deliberately plain DOM: this must
 *  work when the renderer is exactly what is broken. */
export function showFailure(root: HTMLElement, kind: FailureKind, detail: string): void {
  const { title, detail: body } = failureMessage(kind, detail)
  const guide = recoveryGuide(kind, navigator.userAgent, navigator.platform)
  root.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.style.cssText =
    'position:fixed;inset:0;padding:2rem;background:#14171c;color:#dfe3e8;' +
    'font:14px/1.6 ui-monospace,Menlo,Consolas,monospace;overflow:auto'
  const h = document.createElement('h1')
  h.style.cssText = 'font-size:1.1rem;margin:0 0 .75rem;color:#f2686f'
  h.textContent = title
  const p = document.createElement('p')
  p.style.cssText = 'margin:0;max-width:70ch;white-space:pre-wrap'
  p.textContent = body
  wrap.append(h, p)
  if (guide !== null) {
    const intro = document.createElement('p')
    intro.style.cssText = 'margin:1rem 0 .5rem;max-width:70ch'
    intro.textContent = guide.intro
    const list = document.createElement('ol')
    list.style.cssText = 'margin:.5rem 0 1rem;padding-left:1.5rem;max-width:78ch'
    for (const step of guide.steps) {
      const item = document.createElement('li')
      item.style.margin = '.4rem 0'
      item.textContent = step
      list.appendChild(item)
    }
    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;gap:.75rem;flex-wrap:wrap;margin:1rem 0'
    const retry = document.createElement('button')
    retry.textContent = 'Try again'
    retry.addEventListener('click', () => window.location.reload())
    const copy = document.createElement('button')
    copy.textContent = 'Copy diagnostics'
    copy.addEventListener('click', () => {
      const report = [
        title, body, `URL: ${location.href}`, `Secure context: ${String(window.isSecureContext)}`,
        `Browser: ${navigator.userAgent}`, `Platform: ${navigator.platform}`,
      ].join('\n')
      const write = navigator.clipboard?.writeText(report)
      if (write === undefined) copy.textContent = 'Clipboard unavailable — select the text above'
      else void write.then(() => { copy.textContent = 'Diagnostics copied' })
        .catch(() => { copy.textContent = 'Could not copy — select the text above' })
    })
    actions.append(retry, copy)
    const advanced = document.createElement('details')
    advanced.style.cssText = 'max-width:78ch;margin-top:.75rem'
    const summary = document.createElement('summary')
    summary.textContent = 'Advanced browser flags'
    const advancedList = document.createElement('ul')
    for (const step of guide.advanced) {
      const item = document.createElement('li')
      item.textContent = step
      advancedList.appendChild(item)
    }
    advanced.append(summary, advancedList)
    wrap.append(intro, list, actions, advanced)
  }
  root.appendChild(wrap)
}
