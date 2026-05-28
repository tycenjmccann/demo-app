import { chromium } from 'playwright-core';

const BROWSER_PATH = '/tmp/demo-app/node_modules/playwright-core/.local-browsers/chromium_headless_shell-1223/chrome-linux/headless_shell';

(async () => {
  const browser = await chromium.launch({
    executablePath: BROWSER_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--single-process',
      '--no-zygote',
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'docs/screenshot-light.png' });
  console.log('Light mode screenshot saved.');

  // Click the toggle switch to enable dark mode
  const toggle = page.locator('[role="switch"]');
  if (await toggle.count() > 0) {
    await toggle.click();
  } else {
    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    });
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshot-dark.png' });
  console.log('Dark mode screenshot saved.');

  await browser.close();
})();
