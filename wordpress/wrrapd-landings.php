<?php
/**
 * Campaign landing pages at /landing1 … /landing5.
 *
 * 1 Holiday rescue (countdown) · 2 Ten-second checkout demo · 3 Now wrapping in Jacksonville
 * 4 Send a wrapped gift to Jacksonville from anywhere · 5 Multi-store gift combo.
 * No WordPress page records; kept out of search while ad tests run.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WRRAPD_LANDINGS_BUILD', '2026-10-18-landings-v2' );

function wrrapd_landing_number() {
	$path = wp_parse_url( isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '', PHP_URL_PATH );
	if ( is_string( $path ) && preg_match( '#^/landing([1-5])/?$#', $path, $m ) ) {
		return (int) $m[1];
	}
	return 0;
}

function wrrapd_landing_extension_url( $n ) {
	$base = function_exists( 'wrrapd_chrome_extension_install_url' )
		? wrrapd_chrome_extension_install_url()
		: 'https://chromewebstore.google.com/detail/wrrapd/lobngnjcjeimefihnobdmocicopikoip';
	$sep = strpos( $base, '?' ) === false ? '?' : '&';
	return $base . $sep . 'utm_source=wrrapd.com&utm_medium=landing&utm_campaign=landing' . (int) $n;
}

function wrrapd_landing_titles() {
	return array(
		1 => 'Holiday gift rescue | Wrrapd',
		2 => 'Gift-wrap in one click at checkout | Wrrapd',
		3 => 'Now wrapping in Jacksonville | Wrrapd',
		4 => 'Send a wrapped gift to Jacksonville from anywhere | Wrrapd',
		5 => 'Three stores, one beautiful gift | Wrrapd',
	);
}

function wrrapd_landing_render() {
	$n = wrrapd_landing_number();
	if ( ! $n ) {
		return;
	}
	if ( ! defined( 'DONOTCACHEPAGE' ) ) {
		define( 'DONOTCACHEPAGE', true );
	}
	global $wp_query;
	if ( $wp_query ) {
		$wp_query->is_404 = false;
	}
	status_header( 200 );
	nocache_headers();

	$titles = wrrapd_landing_titles();
	add_filter(
		'pre_get_document_title',
		function () use ( $titles, $n ) {
			return $titles[ $n ];
		},
		99
	);
	add_filter(
		'wp_robots',
		function ( $robots ) {
			$robots['noindex']  = true;
			$robots['nofollow'] = true;
			return $robots;
		}
	);
	add_filter(
		'body_class',
		function ( $classes ) use ( $n ) {
			$kit       = (int) get_option( 'elementor_active_kit' );
			$classes[] = 'wrrapd-landing-page';
			$classes[] = 'wrrapd-landing-' . $n;
			$classes[] = 'page';
			$classes[] = 'elementor-default';
			$classes[] = 'elementor-template-full-width';
			if ( $kit ) {
				$classes[] = 'elementor-kit-' . $kit;
			}
			return array_unique( $classes );
		}
	);
	if ( function_exists( 'wrrapd_buy_header_match_css' ) ) {
		add_action(
			'wp_head',
			function () {
				ob_start();
				wrrapd_buy_header_match_css();
				echo str_replace( 'wrrapd-buy-page', 'wrrapd-landing-page', ob_get_clean() );
			},
			10000
		);
	}

	$base = content_url( 'mu-plugins/' );
	wp_enqueue_style(
		'wrrapd-landing-font',
		'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,460;0,9..144,560;0,9..144,650;1,9..144,460;1,9..144,560&display=swap',
		array(),
		null
	);
	wp_enqueue_style( 'wrrapd-landings', $base . 'wrrapd-landings.css', array( 'wrrapd-landing-font' ), WRRAPD_LANDINGS_BUILD );
	wp_enqueue_script( 'wrrapd-landings', $base . 'wrrapd-landings.js', array(), WRRAPD_LANDINGS_BUILD, true );
	wp_localize_script(
		'wrrapd-landings',
		'WRRAPD_LANDING',
		array(
			'page'         => $n,
			'api'          => 'https://api.wrrapd.com',
			'extensionUrl' => wrrapd_landing_extension_url( $n ),
			'build'        => WRRAPD_LANDINGS_BUILD,
		)
	);

	get_header();
	echo '<main id="wrrapd-landing" class="wl wl-' . (int) $n . '" data-build="' . esc_attr( WRRAPD_LANDINGS_BUILD ) . '">';
	$fn = 'wrrapd_landing_body_' . $n;
	$fn( wrrapd_landing_extension_url( $n ) );
	echo '</main>';
	get_footer();
	exit;
}
add_action( 'template_redirect', 'wrrapd_landing_render', 1 );

/* ---------- shared pieces ---------- */

