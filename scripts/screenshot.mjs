// Renders the built game in headless Chrome and saves screenshots to ./screenshots.
// Usage: npm run build && npm run screenshot [-- name=query ...]
// Each argument is name=urlQuery, e.g. noon="t=300&speed=0".

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const PORT = 4173;
const W = Number(process.env.SHOT_W ?? 1600);
const H = Number(process.env.SHOT_H ?? 900);

const defaults = {
  'camp-morning': 't=170&speed=0&warm=90&ui=0',
  'valley-noon': 't=300&speed=0&warm=90&ui=0&cam=0,10,0.9,0.75,190',
  'camp-close': 't=230&speed=0&warm=40&ui=0&cam=-42,26,0.35,0.42,26',
  'golden-hour': 't=560&speed=0&warm=90&ui=0&cam=-60,-120,0.53,0.18,190',
  night: 't=820&speed=0&warm=90&ui=0&cam=-42,26,0.9,0.5,45',
  canoe: 't=260&warm=40&ui=0&follow=canoe',
  airship: 't=300&ui=0&follow=airship',
  villagers: 't=230&speed=0&warm=0&ui=0&cam=-42,26,0.35,0.22,7',
  'mobile-ui': 't=240&warm=40',
  'hex-grid': 't=300&speed=0&ui=0&hex=1&cam=-30,20,0.75,0.9,110',
};

const args = process.argv.slice(2);
const shots = args.length ? Object.fromEntries(args.map((a) => [a.split('=')[0], a.slice(a.indexOf('=') + 1)])) : defaults;

mkdirSync('screenshots', { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
});
try {
  for (const [name, query] of Object.entries(shots)) {
    const page = await browser.newPage();
    // Names starting with "mobile" render as a phone (touch, small portrait screen).
    if (name.startsWith('mobile')) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    else await page.setViewport({ width: W, height: H });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`http://localhost:${PORT}/?${query}`, { waitUntil: 'load' });
    await page.waitForFunction('window.__mystReady === true', { timeout: 240000 });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: `screenshots/${name}.png` });
    console.log(`saved screenshots/${name}.png${errors.length ? `  (errors: ${errors.join(' | ')})` : ''}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
