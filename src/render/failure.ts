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
  | 'software-adapter'
  | 'device-lost'
  | 'bad-content'
  | 'unknown'

export type FailureMessage = { readonly title: string; readonly detail: string }

export function failureMessage(kind: FailureKind, detail: string): FailureMessage {
  switch (kind) {
    case 'no-webgpu':
      return {
        title: 'WebGPU is not available',
        detail:
          'navigator.gpu is absent. It is exposed only in a secure context, and a ' +
          'plain-HTTP LAN address is not one — reach the dev server through the SSH ' +
          'tunnel at http://localhost:5173 rather than by IP. ' + detail,
      }
    case 'software-adapter':
      return {
        title: 'This is a software rasterizer, not a GPU',
        detail:
          'Rendering would work but every frame-time number and screenshot from it ' +
          'would be meaningless. ' + detail,
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
          'than becoming a NaN in the integrator. Offending field: ' + (detail || '(none reported)'),
      }
    case 'unknown':
      return {
        title: 'Startup failed',
        detail: detail || 'No further detail was captured. Check the browser console.',
      }
  }
}

/** Replaces the page with a failure report. Deliberately plain DOM: this must
 *  work when the renderer is exactly what is broken. */
export function showFailure(root: HTMLElement, kind: FailureKind, detail: string): void {
  const { title, detail: body } = failureMessage(kind, detail)
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
  root.appendChild(wrap)
}