function wrrapd_landing_cta( $url, $label, $extra = '' ) {
	return '<a class="wl-btn ' . esc_attr( $extra ) . '" href="' . esc_url( $url ) . '" target="_blank" rel="noopener" data-wl-cta>'
		. wrrapd_landing_chrome_svg() . '<span>' . esc_html( $label ) . '</span></a>';
}

function wrrapd_landing_chrome_svg() {
	return '<svg class="wl-chrome" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#0f0351"/><circle cx="12" cy="12" r="4.4" fill="#f6b933"/><path d="M12 7.6h9.2M8.2 14.2 3.6 6.2M15.8 14.2 11.2 22" stroke="#f6b933" stroke-width="1.6" fill="none"/></svg>';
}

function wrrapd_landing_bow_svg( $cls = 'wl-bow' ) {
	return '<svg class="' . esc_attr( $cls ) . '" viewBox="0 0 64 40" aria-hidden="true"><path d="M32 20C24 4 6 2 6 14s18 10 26 6Z" fill="#f6b933"/><path d="M32 20c8-16 26-18 26-6S40 24 32 20Z" fill="#f6b933"/><path d="M30 20 22 38h6l4-10 4 10h6l-8-18Z" fill="#e3a21a"/><circle cx="32" cy="20" r="5" fill="#d99a14"/></svg>';
}

function wrrapd_landing_gift( $pattern, $size = '' ) {
	return '<div class="wl-gift wl-pat-' . esc_attr( $pattern ) . ' ' . esc_attr( $size ) . '"><span class="wl-ribbon-v"></span><span class="wl-ribbon-h"></span>' . wrrapd_landing_bow_svg() . '</div>';
}

function wrrapd_landing_stores() {
	$stores = array( 'Amazon', 'Target', 'Walmart', "Kohl's", 'Nordstrom', 'Ulta', 'Sephora', 'Best Buy', 'LEGO', 'Etsy' );
	$h      = '<ul class="wl-stores" aria-label="Stores">';
	foreach ( $stores as $s ) {
		$h .= '<li>' . esc_html( $s ) . '</li>';
	}
	return $h . '</ul>';
}

function wrrapd_landing_steps( $steps ) {
	$h = '<ol class="wl-steps">';
	foreach ( $steps as $i => $s ) {
		$h .= '<li><span class="wl-step-n">' . ( $i + 1 ) . '</span><h3>' . esc_html( $s[0] ) . '</h3><p>' . esc_html( $s[1] ) . '</p></li>';
	}
	return $h . '</ol>';
}

function wrrapd_landing_sticky( $url, $label ) {
	return '<div class="wl-sticky">' . wrrapd_landing_cta( $url, $label, 'wl-btn-block' ) . '</div>';
}

function wrrapd_landing_final( $url, $title, $sub, $label ) {
	return '<section class="wl-final"><div class="wl-inner">' . wrrapd_landing_gift( 'stripe', 'wl-gift-sm' )
		. '<h2>' . esc_html( $title ) . '</h2><p>' . esc_html( $sub ) . '</p>' . wrrapd_landing_cta( $url, $label ) . '<p class="wl-fine">Free Chrome extension · Patent pending · <a href="https://wrrapd.com/privacy/">Privacy &amp; data</a></p></div></section>';
}

