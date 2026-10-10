// tests/build/contentFilter.test.ts
import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { contentCopyFilter } from '../../vite.config.js'

describe('contentCopyFilter (vite.config.ts)', () => {
  const root = resolve('/repo/content')
  const copies = contentCopyFilter(root)
  it.each([
    ['content/models', false],
    ['content/models/candidates/a6m2-zeke.glb', false],
    ['content/terrain/tiles', false],
    ['content/terrain/tiles/L0/0_0.bin', false],
    ['content/audio/candidates/index.json', false],
    ['content/audio/rocket_whoosh.wav', true],
    ['content/aircraft/wildcat.glb', true],
    ['content/terrain/L0.bin', false],
    ['content/terrain/L12.bin', false],
    ['content/terrain/L0.bin.gz', true],
    ['content/terrain/L1.bin.gz', true],
    ['content/bathy/depth.bin', true],
    ['content/models-notes/readme.md', true],
  ])('%s -> copied: %s', (path, expected) => {
    expect(copies(resolve('/repo', path))).toBe(expected)
  })
})
