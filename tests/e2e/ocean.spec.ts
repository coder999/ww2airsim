import { flySweep, snapshot, waitForTerrain } from './harness.js'
import { test, expect } from '@playwright/test'
import { referenceDisplacement, OCEAN_PHASE_SEED } from '../../src/render/ocean/reference.js'

// No application frame loop: readbacks validate compute on the same real
// adapter independently before the surface is permitted to consume it.
for (const n of [64,128,256]) {
  test(`GPU inverse FFT matches the CPU reference at N=${n}`, async ({page}) => {
    await page.route('**/ocean-test', (route) => route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}))
    await page.goto('/ocean-test')
    const options = {beaufort:4,cascade:0,n,patchM:509}
    const results = await page.evaluate(async (opts) => {
      // Vite transforms these modules; variables keep Node's type resolver
      // from interpreting browser-root paths as filesystem imports.
      const rendererPath='/src/render/renderer.ts', computePath='/src/render/ocean/compute.ts'
      const {initRenderer}=await import(rendererPath)
      const {createOceanCompute}=await import(computePath)
      const {renderer,adapterVerdict}=await initRenderer(document.createElement('canvas'))
      const errors: string[]=[]
      renderer.onError=(info: {message?:string})=>errors.push(String(info.message ?? info))
      const compute=await createOceanCompute(renderer,opts)
      try {
        const samples=[]
        for (const time of [0,1.5,17]) {
          compute.dispatch(time)
          for (const component of ['height','x','z'] as const) {
            const sample=await compute.readDisplacement(component)
            samples.push({component,timeS:sample.timeS,values:Array.from(sample.values) as number[]})
          }
        }
        return {adapterVerdict,errors,seed:compute.phaseSeed,samples}
      } finally {compute.dispose();renderer.dispose()}
    },options)
    expect(results.adapterVerdict.severity).toBe('ok')
    expect(results.errors).toEqual([])
    expect(results.seed).toBe(OCEAN_PHASE_SEED)
    for (const sample of results.samples) {
      const reference=referenceDisplacement({...options,timeS:sample.timeS},sample.component)
      expect(sample.values).toHaveLength(reference.length)
      const rms=Math.sqrt(sample.values.reduce((sum,v,i)=>sum+(v-reference[i]!)**2,0)/reference.length)
      console.log(`FFT N=${n} ${sample.component} t=${sample.timeS}: RMS error ${rms} m`)
      // Measured AMD RDNA-2, 2026-09-15: largest height RMS 4.43e-7 m
      // across N=64/128/256 and t=0/1.5/17. A 1e-5 m bound allows float32
      // driver variation while detecting sign, layout and normalization bugs.
      expect(rms).toBeLessThan(1e-5)
    }
  })
}

for (const tier of ['high','medium','low']) {
  test(`scene ocean ${tier}: actual texture readback and total GPU budget`, async ({page}) => {
    await page.setViewportSize({width:2560,height:1440})
    // `spawnX`/`spawnZ` pinned to the open-water origin explicitly: this test
    // wants the ocean surface, not Tacloban, and used to get it for free by
    // leaving them unset while the default spawn was itself `(0, 600, 0)`.
    // Since that default moved to a ground spawn at Tacloban
    // (Task 14), an unset spawnX/spawnZ here would silently fly this test
    // over land instead -- still airborne, since `spawnY` alone makes this a
    // DEV override and an override is never parked, but not the open-water
    // scene the test is about.
    //
    // The tick wait below is NOT immediate, and that changed with Plan 12
    // (Task 7, 2026-09-18): the frame's `groundSpawn` is now derived from the
    // world's entities, and the scenario's CHOCKED WINGMAN stays parked at
    // Tacloban whatever the override does -- so the world is held at zero
    // elapsed time until the terrain heightfield lands, exactly as a parked
    // flight is. The comment here used to assert the opposite. Nothing in
    // this test depends on when the clock starts, only that it reaches 240.
    await page.goto(`/?spawnY=600&spawnX=0&spawnZ=0&beaufort=6&oceanTime=17&oceanTier=${tier}`)
    await page.waitForFunction(() => ((window as unknown as import('./harness.js').DiagWindow).__ww2?.tick() ?? 0) > 240)
    const samples = await page.evaluate(async () => {
      const d = (window as unknown as import('./harness.js').DiagWindow).__ww2!
      const samples = []
      for(let i=0;i<d.oceanComputeTimesMs().length;i++) samples.push(await d.oceanDisplacementSample(i))
      d.resetFrameTimes()
      return samples
    })
    expect(samples).toHaveLength(tier === 'high' ? 3 : tier === 'medium' ? 2 : 1)
    for (const sample of samples) {
      expect(sample).not.toBeNull()
      expect(sample!.timeS).toBe(17)
      expect(sample!.phaseSeed).toBe((OCEAN_PHASE_SEED ^ sample!.options.cascade) >>> 0)
      const reference = referenceDisplacement({...sample!.options,timeS:17})
      const rms = Math.sqrt(sample!.values.reduce((sum,v,i)=>sum+(v-reference[i]!)**2,0)/reference.length)
      expect(rms).toBeLessThan(1e-5)
    }
    await page.waitForFunction(() => {
      const d = (window as unknown as import('./harness.js').DiagWindow).__ww2!
      return d.gpuFrameTimesMs().length >= 240 && d.oceanComputeTimesMs().every(s => s.length >= 120)
    })
    const timing = await page.evaluate(() => {
      const d = (window as unknown as import('./harness.js').DiagWindow).__ww2!
      return {render:d.gpuFrameTimesMs(),compute:d.oceanComputeTimesMs(),errors:d.validationErrors}
    })
    const percentile = (a: readonly number[], p: number) => [...a].sort((x,y)=>x-y)[Math.floor((a.length-1)*p)]!
    // Sum per-pass percentiles: conservative proxy, not paired frame latency.
    const total = (p:number) => percentile(timing.render,p)+timing.compute.reduce((s,a)=>s+percentile(a,p),0)
    console.log(`ocean ${tier}: render p50=${percentile(timing.render,.5)} p95=${percentile(timing.render,.95)}; compute p50=${timing.compute.map(a=>percentile(a,.5))}; total p50=${total(.5)} p95=${total(.95)} ms`)
    expect(timing.errors).toEqual([])
    expect(total(.95)).toBeLessThan(8.33)
  })
}

for (const altitude of [100,600,3000,8000]) {
  for (const coast of [false,true]) {
    test(`ocean sweep ${altitude} m ${coast ? 'coast' : 'gulf'}`, async ({page}) => {
      const errors: string[] = []
      page.on('pageerror', e => errors.push(e.message))
      await page.goto(`/?spawnY=${altitude}&spawnX=${coast ? -30000 : 0}&spawnZ=${coast ? -47605 : 0}&beaufort=6`)
      await waitForTerrain(page)
      const start = await snapshot(page)
      expect(Math.abs(start.position.y-altitude)).toBeLessThan(80)
      expect(Math.abs(start.position.x-(coast ? -30000 : 0))).toBeLessThan(1000)
      await flySweep(page)
      const end = await snapshot(page)
      expect(end.errors).toEqual([])
      expect(errors).toEqual([])
      expect(end.tick).toBeGreaterThan(start.tick)
    })
  }
}
