import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { MODEL_STANCE } from '../../src/render/scene/stance.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

// The drawn-stance tilt (tailDownFraction, stanceTiltRad, drawnPose) was retired in T1
// (2026-09-28): the sim carries the ground attitude and the drawing draws the sim. What stays is
// the measured stance table, the reference the specs' wheel layout is held to.
const specs = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.replace(/\.json$/, '')))

describe('MODEL_STANCE', () => {
  it.each(specs.map((s) => [s.id, s.view.model] as const))('%s: its drawn model (%s) has a measured stance', (_id, model) => {
    expect(MODEL_STANCE[model], `${model} has no MODEL_STANCE entry`).toBeDefined()
  })
})
