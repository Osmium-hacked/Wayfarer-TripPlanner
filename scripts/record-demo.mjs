// Records a narrated product demo of the running app and encodes it to MP4.
// Usage: npm start (in another terminal), then: npm run demo
// Needs Chrome (via playwright-core) and ffmpeg on PATH. Output: demo/wayfarer-demo.mp4
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT_DIR = path.resolve('demo');
const RAW_DIR = path.join(OUT_DIR, 'raw');
fs.rmSync(RAW_DIR, { recursive: true, force: true });
fs.mkdirSync(RAW_DIR, { recursive: true });

// Visible cursor + caption pill, injected into every page (videos don't show the real cursor).
function overlay() {
  const install = () => {
    if (document.getElementById('__cursor')) return;
    const style = document.createElement('style');
    style.textContent = `
      #__cursor{position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
        background:rgba(20,19,18,.85);border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.35);
        z-index:2147483647;pointer-events:none;transition:transform .12s ease,width .12s,height .12s}
      #__cursor.down{transform:scale(.7)}
      #__caption{position:fixed;left:50%;top:76px;transform:translate(-50%,-8px);max-width:min(680px,92vw);
        padding:10px 20px;border-radius:999px;background:rgba(20,19,18,.9);color:#fff;
        font:600 15px/1.35 'Plus Jakarta Sans',system-ui,sans-serif;text-align:center;
        box-shadow:0 12px 30px rgba(0,0,0,.3);z-index:2147483646;pointer-events:none;
        opacity:0;transition:opacity .35s ease,transform .35s ease}
      #__caption.on{opacity:1;transform:translate(-50%,0)}
      @media (max-width:600px){#__caption{top:68px;font-size:13px;padding:8px 14px}}`;
    document.head.appendChild(style);
    const cursor = Object.assign(document.createElement('div'), { id: '__cursor' });
    const caption = Object.assign(document.createElement('div'), { id: '__caption' });
    document.body.append(cursor, caption);
    addEventListener('mousemove', (e) => {
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
    }, true);
    addEventListener('mousedown', () => cursor.classList.add('down'), true);
    addEventListener('mouseup', () => cursor.classList.remove('down'), true);
    window.__caption = (text) => {
      caption.classList.remove('on');
      if (!text) return;
      setTimeout(() => {
        caption.textContent = text;
        caption.classList.add('on');
      }, 180);
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
}

const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome' });

function helpers(page) {
  const wait = (ms) => page.waitForTimeout(ms);
  const caption = async (text, hold = 0) => {
    await page.evaluate((t) => window.__caption?.(t), text);
    if (hold) await wait(hold);
  };
  const center = async (locator) => {
    // Keep targets clear of the sticky header and the fixed refine bar before clicking.
    const offscreen = await locator.evaluate((el) => {
      const r = el.getBoundingClientRect();
      if (getComputedStyle(el).position === 'fixed' || el.closest('.refine, .app-header, .drawer, .toaster')) return false;
      return r.top < 130 || r.bottom > innerHeight - 150;
    });
    if (offscreen) {
      await locator.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      await page.waitForTimeout(700);
    }
    const b = await locator.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const moveTo = async (locator, steps = 22) => {
    const p = await center(locator);
    await page.mouse.move(p.x, p.y, { steps });
    await wait(150);
    return p;
  };
  const click = async (locator, pause = 450) => {
    const p = await moveTo(locator);
    await page.mouse.click(p.x, p.y);
    await wait(pause);
  };
  const type = async (locator, text) => {
    await click(locator, 200);
    await locator.pressSequentially(text, { delay: 38 });
  };
  const scrollTo = async (y, ms = 900) => {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'smooth' }), y);
    await wait(ms);
  };
  const scrollToEl = async (locator, offset = 140, ms = 900) => {
    const y = await locator.evaluate((el, off) => el.getBoundingClientRect().top + scrollY - off, offset);
    await scrollTo(Math.max(0, y), ms);
  };
  const simulate = async (label) => {
    await click(page.getByRole('button', { name: 'Simulate AI failures' }), 900);
    await click(page.locator('.radio-row', { hasText: label }), 500);
  };
  return { wait, caption, moveTo, click, type, scrollTo, scrollToEl, simulate };
}

