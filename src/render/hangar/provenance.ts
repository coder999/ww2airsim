// src/render/hangar/provenance.ts
import { z } from 'zod'
import type { Object3D } from 'three'

/**
 * Where each shipped model came from, for the Hangar card's Model row: a
 * Sketchfab download (author, link, licence) or one of our own (Blender, or
 * generated in code). Read from tools/models/entries/*.json like budgets.ts,
 * and for the same reason: the page cannot import tools/models/manifest.ts.
 * tests/render/hangar/provenance.test.ts pins it to the manifest's own parse.
 * The legend's "Models:" line credits the downloads in one line; this row
 * says which model each author made (Mark asked, 2026-09-27).
 */
export type ModelProvenance =
  | { readonly kind: 'sketchfab'; readonly author: string; readonly url: string; readonly license: string }
  | { readonly kind: 'blender' | 'generated'; readonly license: string }
/** Output path (e.g. `content/aircraft/f4u-corsair.glb`) to its provenance. */
export type ProvenanceTable = ReadonlyMap<string, ModelProvenance>

const Entry = z.object({
  output: z.string(),
  source: z.object({ kind: z.enum(['sketchfab', 'blender', 'generated']).optional(), url: z.string().optional(), author: z.string().optional(), license: z.string() }),
})

export function parseProvenance(files: Record<string, unknown>): ProvenanceTable {
  const table = new Map<string, ModelProvenance>()
  for (const [path, raw] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const r = Entry.safeParse(raw)
    if (!r.success) throw new Error(`${path}: ${r.error.message}`)
    const s = r.data.source
    // Entries written before O1 carry no `kind`: they are Sketchfab downloads (manifest.ts).
    const kind = s.kind ?? 'sketchfab'
    if (kind === 'sketchfab') {
      if (s.url === undefined || s.author === undefined) throw new Error(`${path}: a download needs source.url and source.author`)
      table.set(r.data.output, { kind, author: s.author, url: s.url, license: s.license })
    } else table.set(r.data.output, { kind, license: s.license })
  }
  return table
}

/** `url` is what the model cache fetched: BASE_URL + the entry's output path. */
export function provenanceForUrl(table: ProvenanceTable, url: string): ModelProvenance | null {
  for (const [output, p] of table) if (url === output || url.endsWith(`/${output}`)) return p
  return null
}

const LICENSE_NAMES: Readonly<Record<string, string>> = { 'CC-BY-4.0': 'CC BY 4.0', 'CC0-1.0': 'CC0' }

export function provenanceText(p: ModelProvenance): string {
  if (p.kind === 'sketchfab') return `Sketchfab download by ${p.author} (${LICENSE_NAMES[p.license] ?? p.license})`
  return `${p.kind === 'blender' ? 'Original Blender model' : 'Original model generated in code'} (${p.license})`
}

/** The card's source for a drawn model: the model cache tags each loaded glb's subtree with
 *  `userData.modelUrl`. An aircraft's hung stores are ordnance glbs, tagged too, so the
 *  airframe is the one tag outside content/ordnance/ (an ordnance entry drawn alone is its
 *  own). No tag at all means the object is drawn in code. */
export function modelSource(root: Object3D, table: ProvenanceTable): ModelProvenance | 'code' | null {
  const urls: string[] = []
  const find = (o: Object3D): void => {
    if (typeof o.userData.modelUrl === 'string') { urls.push(o.userData.modelUrl); return }
    o.children.forEach(find)
  }
  find(root)
  if (urls.length === 0) return 'code'
  const own = urls.find((u) => !u.includes('content/ordnance/')) ?? urls[0]!
  return provenanceForUrl(table, own)
}
