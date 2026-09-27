import { describe, it, expect } from 'vitest'
import { missionWorld } from './fixture.js'

/** M3-R10 / friendly-fire handoff §3 item 8: a mission may not order the
 *  player to destroy his own side, or to protect the enemy's. */
describe('objective targets are on the right side', () => {
  it('destroy aimed at an allied ship fails the load, naming it', () => {
    expect(() => missionWorld({ objectives: [
      { id: 'x', label: 'X', priority: 'primary', kind: 'destroy', targets: ['cv-1'] },
    ] })).toThrow(/objective "x".*"cv-1".*allied/)
  })
  it('destroy aimed at an allied airfield structure fails the load', () => {
    expect(() => missionWorld({ objectives: [
      { id: 'x', label: 'X', priority: 'primary', kind: 'destroy', targets: ['tacloban-tower'] },
    ] })).toThrow(/"tacloban-tower".*allied/)
  })
  it('protect aimed at an axis ship fails the load', () => {
    expect(() => missionWorld({ objectives: [
      { id: 'x', label: 'X', priority: 'primary', kind: 'protect', targets: ['convoy'] },
    ] })).toThrow(/objective "x".*"maru-1".*axis/)
  })
  it('deny naming an allied hostile fails the load', () => {
    expect(() => missionWorld({ objectives: [
      { id: 'x', label: 'X', priority: 'primary', kind: 'deny', hostiles: ['cv-1'], around: { x: 0, z: 0 }, radiusM: 100 },
    ] })).toThrow(/"cv-1".*allied/)
  })
  it('the legal forms still load', () => {
    const w = missionWorld({ objectives: [
      { id: 'a', label: 'A', priority: 'primary', kind: 'destroy', targets: ['convoy', 'dulag-hangar-1', 'raid'] },
      { id: 'b', label: 'B', priority: 'primary', kind: 'protect', targets: ['cv-1', 'tacloban-tower'] },
      { id: 'c', label: 'C', priority: 'primary', kind: 'deny', hostiles: ['raid'], around: 'cv-1', radiusM: 5000 },
    ] })
    expect(w.mission!.objectives.map((o) => o.resolved.length)).toEqual([4, 2, 1])
  })
})
