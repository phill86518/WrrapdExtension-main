#!/usr/bin/env node
/**
 * Build a Chrome Web Store upload zip — runtime files only (no src/, fixtures/, node_modules/).
 *
 * Pure Node implementation (no python3, no external zip tool, no extra npm deps)
 * so it works identically on Windows, macOS, and Linux.
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const extensionRoot = join(fileURLToPath(new URL("..", import.meta.url)));
const outPath = join(extensionRoot, "wrrapd-extension-store.zip");

const required = [
  "manifest.json",
  "rules.json",
  "content.js",
  "content-target.js",
  "content-lego.js",
  "content-ulta.js",
  "content-walmart.js",
  "content-nordstrom.js",
  "content-kohls.js",
  "content-sephora.js",
  "content-bestbuy.js",
  "content-etsy.js",
];

for (const rel of required) {
  if (!existsSync(join(extensionRoot, rel))) {
    console.error(`Missing required store file: ${rel}`);
    process.exit(1);
  }
}

/** Collect file paths under a directory (recursively), as zip-root-relative arc names. */
function walkDir(absDir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(absDir)) {
    const full = join(absDir, entry);
    if (statSync(full).isDirectory()) out.push(...walkDir(full));
    else out.push(relative(extensionRoot, full).split(sep).join("/"));
  }
  return out;
}

const arcNames = [...required];
const assetsDir = join(extensionRoot, "assets");
if (existsSync(assetsDir)) arcNames.push(...walkDir(assetsDir));

// ── Minimal ZIP writer (deflate) ────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() >> 1) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

const now = new Date();
const { time, date } = dosDateTime(now);
const localParts = [];
const centralParts = [];
let offset = 0;

for (const name of arcNames) {
  const data = readFileSync(join(extensionRoot, name));
  const nameBuf = Buffer.from(name, "utf8");
  const comp = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(0, 6);
  lh.writeUInt16LE(8, 8);
  lh.writeUInt16LE(time, 10);
  lh.writeUInt16LE(date, 12);
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(comp.length, 18);
  lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(nameBuf.length, 26);
  lh.writeUInt16LE(0, 28);
  localParts.push(lh, nameBuf, comp);

  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);
  ch.writeUInt16LE(20, 4);
  ch.writeUInt16LE(20, 6);
  ch.writeUInt16LE(0, 8);
  ch.writeUInt16LE(8, 10);
  ch.writeUInt16LE(time, 12);
  ch.writeUInt16LE(date, 14);
  ch.writeUInt32LE(crc, 16);
  ch.writeUInt32LE(comp.length, 20);
  ch.writeUInt32LE(data.length, 24);
  ch.writeUInt16LE(nameBuf.length, 28);
  ch.writeUInt16LE(0, 30);
  ch.writeUInt16LE(0, 32);
  ch.writeUInt16LE(0, 34);
  ch.writeUInt16LE(0, 36);
  ch.writeUInt32LE(0, 38);
  ch.writeUInt32LE(offset, 42);
  centralParts.push(ch, nameBuf);

  offset += lh.length + nameBuf.length + comp.length;
}

const centralBuf = Buffer.concat(centralParts);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(arcNames.length, 8);
eocd.writeUInt16LE(arcNames.length, 10);
eocd.writeUInt32LE(centralBuf.length, 12);
eocd.writeUInt32LE(offset, 16);
eocd.writeUInt16LE(0, 20);

writeFileSync(outPath, Buffer.concat([...localParts, centralBuf, eocd]));
console.log(`${outPath}  (${arcNames.length} entries)`);