function wrrapd_landing_zip_checker( $id, $label ) {
	return '<form class="wl-zip" data-wl-zip novalidate>'
		. '<label for="' . esc_attr( $id ) . '">' . esc_html( $label ) . '</label>'
		. '<div class="wl-zip-row"><input id="' . esc_attr( $id ) . '" inputmode="numeric" maxlength="5" autocomplete="postal-code" placeholder="ZIP code"><button type="submit" class="wl-btn wl-btn-sm">Check</button></div>'
		. '<div class="wl-zip-out" aria-live="polite"></div></form>';
}

/* ---------- 1. Holiday rescue ---------- */

function wrrapd_landing_body_1( $ext ) {
	echo '<section class="wl-hero wl-hero-navy"><div class="wl-inner wl-hero-grid">';
	echo '<div><p class="wl-eyebrow">Holiday gift rescue</p>';
	echo '<h1 data-wl-rescue-title>It\'s the 22nd and nothing is wrapped?</h1>';
	echo '<p class="wl-lead">Relax. Shop your favorite store, choose Wrrapd at checkout, and we gift-wrap every present and deliver it to their door.</p>';
	echo wrrapd_landing_cta( $ext, 'Rescue my gifts — add to Chrome, free' );
	echo '</div>';
	echo '<div class="wl-count-card" data-wl-countdown><p class="wl-count-label">Order by <b data-wl-cd-date>—</b> for <b data-wl-cd-name>the holidays</b></p>';
	echo '<div class="wl-count"><div><b data-wl-cd="d">00</b><span>days</span></div><div><b data-wl-cd="h">00</b><span>hours</span></div><div><b data-wl-cd="m">00</b><span>min</span></div><div><b data-wl-cd="s">00</b><span>sec</span></div></div>';
	echo '<p class="wl-fine">Suggested order-by date. Delivery depends on each store\'s shipping.</p></div>';
	echo '</div></section>';

	echo '<section class="wl-band"><div class="wl-inner"><h2>Every gift-giving day this season</h2><div class="wl-milestones" data-wl-milestones></div></div></section>';

	echo '<section class="wl-section"><div class="wl-inner"><h2>Wrapped in three easy steps</h2>';
	echo wrrapd_landing_steps(
		array(
			array( 'Shop like always', 'Add gifts to your cart at the stores you already love.' ),
			array( 'Choose Wrrapd at checkout', 'Pick a wrapping design, add fresh flowers and a gift message.' ),
			array( 'We wrap and deliver', 'Your gifts arrive beautifully wrapped, together, at their door.' ),
		)
	);
	echo '</div></section>';

	echo '<section class="wl-section wl-cream"><div class="wl-inner wl-split"><div class="wl-gift-pile">'
		. wrrapd_landing_gift( 'plaid' ) . wrrapd_landing_gift( 'dots', 'wl-gift-sm' ) . wrrapd_landing_gift( 'stripe', 'wl-gift-md' )
		. '</div><div><h2>Gorgeous under the tree</h2><p class="wl-lead-dark">Hand-wrapped by local WrapStars with designer paper, satin ribbon and a gold bow. Add a bouquet and it becomes the moment they remember.</p>'
		. wrrapd_landing_stores() . '</div></div></section>';

	echo wrrapd_landing_final( $ext, 'Get every gift wrapped this year', 'Install once. Gift-wrap at checkout all season long.', 'Add to Chrome, free' );
	echo wrrapd_landing_sticky( $ext, 'Rescue my gifts' );
}

/* ---------- 2. Ten-second checkout demo ---------- */

