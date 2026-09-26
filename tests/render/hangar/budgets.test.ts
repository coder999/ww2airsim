import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { readFileSync, readdirSync } from 'node:fs'
import { loadModelEntries } from '../../../tools/models/manifest.js'
import { budgetForUrl, countsReport, countsText, parseBudgets } from '../../../src/render/hangar/budgets.js'
import { WILDCAT_MODEL_PATH, shipModelPath } from '../../../src/render/content.js'
import { SHIP_MODELS } from '../../../src/render/scene/shipModels.js'

const entryFiles = (): Record<string, unknown> => Object.fromEntries(
  readdirSync('tools/models/entries').filter((f) => f.endsWith('.json'))
    .map((f) => [`/tools/models/entries/${f}`, JSON.parse(readFileSync(`tools/models/entries/${f}`, 'utf8')) as unknown]),
)
const box = (): Mesh => new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()) // 12 triangles, 1 draw

describe('parseBudgets', () => {
  it("agrees with the build's own manifest parse, entry for entry", () => {
    const table = parseBudgets(entryFiles())
    const expected = new Map(loadModelEntries().map((e) => [e.output, e.budget]))
    expect(new Map(table)).toEqual(expected)
  })

  it('finds a budget for every model the runtime can load', () => {
    const table = parseBudgets(entryFiles())
    for (const path of [WILDCAT_MODEL_PATH, ...Object.keys(SHIP_MODELS).map(shipModelPath)]) {
      expect(budgetForUrl(table, `/${path}`), path).not.toBeNull()
    }
  })

  it('names the file when an entry has no budget', () => {
    expect(() => parseBudgets({ '/tools/models/entries/x.json': { output: 'content/ships/x.glb' } })).toThrow(/x\.json/)
  })
})

describe('countsReport', () => {
  const table = parseBudgets({ '/e/a.json': { output: 'content/aircraft/a.glb', budget: { maxBytes: 1, maxTriangles: 24, maxDrawCalls: 2 } } })

  it('counts the tagged model apart from runtime additions, against its budget', () => {
    const model = new Group(); model.userData.modelUrl = '/content/aircraft/a.glb'
    model.add(box(), box())
    const root = new Group(); root.add(model, box()) // the third box is a runtime store
    const r = countsReport(root, table)
    expect(r.scene).toEqual({ triangles: 36, drawCalls: 3 })
    expect(r.model).toEqual({ triangles: 24, drawCalls: 2 })
    expect(r.modelUrl).toBe('/content/aircraft/a.glb')
    expect(r.over).toBe(false)
    model.add(box())
    expect(countsReport(root, table).over).toBe(true)
  })

  it('a model with no tag or no budget reads "no manifest budget" and is never over', () => {
    const root = new Group(); root.add(box())
    const r = countsReport(root, table)
    expect(r).toMatchObject({ model: null, modelUrl: null, budget: null, over: false })
    expect(countsText(r)).toEqual({ lines: ['Scene 12 triangles, 1 draw calls', 'No manifest budget'], over: false })
  })

  it('reads model against budget in the text', () => {
    const model = new Group(); model.userData.modelUrl = '/content/aircraft/a.glb'; model.add(box())
    const root = new Group(); root.add(model)
    expect(countsText(countsReport(root, table)).lines).toEqual([
      'Scene 12 triangles, 1 draw calls',
      'Model 12 / 24 triangles, 1 / 2 draw calls',
    ])
  })
})
