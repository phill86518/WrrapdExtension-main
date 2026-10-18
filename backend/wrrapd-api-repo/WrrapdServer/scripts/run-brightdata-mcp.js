#!/usr/bin/env node
/**
 * Cursor MCP launcher for Bright Data.
 * Loads BRIGHTDATA_API_KEY from WrrapdServer/.env and starts @brightdata/mcp.
 * Do not put the API token in mcp.json or git.
 */
const path = require('path');
const { spawn } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const token = String(process.env.BRIGHTDATA_API_KEY || process.env.BRIGHT_DATA_API_KEY || '').trim();
if (!token) {
    console.error(
        '[brightdata-mcp] Set BRIGHTDATA_API_KEY in backend/wrrapd-api-repo/WrrapdServer/.env then restart Cursor MCP.',
    );
    process.exit(1);
}

process.env.API_TOKEN = token;
// Limit tools for Kohl's / unlocker work unless overridden.
if (!process.env.GROUPS && !process.env.TOOLS) {
    process.env.TOOLS = 'scrape_as_markdown,scrape_as_html,scrape_batch,extract';
}

const child = spawn('npx', ['-y', '@brightdata/mcp'], {
    stdio: 'inherit',
    env: process.env,
    cwd: path.join(__dirname, '..'),
});
child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code == null ? 1 : code);
});
