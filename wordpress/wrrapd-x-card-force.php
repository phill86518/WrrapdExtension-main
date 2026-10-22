<?php
/**
 * Plugin Name: Wrrapd X Card Force
 * Description: Path-aware OG/Twitter share images for wrrapd.com + apply.wrrapd.com; bypass page cache for social bots; strip noindex for social crawlers so cards render.
 * Version: 2.0.0
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WRRAPD_X_CARD_VER', '20261022c' );

/**
 * @return string Request path with leading slash, no trailing slash (except root "/").
 */
function wrrapd_x_card_path() {
	$path = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_parse_url( wp_unslash( $_SERVER['REQUEST_URI'] ), PHP_URL_PATH ) : '/';
	if ( ! is_string( $path ) || $path === '' ) {
		return '/';
	}
	$path = '/' . trim( $path, '/' );
	return $path === '/' ? '/' : $path;
}

function wrrapd_x_card_host() {
	$host = isset( $_SERVER['HTTP_HOST'] ) ? strtolower( (string) $_SERVER['HTTP_HOST'] ) : '';
	$host = preg_replace( '/:\d+$/', '', $host );
	return is_string( $host ) ? $host : '';
}

function wrrapd_x_card_is_apply_host() {
	$host = wrrapd_x_card_host();
	return (bool) preg_match( '#(^|\.)apply\.wrrapd\.com$#', $host )
		|| (bool) preg_match( '#(^|\.)pros\.wrrapd\.com$#', $host );
}

function wrrapd_x_card_is_bot() {
	$ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? strtolower( (string) $_SERVER['HTTP_USER_AGENT'] ) : '';
	foreach ( array( 'twitterbot', 'facebookexternalhit', 'linkedinbot', 'slackbot', 'discordbot', 'whatsapp', 'telegrambot' ) as $needle ) {
		if ( $ua !== '' && strpos( $ua, $needle ) !== false ) {
			return true;
		}
	}
	return isset( $_GET['wrrapd_card_debug'] ) || isset( $_GET['share'] );
}

/**
 * Canonical 1200×630 share image for this request.
 */
function wrrapd_x_card_image_url() {
	static $cached = null;
	if ( is_string( $cached ) ) {
		return $cached;
	}

	$v    = WRRAPD_X_CARD_VER;
	$base = 'https://wrrapd.com/wp-content/uploads/2026/10/';
	$api  = 'https://api.wrrapd.com/img/og/';
	$path = wrrapd_x_card_path();

	if ( wrrapd_x_card_is_apply_host() ) {
		if ( preg_match( '#^/wraprider(/|$)#', $path ) ) {
			$cached = $api . 'wraprider-og.jpg?v=' . $v;
			return $cached;
		}
		if ( preg_match( '#^/(drive|joyrider)(/|$)#', $path ) || preg_match( '#^/driver#', $path ) ) {
			$cached = $api . 'joyrider-og.jpg?v=' . $v;
			return $cached;
		}
		// WrapStar landings + apply form + portal home.
		$cached = $api . 'wrapstar-og.jpg?v=' . $v;
		return $cached;
	}

	if ( preg_match( '#^/buy/?$#', $path ) ) {
		$cached = $base . 'wrrapd-share-buy-20261022.jpg?v=' . $v;
		return $cached;
	}

	$essays = array(
		'/holiday-gifting-season'       => 'wrrapd-share-essay-holiday-20261022.jpg',
		'/give-them-a-season'           => 'wrrapd-share-essay-season-20261022.jpg',
		'/what-belongs-under-the-ribbon' => 'wrrapd-share-essay-ribbon-20261022.jpg',
	);
	foreach ( $essays as $slug => $file ) {
		if ( $path === $slug || $path === $slug . '/' ) {
			$cached = $base . $file . '?v=' . $v;
			return $cached;
		}
	}

	// Singular posts: prefer a real featured image when present.
	if ( function_exists( 'is_singular' ) && is_singular( 'post' ) && function_exists( 'get_the_post_thumbnail_url' ) ) {
		$thumb = get_the_post_thumbnail_url( null, 'full' );
		if ( is_string( $thumb ) && $thumb !== '' && strpos( $thumb, 'Wrrapd_f-Logo' ) === false ) {
			$cached = $thumb;
			return $cached;
		}
		$cached = $base . 'wrrapd-share-blog-20261022.jpg?v=' . $v;
		return $cached;
	}

	if ( $path !== '/' && function_exists( 'is_singular' ) && is_singular() ) {
		$cached = $base . 'wrrapd-share-blog-20261022.jpg?v=' . $v;
		return $cached;
	}

	$cached = $base . 'wrrapd-share-home-20261022.jpg?v=' . $v;
	return $cached;
}

if ( wrrapd_x_card_is_bot() ) {
	if ( ! defined( 'DONOTCACHEPAGE' ) ) {
		define( 'DONOTCACHEPAGE', true );
	}
}

add_filter(
	'w3tc_can_cache',
	function ( $can ) {
		return wrrapd_x_card_is_bot() ? false : $can;
	},
	0
);

function wrrapd_x_card_rewrite( $html ) {
	if ( ! is_string( $html ) || $html === '' ) {
		return $html;
	}
	$img = wrrapd_x_card_image_url();

	// Normalize known weak / stale OG targets to the path-correct card.
	$html = preg_replace(
		'#https://(?:wrrapd\.com|apply\.wrrapd\.com)/wp-content/uploads/[^"\']+/(?:Wrrapd_f-Logo[^"\']*|Applications_Wrrapd[^"\']*|wrrapd-(?:homepage|focus|x-card-20261021|share-home-20261022|share-buy-20261022|share-blog-20261022|share-essay-[a-z]+-20261022)(?:-og)?\.jpg)(?:\?[^"\']*)?#i',
		$img,
		$html
	);
	$html = preg_replace(
		'#https://api\.wrrapd\.com/img/og/(?:wrapstar|joyrider|wraprider)-og\.jpg(?:\?[^"\']*)?#i',
		$img,
		$html
	);

	// X/FB refuse cards when the page is noindex (e.g. /buy for Google).
	if ( wrrapd_x_card_is_bot() ) {
		$html = preg_replace(
			"#<meta\s+name=['\"]robots['\"]\s+content=['\"][^'\"]*noindex[^'\"]*['\"]\s*/?>#i",
			'<meta name="robots" content="max-image-preview:large" />',
			$html
		);
	}
	return $html;
}

add_action(
	'template_redirect',
	function () {
		if ( ! headers_sent() && wrrapd_x_card_is_bot() ) {
			header( 'Cache-Control: no-store, no-cache, must-revalidate, max-age=0' );
			header( 'Pragma: no-cache' );
			header( 'X-Wrrapd-Card: force-7' );
		}
		ob_start( 'wrrapd_x_card_rewrite' );
	},
	0
);

add_action(
	'wp_head',
	function () {
		$img = esc_url( wrrapd_x_card_image_url() );
		echo "\n<!-- wrrapd-x-card-force -->\n";
		echo '<meta property="og:image" content="' . $img . '" />' . "\n";
		echo '<meta property="og:image:secure_url" content="' . $img . '" />' . "\n";
		echo '<meta property="og:image:width" content="1200" />' . "\n";
		echo '<meta property="og:image:height" content="630" />' . "\n";
		echo '<meta name="twitter:card" content="summary_large_image" />' . "\n";
		echo '<meta name="twitter:image" content="' . $img . '" />' . "\n";
	},
	99
);
