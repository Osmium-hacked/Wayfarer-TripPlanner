// End-to-end smoke test against the running app (demo mode is fine).
// Usage: npm start (in another terminal), then: npm run smoke
// Drives your installed Chrome via playwright-core and checks every main feature.
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const results = [];
let failed = 0;

async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push(`  ✔ ${name} (${Date.now() - t} ms)`);
  } catch (err) {
    failed++;
    results.push(`  ✘ ${name}\n      ${String(err.message).split('\n')[0]}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const stopNames = (day = 0) => page.locator('.day').nth(day).locator('.stop__name').allTextContents();
const pickSimulation = async (label) => {
  await page.getByRole('button', { name: 'Simulate AI failures' }).click();
  await page.locator('.radio-row', { hasText: label }).click();
};
const newTrip = async () => {
  await page.getByRole('button', { name: 'New trip' }).click();
  await page.locator('#trip-prompt').waitFor();
};
const plan = async (text) => {
  await page.locator('#trip-prompt').fill(text);
  await page.getByRole('button', { name: 'Plan my trip' }).click();
};

await page.goto(BASE);

await step('welcome screen shows on first visit and leads to home', async () => {
  await page.getByRole('button', { name: 'Get Started' }).click();
  await page.locator('.greet').waitFor();
  assert((await page.locator('.place-card').count()) === 6, 'expected 6 popular places');
});

await step('popular place card fills the composer', async () => {
  await page.getByRole('button', { name: 'Use the Kyoto example' }).click();
  assert((await page.locator('#trip-prompt').inputValue()).includes('Kyoto'), 'prompt not filled');
});

await step('trip-style chips are sent to the AI', async () => {
  await page.getByRole('button', { name: 'Foodie' }).click();
  assert((await page.getByRole('button', { name: 'Foodie' }).getAttribute('aria-pressed')) === 'true', 'chip not pressed');
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().endsWith('/api/itinerary')),
    page.getByRole('button', { name: 'Plan my trip' }).click(),
  ]);
  assert(JSON.parse(req.postData()).prompt.includes('Trip style: great local food'), 'vibe missing from prompt');
});

await step('streaming preview appears, then the itinerary renders', async () => {
  await page.locator('.preview__title').waitFor({ timeout: 10000 });
  await page.locator('.trip-sheet').waitFor({ timeout: 20000 });
  assert((await page.locator('.trip__title').textContent()).includes('Kyoto'), 'wrong trip title');
  assert((await page.locator('.stop').count()) > 10, 'too few stops');
});

await step('destination photo loads in the hero', async () => {
  await page.locator('.trip-hero .photo__img.is-loaded').waitFor({ timeout: 15000 });
});

await step('category chip highlights matching stops', async () => {
  const chip = page.locator('.cat-chip').first();
  await chip.click();
  assert((await page.locator('.stop.is-dimmed').count()) > 0, 'no stops dimmed');
  await page.getByRole('button', { name: 'Show all' }).click();
  assert((await page.locator('.stop.is-dimmed').count()) === 0, 'still dimmed');
});

await step('expand a stop shows its details', async () => {
  await page.locator('[data-stop-focus]').first().click();
  assert((await page.locator('[data-stop-focus]').first().getAttribute('aria-expanded')) === 'true', 'not expanded');
  await page.locator('.stop.is-expanded .stop__map').waitFor();
});

await step('keyboard: Alt+↓ reorders and keeps focus', async () => {
  const before = await stopNames(0);
  await page.locator('[data-stop-focus]').first().focus();
  await page.keyboard.press('Alt+ArrowDown');
  const after = await stopNames(0);
  assert(after[1] === before[0] && after[0] === before[1], `order unchanged: ${after.slice(0, 2)}`);
  assert((await page.evaluate(() => document.activeElement?.dataset.stopFocus)) != null, 'focus lost');
});

await step('remove a stop, then undo from the toast', async () => {
  const before = await stopNames(0);
  await page.locator('.day').first().locator('[data-stop-focus]').first().focus();
  await page.keyboard.press('Delete');
  assert((await stopNames(0)).length === before.length - 1, 'stop not removed');
  await page.locator('.toast__action', { hasText: 'Undo' }).click();
  assert(JSON.stringify(await stopNames(0)) === JSON.stringify(before), 'undo did not restore order');
});

await step('drag a stop from day 1 into day 2', async () => {
  const d1 = await stopNames(0);
  const d2 = await stopNames(1);
  const handle = page.locator('.day').first().locator('.stop__handle').first();
  const target = page.locator('.day').nth(1).locator('.stop__card').first();
  // Put day 1 near the top so both the handle and the target are on screen.
  await page.locator('.day').first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 130));
  await page.waitForTimeout(300);
  const h = await handle.boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 20, h.y + 40, { steps: 8 });
  const t = await target.boundingBox();
  await page.mouse.move(t.x + 120, t.y + t.height / 2, { steps: 25 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert((await stopNames(0)).length === d1.length - 1, 'day 1 did not lose a stop');
  assert((await stopNames(1)).includes(d1[0]) && (await stopNames(1)).length === d2.length + 1, 'day 2 did not gain the stop');
});

await step('global Ctrl+Z undoes the drag', async () => {
  const d1 = await stopNames(0);
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('Control+z');
  assert((await stopNames(0)).length === d1.length + 1, 'undo did not restore the dragged stop');
});

await step('favourite heart toggles and is saved', async () => {
  await page.locator('.trip-hero .heart').click();
  assert((await page.locator('.trip-hero .heart').getAttribute('aria-pressed')) === 'true', 'heart not on');
});

await step('"Refine with AI" focuses the refine bar, refinement applies with undo toast', async () => {
  await page.getByRole('button', { name: 'Refine with AI' }).click();
  assert((await page.evaluate(() => document.activeElement?.id)) === 'refine-input', 'refine input not focused');
  await page.locator('#refine-input').fill('Make day 2 more relaxed');
  await page.keyboard.press('Enter');
  await page.locator('.toast', { hasText: 'Itinerary updated' }).waitFor({ timeout: 20000 });
  assert((await page.locator('.trip-hero .heart').getAttribute('aria-pressed')) === 'true', 'favourite lost after refine');
});

await step('trips survive a reload', async () => {
  const title = await page.locator('.trip__title').textContent();
  await page.waitForTimeout(500); // autosave debounce
  await page.reload();
  await page.locator('.trip__title').waitFor();
  assert((await page.locator('.trip__title').textContent()) === title, 'trip not restored');
});

await step('malformed JSON is repaired automatically', async () => {
  await pickSimulation('auto-repair succeeds');
  await newTrip();
  await plan('3 days in Barcelona, beaches and tapas');
  await page.locator('.notice--info', { hasText: 'malformed' }).waitFor({ timeout: 15000 });
  await page.locator('.trip-sheet').waitFor({ timeout: 25000 });
  assert((await page.locator('.trip__title').textContent()).includes('Barcelona'), 'repair did not produce the trip');
});

await step('unrecoverable JSON shows an error with retry and raw output', async () => {
  await pickSimulation('Malformed JSON on every attempt');
  await newTrip();
  await plan('2 days in Porto');
  await page.locator('.error-panel', { hasText: 'garbled' }).waitFor({ timeout: 25000 });
  await page.getByRole('button', { name: 'Try again' }).waitFor();
  await page.locator('.error-panel__details summary').click();
  assert((await page.locator('.error-panel__details pre').textContent()).includes('Porto'), 'raw output missing');
});

await step('"not a trip" gets a gentle message without retry', async () => {
  await pickSimulation('not a trip');
  await plan('hello there');
  await page.locator('.error-panel', { hasText: 'doesn’t look like a trip' }).waitFor({ timeout: 10000 });
  assert((await page.getByRole('button', { name: 'Try again' }).count()) === 0, 'retry should be hidden');
});

await step('provider outage shows a retryable error', async () => {
  await pickSimulation('Provider outage');
  await page.getByRole('button', { name: 'Plan my trip' }).click();
  await page.locator('.error-panel', { hasText: 'provider had a problem' }).waitFor({ timeout: 10000 });
});

await step('messy data renders with a warnings banner', async () => {
  await pickSimulation('Messy but salvageable');
  await page.getByRole('button', { name: 'Plan my trip' }).click();
  await page.locator('.warnings', { hasText: 'without a name' }).waitFor({ timeout: 20000 });
});

await step('cancel + resubmit: a stale response never overwrites the newer trip', async () => {
  await pickSimulation('Slow (12 s)');
  await newTrip();
  await plan('3 days in Rome');
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(200);
  assert((await page.locator('.progress').count()) === 0, 'Cancel did not stop the request');
  await page.locator('.badge--sim').click(); // simulation off
  await plan('2 days in Oslo');
  await page.locator('.trip-sheet').waitFor({ timeout: 20000 });
  await page.waitForTimeout(12000);
  assert((await page.locator('.trip__title').textContent()).includes('Oslo'), 'stale Rome response won');
});

await step('dark mode toggle', async () => {
  const btn = page.locator('.app-header__actions .icon-btn').last();
  await btn.click(); // system → light
  await btn.click(); // light → dark
  assert((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'not dark');
  await btn.click(); // → system
});

await step('My trips drawer lists saved trips, favourites first, and opens one', async () => {
  await page.getByRole('button', { name: /My trips/ }).click();
  await page.locator('.drawer[open]').waitFor();
  const first = await page.locator('.drawer .trip-item').first().textContent();
  assert(first.includes('Kyoto'), `favourite not first: ${first}`);
  await page.locator('.drawer .trip-item__main').first().click();
  await page.locator('.trip__title', { hasText: 'Kyoto' }).waitFor();
});

await step('no uncaught page errors', async () => {
  assert(pageErrors.length === 0, pageErrors.join(' | '));
});

await browser.close();
console.log(`\nSmoke test against ${BASE}\n${results.join('\n')}\n\n${failed ? `${failed} failed` : 'all passed'}`);
process.exit(failed ? 1 : 0);
