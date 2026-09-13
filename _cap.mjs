import { chromium } from 'playwright'
const out = process.argv[2]
const b = await chromium.connect('ws://127.0.0.1:39000/', { headers: { 'x-playwright-launch-options': JSON.stringify({ channel: 'chromium', headless: false }) }, timeout: 60000 })
const page = await b.newPage({ viewport: { width: 2560, height: 1440 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(7000)
await page.screenshot({ path: out })
await b.close()
