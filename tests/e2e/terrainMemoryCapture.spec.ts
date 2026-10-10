import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { spawnUrl, startGame, type DiagWindow } from './harness.js'
import { toLocal } from '../../src/sim/world/projection.js'

// L1.1 (2026-10-10): what one Asset Quality tier costs a first visit -- bytes
// fetched, seconds from navigation to the physics field (the moment the game
// can fly), Chrome's JS heap, and the GPU process's dedicated video memory. A
// measurement tool, not a test: skipped unless E2E_CAPTURE=1. One tier per
// invocation (`TERRAIN_TIER=low|medium`), so each run gets its own browser and
// GPU process: contexts in one worker share the GPU process, and a previous
// tier's textures would be counted against the next.
//
// The GPU number is read on ryzen itself (Windows counter
// `\GPU Process Memory(pid_*)\Dedicated Usage`) for the Playwright Chrome GPU
// process started after this test began, so it needs the ryzen server
// (`PW_REMOTE`) and `ssh ryzen`. Docs: docs/testing.md, capture tools.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const TIER = process.env.TERRAIN_TIER ?? 'medium'
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/terrain-memory'
const FT = 0.3048

type GpuProc = { pid: number; startMs: number; dedicatedBytes: number }
function playwrightGpuProcesses(): GpuProc[] {
  const ps = [
    "$c = (Get-Counter '\\GPU Process Memory(*)\\Dedicated Usage').CounterSamples",
    "$procs = Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | ? { $_.CommandLine -like '*--type=gpu-process*' -and ($_.ExecutablePath -like '*ms-playwright*' -or $_.ExecutablePath -like 'C:\\e2e\\browsers*') }",
    '$out = foreach ($p in $procs) { $b = ($c | ? { $_.InstanceName -like "pid_$($p.ProcessId)_*" } | Measure-Object CookedValue -Sum).Sum; ' +
      '[pscustomobject]@{ pid = $p.ProcessId; startMs = [long]([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds(); dedicatedBytes = [long]$b } }',
    'ConvertTo-Json -Compress @($out)',
  ].join('; ')
  const raw = execFileSync('ssh', ['ryzen', ps], { encoding: 'utf8' }).trim()
  return JSON.parse(raw || '[]') as GpuProc[]
}

test(`first visit at Asset Quality ${TIER}: bytes, time to ready, memory`, async ({ page }) => {
  test.setTimeout(600_000)
  mkdirSync(OUT, { recursive: true })
  const startMs = Date.now()
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.addInitScript((tier) => {
    window.localStorage.setItem('ww2airsim.assetQuality.v1', tier)
    // The default buffer holds 250 entries, and the dev server's modules
    // alone fill it before the first terrain level is fetched.
    performance.setResourceTimingBufferSize(100_000)
  }, TIER)
  // West of the Nacolod massif at 2,500 ft, heading east toward it: hills in
  // the near field, where ring 0 reads the finest level.
  const peak = toLocal(10.450846, 125.096068)
  const navMs = Date.now()
  await page.goto(spawnUrl({ x: peak.x - 6000, y: 2500 * FT, z: peak.z }))
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 540_000,
    polling: 100,
  })
  const readyS = (Date.now() - navMs) / 1000
  const bytes = await page.evaluate(() => {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const sum = (list: PerformanceResourceTiming[]) => list.reduce((s, e) => s + (e.transferSize || e.encodedBodySize), 0)
    return { all: sum(entries), terrain: sum(entries.filter((e) => e.name.includes('/content/terrain/'))) }
  })
  await startGame(page)
  await page.waitForTimeout(6000)
  const heapBytes = await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? -1)
  const gpu = playwrightGpuProcesses().filter((p) => p.startMs >= startMs - 5000)
  await page.keyboard.press('Slash')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/${TIER}.png` })
  const errors = await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)
  console.log(
    `TERRAINMEM tier=${TIER} readyS=${readyS.toFixed(1)} bytesAll=${bytes.all} bytesTerrain=${bytes.terrain} ` +
      `jsHeap=${heapBytes} gpuDedicated=${JSON.stringify(gpu.map((p) => p.dedicatedBytes))}`,
  )
  expect(gpu.length, 'exactly one Playwright Chrome GPU process started during this test').toBe(1)
  expect(errors).toEqual([])
})
