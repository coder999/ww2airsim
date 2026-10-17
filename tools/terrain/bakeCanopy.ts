import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { bakeCanopy, bakeCanopyHeight } from './canopy.js'

const out = resolve(process.argv[2] ?? 'content/canopy')
mkdirSync(out, { recursive: true })
const data = bakeCanopy()
const gz = gzipSync(data, { level: 9 })
writeFileSync(resolve(out, 'material.bin.gz'), gz)
console.log(`Canopy: ${data.length} decoded bytes, ${gz.length} compressed; ${out}`)
const height = bakeCanopyHeight()
const heightGz = gzipSync(height, { level: 9 })
writeFileSync(resolve(out, 'height.bin.gz'), heightGz)
console.log(`Canopy height: ${height.length} decoded bytes, ${heightGz.length} compressed; ${out}`)
