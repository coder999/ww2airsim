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
