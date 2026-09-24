import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

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
})
