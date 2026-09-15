import { expect, it } from 'vitest'
import { cascadeOptions, OCEAN_PATCHES_M } from '../../../src/render/ocean/bands.js'
import { stationarySpectrum } from '../../../src/render/ocean/reference.js'

it('partitions every wave number exactly once at every cascade count', () => {
  for (const count of [1,2,3]) {
    const bands = cascadeOptions(4,256,count)
    for (const k of [0,0.01,0.1,2*Math.PI/32,0.5,2*Math.PI/4,2,20]) {
      expect(bands.filter((b) => k >= b.kMin! && k < (b.kMax ?? Infinity))).toHaveLength(1)
    }
  }
  const gcd = (a:number,b:number):number => b===0 ? a : gcd(b,a%b)
  for (let i=0;i<3;i++) for (let j=i+1;j<3;j++) expect(gcd(OCEAN_PATCHES_M[i]!,OCEAN_PATCHES_M[j]!)).toBe(1)
})

it('band selection preserves rather than rescales the shared spectrum', () => {
  const options = {beaufort:4,n:32,patchM:127,timeS:0,cascade:0}
  const full = stationarySpectrum(options)
  const low = stationarySpectrum({...options,kMax:0.2})
  const high = stationarySpectrum({...options,kMin:0.2})
  for (let i=0;i<full.re.length;i++) {
    expect(low.re[i]!+high.re[i]!).toBeCloseTo(full.re[i]!,14)
    expect(low.im[i]!+high.im[i]!).toBeCloseTo(full.im[i]!,14)
  }
})
