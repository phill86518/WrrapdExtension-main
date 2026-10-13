/**
 * Amazon category for every bought item. Amazon pages print their own path; other stores are
 * mapped by Grok onto the Amazon department list in data/amazon-categories.json.
 */
const fs = require('fs');
const path = require('path');
const grokClient = require('../grok-client');

const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'amazon-categories.json');
let TREE = null;

function tree() {
    if (!TREE) TREE = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')).departments;
    return TREE;
}

function decode(s) {
    return String(s || '')
        .replace(/&amp;/g, '&')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Amazon product pages list the category path in the wayfinding breadcrumb. */
function amazonBreadcrumb(html) {
    const i = html.indexOf('wayfinding-breadcrumbs_feature_div');
    if (i < 0) return [];
    const chunk = html.slice(i, i + 12000);
    const end = chunk.indexOf('</ul>');
    const list = end > 0 ? chunk.slice(0, end) : chunk;
    const out = [];
    const re = /<a[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(list)) && out.length < 8) {
        const t = decode(m[1].replace(/<[^>]+>/g, ' '));
        if (t) out.push(t);
    }
    return out;
}

/** Amazon product group (gl_*) printed on every product page, mapped to its department. */
const PRODUCT_GROUPS = {
    pc: 'Electronics', ce: 'Electronics', premium_ce_brands: 'Electronics', camera: 'Electronics', wireless: 'Cell Phones & Accessories',
    video_games: 'Video Games', digital_video_game: 'Video Games', software: 'Software', digital_software: 'Software',
    book: 'Books', digital_ebook_purchase: 'Kindle Store', ebook: 'Kindle Store', music: 'Music', digital_music_purchase: 'Music', dvd: 'Movies & TV', video: 'Movies & TV',
    kitchen: 'Home & Kitchen', home: 'Home & Kitchen', furniture: 'Home & Kitchen', home_entertainment: 'Electronics', major_appliances: 'Appliances',
    home_improvement: 'Tools & Home Improvement', lawn_and_garden: 'Patio, Lawn & Garden', outdoors: 'Patio, Lawn & Garden',
    apparel: 'Clothing, Shoes & Jewelry', shoes: 'Clothing, Shoes & Jewelry', jewelry: 'Clothing, Shoes & Jewelry', watch: 'Clothing, Shoes & Jewelry', luggage: 'Luggage & Travel Gear',
    beauty: 'Beauty & Personal Care', luxury_beauty: 'Beauty & Personal Care', personal_care_appliances: 'Beauty & Personal Care',
    drugstore: 'Health & Household', health_and_household: 'Health & Household', grocery: 'Grocery & Gourmet Food', gourmet: 'Grocery & Gourmet Food',
    toy: 'Toys & Games', baby_product: 'Baby', sports: 'Sports & Outdoors', automotive: 'Automotive', pet_products: 'Pet Supplies',
    office_product: 'Office Products', art_and_craft_supply: 'Arts, Crafts & Sewing', musical_instruments: 'Musical Instruments',
    biss: 'Industrial & Scientific', gift_card: 'Gift Cards', handmade: 'Handmade', collectibles: 'Collectibles & Fine Art',
};

function amazonProductGroup(html) {
    const m = String(html || '').match(/productGroupID["':=\s]+["']?(?:gl_)?([a-z_]+?)(?:_display_on_website)?["',]/i);
    return m ? m[1].toLowerCase() : null;
}

function matchDepartment(name) {
    const want = String(name || '').toLowerCase();
    return Object.keys(tree()).find((d) => d.toLowerCase() === want) || null;
}

function matchSub(dept, name) {
    if (!dept || !name) return null;
    const want = String(name).toLowerCase();
    return tree()[dept].find((s) => s.toLowerCase() === want) || null;
}

function fromAmazonPath(parts) {
    if (!parts.length) return null;
    const dept = matchDepartment(parts[0]);
    return {
        department: dept || parts[0],
        subcategory: (dept && matchSub(dept, parts[1])) || parts[1] || '',
        path: parts.join(' > '),
        source: 'amazon_page',
    };
}

async function mapWithGrok({ retailerName, title, brand, category, department }) {
    if (!grokClient.isConfigured()) return null;
    const list = department ? { [department]: tree()[department] } : tree();
    const { content } = await grokClient.chatCompletions({
        messages: [
            {
                role: 'system',
                content:
                    'Map one retail product onto the Amazon.com category list you are given. ' +
                    'department must be one key of the list. subcategory must be one value under that key, or "" when none fits. ' +
                    'Return JSON: {"department":string,"subcategory":string}',
            },
            {
                role: 'user',
                content: JSON.stringify({ product: { retailer: retailerName, title, brand, retailerCategory: category }, amazonCategories: list }),
            },
        ],
        temperature: 0,
        max_tokens: 120,
        response_format: { type: 'json_object' },
    });
    const out = grokClient.parseJsonContent(content);
    const dept = department || matchDepartment(out && out.department);
    if (!dept) return null;
    const sub = matchSub(dept, out && out.subcategory) || '';
    return { department: dept, subcategory: sub, path: sub ? `${dept} > ${sub}` : dept, source: department ? 'amazon_page' : 'grok' };
}

/**
 * @returns {Promise<{department:string, subcategory:string, path:string, source:string} | null>}
 */
async function categorize({ retailer, retailerName, html, title, brand, category }) {
    if (retailer === 'amazon') {
        const fromPage = fromAmazonPath(amazonBreadcrumb(html || ''));
        if (fromPage) return fromPage;
    }
    const group = retailer === 'amazon' ? amazonProductGroup(html) : null;
    const department = group ? PRODUCT_GROUPS[group] || null : null;
    try {
        return await mapWithGrok({ retailerName, title, brand, category, department });
    } catch (_) {
        return department ? { department, subcategory: '', path: department, source: 'amazon_page' } : null;
    }
}

module.exports = { categorize, amazonBreadcrumb, amazonProductGroup, tree };
