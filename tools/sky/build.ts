import { mkdirSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { buildDetail, buildShape } from './noise.js'
import { detailPath, shapePath, SKY_DIR } from './load.js'

mkdirSync(SKY_DIR, { recursive: true })
const shape = buildShape(), detail = buildDetail()
writeFileSync(shapePath(), gzipSync(shape, { level: 9 }))
writeFileSync(detailPath(), gzipSync(detail, { level: 9 }))
console.log(`wrote ${shapePath()} (${shape.length} bytes raw) and ${detailPath()} (${detail.length} bytes raw)`)
