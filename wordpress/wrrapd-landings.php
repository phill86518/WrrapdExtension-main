<?php
/**
 * Campaign landing pages at /landing1 … /landing5 (still private).
 *
 * Homepage (2026-10-19+): the Elementor front page plus landing6 overlays (occasion strip,
 * How it works, paste & wrap → /buy/, gift-ideas blurb). Store gift guides live at /gift-ideas/.
 * /landing6/ redirects to /. Pre-refresh homepage (no overlays): /landing-retired-20261019/
 * (editors / preview key only).
 *
 * Landings 1–5: no WordPress page records. Private via editors or ?lp=<key>
 * (option wrrapd_landing_preview_key). Everyone else gets the normal 404.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WRRAPD_LANDINGS_BUILD', '2026-10-19-landings-v21' );
define( 'WRRAPD_LANDING_COOKIE', 'wrrapd_lp' );
define( 'WRRAPD_LANDING_RETIRED_SLUG', 'landing-retired-20261019' );

function wrrapd_landing_number() {
	$path = wp_parse_url( isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '', PHP_URL_PATH );
	if ( is_string( $path ) && preg_match( '#^/landing([1-5])/?$#', $path, $m ) ) {
		return (int) $m[1];
	}
	return 0;
}

function wrrapd_landing_is_retired_request() {
	$path = wp_parse_url( isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '', PHP_URL_PATH );
	return is_string( $path ) && (bool) preg_match( '#^/' . preg_quote( WRRAPD_LANDING_RETIRED_SLUG, '#' ) . '/?$#', $path );
}

function wrrapd_landing_is_landing6_alias() {
	$path = wp_parse_url( isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '', PHP_URL_PATH );
	return is_string( $path ) && (bool) preg_match( '#^/landing6/?$#', $path );
}

function wrrapd_landing_preview_token() {
	$key = (string) get_option( 'wrrapd_landing_preview_key', '' );
	return strlen( $key ) >= 16 ? hash_hmac( 'sha256', $key, wp_salt( 'auth' ) ) : '';
}

function wrrapd_landing_query_key_ok() {
	$key = (string) get_option( 'wrrapd_landing_preview_key', '' );
	// Links pasted from chat or email often pick up a trailing backtick, quote or period.
	$got = isset( $_GET['lp'] ) ? preg_replace( '/[^A-Za-z0-9_-]/', '', (string) wp_unslash( $_GET['lp'] ) ) : '';
	return strlen( $key ) >= 16 && strlen( $got ) >= strlen( $key ) && hash_equals( $key, substr( $got, 0, strlen( $key ) ) );
}

function wrrapd_landing_allowed() {
	if ( is_user_logged_in() && current_user_can( 'edit_pages' ) ) {
		return true;
	}
	if ( wrrapd_landing_query_key_ok() ) {
		return true;
	}
	$token  = wrrapd_landing_preview_token();
	$cookie = isset( $_COOKIE[ WRRAPD_LANDING_COOKIE ] ) ? (string) wp_unslash( $_COOKIE[ WRRAPD_LANDING_COOKIE ] ) : '';
	return '' !== $token && '' !== $cookie && hash_equals( $token, $cookie );
}

/* Retired archive + (legacy) /landing6 alias both resolve to the Elementor front page. */
add_filter(
	'request',
	function ( $vars ) {
		$front = (int) get_option( 'page_on_front' );
		if ( ! $front ) {
			return $vars;
		}
		if ( wrrapd_landing_is_retired_request() && wrrapd_landing_allowed() ) {
			return array( 'page_id' => $front );
		}
		return $vars;
	},
	1
);
add_filter(
	'redirect_canonical',
	function ( $url ) {
		if ( wrrapd_landing_number() || wrrapd_landing_is_retired_request() || wrrapd_landing_is_landing6_alias() ) {
			return false;
		}
		return $url;
	}
);