// ---------------------------------------------------------------- desktop
async function desktop() {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
    recordVideo: { dir: RAW_DIR, size: { width: 1280, height: 800 } },
  });
  await ctx.addInitScript(overlay);
  const page = await ctx.newPage();
  const started = Date.now();
  const { wait, caption, moveTo, click, type, scrollTo, scrollToEl, simulate } = helpers(page);

  await page.goto(BASE);
  await page.locator('.welcome .photo__img.is-loaded').waitFor({ timeout: 15000 }).catch(() => {});
  await wait(800); // let the photo finish fading in
  const trim = (Date.now() - started) / 1000; // start the video here, skipping the blank load
  await page.mouse.move(640, 700);
  await caption('Wayfarer: describe a trip, get an interactive itinerary', 3200);
  await click(page.getByRole('button', { name: 'Get Started' }), 1200);

  // Home
  await caption('Popular places come with real destination photos', 1500);
  await page.locator('.carousel').evaluate((el) => el.scrollTo({ left: 520, behavior: 'smooth' }));
  await wait(1300);
  await page.locator('.carousel').evaluate((el) => el.scrollTo({ left: 0, behavior: 'smooth' }));
  await wait(900);
  await caption('Or describe any trip in plain words…', 600);
  await type(page.locator('#trip-prompt'), '4 days in Lisbon: seafood, viewpoints and slow mornings');
  await wait(400);
  await caption('…and pick a trip style. Chips are added to the request.', 300);
  await click(page.getByRole('button', { name: 'Foodie' }), 350);
  await click(page.getByRole('button', { name: 'Relaxed' }), 600);
  await caption('The model returns JSON. It streams in and is previewed live.');
  await click(page.getByRole('button', { name: 'Plan my trip' }), 300);
  await page.locator('.preview__title').waitFor({ timeout: 15000 });
  await scrollToEl(page.locator('.progress'), 90, 1200);
  await page.locator('.trip-sheet').waitFor({ timeout: 30000 });
  await wait(600);

  // Trip view
  await caption('Parsed, validated and rendered as an interactive itinerary', 3000);
  await caption('Category chips highlight matching stops', 300);
  await click(page.locator('.cat-chip').first(), 700);
  await scrollToEl(page.locator('.day').first(), 150, 1400);
  await wait(1200);
  await click(page.getByRole('button', { name: 'Show all' }), 700);

  await caption('Expand a stop for details, an insider tip and a map link', 300);
  const firstStop = page.locator('[data-stop-focus]').first();
  await click(firstStop, 2200);
  await click(firstStop, 600);

  await caption('Drag stops within a day, or across days', 300);
  await scrollToEl(page.locator('.day').first(), 130, 900);
  const handle = page.locator('.day').first().locator('.stop__handle').first();
  const hp = await moveTo(handle);
  await page.mouse.down();
  await page.mouse.move(hp.x + 20, hp.y + 40, { steps: 10 });
  const target = page.locator('.day').nth(1).locator('.stop__card').first();
  const tb = await target.boundingBox();
  await page.mouse.move(tb.x + 140, tb.y + tb.height / 2 + 10, { steps: 45 });
  await wait(500);
  await page.mouse.up();
  await wait(1500);

  await caption('Remove a stop, with one-click undo', 300);
  const stop2 = page.locator('.day').nth(1).locator('[data-stop-focus]').nth(2);
  await click(stop2, 700);
  await click(page.locator('.stop.is-expanded .btn--danger-ghost'), 1300);
  await click(page.locator('.toast__action', { hasText: 'Undo' }), 1500);

  await caption('Keyboard friendly: Alt + ↑/↓ reorders the focused stop', 300);
  const kb = page.locator('.day').nth(1).locator('[data-stop-focus]').first();
  await kb.focus();
  await wait(500);
  await page.keyboard.press('Alt+ArrowDown');
  await wait(700);
  await page.keyboard.press('Alt+ArrowDown');
  await wait(1300);
  await page.keyboard.press('Control+z');
  await wait(500);
  await page.keyboard.press('Control+z');
  await wait(600);

  await scrollTo(0, 1100);
  await caption('Save favourites', 200);
  await click(page.locator('.trip-hero .heart'), 1200);

  await caption('Follow-up prompts edit the existing plan instead of starting over', 300);
  await click(page.getByRole('button', { name: 'Refine with AI' }), 300);
  await page.locator('#refine-input').pressSequentially('Make day 2 more relaxed', { delay: 40 });
  await wait(300);
  await page.keyboard.press('Enter');
  await page.locator('.toast', { hasText: 'Itinerary updated' }).waitFor({ timeout: 30000 });
  await wait(1800);

  // Failure handling
  await caption('Built-in failure simulator: make the AI misbehave on purpose', 300);
  await simulate('auto-repair succeeds');
  await wait(400);
  await click(page.getByRole('button', { name: 'Back to home' }), 900);
  await caption('Malformed JSON? The app asks the model to repair it automatically', 300);
  await click(page.getByRole('button', { name: /Plan 5 days in Kyoto now/ }), 300);
  await page.locator('.notice--info').waitFor({ timeout: 20000 });
  await scrollToEl(page.locator('.progress'), 90, 900);
  await page.locator('.trip-sheet').waitFor({ timeout: 30000 });
  await wait(2200);

  await simulate('Malformed JSON on every attempt');
  await click(page.getByRole('button', { name: 'New trip' }), 700);
  await caption('If the repair also fails: a clear error, retry, and the raw output', 300);
  await type(page.locator('#trip-prompt'), '2 days in Porto');
  await page.keyboard.press('Enter');
  await page.locator('.error-panel').waitFor({ timeout: 30000 });
  await scrollToEl(page.locator('.error-panel'), 220, 700);
  await click(page.locator('.error-panel__details summary'), 2600);

  await simulate('Provider outage');
  await caption('Outages, rate limits and timeouts each get specific, friendly handling', 300);
  await click(page.getByRole('button', { name: 'Plan my trip' }), 2600);

  await click(page.locator('.badge--sim'), 500);
  await caption('Light and dark themes', 300);
  const themeBtn = page.locator('.app-header__actions .icon-btn').last();
  await click(themeBtn, 300);
  await click(themeBtn, 1500);
  await caption('Every trip saves automatically. Favourites come first.', 300);
  await click(page.getByRole('button', { name: /My trips/ }), 1800);
  await click(page.locator('.drawer .trip-item__main').first(), 1500);
  await scrollTo(380, 1600);
  await caption('', 0);
  await wait(600);

  const video = page.video();
  await ctx.close();
  return { file: await video.path(), trim };
}

