/**
 * Posts once on Tuesday, Thursday, and Saturday (10:15am–6:00pm America/New_York).
 * A restart during that window still posts; the date log prevents a second send.
 */

const fs = require('fs');
const path = require('path');
const { selectPost, inPostWindow, etParts, POSTS } = require('./facebook-posts');
const { pageConfig, publishPagePost } = require('./facebook-page');

const LOG_PATH = path.join(__dirname, '..', 'data', 'facebook-post-log.json');

let ticking = false;
let lastSkipLogDate = '';

function readLog() {
	try {
		const raw = fs.readFileSync(LOG_PATH, 'utf8');
		const parsed = JSON.parse(raw);
		if (parsed && Array.isArray(parsed.posts)) return parsed;
	} catch (err) {
		if (err && err.code !== 'ENOENT') {
			console.error('[facebook] Could not read post log:', err.message);
		}
	}
	return { posts: [] };
}

function writeLog(log) {
	const dir = path.dirname(LOG_PATH);
	fs.mkdirSync(dir, { recursive: true });
	const tmp = `${LOG_PATH}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(log, null, 2));
	fs.renameSync(tmp, LOG_PATH);
}

function alreadyPosted(dateKey) {
	return readLog().posts.some((row) => row && row.dateKey === dateKey && !row.removedAt);
}

function recentPostIds(days = 6) {
	const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
	const ids = new Set();
	for (const row of readLog().posts) {
		if (!row || row.removedAt || !row.id || !row.postedAt) continue;
		if (Date.parse(row.postedAt) >= cutoff) ids.add(row.id);
	}
	return ids;
}

function withFreshCopy(post) {
	if (!post) return post;
	const recent = recentPostIds();
	if (!recent.has(post.id)) return post;
	const other = POSTS.find((item) => item.slot === post.slot && item.id !== post.id && !recent.has(item.id));
	if (!other) return post;
	return { ...other, dateKey: post.dateKey, isoWeek: post.isoWeek };
}

function status(now = new Date()) {
	const et = etParts(now);
	const next = withFreshCopy(selectPost(now));
	const cfg = pageConfig();
	const log = readLog();
	const last = log.posts.length ? log.posts[log.posts.length - 1] : null;
	return {
		timezone: 'America/New_York',
		today: et.dateKey,
		weekday: et.weekday,
		inWindow: inPostWindow(now),
		window: 'Tue/Thu/Sat 10:15–18:00',
		configured: cfg.hasToken && Boolean(cfg.pageId),
		enabled: cfg.enabled,
		ready: cfg.ready,
		pageId: cfg.pageId || null,
		graphVersion: cfg.graphVersion,
		alreadyPostedToday: alreadyPosted(et.dateKey),
		nextPost: next
			? { id: next.id, slot: next.slot, link: next.link, message: next.message, isoWeek: next.isoWeek }
			: null,
		lastPost: last,
	};
}

async function publishSelected(post) {
	const result = await publishPagePost({ message: post.message, link: post.link, image: post.image });
	const log = readLog();
	log.posts.push({
		dateKey: post.dateKey,
		id: post.id,
		slot: post.slot,
		link: post.link,
		facebookId: result.id,
		postedAt: new Date().toISOString(),
	});
	writeLog(log);
	return result;
}

async function tick(now = new Date()) {
	if (ticking) return { skipped: 'busy' };
	ticking = true;
	try {
		if (!inPostWindow(now)) return { skipped: 'outside-window' };
		const post = withFreshCopy(selectPost(now));
		if (!post) return { skipped: 'no-post' };
		if (alreadyPosted(post.dateKey)) return { skipped: 'already-posted', dateKey: post.dateKey };
		const cfg = pageConfig();
		if (!cfg.ready) {
			if (lastSkipLogDate !== post.dateKey) {
				lastSkipLogDate = post.dateKey;
				console.log(
					`[facebook] ${post.dateKey} ${post.id} is ready, but posting is off. Set META_PAGE_ID, META_PAGE_ACCESS_TOKEN, and FACEBOOK_POST_ENABLED=true.`
				);
			}
			return { skipped: 'not-configured', id: post.id, dateKey: post.dateKey };
		}
		const result = await publishSelected(post);
		console.log(`[facebook] Posted ${post.id} as ${result.id}`);
		return { posted: true, id: post.id, facebookId: result.id, dateKey: post.dateKey };
	} catch (err) {
		console.error('[facebook] Post failed:', err.message || err);
		return { posted: false, error: err.message || String(err) };
	} finally {
		ticking = false;
	}
}

module.exports = {
	tick,
	status,
	publishSelected,
	alreadyPosted,
};
