import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DEMO_DIR = '/home/nochaserz/Documents/Coding Projects/golden-audit/design-demos'
const directions = [
  { file: 'direction-a-trust-ledger.html', name: 'a-trust-ledger', w: 1280, h: 1000 },
  { file: 'direction-b-calm-audit.html', name: 'b-calm-audit', w: 1280, h: 1050 },
  { file: 'direction-c-signal-map.html', name: 'c-signal-map', w: 1280, h: 1150 },
]

const browser = await chromium.launch({ executablePath: '/home/nochaserz/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome' })
for (const d of directions) {
  const filePath = 'file://' + join(DEMO_DIR, d.file)
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: 2 })
    await page.goto(filePath, { waitUntil: 'networkidle' })
    if (theme === 'light') {
      await page.click('.toggle')
      await page.waitForTimeout(250)
    }
    const out = join(DEMO_DIR, `${d.name}-${theme}.png`)
    await page.screenshot({ path: out, fullPage: true })
    console.log('wrote', out)
    await page.close()
  }
}
await browser.close()
