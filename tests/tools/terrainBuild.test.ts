import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { fromFile } from 'geotiff'
import {
  FIRST_COMMITTED_LEVEL,
  loadTerrainHeader,
  loadTerrainLevel,
  terrainHeaderPath,
  terrainLevelPath,
} from '../../tools/terrain/load.js'
import { samplesAtLevel } from '../../src/sim/world/schema.js'
import { toGeodetic, toLocal } from '../../src/sim/world/projection.js'
import { gridToLocal } from '../../tools/terrain/resample.js'
import { CACHE_DIR } from '../../tools/terrain/fetch.js'
import { tileFileName } from '../../tools/terrain/tiles.js'

const header = loadTerrainHeader()

/** Committed levels: L4 (513x513) through L12 (3x3). Everything finer is
 *  gitignored (see `tools/terrain/load.ts`'s FIRST_COMMITTED_LEVEL), so a
 *  fresh clone has exactly these. */
const COMMITTED_LEVELS = Array.from(
  { length: header.levels - FIRST_COMMITTED_LEVEL },
  (_v, i) => FIRST_COMMITTED_LEVEL + i,
)

describe('the committed terrain fallback', () => {
  it('is present, parses, and has the level sizes its header claims', () => {
    expect(COMMITTED_LEVELS).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12])
    for (const level of COMMITTED_LEVELS) {
      const data = loadTerrainLevel(level, header)
      const n = samplesAtLevel(header, level)
      expect(data.length, `L${level}`).toBe(n * n)
    }
  })

  it('puts land above the sea and the gulf below it, at real coordinates', () => {
    // The check that catches a wrong projection, a mirrored grid or a
    // half-degree offset -- none of which look wrong in isolation.
    //   Tacloban airfield  11.228 N 125.028 E  -- land, near sea level
    //   central Leyte Gulf 10.75 N 125.25 E    -- open water
    //
    // Provenance of the two coordinates: taken verbatim from
    // `.superpowers/sdd/2026-09-13-terrain/task-6-brief.md`, which sourced them
    // independently of this pipeline and forbids writing them from memory.
    // Cross-checked against the SOURCE data on 2026-09-14, before any of this
    // test's expectations were written: sampling the cached Copernicus COGs
    // directly (not through the built grid) gives 1.92 m at the Tacloban point
    // and exactly 0.00 m at the gulf point, i.e. dry land just above the sea
    // and open water -- which is what the two are asserted to be below.
    //
    // Fix round 1 (2026-09-14): the two assertions above pass under EVERY one
    // of the grid's 8 dihedral symmetries (row-flip, col-flip, 180-rotation,
    // transpose, anti-transpose, both 90-rotations) -- proven by direct
    // experiment against this committed grid, not assumed. Root cause: L4
    // holds no negative values anywhere in this no-bathymetry build, so
    // `> -2` is true of every cell; and the gulf point sits only ~5.5 km
    // (14 grid cells) from L4's geometric centre (row 270/col 242 of 513,
    // centre 256/256), so a reflection barely moves it and it stays in the
    // same flat water patch. Two more points, independently sourced, far
    // from centre and off every symmetry axis, close that gap:
    //   Mt Nacolod, Southern Leyte  10.450846 N 125.096068 E, 915-1007 m --
    //     PeakVisor (https://peakvisor.com/peak/mount-nacolod.html) and the
    //     Province of Southern Leyte
    //     (https://southernleyte.gov.ph/topography/), both read 2026-09-14.
    //     114 grid cells (~44 km) from centre.
    //   Surigao Strait  10.167 N 125.383 E -- open water between Leyte/Panaon
    //     and Mindanao/Dinagat, historically the site of the Battle of
    //     Surigao Strait (25 Oct 1944) -- Wikipedia
    //     (https://en.wikipedia.org/wiki/Surigao_Strait), read 2026-09-14.
    //     181 grid cells (~71 km) from centre.
    // Nacolod's real elevation (841 m in this build's L4) is high enough, and
    // its grid position generic enough (off the row axis, the column axis and
    // both diagonals), that EVERY one of its 8 dihedral images reads well
    // under 300 m in the correctly-built grid -- measured, not assumed:
    //   identity 841.0, row-flip 0.0, col-flip 0.0, 180-rot 132.9,
    //   transpose 4.0, anti-transpose 60.1, rot90cw 32.1, rot90ccw 0.0 (m)
    // so asserting > 300 m at Nacolod alone kills all seven non-identity
    // transforms; each is demonstrated individually in
    // task-6-report.md's "Fix round 1". Surigao Strait's images reinforce two
    // of them independently (row-flip -> 98.4 m, 180-rot -> 363.7 m, both
    // fail an open-water assertion), as a second, unrelated line of defence.
    const sample = (latDeg: number, lonDeg: number, level: number): number => {
      const { x, z } = toLocal(latDeg, lonDeg)
      const n = samplesAtLevel(header, level)
      const step = (2 * header.halfExtentM) / (n - 1)
      const col = Math.round((x + header.halfExtentM) / step)
      const row = Math.round((header.halfExtentM - z) / step)
      return loadTerrainLevel(level, header)[row * n + col]! / 10
    }
    expect(sample(11.228, 125.028, 4)).toBeGreaterThan(-2)
    expect(sample(10.75, 125.25, 4)).toBeLessThanOrEqual(0)
    expect(sample(10.450846, 125.096068, 4)).toBeGreaterThan(300)
    expect(sample(10.167, 125.383, 4)).toBeLessThanOrEqual(0)
  })

  it('is not flat, and is not noise', () => {
    // Two failure modes that a size check cannot tell apart from success: a
    // pipeline that wrote zeros, and one that wrote garbage.
    const l4 = loadTerrainLevel(4, header)
    const max = l4.reduce((m, v) => Math.max(m, v), -Infinity) / 10
    const land = l4.reduce((n, v) => n + (v > 5 ? 1 : 0), 0) / l4.length
    expect(max).toBeGreaterThan(500)     // Leyte has real relief
    expect(max).toBeLessThan(3000)       // and is not the Himalayas
    expect(land).toBeGreaterThan(0.15)   // a gulf with islands, not an ocean
    expect(land).toBeLessThan(0.85)      // and not a continent
  })
})

