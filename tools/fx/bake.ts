// tools/fx/bake.ts
/**
 * `npm run fx:pack` packs tools/fx/renders/ into content/fx/ (plan E2) and writes
 * tools/fx/bake-report.json. `npm run fx:pack -- --check <sheet>` measures one sheet at its
 * rendered size against pack.ts's acceptance rules and writes nothing (non-zero on failure).
 * `npm run fx:bake` is fx:render, then fx:pack.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { FX_CONTENT_BYTES_MAX, FX_SHEETS, fxSheetManifestSchema, type FxSheetName } from '../../src/render/fx/sheetManifest.js'
import { readKtx2Header } from '../textures/ktx2.js'
import { ktxBinary } from '../textures/ktxTool.js'
import {
  acceptance, crossfadeLoop, emitScale, encodeMotion, flowSequence, LADDER, litScale, LOOP_BLEND, LOOPING, measureSheet,
  mipLevels, motionScaleOf, packCell, PASSES, pickFrames, type FramePasses, type Pass, type SheetMetrics,
} from './pack.js'
import { read16 } from './png16.js'
import { fxSceneSha256 } from './sceneHash.js'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const RENDERS = join(ROOT, 'tools/fx/renders/')
const WORK = join(RENDERS, '_pack/')
const OUT = join(ROOT, 'content/fx/')
const REPORT = join(ROOT, 'tools/fx/bake-report.json')
const FILES = { lightA: 'fx-light-a.ktx2', lightB: 'fx-light-b.ktx2', motion: 'fx-motion.ktx2' } as const
const COLS = 3, ROWS = 2

type Meta = { readonly frames: number; readonly cellPx: number; readonly emission: boolean; readonly blender: string; readonly buildHash: string; readonly bakeS: number; readonly renderS: number; readonly samples: number }
export type BakeReport = {
  readonly rung: { readonly cellPx: number; readonly frames: number }
  readonly totalBytes: number
  readonly files: Readonly<Record<string, number>>
  readonly motionScale: number
  readonly sceneSha256: string
  readonly blender: string
  readonly sheets: Readonly<Record<FxSheetName, { readonly metrics: SheetMetrics; readonly litScale: number; readonly emitScale: number; readonly bakeS: number; readonly renderS: number; readonly samples: number }>>
}

async function loadSheet(sheet: FxSheetName, cellPx: number): Promise<{ meta: Meta; frames: FramePasses[] }> {
  const dir = join(RENDERS, sheet)
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as Meta
  const frames: FramePasses[] = []
  for (let k = 0; k < meta.frames; k++) {
    const f = join(dir, `f${String(k).padStart(2, '0')}`)
    const lit = {} as Record<Pass, Float32Array>
    let alpha = new Float32Array(0)
    for (const p of PASSES) { const c = await read16(join(f, `${p}.png`), cellPx); lit[p] = c.lum; if (p === 'front') alpha = c.alpha }
    const emit = meta.emission ? (await read16(join(f, 'emit.png'), cellPx)).lum : new Float32Array(cellPx * cellPx)
    frames.push({ lit, alpha, emit })
  }
  return { meta, frames }
}

type Prepared = { readonly meta: Meta; readonly picked: FramePasses[]; readonly litK: number; readonly emitK: number; readonly metrics: SheetMetrics; readonly failures: string[] }
async function prepare(sheet: FxSheetName, cellPx: number, frames: number | null): Promise<Prepared> {
  const { meta, frames: raw } = await loadSheet(sheet, cellPx)
  const loop = LOOPING.includes(sheet)
  const seq = loop ? crossfadeLoop(raw, LOOP_BLEND) : raw
  const picked = pickFrames(seq.length, frames ?? seq.length, loop).map((i) => seq[i]!)
  const litK = litScale(picked), emitK = emitScale(picked)
  const metrics = measureSheet(picked, cellPx, litK, emitK)
  return { meta, picked, litK, emitK, metrics, failures: acceptance(sheet, metrics, picked.length) }
}

function atlas(cells: readonly Uint8Array[], cellPx: number): Uint8Array {
  const w = COLS * cellPx, out = new Uint8Array(w * ROWS * cellPx * 4)
  cells.forEach((c, cell) => {
    const ox = (cell % COLS) * cellPx, oy = Math.floor(cell / COLS) * cellPx
    for (let y = 0; y < cellPx; y++) out.set(c.subarray(y * cellPx * 4, (y + 1) * cellPx * 4), ((oy + y) * w + ox) * 4)
  })
  return out
}

async function packRung(ktx: string, rung: { cellPx: number; frames: number }): Promise<BakeReport> {
  const { cellPx, frames } = rung
  const prepared = {} as Record<FxSheetName, Prepared>
  for (const s of FX_SHEETS) prepared[s] = await prepare(s, cellPx, frames)
  const failures = FX_SHEETS.flatMap((s) => prepared[s].failures)
  if (failures.length > 0) throw new Error(`acceptance failed at ${cellPx} px x ${frames}:\n${failures.join('\n')}`)
  const builds = new Set(FX_SHEETS.map((s) => `${prepared[s].meta.blender} ${prepared[s].meta.buildHash}`))
  if (builds.size !== 1) throw new Error(`sheets were baked by different Blender builds: ${[...builds].join(', ')}`)
  const flows = Object.fromEntries(FX_SHEETS.map((s) => [s, flowSequence(prepared[s].picked, cellPx, prepared[s].litK, LOOPING.includes(s))])) as Record<FxSheetName, ReturnType<typeof flowSequence>>
  const motionScale = Number(motionScaleOf(FX_SHEETS.flatMap((s) => flows[s]), cellPx).toFixed(5))
  rmSync(WORK, { recursive: true, force: true }); mkdirSync(WORK, { recursive: true })
  const pngs: Record<keyof typeof FILES, string[]> = { lightA: [], lightB: [], motion: [] }
  for (let k = 0; k < frames; k++) {
    const packed = FX_SHEETS.map((s) => packCell(prepared[s].picked[k]!, cellPx, prepared[s].litK, prepared[s].emitK))
    const motion = FX_SHEETS.map((s) => encodeMotion(flows[s][k]!, cellPx, motionScale))
    const layers = { lightA: atlas(packed.map((p) => p.a), cellPx), lightB: atlas(packed.map((p) => p.b), cellPx), motion: atlas(motion, cellPx) }
    for (const image of ['lightA', 'lightB', 'motion'] as const) {
      const png = join(WORK, `${image}-${String(k).padStart(2, '0')}.png`)
      await sharp(Buffer.from(layers[image]), { raw: { width: COLS * cellPx, height: ROWS * cellPx, channels: 4 } }).png().toFile(png)
      pngs[image].push(png)
    }
  }
  const files: Record<string, number> = {}
  for (const image of ['lightA', 'lightB', 'motion'] as const) {
    const out = join(WORK, FILES[image])
    // E1 Ruling R8: Basis (ETC1S), linear; Ruling R5 keeps E1's encoder settings.
    execFileSync(ktx, ['create', '--format', 'R8G8B8A8_UNORM', '--assign-tf', 'linear', '--encode', 'basis-lz', '--clevel', '2', '--qlevel', '128',
      '--generate-mipmap', '--levels', String(mipLevels(cellPx)), '--layers', String(frames), ...pngs[image], out], { stdio: 'inherit' })
    const h = readKtx2Header(new Uint8Array(readFileSync(out)))
    if (h.layerCount !== frames) throw new Error(`${FILES[image]}: ${h.layerCount} layers, expected ${frames}`)
    files[FILES[image]] = statSync(out).size
  }
  const blender = [...builds][0]!
  const manifest = fxSheetManifestSchema.parse({
    version: 1, images: FILES, cellPx, cols: COLS, rows: ROWS, frames, motionScale,
    sheets: FX_SHEETS.map((name, cell) => ({ name, cell })),
    provenance: { generator: 'blender', seed: 0, blenderVersion: blender, sceneSha256: fxSceneSha256() },
  })
  const json = JSON.stringify(manifest, null, 2) + '\n'
  writeFileSync(join(WORK, 'sheets.json'), json)
  files['sheets.json'] = Buffer.byteLength(json)
  return {
    rung, totalBytes: Object.values(files).reduce((a, b) => a + b, 0), files, motionScale, sceneSha256: manifest.provenance.sceneSha256!, blender,
    sheets: Object.fromEntries(FX_SHEETS.map((s) => [s, {
      metrics: prepared[s].metrics, litScale: prepared[s].litK, emitScale: prepared[s].emitK,
      bakeS: prepared[s].meta.bakeS, renderS: prepared[s].meta.renderS, samples: prepared[s].meta.samples,
    }])) as BakeReport['sheets'],
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv[0] === '--check') {
    const sheet = argv[1] as FxSheetName
    if (!(FX_SHEETS as readonly string[]).includes(sheet)) throw new Error(`--check needs a sheet: one of ${FX_SHEETS.join(', ')}`)
    const meta = JSON.parse(readFileSync(join(RENDERS, sheet, 'meta.json'), 'utf8')) as Meta
    const p = await prepare(sheet, meta.cellPx, null)
    const m = p.metrics
    console.log(JSON.stringify({ sheet, frames: p.picked.length, fill: m.fill, edgeAlpha: m.edgeAlpha, peakCoverage: Math.max(...m.coverageByFrame), aspectAtPeak: m.aspectAtPeak, emitFrames: m.emitFrames, seam: m.seam, step: m.step, sixWay: m.sixWay }, null, 2))
    if (p.failures.length > 0) { console.error(p.failures.join('\n')); process.exit(1) }
    console.log(`${sheet}: passes`)
    return
  }
  const ktx = await ktxBinary()
  for (const rung of LADDER) {
    const report = await packRung(ktx, rung)
    console.log(`fx:pack: ${rung.cellPx} px x ${rung.frames} frames = ${report.totalBytes} bytes`)
    if (report.totalBytes > FX_CONTENT_BYTES_MAX) continue
    for (const f of readdirSync(OUT)) rmSync(join(OUT, f))
    for (const f of Object.keys(report.files)) copyFileSync(join(WORK, f), join(OUT, f))
    writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n')
    console.log(`fx:pack: shipped ${rung.cellPx} px x ${rung.frames}; report in tools/fx/bake-report.json`)
    return
  }
  throw new Error(`fx:pack: no rung of ${JSON.stringify(LADDER)} fits ${FX_CONTENT_BYTES_MAX} bytes (spec §6.3)`)
}

await main()
