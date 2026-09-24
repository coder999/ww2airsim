import { mkdirSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { buildCoverage, buildDetail, buildShape } from './noise.js'
import { coveragePath, detailPath, shapePath, SKY_DIR } from './load.js'

mkdirSync(SKY_DIR, { recursive: true })
const shape = buildShape(), detail = buildDetail(), coverage = buildCoverage()
writeFileSync(shapePath(), gzipSync(shape, { level: 9 }))
writeFileSync(detailPath(), gzipSync(detail, { level: 9 }))
writeFileSync(coveragePath(), gzipSync(coverage, { level: 9 }))
console.log(`wrote ${shapePath()} (${shape.length} bytes raw), ${detailPath()} (${detail.length} bytes raw), and ${coveragePath()} (${coverage.length} bytes raw)`)