/**
 * Design §7's "Determinism": re-running the pipeline and comparing its two
 * outputs would pass against a pipeline that is wrong in the same way twice,
 * so the bytes are pinned as literals instead.
 *
 * Every digest below was read off the committed artefact with `sha256sum` on
 * 2026-09-14, after `npm run terrain:build` had been run twice from the same
 * cache and `sha256sum -c` confirmed all thirteen levels plus the header were
 * byte-identical across the two runs.
 *
 * Changing the resampler, the mip filter, the projection, the world centre or
 * the source tiles changes these; that is the point. Regenerate them
 * deliberately (`npm run terrain:build`, then `sha256sum`), never by pasting
 * whatever the failure printed.
 */
const COMMITTED_SHA256: Readonly<Record<string, string>> = {
  'header.json': 'd69644f904f4238f4bd78ac122b9a15ec5b405f809dbc7b94fb028cc4eae2aeb',
  'L4.bin': '37bf755bfec80c5bae409ff7fddf183507ec4a6f1a7c89b557ee9ae80ea5fe5a',
  'L5.bin': 'f33e0af56e770e9dc6fc376eb4e2f2b1aff26e43cc574dfe00f5269df5d785bd',
  'L6.bin': 'acc0c6fae99248551d8815f873d376d0e28d36c37acbbd7e074bdcc774d06719',
  'L7.bin': 'dfc00c223df8eb5da1d123b7ab44ce7cd85e849fa5126859f0e7c6c288328d9a',
  'L8.bin': '5a86b6680f505bfcb4d3492f53562404ec538da1f6d2598c94dbc9df34242074',
  'L9.bin': 'd7d083257c6e37ce92df8a5b1380f44605a1950957d988bb68b6a154fc12a409',
  'L10.bin': 'a84294afcc9417ee9a3eae88c1657e56c83ea0c02840a1c902a1883ec4d11809',
  'L11.bin': '2d33e9d6c717cde81f0621c8e0aa25ec700e725a3fb23c57535618a01b647b79',
  'L12.bin': 'b1b870817a67f232d536dc73f3f592af5416652568864dd7578abf986388b680',
}

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex')

describe('the committed terrain is byte-for-byte the pinned build', () => {
  it('matches the pinned SHA-256 of header.json and every committed level', () => {
    const actual: Record<string, string> = { 'header.json': sha256(terrainHeaderPath()) }
    for (const level of COMMITTED_LEVELS) actual[`L${level}.bin`] = sha256(terrainLevelPath(level))
    expect(actual).toEqual(COMMITTED_SHA256)
  })
})