// ---------------------------------------------------------------- mobile
async function mobile() {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
    recordVideo: { dir: RAW_DIR, size: { width: 390, height: 844 } },
  });
  await ctx.addInitScript(overlay);
  await ctx.addInitScript(() => localStorage.setItem('wayfarer:welcomed', '1'));
  const page = await ctx.newPage();
  const started = Date.now();
  const { wait, caption, click, scrollTo, scrollToEl } = helpers(page);

  await page.goto(BASE);
  await page.locator('.place-card .photo__img.is-loaded').first().waitFor({ timeout: 15000 }).catch(() => {});
  await wait(800);
  const trim = (Date.now() - started) / 1000;
  await caption('Fully responsive: the same app on a phone', 2200);
  await scrollToEl(page.locator('.carousel'), 120, 1000);
  await page.locator('.carousel').evaluate((el) => el.scrollTo({ left: 600, behavior: 'smooth' }));
  await wait(1400);
  await page.locator('.carousel').evaluate((el) => el.scrollTo({ left: 0, behavior: 'smooth' }));
  await wait(1000);
  await caption('One tap plans a trip', 300);
  await click(page.getByRole('button', { name: /Plan 5 days in Bora Bora now/ }), 300);
  await page.locator('.trip-sheet').waitFor({ timeout: 30000 });
  await caption('', 0);
  await wait(2600);
  await scrollToEl(page.locator('.cat-chips'), 200, 1400);
  await wait(800);
  await scrollToEl(page.locator('.day').first(), 120, 1400);
  await caption('Touch-friendly cards and drag handles', 300);
  await click(page.locator('[data-stop-focus]').nth(1), 2600);
  await caption('', 0);
  await wait(500);

  const video = page.video();
  await ctx.close();
  return { file: await video.path(), trim };
}

console.log('Recording desktop…');
const desk = await desktop();
console.log('Recording mobile…');
const mob = await mobile();
await browser.close();

const out = path.join(OUT_DIR, 'wayfarer-demo.mp4');
console.log('Encoding MP4…');
execFileSync(
  'ffmpeg',
  [
    '-y', '-loglevel', 'error',
    '-i', desk.file,
    '-i', mob.file,
    '-filter_complex',
    `[0:v]trim=start=${desk.trim.toFixed(2)},setpts=PTS-STARTPTS,fps=30,scale=1280:800,setsar=1[a];` +
      `[1:v]trim=start=${mob.trim.toFixed(2)},setpts=PTS-STARTPTS,fps=30,scale=-2:760,pad=1280:800:(ow-iw)/2:(oh-ih)/2:color=0xF4ECE4,setsar=1[b];` +
      '[a][b]concat=n=2:v=1:a=0[v]',
    '-map', '[v]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow',
    '-movflags', '+faststart',
    out,
  ],
  { stdio: 'inherit' },
);
fs.rmSync(RAW_DIR, { recursive: true, force: true });
console.log(`Saved ${out} (trimmed ${desk.trim.toFixed(1)}s / ${mob.trim.toFixed(1)}s of page load)`);
