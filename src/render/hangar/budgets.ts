// src/render/hangar/budgets.ts
import { z } from 'zod'
import type { Object3D } from 'three'
import { sceneCounts } from './models.js'

/**
 * Each shipped model's manifest budget (A6M Zero spec §6.1), read from
 * tools/models/entries/*.json, the same files `npm run models:build`
 * enforces. The page cannot import tools/models/manifest.ts (it reads the
 * disk with node:fs), so this parses only the fields the readout needs;
 * tests/render/hangar/budgets.test.ts pins the result to the manifest's own
 * parse, so the two cannot drift.
 */
export interface ModelBudget { readonly maxBytes: number; readonly maxTriangles: number; readonly maxDrawCalls: number }
export interface Counts { readonly triangles: number; readonly drawCalls: number }
/** Output path (e.g. `content/aircraft/wildcat.glb`) to its budget. */
export type BudgetTable = ReadonlyMap<string, ModelBudget>

const EntryBudget = z.object({
  output: z.string(),
  budget: z.object({ maxBytes: z.number().int().positive(), maxTriangles: z.number().int().positive(), maxDrawCalls: z.number().int().positive() }).strict(),
})

export function parseBudgets(files: Record<string, unknown>): BudgetTable {
  const table = new Map<string, ModelBudget>()
  for (const [path, raw] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const r = EntryBudget.safeParse(raw)
    if (!r.success) throw new Error(`${path}: ${r.error.message}`)
    table.set(r.data.output, r.data.budget)
  }
  return table
}

/** `url` is what the model cache fetched: BASE_URL + the entry's output path. */
export function budgetForUrl(table: BudgetTable, url: string): ModelBudget | null {
  for (const [output, budget] of table) if (url === output || url.endsWith(`/${output}`)) return budget
  return null
}

export interface CountsReport {
  /** Everything visible under the model root. */
  readonly scene: Counts
  /** Only the subtrees the model cache tagged with `userData.modelUrl`; null if none. */
  readonly model: Counts | null
  /** The one tagged URL, or null (none, or more than one). */
  readonly modelUrl: string | null
  readonly budget: ModelBudget | null
  /** The model exceeds its budget on triangles or draw calls. */
  readonly over: boolean
}

export function countsReport(root: Object3D, table: BudgetTable): CountsReport {
  const tagged: Object3D[] = []
  const find = (o: Object3D): void => {
    if (typeof o.userData.modelUrl === 'string') { tagged.push(o); return }
    o.children.forEach(find)
  }
  find(root)
  const scene = sceneCounts(root)
  if (tagged.length === 0) return { scene, model: null, modelUrl: null, budget: null, over: false }
  let triangles = 0, drawCalls = 0
  for (const t of tagged) { const c = sceneCounts(t); triangles += c.triangles; drawCalls += c.drawCalls }
  const urls = [...new Set(tagged.map((t) => t.userData.modelUrl as string))]
  const modelUrl = urls.length === 1 ? urls[0]! : null
  const budget = modelUrl === null ? null : budgetForUrl(table, modelUrl)
  const over = budget !== null && (triangles > budget.maxTriangles || drawCalls > budget.maxDrawCalls)
  return { scene, model: { triangles, drawCalls }, modelUrl, budget, over }
}

export function countsText(r: CountsReport): { readonly lines: readonly string[]; readonly over: boolean } {
  const lines = [`Scene ${r.scene.triangles} triangles, ${r.scene.drawCalls} draw calls`]
  if (r.model === null || r.budget === null) lines.push('No manifest budget')
  else lines.push(`Model ${r.model.triangles} / ${r.budget.maxTriangles} triangles, ${r.model.drawCalls} / ${r.budget.maxDrawCalls} draw calls`)
  return { lines, over: r.over }
}
