/**
 * Decides whether a WebGPU adapter is the reference platform, a different real
 * GPU, or a software rasterizer.
 *
 * Why this is not cosmetic: a software rasterizer can present as a non-fallback
 * adapter, and every frame-time number and golden screenshot taken from one is
 * worthless. Failing loudly is the only thing that stops a driver update or a
 * headless-flag change quietly corrupting the baselines (master spec §11).
 *
 * The master spec says this guard should confirm that `adapter.info` vendor and
 * device identify the RX 6700 XT. Measured on the reference platform
 * 2026-09-12: Chrome returns `device: ""` and `description: ""` -- it reports
 * deliberately coarse identifiers. Vendor plus architecture is the real
 * ceiling, and it still discharges the guard's actual purpose.
 */
export type AdapterInfoLike = {
  readonly vendor: string
  readonly architecture: string
  readonly device: string
  readonly description: string
  readonly isFallbackAdapter?: boolean | undefined
}

export type AdapterVerdict = {
  /** True only for the reference platform. */
  readonly ok: boolean
  /** `fail` is a software rasterizer; `warn` is a real but different GPU. */
  readonly severity: 'ok' | 'warn' | 'fail'
  readonly summary: string
}

const SOFTWARE = /swiftshader|llvmpipe|basic render|microsoft basic|software/i

export function judgeAdapter(info: AdapterInfoLike): AdapterVerdict {
  const haystack = `${info.vendor} ${info.architecture} ${info.device} ${info.description}`
  const seen = `vendor="${info.vendor}" architecture="${info.architecture}"`

  if (info.isFallbackAdapter === true || SOFTWARE.test(haystack)) {
    return {
      ok: false,
      severity: 'fail',
      summary:
        `This is a software rasterizer, not a GPU (${seen}). Frame times and ` +
        `screenshots taken here are meaningless.`,
    }
  }

  const isReference =
    /amd/i.test(info.vendor) && /rdna[ -]?2/i.test(info.architecture)

  return isReference
    ? { ok: true, severity: 'ok', summary: `Reference platform: ${seen}` }
    : {
        ok: false,
        severity: 'warn',
        summary:
          `Real GPU, but not the reference platform (${seen}). Performance ` +
          `figures and screenshots from here are not comparable.`,
      }
}
