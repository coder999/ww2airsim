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
export interface CreditSource { readonly source: { readonly license: string; readonly url?: string; readonly author?: string } }
export interface ModelCredit { readonly author: string; readonly url: string }

/** One credit per CC BY entry, in the order given, once per source URL (two entries built from one download credit it once). */
export function modelCredits(entries: readonly CreditSource[]): ModelCredit[] {
  const seen = new Set<string>()
  const out: ModelCredit[] = []
  for (const e of entries) {
    if (e.source.license !== 'CC-BY-4.0' || e.source.url === undefined || e.source.author === undefined || seen.has(e.source.url)) continue
    seen.add(e.source.url)
    out.push({ author: e.source.author, url: e.source.url })
  }
  return out
}

/** One run of the credit line: plain text, or a link when `href` is set. */
export interface CreditPart { readonly text: string; readonly href?: string }

/**
 * The authors, between "Models: " and the licence, as text and link runs.
 * Each author is named once, in first-appearance order: a single work links
 * the name; several works leave the name plain and link each work by number,
 * "KTKloss (1 2 3 4)", so every work keeps its own link (Mark, 2026-09-27).
 */
export function modelCreditParts(credits: readonly ModelCredit[]): CreditPart[] {
  const byAuthor = new Map<string, string[]>()
  for (const c of credits) byAuthor.set(c.author, [...(byAuthor.get(c.author) ?? []), c.url])
  const out: CreditPart[] = []
  for (const [author, urls] of byAuthor) {
    if (out.length) out.push({ text: ', ' })
    if (urls.length === 1) { out.push({ text: author, href: urls[0]! }); continue }
    out.push({ text: author }, { text: ' (' })
    urls.forEach((href, i) => out.push(...(i ? [{ text: ' ' }] : []), { text: String(i + 1), href }))
    out.push({ text: ')' })
  }
  return out
}

/** The line as plain text, which is all a `node` test can see; `createLegend` renders the same parts, linking each work and the licence. */
export function modelCreditsText(credits: readonly ModelCredit[]): string {
  return credits.length === 0 ? '' : `Models: ${modelCreditParts(credits).map((p) => p.text).join('')} (CC BY 4.0)`
}