function wrrapd_landing_body_2( $ext ) {
	echo '<section class="wl-hero wl-hero-cream"><div class="wl-inner wl-hero-grid wl-hero-demo">';
	echo '<div><p class="wl-eyebrow wl-eyebrow-dark">The 10-second checkout</p>';
	echo '<h1>Gift-wrap in one click, right at checkout.</h1>';
	echo '<p class="wl-lead-dark">Shop at your favorite store. Wrrapd appears at checkout. Pick a design, add flowers, and your gift arrives beautifully wrapped.</p>';
	echo wrrapd_landing_cta( $ext, 'Add to Chrome, free', 'wl-btn-xl' );
	echo '<p class="wl-fine wl-fine-dark">Works at Amazon, Target, Walmart, Kohl\'s, Nordstrom, Ulta, Sephora, Best Buy, LEGO and Etsy.</p></div>';

	echo '<div class="wl-demo" data-wl-demo aria-label="Wrrapd at checkout, animated demo">';
	echo '<div class="wl-browser"><div class="wl-browser-bar"><i></i><i></i><i></i><span class="wl-url" data-wl-demo-url>www.target.com/checkout</span></div>';
	echo '<div class="wl-browser-body">';
	echo '<div class="wl-cart"><p class="wl-cart-store" data-wl-demo-store>Target</p>';
	echo '<div class="wl-cart-item"><img src="https://target.scene7.com/is/image/Target/GUEST_2c7410d9-3a5a-41d2-a0fe-f53eeabd2726?wid=300&hei=300&qlt=80" alt="" data-wl-demo-img><div><p class="wl-cart-title" data-wl-demo-title>LEGO Icons Bumblebee Set</p><p class="wl-cart-meta">Qty 1 · Arrives Tue</p></div></div>';
	echo '<div class="wl-cart-line"><span>Order total</span><span class="wl-skel"></span></div>';
	echo '<button type="button" class="wl-place" tabindex="-1" data-wl-demo-place>Place your order</button></div>';
	echo '<div class="wl-panel" data-wl-demo-panel><div class="wl-panel-head">' . wrrapd_landing_bow_svg( 'wl-bow-xs' ) . '<b>Wrrapd</b></div>';
	echo '<p class="wl-panel-q">Gift-wrap this order?</p><div class="wl-toggle" data-wl-demo-toggle><span></span></div>';
	echo '<p class="wl-panel-sub">Choose a design</p><div class="wl-swatches"><i class="wl-pat-plaid" data-wl-sw></i><i class="wl-pat-dots" data-wl-sw></i><i class="wl-pat-stripe" data-wl-sw></i><i class="wl-pat-star" data-wl-sw></i></div>';
	echo '<label class="wl-panel-check" data-wl-demo-flowers><span class="wl-box"></span>Add fresh flowers</label></div>';
	echo '<div class="wl-done" data-wl-demo-done>' . wrrapd_landing_gift( 'plaid', 'wl-gift-sm' ) . '<p>Wrapped and on its way!</p></div>';
	echo '<span class="wl-cursor" data-wl-demo-cursor></span>';
	echo '</div></div>';
	echo '<ol class="wl-demo-steps" data-wl-demo-steps><li>Shop</li><li>Wrrapd appears</li><li>Pick a design</li><li>Add flowers</li><li>Done</li></ol>';
	echo '<div class="wl-demo-progress"><span data-wl-demo-bar></span></div>';
	echo '</div></div></section>';

	echo '<section class="wl-statement"><div class="wl-inner"><p>Your store. Your cart. <em>Our wrapping.</em></p></div></section>';

	echo '<section class="wl-section"><div class="wl-inner"><h2>One click does it all</h2><div class="wl-features">';
	$f = array(
		array( 'Designer paper', 'Choose from seasonal and classic wrapping designs.' ),
		array( 'Fresh flowers', 'Add a bouquet that arrives with the gift.' ),
		array( 'Gift message', 'Write a note we tuck under the bow.' ),
		array( 'Delivered together', 'Gifts from several stores arrive as one surprise.' ),
	);
	foreach ( $f as $x ) {
		echo '<div class="wl-feature">' . wrrapd_landing_bow_svg( 'wl-bow-xs' ) . '<h3>' . esc_html( $x[0] ) . '</h3><p>' . esc_html( $x[1] ) . '</p></div>';
	}
	echo '</div></div></section>';

	echo wrrapd_landing_final( $ext, 'Try it on your next order', 'Takes seconds to install. Shows up right when you check out.', 'Add to Chrome, free' );
	echo wrrapd_landing_sticky( $ext, 'Add to Chrome, free' );
}

