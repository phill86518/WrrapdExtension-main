#!/usr/bin/env node
/** Generates wrrapd-top-gifting-choices-page.html */

const EXTENSION_RETAILERS = new Set([
	'lego.com', 'target.com', 'walmart.com', 'nordstrom.com', 'kohls.com',
	'sephora.com', 'ulta.com', 'etsy.com', 'bestbuy.com', 'amazon.com',
]);

/** Declined or not a fit — never list on the public page */
const BLOCKLIST = new Set([
	'scoutbags.com',
	'samsclub.com',
	'neimanmarcus.com',
	'gamestop.com',
	'cobragolf.com',
	'cobra.com',
]);

/** Live tracked links — shown first with no public “partner” label */
const FEATURED = [
	{ title: 'GiftCards.com', domain: 'giftcards.com', copy: 'Digital and physical gift cards for dozens of brands—when you want them to choose.' },
	{ title: 'zChocolates', domain: 'zchocolates.com', copy: 'Artisan chocolate gifts—boxes built for unwrapping.' },
	{ title: 'Russell Stover', domain: 'russellstover.com', copy: 'Classic American chocolates—assortments for every name on the list.', href: 'https://www.russellstover.com/shop/gifts' },
	{ title: 'Fresh Roasted Coffee', domain: 'freshroastedcoffee.com', copy: 'Roaster-direct beans—giftable bags with real aroma payoff.' },
	{ title: 'Books-A-Million', domain: 'booksamillion.com', copy: 'Books, games, and collectibles—reader gifts.', href: 'https://www.booksamillion.com/gifts' },
];

const FEATURED_DOMAINS = new Set(FEATURED.map((f) => f.domain));

/** Fallback gift-hub URLs when an item has no explicit href (avoid 404-prone paths). */
const DEFAULT_GIFT_HREFS = {
	'anthropologie.com': 'https://www.anthropologie.com/gifts',
	'clinique.com': 'https://www.clinique.com/',
	'fossil.com': 'https://www.fossil.com/en-us/gifts/',
	'fragrancenet.com': 'https://www.fragrancenet.com/',
	'kerastase-usa.com': 'https://www.kerastase-usa.com/gifts/',
	'kiehls.com': 'https://www.kiehls.com/gifts/',
	'macys.com': 'https://www.macys.com/shop/gift-guide',
	'monicavinader.com': 'https://www.monicavinader.com/',
	'movado.com': 'https://www.movado.com/us/en/gifts',
	'prada-beauty.com': 'https://www.prada-beauty.com/',
	'russellstover.com': 'https://www.russellstover.com/shop/gifts',
	'toddsnyder.com': 'https://www.toddsnyder.com/',
	'yslbeauty.com': 'https://www.yslbeauty.com/',
	'zchocolates.com': 'https://www.zchocolates.com/',
};

function card({ title, domain, copy, href }) {
	const host = domain.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
	if (EXTENSION_RETAILERS.has(host) || BLOCKLIST.has(host)) return '';
	const url = href || DEFAULT_GIFT_HREFS[host] || `https://www.${host}/`;
	return `
			<li class="wrrapd-top-gifts__card">
				<div class="wrrapd-top-gifts__card-top">
					<span class="wrrapd-top-gifts__logo"><img src="https://www.google.com/s2/favicons?domain=${host}&amp;sz=128" width="38" height="38" alt="" decoding="async" loading="lazy" /></span>
					<h3 class="wrrapd-top-gifts__card-title">${title}</h3>
				</div>
				<p class="wrrapd-top-gifts__card-copy">${copy}</p>
				<a class="wrrapd-top-gifts__card-cta" href="${url}" target="_blank" rel="sponsored noopener noreferrer">Shop ${title} →</a>
			</li>`;
}

