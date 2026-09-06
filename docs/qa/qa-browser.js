import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

// This repo's package.json sets "type": "module", so this file is parsed as
// ESM. `playwright` is installed standalone under /tmp/pw (not in this repo's
// node_modules, to keep package.json/package-lock.json untouched), so it's
// loaded via a require() shim rather than a bare `import`.
const require = createRequire(import.meta.url)
const { chromium } = require('/tmp/pw/node_modules/playwright')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = 'http://localhost:4173'
const BUTTON_SELECTOR = 'button[aria-label="Toggle email notifications"]'
const SETTINGS_KEY = 'demo.settings.emailNotifications'
const ACTIVITY_KEY = 'demo.activity'

let checkNum = 0
let failCount = 0

function check(cond, desc) {
  checkNum++
  const status = cond ? 'PASS' : 'FAIL'
  if (!cond) failCount++
  console.log(`[CHECK ${checkNum}] ${status} ${desc}`)
  return cond
}

const allConsoleErrors = []
const allConsoleWarnings = []
const allPageErrors = []

function instrument(page, label) {
  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error') allConsoleErrors.push({ scenario: label, text: msg.text() })
    else if (type === 'warning') allConsoleWarnings.push({ scenario: label, text: msg.text() })
  })
  page.on('pageerror', (err) => {
    allPageErrors.push({ scenario: label, text: err.message })
  })
}

async function getMetaInfo(page) {
  return page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Toggle email notifications"]')
    const section = btn ? btn.closest('section') : null
    const metaCount = section ? section.querySelectorAll('.settings__control-meta').length : 0
    const meta = section ? section.querySelector('.settings__control-meta') : null
    const time = meta ? meta.querySelector('time') : null
    return {
      metaCount,
      metaText: meta ? meta.textContent : null,
      timeText: time ? time.textContent : null,
      dateTime: time ? time.getAttribute('dateTime') : null,
      title: time ? time.getAttribute('title') : null,
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
    const items = Array.from(feedSection.querySelectorAll('li')).map((li) => {
      const time = li.querySelector('time')
      return {
        text: li.textContent.trim(),
        time: time ? time.textContent : null,
        dateTime: time ? time.getAttribute('dateTime') : null,
      }
    })
    return { count: items.length, items }
  })
}

async function scenarioS1(browser) {
  const label = 'S1'
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  instrument(page, label)
  await page.goto(BASE_URL, { waitUntil: 'load' })

  const btn = page.locator(BUTTON_SELECTOR)
  const text = ((await btn.textContent()) || '').trim()
  const pressed = await btn.getAttribute('aria-pressed')
  check(text === 'Off', `${label}: button text is 'Off' (actual: '${text}')`)
  check(pressed === 'false', `${label}: aria-pressed is 'false' (actual: '${pressed}')`)

  const meta = await getMetaInfo(page)
  check(meta.metaCount === 0, `${label}: .settings__control-meta count === 0 (actual: ${meta.metaCount})`)

  const anyLastChanged = await page.evaluate(() => {
    const all = document.querySelectorAll('body *')
    for (const el of all) {
      if (el.textContent && el.textContent.trim().startsWith('Last changed')) return true
    }
    return false
  })
  check(!anyLastChanged, `${label}: no element whose textContent starts with 'Last changed' (found: ${anyLastChanged})`)

  const settingsRaw = await page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY)
  check(settingsRaw === null, `${label}: localStorage.getItem('${SETTINGS_KEY}') === null (actual: ${JSON.stringify(settingsRaw)})`)

  await page.screenshot({ path: path.join(__dirname, 'qa-01-fresh.png') })

  await context.close()
}

