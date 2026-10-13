/**
 * Automated quote runner: replays the saved retailer workflow in a signed-in Wrrapd browser
 * profile up to the retailer cost page, reads it, empties the cart, and closes. It never places
 * or pays for an order. Playwright is optional; without it (or without a signed-in profile for
 * the retailer) every quote goes to the Command Center quote desk.
 *
 * Profiles: data/buy-browser-profiles/<retailer>/ (a person signs in to Wrrapd's retailer account once).
 */
const fs = require('fs');
const path = require('path');
const grokClient = require('../grok-client');
const workflows = require('./workflows');
const { priceAppearsInPage } = require('./page-reader');

const PROFILE_ROOT = path.join(__dirname, '..', '..', 'data', 'buy-browser-profiles');
const PLACE_ORDER_RE =
    /place\s*(your\s*)?order|submit\s*order|complete\s*(my\s*)?(order|purchase)|pay\s*now|buy\s*now|confirm\s*(and|&)\s*pay|purchase\s*now|1-click|one-click|order\s*now|checkout\s*with\s*paypal/i;
const CARD_FIELD_RE = /cc-|card|cvv|cvc|security\s*code|expir/i;
const PER_ITEM = new Set(['open_product', 'choose_variant', 'add_to_cart']);
const STEP_TIMEOUT_MS = 15000;
let running = 0;

function loadPlaywright() {
    for (const name of ['playwright', 'playwright-core']) {
        try {
            return require(name);
        } catch (_) {
            /* not installed */
        }
    }
    return null;
}

function profileDir(retailerId) {
    return path.join(PROFILE_ROOT, retailerId);
}

function status(retailerId) {
    const pw = !!loadPlaywright();
    const profile = fs.existsSync(path.join(profileDir(retailerId), 'Default'));
    return { playwright: pw, signedInProfile: profile, ready: pw && profile };
}

function fill(template, ctx) {
    return String(template || '').replace(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g, (_, key) => {
        const v = key.split('.').reduce((o, k) => (o && o[k] != null ? o[k] : undefined), ctx);
        return v == null ? '' : String(v);
    });
}

async function locate(page, target, ctx) {
    if (!target) return null;
    if (target.selector) {
        const loc = page.locator(fill(target.selector, ctx)).first();
        if (await loc.count()) return loc;
    }
    if (target.text) {
        const name = fill(target.text, ctx);
        if (!name) return null;
        for (const role of target.role ? [target.role] : ['button', 'link', 'radio', 'option']) {
            const loc = page.getByRole(role, { name, exact: false }).first();
            if (await loc.count()) return loc;
        }
        const loc = page.getByText(name, { exact: false }).first();
        if (await loc.count()) return loc;
    }
    return null;
}

async function assertSafeClick(loc) {
    const label = await loc
        .evaluate((el) =>
            [el.innerText, el.value, el.getAttribute('aria-label'), el.getAttribute('name'), el.id].filter(Boolean).join(' '),
        )
        .catch(() => '');
    if (PLACE_ORDER_RE.test(label)) throw new Error(`refused to click "${label.slice(0, 60)}"`);
}

async function snapshotControls(page) {
    return page.evaluate(() => {
        const out = [];
        const els = document.querySelectorAll('a,button,input,select,[role=button],[role=radio],label');
        const cssPath = (el) => {
            if (el.id) return `#${CSS.escape(el.id)}`;
            const parts = [];
            let n = el;
            while (n && n.nodeType === 1 && parts.length < 5) {
                let p = n.tagName.toLowerCase();
                const dt = n.getAttribute('data-testid') || n.getAttribute('data-test');
                if (dt) {
                    parts.unshift(`${p}[data-testid="${dt}"]`);
                    break;
                }
                const sib = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
                if (sib.length > 1) p += `:nth-of-type(${sib.indexOf(n) + 1})`;
                parts.unshift(p);
                n = n.parentElement;
            }
            return parts.join(' > ');
        };
        for (const el of els) {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            out.push({
                i: out.length,
                tag: el.tagName.toLowerCase(),
                text: (el.innerText || el.value || '').trim().slice(0, 80),
                aria: (el.getAttribute('aria-label') || '').slice(0, 80),
                selector: cssPath(el),
            });
            if (out.length >= 250) break;
        }
        return out;
    });
}

