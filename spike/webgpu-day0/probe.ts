/**
 * Day-0 WebGPU probe — THROWAWAY. Delete once its answers are recorded.
 *
 * Settles spec §15's day-0 questions on the reference platform (Windows, RX 6700 XT)
 * rather than assuming them:
 *
 *   1. Is this a genuinely secure context, so `navigator.gpu` is even exposed?
 *   2. Does `adapter.info` identify the RX 6700 XT rather than a software rasterizer?
 *      Both halves matter: a software rasterizer can present as a non-fallback
 *      adapter, and any frame-time budget or golden screenshot taken from one is
 *      worthless. Note the platform removed `GPUAdapter.isFallbackAdapter`, so this
 *      reports whichever of the two spellings actually exists.
 *   3. Does a TSL compute pass using `workgroupArray` + `workgroupBarrier` and a
 *      `StorageTexture` write actually execute? The symbols are present in three
 *      0.186.0, so this confirms behaviour, not existence.
 *   4. If TSL fails, does the raw-WGSL contingency (`wgslFn`) work on the same device?
 *
 * Design constraint: the feedback loop on this probe is hours long, so it must
 * produce a useful report even when something fails. Every check is independently
 * wrapped, results render as they complete, and a thrown error becomes a reported
 * failure rather than a blank page.
 */

type Status = 'pass' | 'fail' | 'warn' | 'info'

type Check = { name: string; status: Status; detail: string }

const checks: Check[] = []
const resultsEl = document.getElementById('results')!
const verdictEl = document.getElementById('verdict')!
const jsonEl = document.getElementById('json') as HTMLTextAreaElement

const MARK: Record<Status, string> = { pass: '✓', fail: '✗', warn: '!', info: '·' }

function render(): void {
  resultsEl.innerHTML = ''
  for (const c of checks) {
    const row = document.createElement('div')
    row.className = `row ${c.status}`
    row.innerHTML =
      `<span class="mark">${MARK[c.status]}</span>` +
      `<span class="name"></span><span class="detail"></span>`
    row.querySelector('.name')!.textContent = c.name
    row.querySelector('.detail')!.textContent = c.detail
    resultsEl.appendChild(row)
  }
}

function add(name: string, status: Status, detail: unknown): void {
  checks.push({
    name,
    status,
    detail: typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2),
  })
  render()
  publish()
}