/* Public homepage = landing6 experience. /landing6/ → /. Retired path stays gated. */
add_action(
	'template_redirect',
	function () {
		if ( wrrapd_landing_is_landing6_alias() ) {
			wp_safe_redirect( home_url( '/' ), 301 );
			exit;
		}
		if ( wrrapd_landing_is_retired_request() ) {
			if ( ! defined( 'DONOTCACHEPAGE' ) ) {
				define( 'DONOTCACHEPAGE', true );
			}
			nocache_headers();
			header( 'X-Robots-Tag: noindex, nofollow', true );
			if ( ! wrrapd_landing_allowed() ) {
				global $wp_query;
				if ( $wp_query ) {
					$wp_query->set_404();
				}
				status_header( 404 );
				return;
			}
			if ( wrrapd_landing_query_key_ok() ) {
				setcookie( WRRAPD_LANDING_COOKIE, wrrapd_landing_preview_token(), time() + 90 * DAY_IN_SECONDS, '/', '', is_ssl(), true );
				wp_safe_redirect( home_url( '/' . WRRAPD_LANDING_RETIRED_SLUG . '/' ), 302 );
				exit;
			}
			add_filter(
				'pre_get_document_title',
				function () {
					return 'Landing page retired 20261019 | Wrrapd';
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
				function ( $classes ) {
					$classes[] = 'wrrapd-landing-retired';
					return $classes;
				}
			);
			return;
		}
		if ( is_front_page() && ! is_admin() && ! wrrapd_landing_is_retired_request() ) {
			wrrapd_landing_6_setup();
		}
	},
	0
);

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
	nocache_headers();
	header( 'X-Robots-Tag: noindex, nofollow', true );
	if ( ! wrrapd_landing_allowed() ) {
		return;
	}
	if ( wrrapd_landing_query_key_ok() ) {
		setcookie( WRRAPD_LANDING_COOKIE, wrrapd_landing_preview_token(), time() + 90 * DAY_IN_SECONDS, '/', '', is_ssl(), true );
		wp_safe_redirect( home_url( '/landing' . $n . '/' ), 302 );
		exit;
	}

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

	global $wp_query;
	if ( $wp_query ) {
		$wp_query->is_404 = false;
	}
	status_header( 200 );
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

	wrrapd_landing_enqueue( $n );

	get_header();
	echo '<main id="wrrapd-landing" class="wl wl-' . (int) $n . '" data-build="' . esc_attr( WRRAPD_LANDINGS_BUILD ) . '">';
	$fn = 'wrrapd_landing_body_' . $n;
	$fn( wrrapd_landing_extension_url( $n ) );
	echo '</main>';
	get_footer();
	exit;
}
add_action( 'template_redirect', 'wrrapd_landing_render', 1 );