async function scenarioS2toS4(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  instrument(page, 'S2-S4')
  await page.goto(BASE_URL, { waitUntil: 'load' })

  const btn = page.locator(BUTTON_SELECTOR)

  // --- S2: toggle On -> hard reload ---
  await btn.click()

  let text = ((await btn.textContent()) || '').trim()
  let pressed = await btn.getAttribute('aria-pressed')
  check(text === 'On', `S2: button text 'On' after click (actual: '${text}')`)
  check(pressed === 'true', `S2: aria-pressed 'true' after click (actual: '${pressed}')`)

  let meta = await getMetaInfo(page)
  check(meta.metaText === 'Last changed just now', `S2: meta line text exactly 'Last changed just now' (actual: '${meta.metaText}')`)

  const settingsRawStr = await page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY)
  console.log(`S2: localStorage['${SETTINGS_KEY}'] = ${settingsRawStr}`)
  let settingsObj = null
  try {
    settingsObj = JSON.parse(settingsRawStr)
  } catch (e) {
    settingsObj = null
  }
  check(
    !!settingsObj && settingsObj.enabled === true && Number.isFinite(settingsObj.lastChangedAt),
    `S2: parsed localStorage JSON has enabled===true and a finite lastChangedAt (actual: ${settingsRawStr})`,
  )

  let feed = await getFeedInfo(page)
  check(feed.count === 1, `S2: Activity feed li count === 1 (actual: ${feed.count})`)
  check(
    !!feed.items[0] && feed.items[0].text.includes('Turned email notifications on.'),
    `S2: feed item text contains 'Turned email notifications on.' (actual: '${feed.items[0] && feed.items[0].text}')`,
  )
  check(
    feed.items[0].time === meta.timeText,
    `S2: feed <time> text equals meta <time> text (feed: '${feed.items[0].time}', meta: '${meta.timeText}')`,
  )
  check(
    feed.items[0].dateTime === meta.dateTime,
    `S2 (R4 millisecond agreement): feed <time> dateTime equals meta <time> dateTime (feed: '${feed.items[0].dateTime}', meta: '${meta.dateTime}')`,
  )

  await page.screenshot({ path: path.join(__dirname, 'qa-02-on-before-reload.png') })

  await page.reload({ waitUntil: 'load' })

  text = ((await btn.textContent()) || '').trim()
  pressed = await btn.getAttribute('aria-pressed')
  check(text === 'On', `S2-reload: button text still 'On' (actual: '${text}')`)
  check(pressed === 'true', `S2-reload: aria-pressed still 'true' (actual: '${pressed}')`)

  meta = await getMetaInfo(page)
  console.log(`S2-reload: meta line text actual = '${meta.metaText}'`)
  check(
    meta.metaText !== null && /^Last changed (just now|\d+m ago)$/.test(meta.metaText),
    `S2-reload: meta line present with just-now-range text (actual: '${meta.metaText}')`,
  )

  feed = await getFeedInfo(page)
  check(feed.count === 1, `S2-reload: Activity feed still has 1 entry (actual: ${feed.count})`)

  await page.screenshot({ path: path.join(__dirname, 'qa-03-on-after-reload.png') })

  // --- S3: toggle Off -> hard reload ---
  await btn.click()

  text = ((await btn.textContent()) || '').trim()
  pressed = await btn.getAttribute('aria-pressed')
  check(text === 'Off', `S3: button text 'Off' after second click (actual: '${text}')`)
  check(pressed === 'false', `S3: aria-pressed 'false' after second click (actual: '${pressed}')`)

  const settingsRawStr2 = await page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY)
  let settingsObj2 = null
  try {
    settingsObj2 = JSON.parse(settingsRawStr2)
  } catch (e) {
    settingsObj2 = null
  }
  check(!!settingsObj2 && settingsObj2.enabled === false, `S3: localStorage enabled===false (actual: ${settingsRawStr2})`)

  feed = await getFeedInfo(page)
  check(feed.count === 2, `S3: Activity feed li count === 2 (actual: ${feed.count})`)
  check(
    feed.items[0].text.includes('Turned email notifications off.'),
    `S3: newest feed item text contains 'Turned email notifications off.' (actual: '${feed.items[0].text}')`,
  )

  meta = await getMetaInfo(page)
  check(
    feed.items[0].dateTime === meta.dateTime,
    `S3: newest feed <time> dateTime equals meta <time> dateTime (feed: '${feed.items[0].dateTime}', meta: '${meta.dateTime}')`,
  )

  await page.reload({ waitUntil: 'load' })

  text = ((await btn.textContent()) || '').trim()
  pressed = await btn.getAttribute('aria-pressed')
  check(text === 'Off', `S3-reload: button text still 'Off' (actual: '${text}')`)
  check(pressed === 'false', `S3-reload: aria-pressed still 'false' (actual: '${pressed}')`)

  meta = await getMetaInfo(page)
  check(meta.metaCount === 1, `S3-reload (R1): meta line still present for a persisted false (actual count: ${meta.metaCount})`)

  feed = await getFeedInfo(page)
  check(feed.count === 2, `S3-reload: Activity feed still has 2 entries (actual: ${feed.count})`)

  await page.screenshot({ path: path.join(__dirname, 'qa-04-off-after-reload.png') })

  // --- S4: exactly one activity per click ---
  const expectedCounts = [3, 4, 5]
  for (const expected of expectedCounts) {
    await btn.click()
    feed = await getFeedInfo(page)
    check(feed.count === expected, `S4: Activity feed li count === ${expected} after click (actual: ${feed.count})`)
  }

  const finalSettingsRaw = await page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY)
  const finalSettings = JSON.parse(finalSettingsRaw)
  const activityRaw = await page.evaluate((key) => localStorage.getItem(key), ACTIVITY_KEY)
  const activityArr = JSON.parse(activityRaw)
  const newestTimestamp = Math.max(...activityArr.map((a) => a.timestamp))
  console.log(`S4: localStorage lastChangedAt = ${finalSettings.lastChangedAt}, newest demo.activity entry timestamp = ${newestTimestamp}`)
  check(
    finalSettings.lastChangedAt === newestTimestamp,
    `S4: persisted lastChangedAt strictly equals newest feed entry timestamp (${finalSettings.lastChangedAt} === ${newestTimestamp})`,
  )

  await context.close()
}

