import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { engineFamilyFor } from '../../src/audio/mix.js'

describe('engineFamilyFor', () => {
  it('gives the heavies, the P-38 and everything else their families', () => {
    for (const id of ['b-17-flying-fortress', 'b-29-superfortress', 'g4m-betty', 'ki-21-sally']) expect(engineFamilyFor(id), id).toBe('multi_heavy')
    expect(engineFamilyFor('p-38-lightning')).toBe('allison')
    for (const id of ['f6f-hellcat', 'f4u-corsair', 'ki-84-frank']) expect(engineFamilyFor(id), id).toBe('radial_big')
    for (const id of ['f4f-wildcat', 'a6m2-zero', 'd3a-val', 'ki-43-oscar', 'unknown']) expect(engineFamilyFor(id), id).toBe('radial')
  })

  it('names only aircraft that exist, so a rename cannot silently demote one to a radial', () => {
    const dir = (rel: string): string[] => readdirSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)))
    const ids = new Set([...dir('content/aircraft'), ...dir('content/library')].map((f) => f.replace(/\.json$/, '')))
    for (const id of ['b-17-flying-fortress', 'b-29-superfortress', 'g4m-betty', 'ki-21-sally', 'p-38-lightning', 'f6f-hellcat', 'f4u-corsair', 'ki-84-frank']) expect(ids.has(id), id).toBe(true)
  })
})
