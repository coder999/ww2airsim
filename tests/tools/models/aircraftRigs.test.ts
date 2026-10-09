// tests/tools/models/aircraftRigs.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import type { Document, Node } from '@gltf-transform/core'
import { AIRFRAME_RIGS, BAY_DOOR_OPEN_DEG, PART_NAME, surfaceDrive, type GearRig } from '../../../src/render/scene/airframeRigs.js'
import { surfaceAngleRad } from '../../../src/render/scene/pivotedAirframe.js'
import { measureDocument } from '../../../tools/models/measure.js'
import { aircraftModelPath } from '../../../src/render/content.js'
import { loadModelEntries } from '../../../tools/models/manifest.js'
import { modelIO } from '../../../tools/models/document.js'
import { bounds, centroid, radiusAbout, rotateAbout, symmetryError, worldPositions, type Vec3 } from '../../../tools/models/rig.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { airframeMeshes, retractedExcess } from './_retractedSkin.js'

const entries = loadModelEntries()
const specIds = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
const named = (doc: Document, name: string): Node[] => doc.getRoot().listNodes().filter((n) => n.getName() === name)
const one = (doc: Document, name: string): Node => { const n = named(doc, name); expect(n, name).toHaveLength(1); return n[0]! }
function pivotOf(n: Node): { point: Vec3; axis: Vec3 } {
  const axis = n.getExtras()['pivotAxis'] as number[] | undefined
  expect(axis, `${n.getName()} carries no pivotAxis`).toBeDefined()
  return { point: [...n.getWorldTranslation()] as unknown as Vec3, axis: axis as unknown as Vec3 }
}
const MAIN = new Set(['GearL', 'GearR'])

/** How far a retracted leg may stand above the airframe surface beneath it (ray-cast per point, _retractedSkin.ts). */
const SKIN_SLACK_M = 0.08
/** Legs known to fold through the skin, each with its measured excess (m) as a ceiling: the list only shrinks.
 *  Re-measured 2026-09-29 with the per-point ray-cast, which replaced a footprint-maximum measure that passed the
 *  Corsair's wheels standing 0.41 m through its wing. The F6F's real legs turn 90 deg to lie flat as they swing aft;
 *  the rig swings them only (was 0.48 m under the old measure). The Zero's 0.17 m is newly seen, not newly caused. */
const THROUGH_SKIN: Readonly<Record<string, number>> = {
  'f6f-hellcat/GearL': 0.29, 'f6f-hellcat/GearR': 0.29,
  'a6m2-zero/GearL': 0.18, 'a6m2-zero/GearR': 0.18,
}

/** Turning a leg to its up angle: how far its centroid rises, and how far it moves the declared way. */
function retraction(points: readonly Vec3[], pivot: Vec3, axis: Vec3, g: GearRig): { up: number; along: number; height: number } {
  const b = bounds(points)
  const before = centroid(points)
  const after = centroid(points.map((p) => rotateAbout(p, pivot, axis, (g.upAngleDeg * Math.PI) / 180)))
  const along = g.retracts === 'inboard' ? Math.abs(before[2]) - Math.abs(after[2]) : g.retracts === 'forward' ? after[0] - before[0] : before[0] - after[0]
  return { up: after[1] - before[1], along, height: b.max[1] - b.min[1] }
}

// Without a row, describe.each below runs nothing and every check in this file passes vacuously.
it('AIRFRAME_RIGS has at least one rig, every part named per P6', () => {
  expect(Object.keys(AIRFRAME_RIGS).length).toBeGreaterThan(0)
  for (const [id, rig] of Object.entries(AIRFRAME_RIGS)) {
    for (const name of [...rig.props.map((p) => p.node), ...rig.gear.map((g) => g.node), ...rig.turrets, ...(rig.surfaces ?? [])]) expect(name, id).toMatch(PART_NAME)
  }
})

// C2: the airframes with bay doors in their models are exactly the specs that have them, and pinned,
// so neither side can gain or lose doors alone.
it('bay doors: modeled on exactly the specs with bayDoors (C2)', () => {
  const modeled = Object.entries(AIRFRAME_RIGS).filter(([, r]) => (r.doors ?? []).length > 0).map(([id]) => id).sort()
  const specced = specIds.filter((s) => loadAircraftSpec(s).bayDoors !== undefined).sort()
  expect(modeled).toEqual(['b-17-flying-fortress', 'b-29-superfortress', 'g4m-betty', 'ki-21-sally'])
  expect(specced).toEqual(modeled)
})