async function scenarioS5corrupt(browser, { label, corruptValue, forbiddenSubstrings, screenshotName }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  instrument(page, label)
  await page.goto(BASE_URL, { waitUntil: 'load' })
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: SETTINGS_KEY, value: corruptValue })
  await page.reload({ waitUntil: 'load' })

  const h1Text = await page.locator('h1').first().textContent().catch(() => null)
  check((h1Text || '').trim() === 'Settings', `${label}: h1 'Settings' visible after reload with corrupt storage (actual: '${h1Text}')`)

  const btn = page.locator(BUTTON_SELECTOR)
  const text = ((await btn.textContent()) || '').trim()
  const pressed = await btn.getAttribute('aria-pressed')
  check(text === 'Off', `${label}: button text 'Off' (actual: '${text}')`)
  check(pressed === 'false', `${label}: aria-pressed 'false' (actual: '${pressed}')`)

  const meta = await getMetaInfo(page)
  check(meta.metaCount === 0, `${label}: .settings__control-meta count === 0 (actual: ${meta.metaCount})`)

  const bodyText = await page.evaluate(() => document.body.textContent)
  for (const forbidden of forbiddenSubstrings) {
    check(!bodyText.includes(forbidden), `${label}: document.body.textContent does not contain '${forbidden}'`)
  }

  const errCount =
    allConsoleErrors.filter((e) => e.scenario === label).length + allPageErrors.filter((e) => e.scenario === label).length
  check(errCount === 0, `${label}: zero console errors / pageerrors (actual: ${errCount})`)

  await page.screenshot({ path: path.join(__dirname, screenshotName) })

  await context.close()
}

