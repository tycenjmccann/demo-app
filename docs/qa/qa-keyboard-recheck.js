import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

// Same ESM/createRequire pattern as qa-browser.js: this repo's package.json
// sets "type": "module", and playwright is installed standalone under
// /tmp/pw (not in this repo's node_modules) to keep package.json /
// package-lock.json untouched.
const require = createRequire(import.meta.url)
const { chromium } = require('/tmp/pw/node_modules/playwright')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = 'http://localhost:4173'
const BUTTON_SELECTOR = 'button[aria-label="Toggle email notifications"]'

async function getMetaInfo(page) {
  return page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Toggle email notifications"]')
    const section = btn ? btn.closest('section') : null
    const metaCount = section ? section.querySelectorAll('.settings__control-meta').length : 0
    const meta = section ? section.querySelector('.settings__control-meta') : null
    return {
      metaCount,
      metaText: meta ? meta.textContent : null,
    }
  })
}

async function getFeedInfo(page) {
  return page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('section'))
    const feedSection = sections.find((s) => {
      const h2 = s.querySelector('h2')
      return h2 && h2.textContent.trim() === 'Recent Activity'
    })
    if (!feedSection) return { count: 0, items: [] }
    const items = Array.from(feedSection.querySelectorAll('li')).map((li) => li.textContent.trim())
    return { count: items.length, items }
  })
}

async function printState(page, label) {
  const btn = page.locator(BUTTON_SELECTOR)
  const text = ((await btn.textContent()) || '').trim()
  const pressed = await btn.getAttribute('aria-pressed')
  const activeIsButton = await page.evaluate(() => {
    const el = document.activeElement
    const btn = document.querySelector('button[aria-label="Toggle email notifications"]')
    return el === btn
  })
  const outerHtmlSnippet = await page.evaluate(() => {
    const el = document.activeElement
    return el ? el.outerHTML.slice(0, 120) : null
  })
  const meta = await getMetaInfo(page)
  const feed = await getFeedInfo(page)

  console.log(`--- ${label} ---`)
  console.log(`  button text: '${text}'`)
  console.log(`  aria-pressed: '${pressed}'`)
  console.log(`  activeElement === button: ${activeIsButton}`)
  console.log(`  document.activeElement.outerHTML.slice(0,120): ${outerHtmlSnippet}`)
  console.log(`  meta line count: ${meta.metaCount}`)
  console.log(`  meta line text: ${JSON.stringify(meta.metaText)}`)
  console.log(`  feed li count: ${feed.count}`)
  console.log(`  feed items: ${JSON.stringify(feed.items)}`)
}

;(async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()

  page.on('console', (msg) => console.log(`  [console.${msg.type()}] ${msg.text()}`))
  page.on('pageerror', (err) => console.log(`  [pageerror] ${err.message}`))

  await page.goto(BASE_URL, { waitUntil: 'load' })

  await page.keyboard.press('Tab')
  await printState(page, 'AFTER TAB (before any key press)')
  await page.screenshot({ path: path.join(__dirname, 'qa-06a-focused-before.png'), fullPage: true })

  await page.keyboard.press('Space')
  await page.waitForTimeout(100)
  await printState(page, 'AFTER SPACE (+100ms wait)')
  await page.screenshot({ path: path.join(__dirname, 'qa-06b-after-space.png'), fullPage: true })

  await page.keyboard.press('Enter')
  await page.waitForTimeout(100)
  await printState(page, 'AFTER ENTER (+100ms wait)')
  await page.screenshot({ path: path.join(__dirname, 'qa-06c-after-enter.png'), fullPage: true })

  await context.close()
  await browser.close()
})().catch((e) => {
  console.error('FATAL SCRIPT ERROR:', e)
  process.exitCode = 1
})
