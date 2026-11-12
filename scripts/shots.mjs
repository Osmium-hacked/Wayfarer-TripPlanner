// Quick visual check: screenshots of the main screens in light/dark, desktop/mobile.
// Usage: node scripts/shots.mjs [outDir]   (dev server must be running on :5173)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const out = process.argv[2] || 'shots';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });

async function run(name, { width, height, scheme, mobile }) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror:`, e.message));
  page.on('console', (m) => m.type() === 'error' && console.log(`[${name}] console:`, m.text()));
  await page.goto(BASE);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}-1-welcome.png` });
  await page.getByRole('button', { name: 'Get Started' }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}-2-home.png`, fullPage: true });
  await page.getByRole('button', { name: /Plan 4 days in Lisbon now/ }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}-3-streaming.png` });
  await page.locator('.trip-sheet').waitFor({ timeout: 20000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}-4-trip.png` });
  await page.locator('[data-stop-focus]').first().click();
  await page.mouse.wheel(0, mobile ? 700 : 520);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}-5-trip-scrolled.png` });
  await ctx.close();
}

await run('desk-light', { width: 1280, height: 800, scheme: 'light' });
await run('desk-dark', { width: 1280, height: 800, scheme: 'dark' });
await run('mobile-light', { width: 390, height: 844, scheme: 'light', mobile: true });
await browser.close();
console.log('done');
