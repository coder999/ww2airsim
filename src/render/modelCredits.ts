// src/render/modelCredits.ts
/**
 * The in-app credit for every CC BY model the game draws (ship-models spec
 * §10, Open item 3, approved by Mark 2026-09-25): one "Models:" line in the
 * legend's credits, derived from tools/models/entries/*.json, so a model
 * cannot ship without its credit. CC BY 4.0 §3(a) asks for the creator, a
 * link to the material and one to the licence "in any reasonable manner";
 * the legend meets WorldCover's the same way (legend.ts). Before this, the
 * committed Wildcat (CC BY, rojatsu) had no in-app credit at all.
 */
export interface CreditSource { readonly source: { readonly url: string; readonly author: string; readonly license: string } }
export interface ModelCredit { readonly author: string; readonly url: string }

/** One credit per CC BY entry, in the order given, once per source URL (two entries built from one download credit it once). */
export function modelCredits(entries: readonly CreditSource[]): ModelCredit[] {
  const seen = new Set<string>()
  const out: ModelCredit[] = []
  for (const e of entries) {
    if (e.source.license !== 'CC-BY-4.0' || seen.has(e.source.url)) continue
    seen.add(e.source.url)
    out.push({ author: e.source.author, url: e.source.url })
  }
  return out
}

/** The line as plain text, which is all a `node` test can see; `createLegend` links each author and the licence. */
export function modelCreditsText(credits: readonly ModelCredit[]): string {
  return credits.length === 0 ? '' : `Models: ${credits.map((c) => c.author).join(', ')} (CC BY 4.0)`
}
