import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { bakeCanopy } from './canopy.js'

const out = resolve(process.argv[2] ?? 'content/canopy')
mkdirSync(out, { recursive: true })
const data = bakeCanopy()
const gz = gzipSync(data, { level: 9 })
writeFileSync(resolve(out, 'material.bin.gz'), gz)
console.log(`Canopy: ${data.length} decoded bytes, ${gz.length} compressed; ${out}`)
