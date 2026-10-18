#!/usr/bin/env node
/**
 * Open a persistent Chromium profile for one retailer so a human can sign in
 * to Wrrapd's store account. The quote runner reuses that profile later.
 *
 * Usage:
 *   node scripts/buy-browser-login.js kohls
 *   node scripts/buy-browser-login.js nordstrom
 *
 * Profiles live in data/buy-browser-profiles/<retailer>/ (gitignored).
 * Close the window when signed in — the profile is saved automatically.
 */
const fs = require('fs');
const path = require('path');

const retailer = String(process.argv[2] || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
const START = {
    kohls: 'https://www.kohls.com/account/login.jsp',
    nordstrom: 'https://www.nordstrom.com/signin',
    bestbuy: 'https://www.bestbuy.com/identity/global/signin',
    target: 'https://www.target.com/account',
    walmart: 'https://www.walmart.com/account/login',
    amazon: 'https://www.amazon.com/ap/signin',
    ulta: 'https://www.ulta.com/signin',
    sephora: 'https://www.sephora.com/profile/signin',
};

async function main() {
    if (!retailer || !START[retailer]) {
        console.error('Usage: node scripts/buy-browser-login.js <retailer>');
        console.error('Retailers:', Object.keys(START).join(', '));
        process.exit(1);
    }

    let playwright;
    try {
        playwright = require('playwright');
    } catch {
        console.error('Playwright is not installed. From WrrapdServer run:');
        console.error('  npm install playwright');
        console.error('  npx playwright install chromium');
        process.exit(1);
    }

    const profileRoot = path.join(__dirname, '..', 'data', 'buy-browser-profiles', retailer);
    fs.mkdirSync(profileRoot, { recursive: true });

    console.log(`[buy-browser] Opening ${retailer} profile at ${profileRoot}`);
    console.log(`[buy-browser] Sign in as the Wrrapd store account, then close the window.`);

    const context = await playwright.chromium.launchPersistentContext(profileRoot, {
        headless: false,
        viewport: { width: 1280, height: 900 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        args: ['--disable-blink-features=AutomationControlled'],
    });
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(START[retailer], { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

    await new Promise((resolve) => {
        context.on('close', resolve);
    });
    console.log(`[buy-browser] Profile saved for ${retailer}.`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
