import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { STAMP_FILTER_ID } from '../../src/render/ui/navalComms.js'

describe('naval-comms.css', () => {
  const css = readFileSync('src/render/ui/naval-comms.css', 'utf8')
  it('does not include proto-nav (prototype-only chrome)', () => {
    expect(css).not.toContain('.proto-nav')
  })
  it('defines the classes Tasks 5/7/8 depend on', () => {
    for (const cls of ['.sheet', '.letterhead', '.form-table', '.ballot-option', '.ballot-box', '.stamp', '.ink-button']) {
      expect(css).toContain(cls)
    }
  })
  it('self-hosts fonts, no external Google Fonts reference', () => {
    expect(css).not.toContain('fonts.googleapis.com')
  })
  it('the filter id `.stamp` references is the one navalComms.ts declares', () => {
    // Task 5 review, Important #1. `.stamp` carries `filter: url(#<id>)`, and
    // per the Filter Effects spec an element referencing an id that does not
    // resolve is NOT RENDERED -- a stamp would be invisible, not merely
    // unfiltered, with nothing logged. Nothing else couples these two files,
    // so without this assertion the CSS and `ensureStampFilter` can drift
    // apart silently (they already did once: the id was `ww2StampRough` in
    // TypeScript and `stampRough` in CSS, papered over by a per-element
    // inline override no other screen would have known to add).
    const referenced = [...css.matchAll(/filter:\s*url\(#([^)]+)\)/g)].map((m) => m[1])
    expect(referenced.length).toBeGreaterThan(0)
    for (const id of referenced) expect(id).toBe(STAMP_FILTER_ID)
  })
  it('styles no bare element selector -- the app document is a WebGPU canvas, not the prototype page', () => {
    // Task 5, the first consumer, imports this file into the app bundle. The
    // prototype's own `* { box-sizing }` / `html, body { padding, flex,
    // background }` rules would then restyle the game's own document. They
    // are scoped to `.naval-comms` instead; this asserts they stay that way.
    // A rule's selector is whatever precedes its `{`, on the same line here
    // since that is this file's formatting throughout.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
    // Every rule is `<selector> { ... }` and nothing here nests, so the text
    // between a `}` and the next `{` is exactly one selector list.
    const selectors = bare.split('}')
      .map((chunk) => (chunk.includes('{') ? chunk.slice(0, chunk.indexOf('{')).trim() : ''))
      .filter((s) => s !== '' && !s.startsWith('@'))
    expect(selectors.length).toBeGreaterThan(20)
    for (const selector of selectors) {
      for (const part of selector.split(',')) {
        // Only the leftmost compound matters: `.routing dt` cannot escape
        // `.routing`, but a bare `body` or `*` applies to the whole document.
        const first = part.trim().split(/[\s>+~]/)[0] ?? ''
        if (first.startsWith(':root')) continue
        expect(first, `unscoped element/universal selector: ${first}`).toContain('.')
      }
    }
  })
})
