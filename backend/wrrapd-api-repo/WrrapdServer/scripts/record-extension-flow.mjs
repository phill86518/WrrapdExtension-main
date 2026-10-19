/**
 * Record wordpress/demo-videos/extension-flow-demo.html → MP4
 *   cd backend/wrrapd-api-repo/WrrapdServer && node scripts/record-extension-flow.mjs
 */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, renameSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../../..'); // wrrapd-GCP
const htmlPath = resolve(root, 'wordpress/demo-videos/extension-flow-demo.html');
const outDir = resolve(root, 'wordpress/demo-videos/out');
const webmPath = join(outDir, 'extension-flow.webm');
const mp4Path = join(outDir, 'Wrrapd-Extension-Flow-Demo.mp4');

mkdirSync(outDir, { recursive: true });
console.log('html', htmlPath);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
await page.goto(pathToFileURL(htmlPath).href + '?auto=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
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
  ['-y', '-i', webmPath, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-crf', '20', '-preset', 'medium', mp4Path],
  { encoding: 'utf8' },
);
if (ff.status !== 0) {
  console.error(ff.stderr || ff.stdout);
  process.exit(ff.status || 1);
}
console.log(JSON.stringify({ webm: webmPath, mp4: mp4Path, bytes: statSync(mp4Path).size }, null, 2));