async function healStep(page, step, ctx) {
    if (!grokClient.isConfigured()) return null;
    const controls = await snapshotControls(page);
    const { content } = await grokClient.chatCompletions({
        messages: [
            {
                role: 'system',
                content:
                    'You pick the one page control that completes a shopping step. Never pick a control that places, submits, or pays for an order. Reply JSON {"index":number|null}.',
            },
            {
                role: 'user',
                content: JSON.stringify({
                    step: step.purpose,
                    hint: fill(step.target && step.target.text, ctx) || fill(step.value, ctx),
                    url: page.url(),
                    controls,
                }).slice(0, 50000),
            },
        ],
        temperature: 0,
        max_tokens: 60,
        response_format: { type: 'json_object' },
    });
    const pick = grokClient.parseJsonContent(content);
    const hit = controls.find((c) => c.i === Number(pick && pick.index));
    if (!hit || PLACE_ORDER_RE.test(`${hit.text} ${hit.aria}`)) return null;
    return { selector: hit.selector };
}

async function readCostPage(page, ctx) {
    const text = (await page.evaluate(() => document.body.innerText || '')).slice(0, 24000);
    const { content } = await grokClient.chatCompletions({
        messages: [
            {
                role: 'system',
                content: [
                    'You read a retailer checkout review page. Use only numbers shown on the page.',
                    'Return JSON {"shipTo":string,"items":[{"title":string,"priceUsd":number,"quantity":number}],',
                    '"shippingOptions":[{"label":string,"priceUsd":number,"arrivalDate":"YYYY-MM-DD"|null,"selected":bool}],',
                    '"taxUsd":number|null,"totalUsd":number|null}. Prices are per unit before tax. Free shipping is 0.',
                    `Today is ${new Date().toISOString().slice(0, 10)}.`,
                ].join(' '),
            },
            { role: 'user', content: text },
        ],
        temperature: 0,
        max_tokens: 900,
        response_format: { type: 'json_object' },
    });
    const facts = grokClient.parseJsonContent(content);
    const items = Array.isArray(facts.items) ? facts.items : [];
    if (items.length !== ctx.lines.length) throw new Error(`cost page shows ${items.length} items, expected ${ctx.lines.length}`);
    if (!String(facts.shipTo || '').includes(ctx.hub.postalCode)) throw new Error('cost page is not shipping to the hub');
    const seen = (usd) => usd === 0 || priceAppearsInPage(text, Number(usd));
    for (const it of items) if (!seen(Number(it.priceUsd))) throw new Error('item price not found on page');
    if (facts.taxUsd == null || !seen(Number(facts.taxUsd))) throw new Error('tax not found on page');
    const options = (Array.isArray(facts.shippingOptions) ? facts.shippingOptions : [])
        .filter((o) => Number.isFinite(Number(o.priceUsd)) && seen(Number(o.priceUsd)))
        .slice(0, 6);
    if (!options.length) throw new Error('no shipping option found on page');
    const itemPrices = {};
    ctx.lines.forEach((line, i) => {
        itemPrices[line.id] = Math.round(Number(items[i].priceUsd) * 100);
    });
    return {
        itemPrices,
        shippingOptions: options.map((o, i) => ({
            id: `s${i + 1}`,
            label: String(o.label || 'Standard').slice(0, 80),
            cents: Math.round(Number(o.priceUsd) * 100),
            arrivalDate: /^\d{4}-\d{2}-\d{2}$/.test(String(o.arrivalDate || '')) ? o.arrivalDate : null,
            taxCents: null,
            selectedByRetailer: o.selected === true,
        })),
        taxCents: Math.round(Number(facts.taxUsd) * 100),
        retailerTotalCents: facts.totalUsd != null ? Math.round(Number(facts.totalUsd) * 100) : null,
    };
}

async function runStep(page, step, ctx, healedSteps, index) {
    const exec = async (target) => {
        if (step.action === 'goto') {
            const url = fill(step.value, ctx);
            const host = new URL(url).hostname;
            if (!ctx.allowedHosts.includes(host)) throw new Error('goto off the retailer site');
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            return;
        }
        if (step.action === 'waitFor') {
            const loc = await locate(page, target, ctx);
            if (!loc) throw new Error('not found');
            await loc.waitFor({ timeout: STEP_TIMEOUT_MS });
            return;
        }
        if (step.action === 'select') {
            const value = fill(step.value, ctx);
            if (!value) return;
            const loc = (await locate(page, target, ctx)) || (await locate(page, { text: value }, ctx));
            if (!loc) throw new Error('variant not found');
            const tag = await loc.evaluate((el) => el.tagName.toLowerCase());
            if (tag === 'select') await loc.selectOption({ label: value });
            else {
                await assertSafeClick(loc);
                await loc.click({ timeout: STEP_TIMEOUT_MS });
            }
            return;
        }
        if (step.action === 'fill') {
            const loc = await locate(page, target, ctx);
            if (!loc) throw new Error('field not found');
            const attrs = await loc.evaluate((el) => `${el.name} ${el.id} ${el.autocomplete}`);
            if (CARD_FIELD_RE.test(attrs)) throw new Error('refused to fill a payment field');
            await loc.fill(fill(step.value, ctx), { timeout: STEP_TIMEOUT_MS });
            return;
        }
        if (step.action === 'click') {
            const loc = await locate(page, target, ctx);
            if (!loc) throw new Error('control not found');
            await assertSafeClick(loc);
            await loc.click({ timeout: STEP_TIMEOUT_MS });
            await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
        }
    };
    try {
        await exec(step.target);
    } catch (first) {
        if (step.action === 'goto' || /refused/.test(first.message)) throw first;
        const healed = await healStep(page, step, ctx).catch(() => null);
        if (!healed) {
            if (step.optional) return;
            throw first;
        }
        await exec(healed);
        healedSteps.set(index, healed);
    }
}