// The source tiles are gitignored (106,966,683 bytes over eight COGs,
// measured 2026-09-14), so CI has none:
// `describe.skipIf` prints a NAMED skip rather than vanishing, which is what
// keeps "green because it checked" distinguishable from "green because it did
// not". The console line below makes that unmissable even in a dot reporter.
//
// BOTH preconditions, not just the cache. The block below also calls
// `loadTerrainLevel(0, header)`, and L0.bin lives in the SEPARATELY gitignored
// `content/terrain/tiles/` -- so gating on the cache alone turned a named skip
// into a hard ENOENT for anyone who followed the instruction this line used to
// print: `npx tsx tools/terrain/fetch.ts` creates the cache and does not create
// L0 (review 2026-09-14, finding M3). `tests/render/terrainLod.test.ts` gates
// on `existsSync(terrainLevelPath(0))` and names both commands, which is the
// shape copied here.
const haveSource = existsSync(CACHE_DIR) && existsSync(terrainLevelPath(0))
if (!haveSource) {
  console.warn(
    `[terrainBuild.test.ts] ${CACHE_DIR} or ${terrainLevelPath(0)} is absent -- the source ` +
    `cross-check and the source-tile digests are SKIPPED. Run ` +
    `\`npx tsx tools/terrain/fetch.ts && npm run terrain:build\` to enable them.`,
  )
}

/**
 * Digests of the eight cached Copernicus GLO-30 tiles the committed levels
 * were built from, read with `sha256sum` on 2026-09-14. Pinned here and not
 * next to the output digests because CI has no cache.
 *
 * There are EIGHT, not the nine `tilesCovering(100e3)` enumerates: GLO-30
 * publishes no tile for N11/E126 (open Philippine Sea), which the dataset's own
 * readme.html says to read as height zero. See ASSETS.md, "Known dataset gap,
 * not a bug", and the ocean test below.
 */
const SOURCE_SHA256: Readonly<Record<string, string>> = {
  'Copernicus_DSM_COG_10_N09_00_E124_00_DEM.tif': '531bffb3000b62512911d7818122f6a5f0fcc33560e695ccc2f57b7c67e2f443',
  'Copernicus_DSM_COG_10_N09_00_E125_00_DEM.tif': '51a82ae28c6fd9a9acc7acbae8d67b851c460691f445b7d9f916acc90e0c900d',
  'Copernicus_DSM_COG_10_N09_00_E126_00_DEM.tif': '4c04228a714ca63f1b74078b17f8d167de2f01c3ba3e90dd65387d7f9a292110',
  'Copernicus_DSM_COG_10_N10_00_E124_00_DEM.tif': 'd655e8ff491d160e9548de8cf0beebf659923f266b231653320966b3fa7df912',
  'Copernicus_DSM_COG_10_N10_00_E125_00_DEM.tif': '2d22581023b475c4c521677d56daa868c52f3d87e5c17768d51d659c5eb81a61',
  'Copernicus_DSM_COG_10_N10_00_E126_00_DEM.tif': 'b7ed57c9d1ca0c4ead4d036243d726dc5f7c434095463b8c7c6d43fe0641da5a',
  'Copernicus_DSM_COG_10_N11_00_E124_00_DEM.tif': 'eefeab24f515e475af27a494792072331d0ba99c942b5f0d1c7eabaaca42777a',
  'Copernicus_DSM_COG_10_N11_00_E125_00_DEM.tif': '4e4587ff17bba2f9572b339b5b97e341798e9469874de8d193976556fb044d4d',
}

/** Postings per degree in GLO-30 (1 arcsecond). Same fact `build.ts` asserts
 *  each tile's width against; restated rather than imported because this suite
 *  exists to disagree with `build.ts`, not to inherit from it. */
const POSTINGS_PER_DEGREE = 3600

