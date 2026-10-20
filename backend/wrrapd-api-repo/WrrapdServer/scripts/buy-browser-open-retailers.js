#!/usr/bin/env node
/**
 * Open one Chromium window with a tab for each buy-for-you retailer.
 * First eight: Lego, Target, Nordstrom, Kohl's, Amazon, Etsy, Ulta, Sephora.
 * Last two: Walmart, Best Buy.
 *
 * Usage:
 *   node scripts/buy-browser-open-retailers.js
 *
 * Uses the shared ordering profile at data/buy-browser-profiles/wrrapd-order/
 * when present so signed-in retailer sessions can stick. Close the window when done.
 */
const fs = require('fs');
const path = require('path');

const TABS = [
    { id: 'lego', name: 'Lego', url: 'https://www.lego.com/en-us' },
    { id: 'target', name: 'Target', url: 'https://www.target.com/account' },
    { id: 'nordstrom', name: 'Nordstrom', url: 'https://www.nordstrom.com/signin' },
    { id: 'kohls', name: "Kohl's", url: 'https://www.kohls.com/account/login.jsp' },
    { id: 'amazon', name: 'Amazon', url: 'https://www.amazon.com/ap/signin' },
    { id: 'etsy', name: 'Etsy', url: 'https://www.etsy.com/signin' },
    { id: 'ulta', name: 'Ulta', url: 'https://www.ulta.com/signin' },
    { id: 'sephora', name: 'Sephora', url: 'https://www.sephora.com/profile/signin' },
    { id: 'walmart', name: 'Walmart', url: 'https://www.walmart.com/account/login' },
    { id: 'bestbuy', name: 'Best Buy', url: 'https://www.bestbuy.com/identity/global/signin' },
];

async function main() {
    let playwright;
    try {
        playwright = require('playwright');
    } catch {
        console.error('Playwright is not installed. From WrrapdServer run:');
        console.error('  npm install playwright');
        console.error('  npx playwright install chromium');
        process.exit(1);
    }

    const profileRoot = path.join(__dirname, '..', 'data', 'buy-browser-profiles', 'wrrapd-order');
    fs.mkdirSync(profileRoot, { recursive: true });

    console.log(`[buy-browser] Opening ${TABS.length} retailer tabs (Walmart + Best Buy last)`);
    console.log(`[buy-browser] Profile: ${profileRoot}`);

    const context = await playwright.chromium.launchPersistentContext(profileRoot, {
        headless: false,
        viewport: { width: 1400, height: 900 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        args: ['--disable-blink-features=AutomationControlled'],
    });

    for (let i = 0; i < TABS.length; i += 1) {
        const tab = TABS[i];
        const page = i === 0 ? (context.pages()[0] || (await context.newPage())) : await context.newPage();
        console.log(`[buy-browser] ${i + 1}/${TABS.length} ${tab.name} → ${tab.url}`);
        await page.goto(tab.url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => {
            console.warn(`[buy-browser] ${tab.name} load: ${String(e && e.message || e).slice(0, 120)}`);
        });
        await page.waitForTimeout(400);
    }

    console.log('[buy-browser] All tabs open. Sign in / start orders on the first 8; leave Walmart and Best Buy for last.');
    console.log('[buy-browser] Close the window when finished.');

    await new Promise((resolve) => {
        context.on('close', resolve);
    });
    console.log('[buy-browser] Window closed.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