async function emptyCart(page, ctx) {
    const cartUrl = ctx.cartUrl;
    if (cartUrl) await page.goto(cartUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    for (let i = 0; i < 12; i++) {
        const loc = page.getByRole('button', { name: /^(delete|remove)\b/i }).first();
        if (!(await loc.count())) break;
        await loc.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(800);
    }
}

const CART_URLS = {
    amazon: 'https://www.amazon.com/gp/cart/view.html',
    target: 'https://www.target.com/cart',
    walmart: 'https://www.walmart.com/cart',
    lego: 'https://www.lego.com/en-us/cart',
    ulta: 'https://www.ulta.com/bag',
    nordstrom: 'https://www.nordstrom.com/shopping-bag',
    kohls: 'https://www.kohls.com/checkout/shopping_cart.jsp',
    sephora: 'https://www.sephora.com/basket',
    bestbuy: 'https://www.bestbuy.com/cart',
    etsy: 'https://www.etsy.com/cart',
};

/**
 * @param {{ retailer: string, lines: Array<{id:string,url:string,variantLabel?:string}>, hub: object, batchId: string, allowedHosts: string[] }} job
 */
async function quote(job) {
    const st = status(job.retailer);
    if (!st.ready) return { ok: false, reason: st.playwright ? 'no_signed_in_profile' : 'runner_not_installed' };
    if (running >= 1) return { ok: false, reason: 'runner_busy' };
    const rec = workflows.get(job.retailer);
    if (!rec) return { ok: false, reason: 'no_workflow' };
    const steps = rec.current.steps;
    const pw = loadPlaywright();
    running += 1;
    let context;
    let page;
    let cartEmptied = false;
    let failedStep = null;
    const healedSteps = new Map();
    const ctx = { ...job, cartUrl: CART_URLS[job.retailer] };
    try {
        context = await pw.chromium.launchPersistentContext(profileDir(job.retailer), {
            headless: true,
            viewport: { width: 1366, height: 900 },
        });
        page = context.pages()[0] || (await context.newPage());
        let result = null;
        for (const line of job.lines) {
            const lineCtx = { ...ctx, item: line };
            for (let i = 0; i < steps.length; i++) {
                if (!PER_ITEM.has(steps[i].purpose)) continue;
                failedStep = i;
                await runStep(page, steps[i], lineCtx, healedSteps, i);
            }
        }
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            if (PER_ITEM.has(step.purpose)) continue;
            failedStep = i;
            if (step.action === 'readCostPage') result = await readCostPage(page, ctx);
            else if (step.action === 'emptyCart') {
                await emptyCart(page, ctx);
                cartEmptied = true;
            }
            else await runStep(page, step, ctx, healedSteps, i);
        }
        if (!result) throw new Error('workflow ended without reading the cost page');
        if (healedSteps.size) {
            const next = steps.map((s, i) => (healedSteps.has(i) ? { ...s, target: { ...(s.target || {}), ...healedSteps.get(i) } } : s));
            workflows.saveVersion(job.retailer, next, {
                source: 'grok-heal',
                savedBy: 'runner',
                note: `Grok found new controls for steps ${[...healedSteps.keys()].map((i) => i + 1).join(', ')}`,
                verified: true,
            });
        }
        workflows.recordRun(job.retailer, { ok: true, batchId: job.batchId, healed: healedSteps.size > 0 });
        return { ok: true, quote: result };
    } catch (e) {
        const reason = e && e.message ? e.message : String(e);
        workflows.recordRun(job.retailer, { ok: false, batchId: job.batchId, failedStep, reason });
        return { ok: false, reason, failedStep };
    } finally {
        if (page && !cartEmptied) await emptyCart(page, ctx).catch(() => {});
        running -= 1;
        if (context) await context.close().catch(() => {});
    }
}

module.exports = { quote, status, PLACE_ORDER_RE };
