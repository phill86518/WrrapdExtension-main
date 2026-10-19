/**
 * Record extension-flow-demo.html to MP4 for the homepage gift-wrap popup intro.
 * Run from WrrapdServer (playwright + ffmpeg-static installed):
 *   node ../../../../wordpress/demo-videos/record-extension-flow.mjs
 */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, renameSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(resolve(process.cwd(), 'package.json'));
const ffmpegPath = require('ffmpeg-static');

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(__dirname, 'extension-flow-demo.html');
const outDir = resolve(__dirname, 'out');
const webmPath = join(outDir, 'extension-flow.webm');
const mp4Path = join(outDir, 'Wrrapd-Extension-Flow-Demo.mp4');

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
const url = pathToFileURL(htmlPath).href + '?auto=0';
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(800);
await page.evaluate(() => window.__WRRAPD_DEMO_RUN && window.__WRRAPD_DEMO_RUN());
const duration = await page.evaluate(() => window.__WRRAPD_DEMO_DURATION_MS || 16000);
await page.waitForTimeout(duration + 1000);
await context.close();
await browser.close();

const webms = readdirSync(outDir)
  .filter((f) => f.endsWith('.webm'))
  .map((f) => join(outDir, f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
if (!webms.length) {
  console.error('No webm recorded');
  process.exit(1);
}
if (webms[0] !== webmPath) {
  if (existsSync(webmPath)) unlinkSync(webmPath);
  renameSync(webms[0], webmPath);
}

const ff = spawnSync(
  ffmpegPath,
  [
    '-y',
    '-i', webmPath,
    '-an',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-crf', '20',
    '-preset', 'medium',
    mp4Path,
  ],
  { encoding: 'utf8' },
);
if (ff.status !== 0) {
  console.error(ff.stderr || ff.stdout);
  process.exit(ff.status || 1);
}
console.log(JSON.stringify({ webm: webmPath, mp4: mp4Path, bytes: statSync(mp4Path).size }, null, 2));
