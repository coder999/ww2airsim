import { longForestEnabled } from '../../src/render/scene/forestDistance.js'
import { expect, it, vi } from 'vitest'
import { createDistantTrees, distantTreesEnabled } from '../../src/render/scene/distantTrees.js'
import { residentCellOffsets, TREE_CELL_M } from '../../src/render/scene/treeCells.js'

it('defaults to the accepted extension and limits the off comparison to DEV', () => {
  try {
    vi.stubEnv('DEV', true)
    vi.stubGlobal('location', { search: '' })
    expect(distantTreesEnabled()).toBe(true)
    expect(longForestEnabled()).toBe(false)
    vi.stubGlobal('location', { search: '?distantTrees=off' })
    expect(distantTreesEnabled()).toBe(false)
    vi.stubGlobal('location', { search: '?distantTrees=off&forestDistance=long' })
    expect(longForestEnabled()).toBe(true)
    vi.stubEnv('DEV', false)
    expect(longForestEnabled()).toBe(false)
    expect(distantTreesEnabled()).toBe(true)
  } finally {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  }
})

it.each([false, true])('fills incrementally, preserves resident slots, and clears reused slots and quality changes (groves=%s)', groves => {
  const cellSize = groves ? 1600 : TREE_CELL_M
  let barren = false
  const forest = createDistantTrees((cx, cz) => barren ? [] : [
    { x: cx * cellSize + 100, z: cz * cellSize + 100, y: 100, height: 20, radius: 8, shade: 0.4 },
  ], groves)
  const fill = (x = 0, y = 200) => {
    for (let i = 0; i < 700; i++) {
      forest.update(x, 0, y)
      if (forest.stats().ready) return
    }
    throw new Error('distant forest did not finish loading')
  }
  forest.update(0, 0, 200)
  expect(forest.stats().generated).toBeLessThanOrEqual(4)
  expect(forest.stats().pending).toBeGreaterThan(0)
  fill()
  const before = forest.stats()
  expect(before.instances).toBe(residentCellOffsets(before.fadeEndM, cellSize).length)
  expect(forest.object.geometry.index!.count).toBe(6)
  const active = () => {
    const center = forest.object.geometry.getAttribute('treeCenter')
    const size = forest.object.geometry.getAttribute('treeSize')
    const slots = new Map<string, number>()
    for (let i = 0; i < size.count; i++) if (size.getX(i) > 0) slots.set(`${center.getX(i)},${center.getZ(i)}`, i)
    return slots
  }
  const slots = active()
  fill(cellSize)
  let overlap = 0
  for (const [site, slot] of active()) if (slots.has(site)) {
    expect(slot).toBe(slots.get(site))
    overlap++
  }
  expect(overlap).toBeGreaterThan(before.instances / 2)
  expect(forest.stats().generated - before.generated).toBeLessThan(before.generated / 2)
  forest.update(cellSize, 0, 30000)
  expect(forest.stats().drawnInstances).toBe(0)
  forest.update(cellSize, 0, 200)
  expect(forest.stats().drawnInstances).toBeGreaterThan(0)
  expect(forest.stats(false).drawnInstances).toBe(0)
  forest.setTier('medium')
  fill()
  expect(forest.stats().instances).toBeLessThan(before.instances)
  forest.setTier('low')
  forest.update(0, 0, 200)
  expect(forest.stats()).toMatchObject({ instances: 0, drawnInstances: 0, pending: 0 })
  forest.setTier('high')
  fill()
  barren = true
  forest.reset()
  fill()
  expect(forest.stats().instances).toBe(0)
  expect(active().size).toBe(0)
})

it('includes far cells beyond the original nearby-tree window without holes', () => {
  const end = 4200
  const offsets = residentCellOffsets(end)
  expect(offsets.some(([x]) => Math.abs(x) > 5)).toBe(true)
  const keys = new Set(offsets.map(([x, z]) => `${x},${z}`))
  for (let z = -12; z <= 12; z++) for (let x = -12; x <= 12; x++) {
    const nearest = Math.hypot(Math.max(0, Math.abs(x) - 1), Math.max(0, Math.abs(z) - 1)) * TREE_CELL_M
    expect(keys.has(`${x},${z}`)).toBe(nearest <= end)
  }
})
