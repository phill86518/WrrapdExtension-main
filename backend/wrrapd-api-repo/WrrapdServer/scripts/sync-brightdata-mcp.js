#!/usr/bin/env node
/**
 * Writes Bright Data into ~/.cursor/mcp.json using the local launcher
 * (token stays in WrrapdServer/.env — never copied into mcp.json).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const mcpPath = path.join(os.homedir(), '.cursor', 'mcp.json');
const launcher = path.resolve(__dirname, 'run-brightdata-mcp.js');

let cfg = { mcpServers: {} };
if (fs.existsSync(mcpPath)) {
    try {
        cfg = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    } catch (e) {
        console.error('Could not parse', mcpPath, e.message);
        process.exit(1);
    }
}
if (!cfg.mcpServers || typeof cfg.mcpServers !== 'object') cfg.mcpServers = {};

cfg.mcpServers['Bright Data'] = {
    command: 'node',
    args: [launcher],
};

fs.mkdirSync(path.dirname(mcpPath), { recursive: true });
fs.writeFileSync(mcpPath, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
console.log('Updated', mcpPath);
console.log('Bright Data MCP →', launcher);
console.log('Put BRIGHTDATA_API_KEY in WrrapdServer/.env, then reload MCP in Cursor.');
