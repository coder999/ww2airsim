import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { staticModelPath } from '../../src/render/content.js'
import { CANOPY_NODES, canopySway } from '../../src/render/scene/parachutist.js'

/** The node names the view needs, read out of the committed glb itself (a rig rename must fail here, not at runtime). */
function glbNodeNames(path: string): string[] {
  const buf = readFileSync(path)
  expect(buf.toString('ascii', 0, 4)).toBe('glTF')
  const jsonLength = buf.readUInt32LE(12)
  expect(buf.toString('ascii', 16, 20)).toBe('JSON')
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLength)) as { nodes: { name?: string }[] }
  return json.nodes.flatMap((n) => (n.name === undefined ? [] : [n.name]))
}

describe('the parachuting-person rig against the view (F7A Task 9)', () => {
  it('has every node the view drives', () => {
    const names = glbNodeNames(staticModelPath('equipment', 'parachuting-person-rig'))
    for (const node of CANOPY_NODES) expect(names, node).toContain(node)
  })
})

describe('canopy sway is view-only, deterministic and bounded (Mark, 2026-10-15)', () => {
  const sway = (tick: number, wind: number, phase: Parameters<typeof canopySway>[3] = 'canopy') => canopySway(tick, wind, 5.5, phase)

  it('is a pure function of its inputs: the same inputs give the same sway, with no random call and no clock', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random in the sway') })
    const now = vi.spyOn(performance, 'now').mockImplementation(() => { throw new Error('clock in the sway') })
    try {
      expect(sway(1234, 8)).toEqual(sway(1234, 8))
      expect(sway(1234, 8)).not.toEqual(sway(1300, 8))
    } finally { random.mockRestore(); now.mockRestore() }
  })

  it('swings more in more wind, never more than 9 degrees, and keeps swinging in calm air', () => {
    const peak = (wind: number) => Math.max(...Array.from({ length: 600 }, (_, i) => Math.abs(sway(i, wind).rollRad)))
    expect(peak(0)).toBeGreaterThan(0)
    expect(peak(12)).toBeGreaterThan(peak(2))
    expect(peak(60)).toBeLessThanOrEqual((9 * Math.PI) / 180 + 1e-9)
  })

  it('is still while the pilot is packed, clearing the airframe, or on the ground', () => {
    for (const phase of ['separating', 'down', 'dead'] as const) expect(sway(400, 12, phase)).toEqual({ rollRad: 0, pitchRad: 0 })
  })
})