function wrrapd_landing_enqueue( $n ) {
	add_action(
		'wp_enqueue_scripts',
		function () use ( $n ) {
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
		},
		20
	);
}

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
	return '<div class="wl-zip" data-wl-zip><form novalidate>'
		. '<label for="' . esc_attr( $id ) . '">' . esc_html( $label ) . '</label>'
		. '<div class="wl-zip-row"><input id="' . esc_attr( $id ) . '" inputmode="numeric" maxlength="5" autocomplete="postal-code" placeholder="ZIP code"><button type="submit" class="wl-btn wl-btn-sm">Check</button></div>'
		. '</form><div class="wl-zip-out" aria-live="polite"></div></div>';
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
		array( 'Amazon', 'https://covers.openlibrary.org/b/isbn/9780694003617-M.jpg' ),
	);
	foreach ( $items as $i => $it ) {
		echo '<figure class="wl-combo-item wl-ci-' . ( $i + 1 ) . '"><img src="' . esc_url( $it[1] ) . '" alt="" loading="eager"><figcaption>' . esc_html( $it[0] ) . '</figcaption></figure>';
	}
	echo '<div class="wl-combo-box">' . wrrapd_landing_gift( 'star' ) . '</div></div>';
	echo '</div></section>';

	echo '<section class="wl-section"><div class="wl-inner"><h2>Ready-made combos</h2><div class="wl-combos">';
	$combos = array(
		array( 'Cozy Night In', 'A plush throw, a scented candle and holiday coffee.', array( 'Target', 'Etsy', 'Amazon' ), 'plaid' ),
		array( 'Little Builder', 'A LEGO set and a favorite picture book.', array( 'LEGO', 'Amazon' ), 'dots' ),
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

/* ---------- 6. Homepage refresh ---------- */

function wrrapd_landing_6_setup() {
	static $done = false;
	if ( $done ) {
		return;
	}
	$done = true;
	add_filter(
		'body_class',
		function ( $classes ) {
			$classes[] = 'wrrapd-landing-6';
			return $classes;
		}
	);
	wrrapd_landing_enqueue( 6 );
	add_action( 'wp_footer', 'wrrapd_landing_6_parts', 5 );
}

function wrrapd_landing_orange( $url, $label, $blank = true ) {
	return '<a class="wl-orange" href="' . esc_url( $url ) . '"' . ( $blank ? ' target="_blank" rel="noopener"' : '' ) . ' data-wl-cta>' . esc_html( $label ) . '</a>';
}

function wrrapd_landing_head( $eyebrow, $title, $lede = '' ) {
	return '<header class="wl-head"><p class="wl-head-eyebrow">' . esc_html( $eyebrow ) . '</p><h2 class="wl-head-title">' . esc_html( $title ) . '</h2>'
		. ( $lede ? '<p class="wl-head-lede">' . esc_html( $lede ) . '</p>' : '' ) . '</header>';
}

/**
 * Homepage parts: header note stays in <template> (JS mounts above the existing CTA).
 * Body sections print as live HTML so the new face shows even if JS is delayed/blocked;
 * JS only repositions them.
 */
function wrrapd_landing_6_parts() {
	$ext  = wrrapd_landing_extension_url( 6 );
	$buy  = home_url( '/buy/' );
	$icon = content_url( 'mu-plugins/icons/favicon/android-chrome-512x512.png' );
	echo '<template id="wl6-parts">';
	echo '<div class="wl6-ways" data-wl6="ways"><span class="wl6-ways-opt1">① Orange button below</span><span class="wl6-ways-sep"> · </span><span class="wl6-ways-opt2">② <a href="#paste-and-wrap">copy-paste your product link</a></span></div>';
	echo '<section class="wl wl-ways-bar" data-wl6="waysbar" aria-label="Two ways to gift-wrap"><p>Two ways to gift-wrap</p><div>'
		. wrrapd_landing_orange( $ext, 'Chrome extension' )
		. '<a class="wl-ghost" href="#paste-and-wrap">Copy-paste your product link</a></div></section>';
	echo '</template>';

	echo '<div id="wl6-body">';
	echo '<section class="wl wl-strip" data-wl6="strip" aria-label="Upcoming gifting days"><div class="wl-strip-inner"><p class="wl-strip-title">Upcoming gifting days</p><div class="wl-strip-row" data-wl-strip></div></div></section>';

	echo '<section class="wl wl-hiw" data-wl6="hiw" id="how-it-works"><div class="wl-inner">';
	echo wrrapd_landing_head( 'How it works', 'Your store. Your cart. Our wrapping.', 'Add the free Wrrapd Chrome extension and gift-wrap right at checkout.' );
	echo '<div class="wl-hiw-grid"><div class="wl-hiw-left">';
	$steps = array(
		array( 'Add Wrrapd to Chrome', 'One click, free. Wrrapd shows up at Amazon, Target, Walmart, Nordstrom, Kohl\'s, Ulta, Sephora, Best Buy, LEGO and Etsy.' ),
		array( 'Shop as usual', 'Fill your cart like always. At checkout, Wrrapd asks if you would like it gift-wrapped.' ),
		array( 'Make it personal', 'Pick a paper, upload your own art or design one with AI. Add a note we tuck under the bow, and fresh flowers.' ),
		array( 'Ship it to the Wrrapd hub', 'Follow Wrrapd\'s prompt on the store\'s shipping page and send the order to our hub.' ),
		array( 'Pay Wrrapd, then check out', 'Pay for the wrapping and add-ons, then place your store order as usual. Final delivery is free.' ),
		array( 'We wrap and deliver', 'Often the same day. You get a photo the moment it arrives.' ),
	);
	echo '<ol class="wl-hiw-steps" data-wl-hiw-steps>';
	foreach ( $steps as $i => $s ) {
		echo '<li' . ( 0 === $i ? ' class="wl-on"' : '' ) . '><button type="button" data-step="' . (int) $i . '"><span class="wl-step-n">' . ( $i + 1 ) . '</span><span class="wl-hiw-copy"><b>' . esc_html( $s[0] ) . '</b><span>' . esc_html( $s[1] ) . '</span></span></button></li>';
	}
	echo '</ol>';
	echo '<div class="wl-hiw-cta">' . wrrapd_landing_orange( $ext, 'Add your FREE Chrome extension today' ) . '</div>';
	echo '</div>';

	echo '<div class="wl-demo wl-hiw-demo" data-wl-hiw aria-label="Animated demo of Wrrapd at checkout">';
	echo '<div class="wl-browser"><div class="wl-browser-bar"><i></i><i></i><i></i><span class="wl-url" data-wl-h-url>chromewebstore.google.com</span></div>';
	echo '<div class="wl-browser-body">';

	echo '<div class="wl-sc wl-sc-install"><div class="wl-cws"><img src="' . esc_url( $icon ) . '" alt="" width="72" height="72"><div class="wl-cws-meta"><b>Wrrapd</b><small>Gift-wrap at checkout</small><small class="wl-cws-free">Free</small></div></div>';
	echo '<button type="button" class="wl-cws-btn" tabindex="-1" data-wl-h-add><span class="wl-cws-a">Add to Chrome</span><span class="wl-cws-b">Added to Chrome</span></button></div>';

	echo '<div class="wl-sc wl-sc-cart"><div class="wl-cart"><p class="wl-cart-store" data-wl-h-store>Target</p>';
	echo '<div class="wl-cart-item"><img src="https://target.scene7.com/is/image/Target/GUEST_2c7410d9-3a5a-41d2-a0fe-f53eeabd2726?wid=300&hei=300&qlt=80" alt="" data-wl-h-img><div><p class="wl-cart-title" data-wl-h-title>LEGO Icons Bumblebee Set</p><p class="wl-cart-meta">Qty 1 · Arrives Tue</p></div></div>';
	echo '<div class="wl-cart-line"><span>Order total</span><span class="wl-skel"></span></div>';
	echo '<button type="button" class="wl-place" tabindex="-1" data-wl-h-place>Place your order</button></div>';
	echo '<div class="wl-panel" data-wl-h-panel><div class="wl-panel-head">' . wrrapd_landing_bow_svg( 'wl-bow-xs' ) . '<b>Wrrapd</b></div>';
	echo '<div class="wl-panel-pick"><p class="wl-panel-q">Gift-wrap this order?</p><div class="wl-toggle" data-wl-h-toggle><span></span></div>';
	echo '<p class="wl-panel-sub">Choose a design</p><div class="wl-swatches"><i class="wl-pat-plaid" data-wl-h-sw></i><i class="wl-pat-dots" data-wl-h-sw></i><i class="wl-pat-stripe" data-wl-h-sw></i><i class="wl-pat-star" data-wl-h-sw></i></div>';
	echo '<label class="wl-panel-check" data-wl-h-flowers><span class="wl-box"></span>Add fresh flowers</label></div>';
	echo '<div class="wl-panel-sum"><p class="wl-panel-q">Wrrapd Summary</p><ul class="wl-sum"><li><span>Gift-wrap</span><b>Holiday Plaid</b></li><li><span>Flowers</span><b>Added</b></li><li><span>Delivery</span><b>Free</b></li></ul>';
	echo '<button type="button" class="wl-pay" tabindex="-1" data-wl-h-pay><span class="wl-pay-a">Pay Wrrapd</span><span class="wl-pay-b">Paid</span></button></div></div></div>';

	echo '<div class="wl-sc wl-sc-ship"><p class="wl-ship-h">Choose a shipping address</p>';
	echo '<div class="wl-addr"><span class="wl-radio"></span><div><b>Jamie Rivera</b><small>Home address</small></div></div>';
	echo '<div class="wl-addr wl-addr-hub" data-wl-h-hub><span class="wl-radio"></span><div><b>Wrrapd hub</b><small>We wrap it, then deliver it to Jamie</small></div>' . wrrapd_landing_bow_svg( 'wl-bow-xs' ) . '</div>';
	echo '<button type="button" class="wl-place" tabindex="-1">Use this address</button></div>';

	echo '<div class="wl-sc wl-sc-done">' . wrrapd_landing_gift( 'plaid', 'wl-gift-sm' ) . '<p>Wrapped and delivered!</p><div class="wl-proof"><span class="wl-proof-pic">' . wrrapd_landing_gift( 'plaid', 'wl-gift-xs' ) . '</span><span>Delivery photo sent to you</span></div></div>';

	echo '<span class="wl-cursor" data-wl-h-cursor></span>';
	echo '<span class="wl-play" data-wl-h-play><span class="wl-play-ic"></span><span class="wl-play-hover">Hover to watch</span><span class="wl-play-tap">Tap to watch</span></span>';
	echo '</div></div>';
	echo '<div class="wl-demo-progress"><span data-wl-h-bar></span></div>';
	echo '</div>';
	echo '</div></div></section>';

	echo '<section class="wl wl-paste" data-wl6="paste" id="paste-and-wrap"><div class="wl-inner">';
	echo wrrapd_landing_head( 'Try without the Extension (simpler)', 'Copy, paste, beautifully wrapped.', 'Miles away from the people you miss? Copy a gift\'s link from one of our partner stores and paste it here. We purchase it, wrap it by hand and deliver it to their door, finished with a bow.' );
	echo '<div class="wl-paste-grid"><div class="wl-paste-left">';
	echo '<form class="wl-paste-form" data-wl-paste action="' . esc_url( $buy ) . '" method="get" novalidate>';
	echo '<label class="wl-paste-zip" for="wl-paste-zip"><span>Giftee / gift-recipient\'s zip code</span>';
	echo '<input id="wl-paste-zip" name="zip" type="text" inputmode="numeric" maxlength="10" autocomplete="postal-code" placeholder="ZIP"></label>';
	echo '<label class="wl-note-label" for="wl-paste-link">Copy-paste your product page (URL) here</label>';
	echo '<div class="wl-paste-row"><input id="wl-paste-link" name="link" type="url" inputmode="url" autocomplete="off" placeholder="https://">';
	echo '<button type="submit" class="wl-orange">Gift-wrap this item</button></div>';
	echo '<input type="hidden" name="utm_source" value="wrrapd.com"><input type="hidden" name="utm_medium" value="landing"><input type="hidden" name="utm_campaign" value="landing6-paste">';
	echo '<p class="wl-paste-out" aria-live="polite"></p></form>';
	echo '<ul class="wl-paste-points">';
	foreach ( array(
		array( 'Make it personal', 'Choose the occasion and write a note. We tuck it under the bow, and fresh flowers can come along too.' ),
		array( 'From any device', 'Order from your phone, tablet or laptop in moments.' ),
		array( 'Up to five gifts at once', 'Gather favorites from different stores in a single order.' ),
		array( 'One graceful checkout', 'Gifts, wrapping and delivery, settled in one payment.' ),
	) as $p ) {
		echo '<li>' . wrrapd_landing_bow_svg( 'wl-bow-xs' ) . '<div><b>' . esc_html( $p[0] ) . '</b><span>' . esc_html( $p[1] ) . '</span></div></li>';
	}
	echo '</ul></div>';

	echo '<div class="wl-phone" data-wl-phone aria-label="Animated demo of pasting a gift link"><div class="wl-phone-screen">';
	echo '<p class="wl-phone-url">wrrapd.com/buy</p><p class="wl-phone-h">Your gift</p>';
	echo '<div class="wl-phone-field"><span data-wl-phone-type></span><i class="wl-caret"></i></div>';
	echo '<div class="wl-phone-card"><img src="https://target.scene7.com/is/image/Target/GUEST_2c7410d9-3a5a-41d2-a0fe-f53eeabd2726?wid=300&hei=300&qlt=80" alt=""><div><b>LEGO Icons Bumblebee Set</b><small>Target · Arrives Tue</small></div></div>';
	echo '<div class="wl-phone-wrap"><span class="wl-pat-plaid"></span><div><b>Holiday Plaid</b><small>Note: Happy birthday, Mom!</small></div></div>';
	echo '<div class="wl-phone-done">' . wrrapd_landing_gift( 'plaid', 'wl-gift-xs' ) . '<b>Wrapped and on its way</b></div>';
	echo '</div></div>';
	echo '</div></div></section>';

	echo '<section class="wl wl-ideas" data-wl6="ideas"><div class="wl-inner">';
	echo wrrapd_landing_head( 'More gift ideas', 'Find the perfect gift', 'Browse ideas by store, or explore brands we love.' );
	echo '<div class="wl-ideas-grid">';
	echo '<a class="wl-idea" href="' . esc_url( home_url( '/gift-ideas/' ) ) . '"><b>Gift ideas by store</b><span>Birthdays, weddings, holidays and more at Target, Nordstrom, Kohl\'s, Ulta, Sephora, Etsy, Walmart, LEGO and Best Buy.</span><em>See gift ideas &rsaquo;</em></a>';
	echo '<a class="wl-idea" href="' . esc_url( home_url( '/top-gifting-choices/' ) ) . '"><b>Wrrapd\'s Top Gifting Choices</b><span>Hand-picked brands: chocolates, beauty, jewelry, electronics and more.</span><em>Browse top choices &rsaquo;</em></a>';
	echo '</div></div></section>';
	echo '</div>';
}

/* ---------- /gift-ideas/: the homepage store gift guides, on their own page ---------- */

function wrrapd_gift_ideas_render() {
	$path = wp_parse_url( isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '', PHP_URL_PATH );
	if ( ! is_string( $path ) || ! preg_match( '#^/gift-ideas/?$#', $path ) ) {
		return;
	}
	$file = __DIR__ . '/wrrapd-gift-guides.html';
	if ( ! is_readable( $file ) ) {
		return;
	}
	global $wp_query;
	if ( $wp_query ) {
		$wp_query->is_404 = false;
	}
	status_header( 200 );
	add_filter(
		'pre_get_document_title',
		function () {
			return 'Gift ideas by store | Wrrapd';
		},
		99
	);
	add_filter(
		'body_class',
		function ( $classes ) {
			$classes[] = 'wrrapd-landing-page';
			$classes[] = 'wrrapd-gift-ideas-page';
			return $classes;
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
	wrrapd_landing_enqueue( 7 );
	get_header();
	echo '<main id="wrrapd-gift-ideas" class="wl-gift-ideas">';
	echo file_get_contents( $file ); // phpcs:ignore WordPress.Security.EscapeOutput -- static, repo-owned markup.
	echo '<p class="wl-gift-ideas-more">Looking for more? <a href="' . esc_url( home_url( '/top-gifting-choices/' ) ) . '">Browse Wrrapd\'s Top Gifting Choices</a></p>';
	echo '</main>';
	get_footer();
	exit;
}
add_action( 'template_redirect', 'wrrapd_gift_ideas_render', 1 );