/* ---------- 3. Now wrapping in Jacksonville ---------- */

function wrrapd_landing_body_3( $ext ) {
	echo '<section class="wl-hero wl-hero-navy wl-hero-jax"><div class="wl-inner wl-hero-grid">';
	echo '<div><p class="wl-eyebrow">Our first city</p><h1>Now wrapping in Jacksonville.</h1>';
	echo '<p class="wl-lead">Beautiful gift-wrapping, hand-delivered by your neighbors. From Riverside to the Beaches, every gift arrives ready to open.</p>';
	echo wrrapd_landing_cta( $ext, 'Add to Chrome, free' ) . '</div>';
	echo '<div class="wl-card">' . wrrapd_landing_zip_checker( 'wl-zip-3', 'Where is your gift going?' ) . '</div>';
	echo '</div></section>';

	echo '<section class="wl-ribbon" aria-label="Neighborhoods"><div class="wl-ribbon-track" data-wl-hoods></div></section>';

	echo '<section class="wl-section"><div class="wl-inner"><h2>Made right here in Jacksonville</h2><div class="wl-roles">';
	echo '<div class="wl-role">' . wrrapd_landing_gift( 'plaid', 'wl-gift-sm' ) . '<h3>Wrapped by local WrapStars</h3><p>Every gift is hand-wrapped with designer paper, satin ribbon and a gold bow.</p></div>';
	echo '<div class="wl-role"><svg class="wl-role-ic" viewBox="0 0 64 40" aria-hidden="true"><rect x="2" y="10" width="36" height="20" rx="3" fill="#f6b933"/><path d="M38 16h12l10 8v6H38Z" fill="#e3a21a"/><circle cx="14" cy="32" r="5" fill="#0f0351"/><circle cx="50" cy="32" r="5" fill="#0f0351"/></svg><h3>Delivered by local JoyRiders</h3><p>A friendly neighbor brings it to the door, ready for the big moment.</p></div>';
	echo '<div class="wl-role"><svg class="wl-role-ic" viewBox="0 0 64 40" aria-hidden="true"><path d="M32 4c-9 0-16 7-16 15 0 11 16 19 16 19s16-8 16-19c0-8-7-15-16-15Z" fill="#c8102e"/><circle cx="32" cy="19" r="6" fill="#fff"/></svg><h3>Proudly local</h3><p>Every Wrrapd gift in town is wrapped and delivered by Jacksonville neighbors.</p></div>';
	echo '</div></div></section>';

	echo '<section class="wl-section wl-cream"><div class="wl-inner"><h2>Where should we wrap next?</h2><p class="wl-lead-dark">Tap your city and we will email you the day Wrrapd arrives.</p>';
	echo '<div class="wl-cities" data-wl-cities>';
	foreach ( array( 'St. Augustine', 'Orlando', 'Tampa', 'Gainesville', 'Tallahassee', 'Miami', 'Savannah', 'Atlanta' ) as $c ) {
		echo '<button type="button" class="wl-city" data-city="' . esc_attr( $c ) . '">' . esc_html( $c ) . '</button>';
	}
	echo '</div>';
	echo wrrapd_landing_waitlist_form( 3 );
	echo '</div></section>';

	echo wrrapd_landing_final( $ext, 'Gift-wrapping, Jacksonville style', 'Install once and choose Wrrapd at checkout.', 'Add to Chrome, free' );
	echo wrrapd_landing_sticky( $ext, 'Add to Chrome, free' );
}

function wrrapd_landing_waitlist_form( $n ) {
	return '<form class="wl-wait" data-wl-wait data-page="landing' . (int) $n . '" novalidate>'
		. '<div class="wl-wait-row"><input type="email" name="email" autocomplete="email" placeholder="you@example.com" aria-label="Your email" required>'
		. '<input type="text" name="city" placeholder="Your city" aria-label="Your city" maxlength="60">'
		. '<button type="submit" class="wl-btn wl-btn-sm">Notify me</button></div>'
		. '<p class="wl-wait-out" aria-live="polite"></p></form>';
}

