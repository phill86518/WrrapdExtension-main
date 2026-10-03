/**
 * Publish to the Wrrapd Facebook Page via the Graph API.
 * Requires META_PAGE_ID and META_PAGE_ACCESS_TOKEN (a Page token, not a user token).
 */

const fs = require('fs');
const path = require('path');

const CREATIVES_DIR = path.join(__dirname, '..', 'data', 'facebook-creatives');
const GRAPH_VERSION = () => (process.env.META_GRAPH_VERSION || 'v26.0').trim() || 'v26.0';

function pageConfig() {
	const pageId = (process.env.META_PAGE_ID || '').trim();
	const accessToken = (process.env.META_PAGE_ACCESS_TOKEN || '').trim();
	const enabled = (process.env.FACEBOOK_POST_ENABLED || '').trim().toLowerCase() === 'true';
	return {
		pageId,
		hasToken: accessToken.length > 0,
		enabled,
		ready: enabled && pageId.length > 0 && accessToken.length > 0,
		graphVersion: GRAPH_VERSION(),
	};
}

function scrub(text) {
	const token = (process.env.META_PAGE_ACCESS_TOKEN || '').trim();
	let out = String(text || '');
	if (token) out = out.split(token).join('[token]');
	return out;
}

function graphUrl(pageId, edge) {
	return `https://graph.facebook.com/${GRAPH_VERSION()}/${encodeURIComponent(pageId)}/${edge}`;
}

async function graphForm(pageId, edge, fields) {
	const accessToken = (process.env.META_PAGE_ACCESS_TOKEN || '').trim();
	const body = new URLSearchParams();
	for (const [key, value] of Object.entries(fields)) {
		if (value != null && value !== '') body.set(key, String(value));
	}
	body.set('access_token', accessToken);
	const res = await fetch(graphUrl(pageId, edge), { method: 'POST', body });
	let data = {};
	try {
		data = await res.json();
	} catch (err) {
		data = {};
	}
	if (!res.ok || data.error) {
		throw new Error(scrub(data?.error?.message || `Graph API HTTP ${res.status}`));
	}
	return data;
}

async function publishPagePost({ message, link, image }) {
	const pageId = (process.env.META_PAGE_ID || '').trim();
	const accessToken = (process.env.META_PAGE_ACCESS_TOKEN || '').trim();
	if (!pageId || !accessToken) {
		throw new Error('META_PAGE_ID and META_PAGE_ACCESS_TOKEN are required');
	}
	const text = String(message || '').trim();
	const imagePath = image ? path.join(CREATIVES_DIR, path.basename(String(image))) : '';
	if (imagePath && fs.existsSync(imagePath)) {
		const bytes = fs.readFileSync(imagePath);
		const form = new FormData();
		form.set('published', 'true');
		form.set('caption', text);
		form.set('access_token', accessToken);
		form.set('source', new Blob([bytes], { type: 'image/jpeg' }), path.basename(imagePath));
		const res = await fetch(graphUrl(pageId, 'photos'), { method: 'POST', body: form });
		let data = {};
		try {
			data = await res.json();
		} catch (err) {
			data = {};
		}
		const postId = data.post_id || (data.id ? `${pageId}_${data.id}` : '');
		if (!res.ok || !postId) {
			throw new Error(scrub(data?.error?.message || `Photo post HTTP ${res.status}`));
		}
		return { id: String(postId), photoId: data.id ? String(data.id) : '' };
	}
	const data = await graphForm(pageId, 'feed', { message: text, link: link || '' });
	if (!data.id) throw new Error('Graph API did not return a post id');
	return { id: String(data.id) };
}

module.exports = {
	pageConfig,
	publishPagePost,
};