const categories = [
	{
		id: 'chocolates-coffee',
		label: 'Chocolates &amp; coffee',
		items: [
			{ title: 'Peet\u2019s Coffee', domain: 'peets.com', copy: 'Subscription and bean gifts for the caffeine loyalist.', href: 'https://www.peets.com/gifts' },
			{ title: 'Baked by Melissa', domain: 'bakedbymelissa.com', copy: 'Tiny cupcakes in gift tins—office-party hero.', href: 'https://www.bakedbymelissa.com/collections/gifts' },
			{ title: 'Pressed Juicery', domain: 'pressedjuicery.com', copy: 'Juice and wellness drops—clean-ingredient care packages.' },
			{ title: 'Ka\u2019Chava', domain: 'kachava.com', copy: 'Plant-based meal shakes—fitness-minded stocking stuffers.' },
		],
	},
	{
		id: 'beauty-fragrance',
		label: 'Beauty &amp; fragrance',
		items: [
			{ title: 'Benefit Cosmetics', domain: 'benefitcosmetics.com', copy: 'Brow kits and cheek pops—playful beauty gifts.', href: 'https://www.benefitcosmetics.com/us/en/gifts' },
			{ title: 'Clinique', domain: 'clinique.com', copy: 'Skincare sets with gift-with-purchase energy.', href: 'https://www.clinique.com/' },
			{ title: 'Givenchy Beauty', domain: 'givenchybeauty.com', copy: 'Designer fragrance and couture color—luxury unboxing.' },
			{ title: 'Anastasia Beverly Hills', domain: 'anastasiabeverlyhills.com', copy: 'Brow and glam essentials for the makeup obsessed.' },
			{ title: 'Moroccanoil', domain: 'moroccanoil.com', copy: 'Hair oil rituals—salon-quality gift sets.' },
			{ title: 'Madison Reed', domain: 'madison-reed.com', copy: 'At-home hair color kits—thoughtful self-care gifts.' },
			{ title: 'Bond No. 9', domain: 'bondno9.com', copy: 'NYC-inspired niche fragrance—for scent collectors.' },
			{ title: 'FragranceNet', domain: 'fragrancenet.com', copy: 'Discount designer fragrance—smart splurge gifting.' },
			{ title: 'FragranceX', domain: 'fragrancex.com', copy: 'Wide fragrance selection when you know their vibe, not the bottle.' },
			{ title: 'Kiehl\u2019s', domain: 'kiehls.com', copy: 'Skincare sets and minis that feel luxe before the bow goes on.', href: 'https://www.kiehls.com/gifts/' },
			{ title: 'K\u00e9rastase', domain: 'kerastase-usa.com', copy: 'Salon-grade hair care bundles.', href: 'https://www.kerastase-usa.com/gifts/' },
			{ title: 'YSL Beauty', domain: 'yslbeauty.com', copy: 'Iconic fragrance and makeup—high-impact unboxing.', href: 'https://www.yslbeauty.com/' },
			{ title: 'Prada Beauty', domain: 'prada-beauty.com', copy: 'Designer fragrance and color for a polished moment.' },
			{ title: 'SK-II', domain: 'sk-ii.com', copy: 'Prestige skincare rituals—self-care done right.' },
			{ title: 'Maison Margiela Fragrances', domain: 'maisonmargiela-fragrances.us', copy: 'Niche scent profiles for someone who has everything.' },
			{ title: 'Milani Cosmetics', domain: 'milanicosmetics.com', copy: 'Drugstore-luxe color—great for beauty-starter kits.' },
			{ title: 'Catrice Cosmetics', domain: 'catricecosmetics.com', copy: 'Affordable color cosmetics—fun grab-and-gift picks.' },
			{ title: 'Moira Cosmetics', domain: 'moirabeauty.com', copy: 'Color-forward makeup for beauty enthusiasts.' },
			{ title: 'MakeUp Eraser', domain: 'makeuperaser.com', copy: 'Reusable remover cloths—stocking-stuffer hero.' },
			{ title: 'HiSmile', domain: 'hismileteeth.com', copy: 'Teeth-whitening kits—self-care with instant wow.' },
			{ title: 'Dermaflash', domain: 'dermaflash.com', copy: 'At-home dermaplaning tools—beauty-tech gifts.' },
			{ title: 'Dr. Brandt', domain: 'drbrandtskincare.com', copy: 'Clinical skincare—results-focused gift sets.' },
			{ title: 'Lab Series', domain: 'labseries.com', copy: 'Men\u2019s skincare—grooming gifts that feel premium.' },
			{ title: 'Marcelle', domain: 'marcelle.com', copy: 'Clean Canadian beauty—gentle formulas in gift-ready sets.' },
			{ title: 'Kate McLeod', domain: 'katemcleod.com', copy: 'Solid body stones—spa-at-home luxe.' },
			{ title: 'Labelle Perfumes', domain: 'labelleperfumes.com', copy: 'Discount designer scents.' },
			{ title: 'Kush Queen', domain: 'kushqueen.shop', copy: 'CBD bath and body—relaxation gifts.' },
		],
	},
	{
		id: 'electronics',
		label: 'Electronics',
		items: [
			{ title: 'HP', domain: 'hp.com', copy: 'Laptops and printers—graduation and WFH upgrades.', href: 'https://www.hp.com/us-en/shop/gifts.html' },
			{ title: 'Acer', domain: 'acer.com', copy: 'Value-forward laptops and monitors—student gifting.', href: 'https://www.acer.com/us-en/' },
			{ title: 'SanDisk', domain: 'sandisk.com', copy: 'Storage and memory—small box, high utility.', href: 'https://shop.sandisk.com/' },
			{ title: 'Monoprice', domain: 'monoprice.com', copy: 'Cables, AV, and maker gear—for the tinkerer.' },
			{ title: 'SodaStream', domain: 'sodastream.com', copy: 'Sparkling-water makers—kitchen gadget gifts.' },
			{ title: 'Click & Grow', domain: 'clickandgrow.com', copy: 'Smart indoor gardens—grow-your-own presents.' },
			{ title: 'Bandolier', domain: 'bandolierstyle.com', copy: 'Phone-case crossbodies—hands-free fashion tech.' },
			{ title: 'Shutterfly', domain: 'shutterfly.com', copy: 'Photo books and custom prints—memory gifts.', href: 'https://www.shutterfly.com/personalized-gifts/' },
			{ title: 'VAIO US', domain: 'us.vaio.com', copy: 'Premium lightweight laptops—niche but loyal audience.' },
			{ title: 'Philips Home Appliances', domain: 'philips.com', copy: 'Air fryers, espresso, and kitchen tech.' },
		],
	},
	{
		id: 'fashion',
		label: 'Fashion &amp; accessories',
		items: [
			{ title: 'Anthropologie', domain: 'anthropologie.com', copy: 'Boho apparel and home—gift-with-personality picks.', href: 'https://www.anthropologie.com/gifts' },
			{ title: 'Tory Burch', domain: 'toryburch.com', copy: 'Classic American luxury—bags and shoes that photograph well.', href: 'https://www.toryburch.com/en-us/gifts/' },
			{ title: 'Jimmy Choo', domain: 'jimmychoo.com', copy: 'Statement heels and bags—milestone-gift territory.' },
			{ title: 'Vera Bradley', domain: 'verabradley.com', copy: 'Patterned bags and travel—cheerful, wrap-friendly boxes.' },
			{ title: 'JanSport', domain: 'jansport.com', copy: 'Backpacks and bags—students and commuters.' },
			{ title: 'Mack Weldon', domain: 'mackweldon.com', copy: 'Elevated men\u2019s basics—under-the-tree staples.' },
			{ title: 'David\u2019s Bridal', domain: 'davidsbridal.com', copy: 'Bridal and occasion wear—shower and wedding gifts.' },
			{ title: 'Macy\u2019s', domain: 'macys.com', copy: 'Department-store breadth—one stop when the list is long.', href: 'https://www.macys.com/shop/gift-guide' },
			{ title: 'JCPenney', domain: 'jcpenney.com', copy: 'Apparel, home, and kids—practical gifting.', href: 'https://www.jcpenney.com/g/gifts' },
			{ title: 'J.Crew Factory', domain: 'jcrewfactory.com', copy: 'Classic American style—easy apparel gifts.', href: 'https://factory.jcrew.com/' },
			{ title: 'Todd Snyder', domain: 'toddsnyder.com', copy: 'Elevated menswear—considered gifts for him.' },
			{ title: 'Kenneth Cole', domain: 'kennethcole.com', copy: 'Shoes, bags, and fragrance—city-polished ideas.' },
			{ title: 'LACOSTE', domain: 'lacoste.com', copy: 'Preppy polos and staples—recognizable gift boxes.', href: 'https://www.lacoste.com/us/' },
			{ title: 'Hunter Boots', domain: 'hunterboots.com', copy: 'Iconic wellies—statement gifts with utility.', href: 'https://www.hunterboots.com/' },
			{ title: 'ECCO', domain: 'ecco.com', copy: 'Comfort footwear—walk-all-day gifts.' },
			{ title: 'Forsake', domain: 'forsake.com', copy: 'Outdoor sneakers—trail-to-town versatility.' },
			{ title: 'Foxcroft', domain: 'foxcroftcollection.com', copy: 'Wrinkle-free women\u2019s shirts—travel-friendly gifts.' },
			{ title: 'A.L.C.', domain: 'alcltd.com', copy: 'Modern women\u2019s ready-to-wear—effortless polish.' },
			{ title: 'Marie Oliver', domain: 'marieoliver.com', copy: 'Feminine dresses and sets—occasion-ready gifting.' },
			{ title: 'Katie Loxton', domain: 'katieloxton.com', copy: 'Affordable bags and accessories—gift-box ready.' },
			{ title: 'Estella Bartlett', domain: 'estellabartlett.com', copy: 'Jewelry and accessories with sentiment packaging.' },
			{ title: 'Papinelle', domain: 'papinelle.com', copy: 'Sleepwear and loungewear—cozy gifts that ship flat.' },
			{ title: 'Komar Brands', domain: 'komarbrands.com', copy: 'Sleepwear and layering—soft, wrap-friendly finds.' },
			{ title: 'Lands\u2019 End', domain: 'landsend.com', copy: 'Monogram-ready classics—family-list friendly.', href: 'https://www.landsend.com/shop/gifts/S-xec-xeb' },
			{ title: 'Stacy Adams', domain: 'stacyadams.com', copy: 'Men\u2019s dress shoes—Father\u2019s Day and formal events.' },
		],
	},
	{
		id: 'jewelry-watches',
		label: 'Jewelry &amp; watches',
		items: [
			{ title: 'Monica Vinader', domain: 'monicavinader.com', copy: 'Demi-fine jewelry—personalized, stackable gifts.' },
			{ title: 'Movado', domain: 'movado.com', copy: 'Minimalist watches—clean dial, classic presentation.', href: 'https://www.movado.com/us/en/gifts' },
			{ title: 'Fossil', domain: 'fossil.com', copy: 'Watches and leather—easy wins for him or her.', href: 'https://www.fossil.com/en-us/gifts/' },
			{ title: 'Timex', domain: 'timex.com', copy: 'Dependable watches from casual to dress.', href: 'https://timex.com/' },
			{ title: 'Kay Jewelers', domain: 'kay.com', copy: 'Classic fine jewelry for milestones.', href: 'https://www.kay.com/jewelry/gifts' },
			{ title: 'Zales', domain: 'zales.com', copy: 'Rings, chains, and sparkle across budgets.', href: 'https://www.zales.com/gifts' },
			{ title: 'JTV Jewelry', domain: 'jtv.com', copy: 'Gemstone jewelry—sparkle across budgets online.' },
			{ title: 'VY Jewelry', domain: 'vyjewelry.com', copy: 'Everyday pieces with gift-box appeal.' },
			{ title: 'Friendly Diamonds', domain: 'friendlydiamonds.com', copy: 'Lab-grown diamonds for forever gifts.' },
			{ title: 'GOODSTONE', domain: 'goodstone.com', copy: 'Modern fine jewelry with strong unbox moments.' },
			{ title: 'Radley London', domain: 'radley.co.uk', copy: 'British bags and small leather goods—charm-heavy gifts.' },
		],
	},
	{
		id: 'home-kitchen',
		label: 'Home &amp; kitchen',
		items: [
			{ title: 'Jonathan Adler', domain: 'jonathanadler.com', copy: 'Whimsical décor and pottery—bold host gifts.' },
			{ title: 'Vitamix', domain: 'vitamix.com', copy: 'Big-ticket kitchen hero—registry-worthy.', href: 'https://www.vitamix.com/us/en_us/' },
			{ title: 'Cuisinart', domain: 'cuisinart.com', copy: 'Small appliances—housewarming staples.', href: 'https://www.cuisinart.com/' },
			{ title: 'Simon Pearce', domain: 'simonpearce.com', copy: 'Handcrafted glass—elevated entertaining gifts.', href: 'https://simonpearce.com/collections/gifts' },
			{ title: 'Portmeirion', domain: 'portmeirion.co.uk', copy: 'Tableware and pottery—British charm for the dining room.' },
			{ title: 'Spode', domain: 'spode.com', copy: 'Fine china and holiday patterns—heirloom-style gifts.' },
			{ title: 'Epicurean', domain: 'epicureanusa.com', copy: 'Cutting boards and kitchen tools—chef-approved.' },
			{ title: 'SUNNYLIFE', domain: 'sunnylife.com', copy: 'Pool floats and outdoor fun—summer-birthday energy.' },
			{ title: 'Addison Ross', domain: 'addisonross.com', copy: 'Frames, candles, and home accents—finishing-touch gifts.' },
			{ title: 'Callia Flowers', domain: 'callia.com', copy: 'Farm-direct flower delivery—fresh blooms by mail.' },
			{ title: 'Art.com', domain: 'art.com', copy: 'Framed prints and posters—personalized wall gifts.' },
		],
	},
	{
		id: 'kids-family',
		label: 'Kids &amp; family',
		items: [
			{ title: 'Jellycat', domain: 'jellycat.com', copy: 'Plush animals—soft gifts kids actually clutch.', href: 'https://us.jellycat.com/' },
			{ title: 'Fat Brain Toys', domain: 'fatbraintoys.com', copy: 'STEM and creative toys—parent-approved unboxing.', href: 'https://www.fatbraintoys.com/' },
			{ title: 'Kidrobot', domain: 'kidrobot.com', copy: 'Designer vinyl toys—collectible gifts for teens and adults.' },
			{ title: 'Gerber Childrenswear', domain: 'gerberchildrenswear.com', copy: 'Baby essentials—shower and new-parent gifts.' },
			{ title: 'Tinybeans', domain: 'tinybeans.com', copy: 'Family photo journal app—digital gift for new parents.' },
			{ title: 'JustFoodForDogs', domain: 'justfoodfordogs.com', copy: 'Premium pet meals—for the dog person on your list.' },
		],
	},
	{
		id: 'food-gourmet',
		label: 'Food &amp; gourmet',
		items: [
			{ title: 'Meat N\u2019 Bone', domain: 'meatnbone.com', copy: 'Premium steaks by mail—grill-master gifts.' },
			{ title: 'Nature Made', domain: 'naturemade.com', copy: 'Vitamins and wellness bundles—practical care packages.' },
			{ title: 'Naked Nutrition', domain: 'nakednutrition.com', copy: 'Protein and supplements—for the gym person.' },
		],
	},
	{
		id: 'books-sports',
		label: 'Books &amp; sports',
		items: [
			{ title: 'Books-A-Million', domain: 'booksamillion.com', copy: 'Books, games, and collectibles—reader gifts.', href: 'https://www.booksamillion.com/gifts' },
			{ title: 'Academy Sports', domain: 'academy.com', copy: 'Sports and outdoor gear—active-lifestyle gifting.', href: 'https://www.academy.com/c/shops/gift-guide' },
			{ title: 'Nathan Sports', domain: 'nathansports.com', copy: 'Running packs and hydration gear.' },
			{ title: 'Golf Direct Now', domain: 'golfdirectnow.com', copy: 'Golf gear—Father\u2019s Day and retirement lists.' },
		],
	},
];