/* ---------- 4. From anywhere to Jacksonville ---------- */

function wrrapd_landing_body_4( $ext ) {
	echo '<section class="wl-hero wl-hero-navy"><div class="wl-inner wl-hero-grid">';
	echo '<div><p class="wl-eyebrow">For the people you miss</p><h1>Miles away? Your gift arrives wrapped with a bow.</h1>';
	echo '<p class="wl-lead">Shop from anywhere in the country. We gift-wrap it in Jacksonville and hand-deliver it to someone you love.</p>';
	echo wrrapd_landing_cta( $ext, 'Send a wrapped gift' ) . '</div>';
	echo '<div class="wl-journey"><div class="wl-journey-stop"><span class="wl-dot"></span><b>You shop</b><small>wherever you are</small></div><div class="wl-journey-line"><span></span></div><div class="wl-journey-stop"><span class="wl-dot"></span><b>We wrap</b><small>in Jacksonville</small></div><div class="wl-journey-line"><span></span></div><div class="wl-journey-stop wl-journey-end">' . wrrapd_landing_gift( 'dots', 'wl-gift-xs' ) . '<b>They open</b><small>at their door</small></div></div>';
	echo '</div></section>';

	echo '<section class="wl-section"><div class="wl-inner wl-split"><div><h2>Make it personal</h2><p class="wl-lead-dark">Pick the occasion and write a note. We tuck it under the bow.</p>';
	echo '<div class="wl-occasions" data-wl-occasions>';
	foreach ( array( 'Birthday', 'Get well', 'New baby', 'Anniversary', 'Thinking of you', 'Holidays' ) as $i => $o ) {
		echo '<button type="button" class="wl-occ' . ( 0 === $i ? ' wl-on' : '' ) . '" data-occ="' . esc_attr( $o ) . '">' . esc_html( $o ) . '</button>';
	}
	echo '</div><label class="wl-note-label" for="wl-note">Your gift message</label><textarea id="wl-note" maxlength="140" data-wl-note>Happy birthday, Mom! Wish I could be there to hug you. Love, Sam</textarea></div>';
	echo '<div class="wl-tag-wrap">' . wrrapd_landing_gift( 'plaid' ) . '<div class="wl-tag"><span class="wl-tag-hole"></span><p class="wl-tag-occ" data-wl-tag-occ>Birthday</p><p class="wl-tag-msg" data-wl-tag-msg></p></div></div>';
	echo '</div></section>';

	echo '<section class="wl-section wl-cream"><div class="wl-inner wl-split"><div class="wl-flower-card"><svg viewBox="0 0 120 120" aria-hidden="true"><g fill="#c8102e"><circle cx="40" cy="38" r="14"/><circle cx="64" cy="30" r="14"/><circle cx="84" cy="44" r="13"/></g><g fill="#f6b933"><circle cx="54" cy="52" r="12"/><circle cx="76" cy="62" r="11"/></g><g fill="#f4a3b4"><circle cx="34" cy="60" r="11"/></g><path d="M60 64 50 112h20Z" fill="#2f7d4a"/><path d="M44 96h32l-6 16H50Z" fill="#0f0351"/></svg></div>';
	echo '<div><h2>Add fresh flowers</h2><p class="wl-lead-dark">A local bouquet arrives with the gift. It turns a package into a celebration.</p></div></div></section>';

	echo '<section class="wl-section"><div class="wl-inner wl-narrow"><h2>Is your gift going to Jacksonville?</h2>' . wrrapd_landing_zip_checker( 'wl-zip-4', 'Their ZIP code' ) . '</div></section>';

	echo wrrapd_landing_final( $ext, 'Close the distance this year', 'Shop from anywhere. We wrap and deliver it in Jacksonville.', 'Send a wrapped gift' );
	echo wrrapd_landing_sticky( $ext, 'Send a wrapped gift' );
}

/* ---------- 5. Gift combo ---------- */

