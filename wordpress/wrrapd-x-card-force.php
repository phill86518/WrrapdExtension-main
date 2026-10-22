<?php
/**
 * Plugin Name: Wrrapd X Card Force
 * Description: Path-aware OG/Twitter share images for wrrapd.com + apply.wrrapd.com. Shopper cards are served from api.wrrapd.com so X can fetch them (SiteGround uploads often fail for Twitterbot and fall back to the logo).
 * Version: 2.1.0
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WRRAPD_X_CARD_VER', '20261022d' );

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
 * Shopper cards always use api.wrrapd.com (reliable for X image fetch).
 */
function wrrapd_x_card_image_url() {
	static $cached = null;
	if ( is_string( $cached ) ) {
		return $cached;
	}

	$v   = WRRAPD_X_CARD_VER;
	$api = 'https://api.wrrapd.com/img/og/';
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
		$cached = $api . 'wrapstar-og.jpg?v=' . $v;
		return $cached;
	}

	if ( preg_match( '#^/buy/?$#', $path ) ) {
		$cached = $api . 'wrrapd-buy-card.jpg?v=' . $v;
		return $cached;
	}

	$essays = array(
		'/holiday-gifting-season'        => 'wrrapd-essay-holiday-card.jpg',
		'/give-them-a-season'            => 'wrrapd-essay-season-card.jpg',
		'/what-belongs-under-the-ribbon' => 'wrrapd-essay-ribbon-card.jpg',
	);
	foreach ( $essays as $slug => $file ) {
		if ( $path === $slug || $path === $slug . '/' ) {
			$cached = $api . $file . '?v=' . $v;
			return $cached;
		}
	}

	if ( function_exists( 'is_singular' ) && is_singular( 'post' ) ) {
		$cached = $api . 'wrrapd-blog-card.jpg?v=' . $v;
		return $cached;
	}

	// Homepage + everything else on the shopper site.
	$cached = $api . 'wrrapd-home-banner-20261022d.jpg?v=' . $v;
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

	// Force every og/twitter image meta onto the path-correct API card.
	$html = preg_replace(
		'#(<meta[^>]+(?:property|name)=["\'](?:og:image|og:image:secure_url|twitter:image)["\'][^>]+content=["\'])[^"\']+(["\'])#i',
		'$1' . $img . '$2',
		$html
	);

	// Kill logo / Applications stills that X sometimes picks when the big card fails.
	$html = preg_replace(
		'#https://(?:wrrapd\.com|apply\.wrrapd\.com)/wp-content/uploads/[^"\']*(?:Wrrapd_f-Logo|cropped-Wrrapd|Applications_Wrrapd)[^"\']*#i',
		$img,
		$html
	);

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
			header( 'X-Wrrapd-Card: force-8' );
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
		echo '<meta property="og:image:type" content="image/jpeg" />' . "\n";
		echo '<meta name="twitter:card" content="summary_large_image" />' . "\n";
		echo '<meta name="twitter:image" content="' . $img . '" />' . "\n";
	},
	1
);
