/**
 * Facebook Page copy for facebook.com/wrrapd.
 * Hiring posts only: one track, the work, and the apply link.
 * Do not name markets, cities, or states. Where a post is shown is a backend campaign.
 * Pay amounts stay off the page. Links go to apply.wrrapd.com.
 *
 * Schedule (America/New_York, once each day):
 *   Tuesday   — WrapStar
 *   Thursday  — JoyRider
 *   Saturday  — WrapRider
 */

const APPLY = {
	wrapstar: 'https://apply.wrrapd.com/',
	joyrider: 'https://apply.wrrapd.com/drive/',
	wraprider: 'https://apply.wrrapd.com/wraprider/',
};

const POSTS = [
	{
		id: 'hire-wrapstar-cities',
		slot: 'tue',
		track: 'wrapstar',
		image: 'wrapstar.jpg',
		link: APPLY.wrapstar,
		message:
			'Do you love wrapping gifts? How about getting paid hourly to enjoy what you love? Become a "WrapStar" and wrap beautiful gifts from your own space, on your own schedule. Your rate is confirmed when you’re approved.\n\nApply now: ' +
			APPLY.wrapstar,
	},
	{
		id: 'hire-wrapstar-ribbon',
		slot: 'tue',
		track: 'wrapstar',
		image: 'wrapstar.jpg',
		link: APPLY.wrapstar,
		message:
			'Do you love wrapping gifts? How about getting paid hourly to enjoy what you love? A "WrapStar" is the hands behind the ribbon — holidays, birthdays, and weddings, wrapped from your own space. Your rate is confirmed when you’re approved.\n\nApply now: ' +
			APPLY.wrapstar,
	},
	{
		id: 'hire-joyrider-cities',
		slot: 'thu',
		track: 'joyrider',
		image: 'joyrider.jpg',
		link: APPLY.joyrider,
		message:
			'Do you love making someone’s day? How about getting paid hourly to deliver that smile? Become a "JoyRider". Pick up a beautifully wrapped gift and bring it to the door on your schedule. Your rate is confirmed when you’re approved.\n\nApply now: ' +
			APPLY.joyrider,
	},
	{
		id: 'hire-joyrider-door',
		slot: 'thu',
		track: 'joyrider',
		image: 'joyrider.jpg',
		link: APPLY.joyrider,
		message:
			'Do you love making someone’s day? How about getting paid hourly to deliver that smile? A "JoyRider" sees a delivery that fits the day, picks up a finished gift, and hands someone a surprise at the door. Your rate is confirmed when you’re approved.\n\nApply now: ' +
			APPLY.joyrider,
	},
	{
		id: 'hire-wraprider-cities',
		slot: 'sat',
		track: 'wraprider',
		image: 'wraprider.jpg',
		link: APPLY.wraprider,
		message:
			'Do you love wrapping gifts? How about getting paid hourly to enjoy what you love — then carry that joy to the door yourself? Become a "WrapRider". Wrap it in your own space and deliver the finished surprise. Your rate is confirmed when you’re approved.\n\nApply now: ' +
			APPLY.wraprider,
	},
	{
		id: 'hire-wraprider-end',
		slot: 'sat',
		track: 'wraprider',
		image: 'wraprider.jpg',
		link: APPLY.wraprider,
		message:
			'Do you love wrapping gifts? How about getting paid hourly to wrap them and deliver them yourself? A "WrapRider" takes a gift from the first fold to the front door and brightens someone’s day. Your rate is confirmed when you’re approved.\n\nApply now: ' +
			APPLY.wraprider,
	},
];

function etParts(now = new Date()) {
	const fmt = new Intl.DateTimeFormat('en-US', {
		timeZone: 'America/New_York',
		weekday: 'short',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	});
	const bag = {};
	for (const part of fmt.formatToParts(now)) {
		if (part.type !== 'literal') bag[part.type] = part.value;
	}
	return {
		weekday: bag.weekday,
		year: Number(bag.year),
		month: Number(bag.month),
		day: Number(bag.day),
		hour: Number(bag.hour),
		minute: Number(bag.minute),
		dateKey: `${bag.year}-${bag.month}-${bag.day}`,
	};
}

function isoWeek(year, month, day) {
	const date = new Date(Date.UTC(year, month - 1, day));
	const weekday = date.getUTCDay() || 7;
	date.setUTCDate(date.getUTCDate() + 4 - weekday);
	const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
	return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

const SLOT_BY_WEEKDAY = { Tue: 'tue', Thu: 'thu', Sat: 'sat' };

function poolFor(et) {
	const slot = SLOT_BY_WEEKDAY[et.weekday];
	if (!slot) return [];
	return POSTS.filter((post) => post.slot === slot);
}

function selectPost(now = new Date()) {
	const et = etParts(now);
	const pool = poolFor(et);
	if (pool.length === 0) return null;
	const week = isoWeek(et.year, et.month, et.day);
	const post = pool[week % pool.length];
	return {
		...post,
		dateKey: et.dateKey,
		slot: post.slot,
		isoWeek: week,
	};
}

function inPostWindow(now = new Date()) {
	const et = etParts(now);
	if (!SLOT_BY_WEEKDAY[et.weekday]) return false;
	const minutes = et.hour * 60 + et.minute;
	return minutes >= 10 * 60 + 15 && minutes < 18 * 60;
}

module.exports = {
	POSTS,
	etParts,
	selectPost,
	inPostWindow,
	SLOT_BY_WEEKDAY,
};