function wrrapd_landing_body_5( $ext ) {
	echo '<section class="wl-hero wl-hero-cream"><div class="wl-inner wl-hero-grid">';
	echo '<div><p class="wl-eyebrow wl-eyebrow-dark">The gift combo</p><h1>Three stores. One beautiful gift.</h1>';
	echo '<p class="wl-lead-dark">Combine gifts from your favorite stores. We wrap them together and deliver them as one unforgettable surprise.</p>';
	echo wrrapd_landing_cta( $ext, 'Build my gift combo', 'wl-btn-xl' ) . '</div>';
	echo '<div class="wl-combo" data-wl-combo>';
	$items = array(
		array( 'Target', 'https://target.scene7.com/is/image/Target/GUEST_5603dbdd-4869-40aa-8828-0ed08ab7c58d?wid=300&hei=300&qlt=80' ),
		array( 'Etsy', 'https://i.etsystatic.com/12200091/r/il/e19d8e/5475173991/il_794xN.5475173991_dadd.jpg' ),
		array( 'Books-A-Million', 'https://covers.openlibrary.org/b/isbn/9780694003617-M.jpg' ),
	);
	foreach ( $items as $i => $it ) {
		echo '<figure class="wl-combo-item wl-ci-' . ( $i + 1 ) . '"><img src="' . esc_url( $it[1] ) . '" alt="" loading="eager"><figcaption>' . esc_html( $it[0] ) . '</figcaption></figure>';
	}
	echo '<div class="wl-combo-box">' . wrrapd_landing_gift( 'star' ) . '</div></div>';
	echo '</div></section>';

	echo '<section class="wl-section"><div class="wl-inner"><h2>Ready-made combos</h2><div class="wl-combos">';
	$combos = array(
		array( 'Cozy Night In', 'A plush throw, a scented candle and holiday coffee.', array( 'Target', 'Etsy', "Peet's" ), 'plaid' ),
		array( 'Little Builder', 'A LEGO set and a favorite picture book.', array( 'LEGO', 'Books-A-Million' ), 'dots' ),
		array( 'Glow Up', 'Skincare and beauty favorites, wrapped as one.', array( 'Ulta', 'Sephora' ), 'stripe' ),
	);
	foreach ( $combos as $c ) {
		echo '<article class="wl-combo-card">' . wrrapd_landing_gift( $c[3], 'wl-gift-sm' ) . '<h3>' . esc_html( $c[0] ) . '</h3><p>' . esc_html( $c[1] ) . '</p><ul class="wl-chips">';
		foreach ( $c[2] as $s ) {
			echo '<li>' . esc_html( $s ) . '</li>';
		}
		echo '</ul></article>';
	}
	echo '</div></div></section>';

	echo '<section class="wl-section wl-cream"><div class="wl-inner"><h2>How a combo comes together</h2>';
	echo wrrapd_landing_steps(
		array(
			array( 'Shop each store', 'Add the pieces to your cart at each store you love.' ),
			array( 'Choose Wrrapd each time', 'Send every order to the same giftee and pick one design.' ),
			array( 'We wrap them together', 'Everything arrives as one gift, with flowers if you like.' ),
		)
	);
	echo '<p class="wl-center"><a class="wl-link" href="https://wrrapd.com/top-gifting-choices/">Browse top gifting choices</a></p></div></section>';

	echo '<section class="wl-section"><div class="wl-inner"><h2>Pick your paper</h2><div class="wl-papers" data-wl-papers>';
	foreach ( array( 'plaid' => 'Holiday Plaid', 'dots' => 'Golden Dots', 'stripe' => 'Candy Stripe', 'star' => 'Starry Night' ) as $k => $label ) {
		echo '<button type="button" class="wl-paper" data-pat="' . esc_attr( $k ) . '"><i class="wl-pat-' . esc_attr( $k ) . '"></i><span>' . esc_html( $label ) . '</span></button>';
	}
	echo '</div></div></section>';

	echo wrrapd_landing_final( $ext, 'Build a gift they will never forget', 'Free to install. Combine stores at checkout.', 'Build my gift combo' );
	echo wrrapd_landing_sticky( $ext, 'Build my gift combo' );
}