// Pinned (C1 batches 1 and 2, 2026-10-08), so a filter that matches nothing fails rather than passing
// empty. Batches 3-4 add rows here as their models get surfaces. The F4F is not a rig (wildcat.ts draws
// it): tests/render/wildcat.test.ts checks its surfaces the same two ways.
it('control surfaces: exactly the batch-1 and batch-2 airframes, each driving roll, pitch, yaw and flaps', () => {
  const withSurfaces = Object.entries(AIRFRAME_RIGS).filter(([, r]) => (r.surfaces ?? []).length > 0)
  expect(withSurfaces.map(([id]) => id).sort()).toEqual(['b-29-superfortress', 'f4u-corsair', 'f6f-hellcat', 'g4m-betty', 'ki-21-sally', 'ki-84-frank', 'p-38-lightning'])
  for (const [id, r] of withSurfaces) expect(new Set(r.surfaces!.map((n) => surfaceDrive(n).input)), id).toEqual(new Set(['roll', 'pitch', 'yaw', 'flap']))
})

describe.each(Object.entries(AIRFRAME_RIGS))('rig %s against its committed glb (R3)', (id, rig) => {
  const path = aircraftModelPath(id)
  let doc: Document
  beforeAll(async () => {
    doc = await modelIO().readBinary(new Uint8Array(readFileSync(path)))
  })

  it('has its manifest entry, writing a committed content/aircraft/<id>.glb', () => {
    expect(entries.find((e) => e.id === id)?.output).toBe(path)
    expect(existsSync(path)).toBe(true)
  })

  it('names every rigged part exactly once, each with a unit pivot axis', () => {
    for (const name of [...rig.props.map((p) => p.node), ...rig.gear.map((g) => g.node), ...rig.turrets]) {
      const { axis } = pivotOf(one(doc, name))
      expect(Math.hypot(...axis), `${name} axis length`).toBeCloseTo(1, 6)
    }
  })

  it('drives every part the glb names: no pivoted part is left out of the rig and silently static', () => {
    const inGlb = doc.getRoot().listNodes().map((n) => n.getName()).filter((n) => PART_NAME.test(n)).sort()
    const inRig = [...rig.props.map((p) => p.node), ...rig.gear.map((g) => g.node), ...rig.turrets, ...(rig.surfaces ?? []), ...(rig.doors ?? [])].sort()
    expect(inGlb).toEqual(inRig)
  })

  it('is inside its entry budget, measured off the committed glb (draw calls, triangles, bytes)', () => {
    const e = entries.find((x) => x.id === id)!
    const m = measureDocument(doc)
    expect(m.drawCalls, 'draw calls').toBeLessThanOrEqual(e.budget.maxDrawCalls)
    expect(m.triangles, 'triangles').toBeLessThanOrEqual(e.budget.maxTriangles)
    expect(statSync(path).size, 'bytes').toBeLessThanOrEqual(e.budget.maxBytes)
  })

  it.each(rig.doors ?? [])('cut bay door %s: hinged on its outboard edge, and a positive turn opens it down and out (C2)', (name) => {
    const n = one(doc, name)
    const { point, axis } = pivotOf(n)
    // The hinge runs fore and aft along the door's outboard edge: along x, at the door's largest |z|.
    expect(Math.abs(axis[0]), `${name} axis along x`).toBeGreaterThan(0.999)
    const pts = worldPositions(n)
    const b = bounds(pts)
    const outboard = name.endsWith('R') ? b.max[2] : b.min[2]
    expect(Math.abs(point[2] - outboard), `${name} hinge at the outboard edge`).toBeLessThan(0.01)
    expect(point[0] >= b.min[0] - 1e-3 && point[0] <= b.max[0] + 1e-3, `${name} hinge within the door's length`).toBe(true)
    // Every vertex is inboard of the hinge, and none is above it: the door hangs off its hinge.
    for (const p of pts) expect(Math.abs(p[2]) <= Math.abs(point[2]) + 1e-3 && p[1] <= point[1] + 1e-3, `${name} vertex ${p}`).toBe(true)
    // The keel edge: the points farthest from the hinge. Fully open (BAY_DOOR_OPEN_DEG) they must drop well
    // below the belly and swing outboard toward the hinge's side, never up into the fuselage.
    const dist = pts.map((p) => radiusAbout([p], point, axis))
    const far = Math.max(...dist)
    const keel = pts.filter((_p, i) => dist[i]! > 0.9 * far)
    const was = centroid(keel)
    const now = centroid(keel.map((p) => rotateAbout(p, point, axis, (BAY_DOOR_OPEN_DEG * Math.PI) / 180)))
    expect(now[1] - was[1], `${name} keel edge drops`).toBeLessThan(-0.5 * far)
    expect(Math.abs(now[2]) - Math.abs(was[2]), `${name} keel edge swings outboard`).toBeGreaterThan(0.5 * far)
  })

  it.each(rig.surfaces ?? [])('control surface %s: hinged on its leading edge, and a positive input moves its trailing edge the right way (C1)', (name) => {
    const n = one(doc, name)
    const { point, axis } = pivotOf(n)
    expect(Math.hypot(...axis), `${name} axis`).toBeCloseTo(1, 6)
    const pts = worldPositions(n)
    const dist = pts.map((p) => radiusAbout([p], point, axis))
    // kit.py puts the hinge on the chord line at the piece's own front face, so nothing lies ahead of it: every
    // vertex is aft along -x taken square to the axis. A hinge at mid-chord or the trailing edge fails here.
    const ax = -axis[0]
    const aft = [-1 - ax * axis[0], -ax * axis[1], -ax * axis[2]] as const
    const len = Math.hypot(...aft)
    const ahead = Math.min(...pts.map((p) => ((p[0] - point[0]) * aft[0] + (p[1] - point[1]) * aft[1] + (p[2] - point[2]) * aft[2]) / len))
    // Dihedral tilts the front face against that direction: the worst is 1.8 mm, G4M Flap1 (measured 2026-10-08),
    // well inside CONTROL_GAP_M's 12 mm. A hinge one gap forward would stand 12 mm ahead and fail.
    expect(ahead, `${name}: how far its foremost vertex stands ahead of the hinge (m)`).toBeGreaterThan(-0.002)
    // The trailing edge: the points farthest from the hinge. A +1 input (full deflection; flaps fully down)
    // must move them as aircraftRigs.ts's surfaceDrive says: +roll raises the right aileron and lowers the
    // left, +pitch raises the elevator, +yaw swings the rudder to starboard (+z), and flaps go down.
    const far = Math.max(...dist)
    const te = pts.filter((_p, i) => dist[i]! > 0.9 * far)
    const moved = centroid(te.map((p) => rotateAbout(p, point, axis, surfaceAngleRad(name, 1))))
    const was = centroid(te)
    const d = surfaceDrive(name)
    const [k, want] = d.input === 'yaw' ? [2, 1] : d.input === 'flap' ? [1, -1] : d.input === 'pitch' ? [1, 1] : [1, name.endsWith('R') ? 1 : -1]
    expect(Math.sign(moved[k]! - was[k]!), `${name} trailing edge along ${'xyz'[k]}`).toBe(want)
    expect(Math.abs(moved[k]! - was[k]!), `${name} moves visibly`).toBeGreaterThan(0.05)
  })

  it('every propeller spins about body x and is N-fold symmetric about its pivot (Review Focus 1)', () => {
    for (const p of rig.props) {
      const { point, axis } = pivotOf(one(doc, p.node))
      expect(Math.abs(axis[0]), `${p.node} axis ${axis}`).toBeGreaterThan(0.999)
      const pts = worldPositions(one(doc, p.node))
      const radius = radiusAbout(pts, point, axis)
      expect(radius, `${p.node} radius`).toBeGreaterThan(0.5)
      const err = symmetryError(pts, point, axis, p.blades)
      // + 1e-9: symmetryError caps at 2% of the radius, and a tolerance set at that cap (a Ruling) must not fail on rounding.
      expect(err / radius, `${p.node}: ${p.blades}-fold error ${err.toFixed(4)} m of radius ${radius.toFixed(3)}`).toBeLessThanOrEqual((p.symmetryTolerance ?? 0.01) + 1e-9)
      // Holds even where a mesh's vertex orbits cannot close (a symmetryTolerance Ruling): a hub taken from the
      // prop's bounds center (a 3-blade prop's is r/4 off) or from nowhere near the prop fails here.
      const offset = radiusAbout([centroid(pts)], point, axis)
      expect(offset / radius, `${p.node}: vertex centroid ${offset.toFixed(4)} m off the spin axis, radius ${radius.toFixed(3)}`).toBeLessThanOrEqual(0.05)
    }
  })

  it('one propeller is Prop; several are Prop1..PropN, port (-z) to starboard by hub z (P6)', () => {
    if (rig.props.length === 1) {
      expect(rig.props[0]!.node).toBe('Prop')
      return
    }
    expect(rig.props.map((p) => p.node)).toEqual(rig.props.map((_, i) => `Prop${i + 1}`))
    const hubs = rig.props.map((p) => pivotOf(one(doc, p.node)).point[2])
    for (let i = 0; i + 1 < hubs.length; i++) {
      expect(hubs[i]!, `${rig.props[i]!.node} (z ${hubs[i]!.toFixed(3)}) is port of ${rig.props[i + 1]!.node} (z ${hubs[i + 1]!.toFixed(3)})`).toBeLessThan(hubs[i + 1]!)
    }
  })

  it('every gear leg hinges at its top and retracts up and the declared way (Review Focus 4)', () => {
    for (const g of rig.gear) {
      const node = one(doc, g.node)
      const { point, axis } = pivotOf(node)
      const pts = worldPositions(node)
      const b = bounds(pts)
      expect(b.max[1] - point[1], `${g.node}: hinge ${point[1].toFixed(3)} vs top ${b.max[1].toFixed(3)}`).toBeLessThanOrEqual(0.2 * (b.max[1] - b.min[1]) + 0.05)
      const r = retraction(pts, point, axis, g)
      expect(r.up, `${g.node} rises`).toBeGreaterThan(0.25 * r.height)
      expect(r.along, `${g.node} moves ${g.retracts}`).toBeGreaterThan(0.25 * r.height)
    }
  })

  it('every retracted leg stays under the airframe surface beneath it (Review Focus 4)', () => {
    const meshes = airframeMeshes(doc)
    for (const g of rig.gear) {
      const node = one(doc, g.node)
      const { point, axis } = pivotOf(node)
      const { excess, covered } = retractedExcess(meshes, node, point, axis, g.upAngleDeg)
      expect(covered, `${g.node}: no airframe under its folded leg`).toBeGreaterThan(0)
      const known = THROUGH_SKIN[`${id}/${g.node}`]
      const msg = `${g.node} at ${g.upAngleDeg} deg stands ${excess.toFixed(3)} m above the airframe surface beneath it`
      if (known === undefined) expect(excess, msg).toBeLessThanOrEqual(SKIN_SLACK_M)
      else {
        expect(excess, `${msg}: a THROUGH_SKIN entry that no longer applies must be deleted`).toBeGreaterThan(SKIN_SLACK_M)
        expect(excess, msg).toBeLessThanOrEqual(known)
      }
    }
  }, 120_000)

  it('turrets run nose to tail, dorsal before ventral at one station, each on a vertical axis', () => {
    const centers = rig.turrets.map((t) => { const n = one(doc, t); expect(Math.abs(pivotOf(n).axis[1]), `${t} axis`).toBeGreaterThan(0.999); return centroid(worldPositions(n)) })
    for (let i = 0; i + 1 < centers.length; i++) {
      const [a, b] = [centers[i]!, centers[i + 1]!]
      expect(a[0] > b[0] + 0.5 || (Math.abs(a[0] - b[0]) <= 0.5 && a[1] > b[1]), `${rig.turrets[i]} before ${rig.turrets[i + 1]}`).toBe(true)
    }
  })

  it("stands on the gear height of every aircraft spec that draws it (Z3's gear.heightM, P1)", () => {
    const mains = rig.gear.filter((g) => MAIN.has(g.node))
    for (const spec of specIds.map((s) => loadAircraftSpec(s)).filter((s) => s.view.model === id)) {
      // A fixed gear (the Val's spats) has no rig nodes: its wheels are part of the airframe mesh, so the lowest point of every
      // node but the propeller stands in for them.
      if (spec.gear.fixed !== true) expect(mains.length, `${spec.id} draws ${id}, whose rig has no main gear`).toBeGreaterThan(0)
      const gearNodes = spec.gear.fixed === true
        ? doc.getRoot().listNodes().filter((n) => n.getMesh() !== null && !rig.props.some((pr) => pr.node === n.getName()))
        : mains.map((g) => one(doc, g.node))
      const lowest = Math.min(...gearNodes.flatMap((n) => worldPositions(n).map((p) => p[1])))
      expect(Math.abs(-lowest - spec.gear.heightM), `${spec.id}: wheels ${(-lowest).toFixed(3)} m below the origin, gear.heightM ${spec.gear.heightM}`).toBeLessThanOrEqual(0.05)
    }
  })
})