function errText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`
  return String(e)
}

/** Anything the page learns that is not a pass/fail check. */
const env: Record<string, unknown> = {}
const uncapturedErrors: string[] = []

function publish(): void {
  const report = {
    probe: 'ww2airsim day-0 webgpu',
    generatedAt: new Date().toISOString(),
    env,
    checks,
    uncapturedErrors,
  }
  ;(window as unknown as { __probe: unknown }).__probe = report
  jsonEl.value = JSON.stringify(report, null, 2)
}

document.getElementById('copy')!.addEventListener('click', () => {
  jsonEl.select()
  void navigator.clipboard?.writeText(jsonEl.value)
})

// A module that throws before its checks run would otherwise leave the page on
// "running" with the reason only in DevTools.
window.addEventListener('error', (e) => {
  uncapturedErrors.push(`window.error: ${e.message}`)
  add('uncaught page error', 'fail', e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  uncapturedErrors.push(`unhandledrejection: ${errText(e.reason)}`)
  add('unhandled promise rejection', 'fail', errText(e.reason))
})

async function main(): Promise<void> {
  // ---- 1. Secure context -------------------------------------------------
  env.origin = location.origin
  env.userAgent = navigator.userAgent
  env.isSecureContext = window.isSecureContext
  env.devicePixelRatio = window.devicePixelRatio
  env.screen = `${screen.width}x${screen.height}`

  add(
    'secure context',
    window.isSecureContext ? 'pass' : 'fail',
    window.isSecureContext
      ? `${location.origin} is a secure context`
      : `${location.origin} is NOT a secure context, so navigator.gpu is withheld. ` +
        `Reach the dev server over the SSH tunnel as http://localhost:5173, not by LAN IP.`,
  )

  // ---- 2. navigator.gpu --------------------------------------------------
  const gpu = (navigator as unknown as { gpu?: unknown }).gpu
  if (!gpu) {
    add(
      'navigator.gpu',
      'fail',
      'absent — WebGPU unavailable in this browser/context. Everything below is skipped.',
    )
    finish()
    return
  }
  add('navigator.gpu', 'pass', 'present')

  // ---- 3. Adapter identity ----------------------------------------------
  let adapter: GPUAdapter | null = null
  try {
    adapter = await (gpu as GPU).requestAdapter({ powerPreference: 'high-performance' })
  } catch (e) {
    add('requestAdapter', 'fail', errText(e))
  }

  if (!adapter) {
    add('requestAdapter', 'fail', 'returned null — no adapter available')
    finish()
    return
  }
  add('requestAdapter', 'pass', 'adapter acquired')

  // The platform removed GPUAdapter.isFallbackAdapter in favour of adapter.info.
  // Report whichever exists rather than assuming, since that is itself unsettled.
  const info = adapter.info as GPUAdapterInfo | undefined
  const infoDump = info
    ? {
        vendor: info.vendor,
        architecture: info.architecture,
        device: info.device,
        description: info.description,
        isFallbackAdapter: (info as unknown as { isFallbackAdapter?: boolean })
          .isFallbackAdapter,
      }
    : null
  env.adapterInfo = infoDump
  env.adapterIsFallbackAdapterProp = (
    adapter as unknown as { isFallbackAdapter?: boolean }
  ).isFallbackAdapter
  env.adapterFeatures = [...adapter.features].sort()
  env.adapterLimits = {
    maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize,
    maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
    maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
  }

  add('adapter.info', info ? 'pass' : 'warn', infoDump ?? 'adapter.info not exposed')

  const haystack = `${infoDump?.vendor ?? ''} ${infoDump?.architecture ?? ''} ${
    infoDump?.device ?? ''
  } ${infoDump?.description ?? ''}`.toLowerCase()
  const looksSoftware = /swiftshader|basic render|microsoft basic|llvmpipe|software/.test(
    haystack,
  )
  const looksAmd = /amd|radeon|rdna/.test(haystack)
  // Chrome reports `rdna-2` with a hyphen, and leaves `device` and `description`
  // EMPTY for fingerprinting reasons -- measured on the reference platform
  // 2026-09-13. So "does the string say 6700 XT" is not a question this API can
  // answer in a normal Chrome build, and vendor + architecture is the real
  // ceiling on adapter identification.
  const looksTarget = /6700|navi[ -]?2|rdna[ -]?2/.test(haystack)

  const fallbackFlag =
    infoDump?.isFallbackAdapter ??
    (adapter as unknown as { isFallbackAdapter?: boolean }).isFallbackAdapter

  if (looksSoftware || fallbackFlag === true) {
    add(
      'discrete GPU (not a software rasterizer)',
      'fail',
      `This looks like a software rasterizer. Frame times and golden screenshots ` +
        `taken here are worthless. haystack="${haystack.trim()}" fallbackFlag=${fallbackFlag}`,
    )
  } else if (looksAmd && looksTarget) {
    add(
      'discrete GPU — AMD RDNA 2 confirmed',
      'pass',
      `vendor="${infoDump?.vendor}" architecture="${infoDump?.architecture}" ` +
        `isFallbackAdapter=${fallbackFlag}. RDNA 2 is the RX 6700 XT's architecture; ` +
        `Chrome leaves device/description empty, so this is as specific as ` +
        `adapter.info gets and it is enough to rule out a software rasterizer.`,
    )
  } else if (looksAmd) {
    add(
      'discrete GPU — AMD, architecture not confirmed',
      'warn',
      `AMD adapter, but the architecture does not read as RDNA 2. ` +
        `haystack="${haystack.trim()}"`,
    )
  } else {
    add(
      'discrete GPU — unrecognised adapter',
      'warn',
      `Not obviously software, but not obviously the reference card either. ` +
        `haystack="${haystack.trim()}"`,
    )
  }

  // ---- 4. Device --------------------------------------------------------
  let device: GPUDevice | null = null
  try {
    device = await adapter.requestDevice()
    device.addEventListener('uncapturederror', (ev) => {
      const msg = (ev as GPUUncapturedErrorEvent).error.message
      uncapturedErrors.push(msg)
      add('uncaptured WebGPU error', 'fail', msg)
    })
    add('requestDevice', 'pass', 'device acquired, uncapturederror listener attached')
  } catch (e) {
    add('requestDevice', 'fail', errText(e))
    finish()
    return
  }

  // ---- 5. TSL compute: workgroupArray + workgroupBarrier + StorageTexture
  // Imported dynamically so that a resolution or parse failure in three leaves
  // every result above intact rather than taking the whole module down.
  try {
    const THREE = await import('three/webgpu')
    const TSL = await import('three/tsl')
    env.threeRevision = (THREE as unknown as { REVISION?: string }).REVISION

    const renderer = new THREE.WebGPURenderer({ forceWebGL: false })
    await renderer.init()
    env.rendererBackend = renderer.backend?.constructor?.name ?? 'unknown'

    if (/WebGL/i.test(String(env.rendererBackend))) {
      add(
        'three renderer backend',
        'fail',
        `three fell back to ${env.rendererBackend}. WebGPU was not used.`,
      )
    } else {
      add('three renderer backend', 'pass', String(env.rendererBackend))
    }

    const COUNT = 64 // one workgroup of 64 invocations
    const {
      Fn,
      instancedArray,
      workgroupArray,
      workgroupBarrier,
      instanceIndex,
      textureStore,
      uvec2,
      vec4,
      float,
      uint,
      If,
    } = TSL as unknown as Record<string, (...a: unknown[]) => unknown>

    // Deliberately two separate passes. These are independent capabilities, and
    // bundling them would mean a StorageTexture problem reporting as "TSL compute
    // is broken" -- a false negative that would send the whole renderer design
    // down the raw-WGSL contingency for no reason. Each reports for itself.

    // ---- 5a. workgroupArray + workgroupBarrier, verified numerically --------
    try {
      const out = instancedArray(COUNT, 'uint') as {
        element: (i: unknown) => { assign: (v: unknown) => unknown }
        toAttribute?: () => unknown
      }

      // Each invocation stages its index in workgroup storage; after the barrier,
      // invocation 0 reduces all 64 and writes the sum. If the barrier does not
      // actually synchronise, the sum comes out WRONG rather than merely slow --
      // which is the point: this verifies behaviour, not the presence of a symbol.
      const scratch = workgroupArray('uint', COUNT) as {
        element: (i: unknown) => { assign: (v: unknown) => unknown }
      }

      const reduceFn = Fn(() => {
        scratch.element(instanceIndex).assign(instanceIndex)
        workgroupBarrier()

        If(instanceIndex.equal(uint(0)), () => {
          const total = uint(0).toVar('total')
          for (let i = 0; i < COUNT; i++) {
            total.addAssign(scratch.element(uint(i)))
          }
          out.element(uint(0)).assign(total)
        })
      }) as unknown as { compute: (n: number) => unknown }

      device.pushErrorScope('validation')
      await renderer.computeAsync(reduceFn.compute(COUNT) as never)
      const vErr = await device.popErrorScope()

      const expected = (COUNT * (COUNT - 1)) / 2 // 2016
      // `.value` is the StorageInstancedBufferAttribute, which is what
      // getArrayBufferAsync takes. NOT `.toAttribute()` -- that returns a
      // BufferAttributeNode for feeding geometry, and passing it here fails with
      // "Cannot read properties of undefined (reading 'size')". Cost me one
      // round trip to the reference platform on 2026-09-13.
      const buf = await renderer.getArrayBufferAsync(
        (out as unknown as { value: unknown }).value as never,
      )
      const got = new Uint32Array(buf)[0]

      env.computeExpected = expected
      env.computeGot = got
      env.computeValidationError = vErr?.message ?? null

      if (vErr) {
        add('TSL compute — validation', 'fail', vErr.message)
      }
      add(
        'TSL compute: workgroupArray + workgroupBarrier',
        got === expected ? 'pass' : 'fail',
        got === expected
          ? `reduced 0..63 to ${got} as expected — the barrier synchronised correctly`
          : `expected ${expected}, got ${got}. The pass ran but the result is wrong, ` +
            `which points at the barrier or the workgroup array rather than at plumbing.`,
      )
    } catch (e) {
      add('TSL compute: workgroupArray + workgroupBarrier', 'fail', errText(e))
      throw e // hand off to the raw-WGSL contingency below
    }

    // ---- 5b. StorageTexture write, reported independently -------------------
    try {
      const tex = new THREE.StorageTexture(8, 8)
      const writeFn = Fn(() => {
        textureStore(
          tex,
          uvec2(instanceIndex.mod(uint(8)), instanceIndex.div(uint(8))),
          vec4(float(1), float(0), float(0), float(1)),
        )
      }) as unknown as { compute: (n: number) => unknown }

      device.pushErrorScope('validation')
      await renderer.computeAsync(writeFn.compute(COUNT) as never)
      const tErr = await device.popErrorScope()
      env.storageTextureValidationError = tErr?.message ?? null

      add(
        'TSL StorageTexture write (textureStore)',
        tErr ? 'fail' : 'pass',
        tErr ? tErr.message : 'executed with no validation error',
      )
    } catch (e) {
      // Not rethrown: the barrier test above already passed, so the WGSL
      // contingency is not needed on account of this one.
      add('TSL StorageTexture write (textureStore)', 'fail', errText(e))
    }
  } catch (e) {
    add(
      'TSL compute path',
      'fail',
      `${errText(e)}\n\nFalling back to the raw-WGSL contingency below.`,
    )

    // ---- 6. Contingency: raw WGSL on the same device ---------------------
    try {
      const module = device.createShaderModule({
        code: `
          var<workgroup> scratch : array<u32, 64>;
          @group(0) @binding(0) var<storage, read_write> out : array<u32>;
          @compute @workgroup_size(64)
          fn main(@builtin(local_invocation_id) lid : vec3<u32>) {
            scratch[lid.x] = lid.x;
            workgroupBarrier();
            if (lid.x == 0u) {
              var total : u32 = 0u;
              for (var i : u32 = 0u; i < 64u; i = i + 1u) { total = total + scratch[i]; }
              out[0] = total;
            }
          }
        `,
      })
      const outBuf = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      })
      const readBuf = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      })
      const layout = device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'storage' },
          },
        ],
      })
      const pipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        compute: { module, entryPoint: 'main' },
      })
      const bind = device.createBindGroup({
        layout,
        entries: [{ binding: 0, resource: { buffer: outBuf } }],
      })
      const enc = device.createCommandEncoder()
      const cp = enc.beginComputePass()
      cp.setPipeline(pipeline)
      cp.setBindGroup(0, bind)
      cp.dispatchWorkgroups(1)
      cp.end()
      enc.copyBufferToBuffer(outBuf, 0, readBuf, 0, 4)
      device.queue.submit([enc.finish()])
      await readBuf.mapAsync(GPUMapMode.READ)
      const got = new Uint32Array(readBuf.getMappedRange().slice(0))[0]
      readBuf.unmap()

      add(
        'raw WGSL contingency (workgroupBarrier)',
        got === 2016 ? 'pass' : 'fail',
        got === 2016
          ? 'raw WGSL compute works — the contingency in spec §15 is viable'
          : `expected 2016, got ${got}`,
      )
    } catch (e2) {
      add('raw WGSL contingency', 'fail', errText(e2))
    }
  }

  finish()
}

function finish(): void {
  const failed = checks.filter((c) => c.status === 'fail')
  const warned = checks.filter((c) => c.status === 'warn')

  if (failed.length === 0 && warned.length === 0) {
    verdictEl.className = 'go'
    verdictEl.textContent =
      'GO — every day-0 question answered yes. WebGPU, the reference adapter, and the ' +
      'TSL compute path all check out. Paste the report back.'
  } else if (failed.length === 0) {
    verdictEl.className = 'go'
    verdictEl.textContent =
      `GO, with ${warned.length} thing(s) to read: ` +
      warned.map((c) => c.name).join('; ') +
      '. Nothing blocking. Paste the report back.'
  } else {
    verdictEl.className = 'nogo'
    verdictEl.textContent =
      `${failed.length} check(s) failed: ` +
      failed.map((c) => c.name).join('; ') +
      '. Paste the report back — the detail matters more than the verdict.'
  }
  publish()
}

void main().catch((e) => {
  add('probe crashed', 'fail', errText(e))
  finish()
})
