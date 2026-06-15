#!/usr/bin/env node
/**
 * Build a Chrome Web Store upload zip — runtime files only (no src/, fixtures/, node_modules/).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

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

const py = `
import os, zipfile
root = ${JSON.stringify(extensionRoot)}
out = ${JSON.stringify(outPath)}
paths = ${JSON.stringify(required)} + ["assets"]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for p in paths:
        abs_p = os.path.join(root, p)
        if os.path.isdir(abs_p):
            for dirpath, _, filenames in os.walk(abs_p):
                for fn in filenames:
                    full = os.path.join(dirpath, fn)
                    arc = os.path.relpath(full, root)
                    zf.write(full, arc)
        elif os.path.isfile(abs_p):
            zf.write(abs_p, p)
print(out)
`;

execFileSync("python3", ["-c", py], { stdio: "inherit" });