const seen = new Set([...FEATURED_DOMAINS]);
for (const cat of categories) {
	cat.items = cat.items.filter((item) => {
		const key = item.domain.replace(/^www\./, '');
		if (BLOCKLIST.has(key) || FEATURED_DOMAINS.has(key) || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

const navItems = categories.map((c) => ({ id: c.id, label: c.label.replace(/&amp;/g, '&') }));

const nav = navItems
	.map((n) => `\t\t\t<li><a class="wrrapd-top-gifts__pill" href="#${n.id}">${n.label}</a></li>`)
	.join('\n');

const featuredCards = FEATURED.map((i) => card(i)).join('');

const sections = categories
	.filter((c) => c.items.length > 0)
	.map((c) => {
		const cards = c.items.map((i) => card(i)).join('');
		return `
		<section class="wrrapd-top-gifts__section" id="${c.id}" aria-labelledby="${c.id}-title">
			<h2 class="wrrapd-top-gifts__category" id="${c.id}-title">${c.label}</h2>
			<ul class="wrrapd-top-gifts__grid">${cards}
			</ul>
		</section>`;
	})
	.join('');

const html = `<!--
  ELEMENTOR: page slug top-gifting-choices — /top-gifting-choices/
  CSS: wrrapd-additional-css-complete.css in Additional CSS.
-->

<section class="wrrapd-top-gifts" aria-labelledby="wtg-hub-title">
	<div class="wrrapd-top-gifts__inner">
		<p class="wrrapd-top-gifts__eyebrow">Gift ideas</p>
		<h1 id="wtg-hub-title">Wrrapd\u2019s Top Gifting Choices</h1>
		<p class="wrrapd-top-gifts__lede wrrapd-top-gifts__lede--display">
			Hand-picked brands by category—chocolates, beauty, electronics, fashion, and more.
			For retailers where Wrrapd wraps at checkout, see our <a href="https://wrrapd.com/">homepage gift guides</a>.
		</p>

		<nav class="wrrapd-top-gifts__nav" aria-label="Gift categories">
			<ul class="wrrapd-top-gifts__nav-list">
${nav}
			</ul>
		</nav>

		<section class="wrrapd-top-gifts__section wrrapd-top-gifts__section--featured" id="featured" aria-labelledby="featured-title">
			<h2 class="wrrapd-top-gifts__category" id="featured-title">Featured Gifting Choices</h2>
			<ul class="wrrapd-top-gifts__grid wrrapd-top-gifts__grid--featured">${featuredCards}
			</ul>
		</section>
${sections}

		<p class="wrrapd-top-gifts__disclaimer">
			We may earn a commission on qualifying purchases.
			<a href="https://wrrapd.com/affiliate-disclosure/">Disclosure</a>.
		</p>
	</div>
</section>
`;

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), 'wrrapd-top-gifting-choices-page.html');
writeFileSync(out, html.trim() + '\n', 'utf8');
const total = FEATURED.length + categories.reduce((n, c) => n + c.items.length, 0);
console.log('Wrote', out, '—', total, 'cards');
