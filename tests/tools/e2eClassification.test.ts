import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CAPTURE_TEST_FILES } from '../e2e/captureTools.js'

const E2E_DIR = fileURLToPath(new URL('../e2e/', import.meta.url))
const specFiles = readdirSync(E2E_DIR).filter(file => file.endsWith('.spec.ts')).sort()
const source = (file: string): string => readFileSync(new URL(`../e2e/${file}`, import.meta.url), 'utf8')

describe('E2E suite classification', () => {
  it('keeps every capture-gated program in the capture manifest', () => {
    const declared = [...CAPTURE_TEST_FILES].sort()
    const gated = specFiles.filter(file => source(file).includes('E2E_CAPTURE')).sort()
    expect(gated).toEqual(declared)
    expect(declared.every(file => specFiles.includes(file))).toBe(true)
  })

  it('does not commit focused tests', () => {
    const focused = specFiles.filter(file => /\b(?:test|describe)\.only\s*\(/.test(source(file)))
    expect(focused).toEqual([])
  })

  it('allows conditional skips only in capture tools and the headed-GPU probe', () => {
    const captureFiles = new Set<string>(CAPTURE_TEST_FILES)
    const allowedCorrectnessSkips = new Set(['qualityProbeChrome.spec.ts'])
    const unexpected = specFiles.filter(file =>
      /\btest\.skip\s*\(/.test(source(file))
      && !captureFiles.has(file)
      && !allowedCorrectnessSkips.has(file),
    )
    expect(unexpected).toEqual([])
  })

  it('does not restore a second private gate around budget tests', () => {
    const staleGate = specFiles.filter(file => source(file).includes('process.env.TAKRAM_GAME_BUDGET'))
    expect(staleGate).toEqual([])
  })
})