async function scenarioS6(browser) {
  const label = 'S6'
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  instrument(page, label)
  await page.goto(BASE_URL, { waitUntil: 'load' })

  let tabCount = 0
  let focused = false
  for (let i = 1; i <= 10; i++) {
    await page.keyboard.press('Tab')
    tabCount = i
    const activeLabel = await page.evaluate(() => {
      const el = document.activeElement
      return el ? el.getAttribute('aria-label') : null
    })
    if (activeLabel === 'Toggle email notifications') {
      focused = true
      break
    }
  }
  check(focused, `${label}: reached the toggle button via Tab within 10 presses (tabs used: ${tabCount})`)
  console.log(`${label}: number of Tab presses to reach the toggle button = ${tabCount}`)

  await page.screenshot({ path: path.join(__dirname, 'qa-06-keyboard.png') })

  await page.keyboard.press('Space')
  const btn = page.locator(BUTTON_SELECTOR)
  let pressed = await btn.getAttribute('aria-pressed')
  let text = ((await btn.textContent()) || '').trim()
  check(pressed === 'true' && text === 'On', `${label}: after Space, button shows 'On' / aria-pressed='true' (actual: '${text}' / '${pressed}')`)
  let activeStillBtn = await page.evaluate(() => {
    const el = document.activeElement
    return !!el && el.getAttribute('aria-label') === 'Toggle email notifications'
  })
  check(activeStillBtn, `${label}: focus remains on the toggle button after Space`)

  await page.keyboard.press('Enter')
  pressed = await btn.getAttribute('aria-pressed')
  text = ((await btn.textContent()) || '').trim()
  check(pressed === 'false' && text === 'Off', `${label}: after Enter, button shows 'Off' / aria-pressed='false' (actual: '${text}' / '${pressed}')`)
  activeStillBtn = await page.evaluate(() => {
    const el = document.activeElement
    return !!el && el.getAttribute('aria-label') === 'Toggle email notifications'
  })
  check(activeStillBtn, `${label}: focus remains on the toggle button after Enter`)

  const describedby = await btn.getAttribute('aria-describedby')
  check(describedby === null, `${label}: aria-describedby is null (actual: ${describedby})`)

  const attrNames = await page.evaluate(() => {
    const el = document.querySelector('button[aria-label="Toggle email notifications"]')
    return Array.from(el.attributes)
      .map((a) => a.name)
      .sort()
  })
  const expectedAttrs = ['type', 'class', 'aria-label', 'aria-pressed'].sort()
  check(
    JSON.stringify(attrNames) === JSON.stringify(expectedAttrs),
    `${label}: full attribute name list equals ${JSON.stringify(expectedAttrs)} (actual: ${JSON.stringify(attrNames)})`,
  )

  const feed = await getFeedInfo(page)
  check(feed.count === 2, `${label}: Activity feed count === 2 after the two key presses (actual: ${feed.count})`)

  await context.close()
}

async function scenarioLayout(browser, width, height, screenshotName, label) {
  const context = await browser.newContext({ viewport: { width, height } })
  const twelveWeeksMs = 12 * 7 * 24 * 60 * 60 * 1000
  const lastChangedAt = Date.now() - twelveWeeksMs

  await context.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value)
    },
    { key: SETTINGS_KEY, value: JSON.stringify({ enabled: true, lastChangedAt }) },
  )

  const page = await context.newPage()
  instrument(page, label)
  await page.goto(BASE_URL, { waitUntil: 'load' })

  const meta = await getMetaInfo(page)
  check(meta.metaText === 'Last changed 12w ago', `${label}: meta line text 'Last changed 12w ago' (actual: '${meta.metaText}')`)

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  const innerWidth = await page.evaluate(() => window.innerWidth)
  console.log(`${label}: document.documentElement.scrollWidth=${scrollWidth}, window.innerWidth=${innerWidth}`)
  check(scrollWidth <= innerWidth, `${label}: no horizontal scroll (scrollWidth ${scrollWidth} <= innerWidth ${innerWidth})`)

  const boxInfo = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Toggle email notifications"]')
    const section = btn.closest('section')
    const control = section.querySelector('.settings__control')
    const metaEl = section.querySelector('.settings__control-meta')
    const controlRect = control.getBoundingClientRect()
    const metaRect = metaEl.getBoundingClientRect()
    const descEl = control.querySelector('.settings__control-description')
    const metaStyle = getComputedStyle(metaEl)
    const descStyle = getComputedStyle(descEl)
    return {
      controlBottom: controlRect.bottom,
      controlWidth: controlRect.width,
      metaTop: metaRect.top,
      metaWidth: metaRect.width,
      metaParentClass: metaEl.parentElement.className,
      metaPrevSiblingClass: metaEl.previousElementSibling ? metaEl.previousElementSibling.className : null,
      metaFontSize: metaStyle.fontSize,
      metaColor: metaStyle.color,
      descFontSize: descStyle.fontSize,
      descColor: descStyle.color,
    }
  })

  check(
    boxInfo.metaTop >= boxInfo.controlBottom,
    `${label}: meta top (${boxInfo.metaTop}) >= control row bottom (${boxInfo.controlBottom}) — beneath the row`,
  )
  check(
    Math.abs(boxInfo.metaWidth - boxInfo.controlWidth) <= 2,
    `${label}: meta width (${boxInfo.metaWidth}) approx equals control row width (${boxInfo.controlWidth}), within 2px — full width, not squeezed into the flex row`,
  )
  check(
    boxInfo.metaParentClass.split(' ').includes('settings__section'),
    `${label}: meta parentElement class includes 'settings__section' (actual: '${boxInfo.metaParentClass}')`,
  )
  check(
    boxInfo.metaPrevSiblingClass === 'settings__control',
    `${label}: meta previousElementSibling is the control row (actual class: '${boxInfo.metaPrevSiblingClass}')`,
  )

  console.log(`${label}: computed .settings__control-meta font-size=${boxInfo.metaFontSize}, color=${boxInfo.metaColor}`)
  console.log(`${label}: computed .settings__control-description font-size=${boxInfo.descFontSize}, color=${boxInfo.descColor}`)

  await page.screenshot({ path: path.join(__dirname, screenshotName), fullPage: true })

  await context.close()
}

