import { mkdirSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { buildCurl, buildDetail, buildShape } from './noise.js'
import { buildWeather } from './weather.js'
import { curlPath, detailPath, shapePath, SKY_DIR, weatherPath } from './load.js'

mkdirSync(SKY_DIR, { recursive: true })
const shape = buildShape(), detail = buildDetail(), curl = buildCurl(), weather = buildWeather()
writeFileSync(shapePath(), gzipSync(shape, { level: 9 }))
writeFileSync(detailPath(), gzipSync(detail, { level: 9 }))
writeFileSync(curlPath(), gzipSync(curl, { level: 9 }))
writeFileSync(weatherPath(), gzipSync(weather, { level: 9 }))
console.log(`wrote ${shapePath()} (${shape.length} bytes raw), ${detailPath()} (${detail.length} bytes raw), ${curlPath()} (${curl.length} bytes raw), and ${weatherPath()} (${weather.length} bytes raw)`)