describe.skipIf(!haveSource)('the built grid against the source tiles', () => {
  it('was built from exactly the eight pinned source tiles', () => {
    const actual: Record<string, string> = {}
    for (const name of Object.keys(SOURCE_SHA256)) actual[name] = sha256(join(CACHE_DIR, name))
    expect(actual).toEqual(SOURCE_SHA256)
  })

  it('agrees with the source DEM at twenty scattered points', async () => {
    // Opens the cached COGs directly and samples them at the lat/lon of a grid
    // cell, rather than going back through resample.ts or build.ts's sampler.
    // Deliberately a DIFFERENT code path in three ways: a 2x2 windowed read
    // instead of one whole-raster read; per-tile pixel indexing (row counted
    // south from the tile's north edge) instead of build.ts's world-wide
    // posting grid (counted north from the equator); and the bilinear weights
    // accumulated row-first instead of column-first.
    const n = samplesAtLevel(header, 0)
    const l0 = loadTerrainLevel(0, header)

    // A fixed-seed LCG, not Math.random: the twenty cells must be the same
    // twenty on every run, or a failure cannot be reproduced. Seed is the date
    // this test was written; the multiplier/increment are glibc's.
    let seed = 20260914
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) >>> 0
      return seed / 4294967296
    }

    let checked = 0
    let worst = 0
    while (checked < 20) {
      const col = Math.floor(next() * n)
      const row = Math.floor(next() * n)
      const { x, z } = gridToLocal(col, row)
      const { latDeg, lonDeg } = toGeodetic(x, z)
      const tileLat = Math.floor(latDeg)
      const tileLon = Math.floor(lonDeg)
      const pc = (lonDeg - tileLon) * POSTINGS_PER_DEGREE
      const pr = (tileLat + 1 - latDeg) * POSTINGS_PER_DEGREE
      // Skip cells whose 2x2 stencil would run off the edge of its own tile:
      // stitching across a seam is build.ts's job and reimplementing it here
      // would defeat the purpose. Rejects roughly 0.06% of cells.
      if (pc < 1 || pc > POSTINGS_PER_DEGREE - 2 || pr < 1 || pr > POSTINGS_PER_DEGREE - 2) continue

      const path = join(CACHE_DIR, tileFileName({ lat: tileLat, lon: tileLon }))
      let sourceM: number
      if (existsSync(path)) {
        const c0 = Math.floor(pc)
        const r0 = Math.floor(pr)
        const fx = pc - c0
        const fy = pr - r0
        const image = await (await fromFile(path)).getImage(0)
        const [w] = await image.readRasters({ window: [c0, r0, c0 + 2, r0 + 2] })
        const north = (1 - fx) * w![0]! + fx * w![1]!
        const south = (1 - fx) * w![2]! + fx * w![3]!
        sourceM = (1 - fy) * north + fy * south
      } else {
        sourceM = 0 // the unpublished ocean cell; see SOURCE_SHA256's comment
      }

      const storedM = l0[row * n + col]! / 10
      // The only difference allowed is the decimetre quantisation the encoding
      // imposes: stored = round(h * 10) / 10, so |stored - h| <= 0.05 m by
      // construction and anything past it is a real disagreement, not rounding.
      // Measured worst case over these exact twenty cells, 2026-09-14: 0.0436 m.
      const delta = Math.abs(storedM - sourceM)
      expect(delta, `L0[${row}][${col}] at ${latDeg},${lonDeg}: source ${sourceM} m, stored ${storedM} m`)
        .toBeLessThanOrEqual(0.05)
      worst = Math.max(worst, delta)
      checked++
    }
    expect(checked).toBe(20)
    expect(worst).toBeGreaterThan(0) // at least one cell actually had relief
  })

  it('reads the one 1-degree cell Copernicus does not publish as sea level', () => {
    // Ruling from Task 3: `ensureAllTiles` returns eight paths for nine cells.
    // A sampler that threw, or produced NaN, for the missing N11/E126 cell
    // would have failed the build; one that produced garbage would have left
    // a mountain range in the open Philippine Sea. Assert both halves: the tile
    // really is absent, and the grid over it really is zero.
    expect(existsSync(join(CACHE_DIR, tileFileName({ lat: 11, lon: 126 })))).toBe(false)

    const n = samplesAtLevel(header, 0)
    const l0 = loadTerrainLevel(0, header)
    let inCell = 0
    for (let row = 0; row < n; row += 16) {
      for (let col = 0; col < n; col += 16) {
        const { x, z } = gridToLocal(col, row)
        const { latDeg, lonDeg } = toGeodetic(x, z)
        // Stay a whole posting clear of the cell's edges so no bilinear tap
        // reaches into a neighbouring tile that does exist.
        if (latDeg < 11.001 || latDeg >= 12 || lonDeg < 126.001 || lonDeg >= 127) continue
        inCell++
        expect(l0[row * n + col], `L0[${row}][${col}] at ${latDeg},${lonDeg}`).toBe(0)
      }
    }
    // The world's north-east corner reaches 11.698 N 126.218 E, so this cell is
    // genuinely inside the grid; a zero here would mean the loop never ran.
    expect(inCell).toBeGreaterThan(100)
  })
})