async function scenarioS9(browser) {
  const label = 'S9'
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  instrument(page, label)

  if (!page.clock || typeof page.clock.install !== 'function') {
    console.log(`${label}: page.clock API is unavailable in this Playwright version — SKIPPED`)
    await context.close()
    return
  }

  try {
    await page.clock.install()
    await page.goto(BASE_URL, { waitUntil: 'load' })

    const btn = page.locator(BUTTON_SELECTOR)
    await btn.click()

    let meta = await getMetaInfo(page)
    check(meta.metaText === 'Last changed just now', `${label}: meta text 'Last changed just now' right after click (actual: '${meta.metaText}')`)

    await page.clock.fastForward('05:30')

    await page
      .waitForFunction(
        () => {
          const btn = document.querySelector('button[aria-label="Toggle email notifications"]')
          const section = btn.closest('section')
          const metaEl = section.querySelector('.settings__control-meta')
          return !!metaEl && metaEl.textContent === 'Last changed 5m ago'
        },
        { timeout: 3000 },
      )
      .catch(() => {})

    meta = await getMetaInfo(page)
    check(
      meta.metaText === 'Last changed 5m ago',
      `${label}: meta text becomes 'Last changed 5m ago' after clock.fastForward('05:30') with no interaction (actual: '${meta.metaText}')`,
    )
  } catch (e) {
    console.log(`${label}: page.clock usage threw: ${e.message} — SKIPPED remaining S9 assertions`)
  }

  await context.close()
}

;(async () => {
  const browser = await chromium.launch()
  try {
    await scenarioS1(browser)
    await scenarioS2toS4(browser)
    await scenarioS5corrupt(browser, {
      label: 'S5a',
      corruptValue: 'not json',
      forbiddenSubstrings: ['not json'],
      screenshotName: 'qa-05-corrupt-a.png',
    })
    await scenarioS5corrupt(browser, {
      label: 'S5b',
      corruptValue: '{"enabled":"yes"}',
      forbiddenSubstrings: ['"yes"', 'enabled'],
      screenshotName: 'qa-05-corrupt-b.png',
    })
    await scenarioS6(browser)
    await scenarioLayout(browser, 320, 800, 'qa-07-320.png', 'S7')
    await scenarioLayout(browser, 1280, 900, 'qa-08-1280.png', 'S8')
    await scenarioS9(browser)
  } finally {
    await browser.close()
  }

  console.log('\n=== SUMMARY ===')
  console.log(`Total checks: ${checkNum}, Passed: ${checkNum - failCount}, Failed: ${failCount}`)
  console.log(`Total console errors: ${allConsoleErrors.length}`)
  allConsoleErrors.forEach((e) => console.log(`  [console.error][${e.scenario}] ${e.text}`))
  console.log(`Total console warnings: ${allConsoleWarnings.length}`)
  allConsoleWarnings.forEach((e) => console.log(`  [console.warn][${e.scenario}] ${e.text}`))
  console.log(`Total pageerrors: ${allPageErrors.length}`)
  allPageErrors.forEach((e) => console.log(`  [pageerror][${e.scenario}] ${e.text}`))
  console.log(
    'NOTE: served via `vite preview` against the production build (dist/), not `npm run dev` — React dev-only warnings (e.g. StrictMode double-invoke diagnostics) will not appear here.',
  )

  process.exitCode = failCount > 0 ? 1 : 0
})().catch((e) => {
  console.error('FATAL SCRIPT ERROR:', e)
  process.exitCode = 1
})
