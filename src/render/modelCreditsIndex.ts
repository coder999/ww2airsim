// src/render/modelCreditsIndex.ts
import { modelCredits, type CreditSource } from './modelCredits.js'

/**
 * Every model entry, bundled at build time by Vite's glob import (a browser
 * cannot list tools/models/entries/), sorted by file name so the line is
 * stable. The same pattern as src/render/hangar/contentIndex.ts.
 */
const entries = import.meta.glob('/tools/models/entries/*.json', { eager: true, import: 'default' })

export const MODEL_CREDITS = modelCredits(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)).map(([, e]) => e as CreditSource))
