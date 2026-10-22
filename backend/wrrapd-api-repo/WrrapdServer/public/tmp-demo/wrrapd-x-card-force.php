<?php
/**
 * Plugin Name: Wrrapd X Card Force
 * Description: Path-aware OG/Twitter share images. Clean /share/ page for X (homepage HTML is too noisy and X sticks on failed image scrapes). Shopper JPEGs on api.wrrapd.com.
 * Version: 2.2.0
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WRRAPD_X_CARD_VER', '20261022e' );

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
	return isset( $_GET['wrrapd_card_debug'] );
}

/**
 * Canonical 1200×630 share image for this request.
 */
function wrrapd_x_card_image_url() {
	static $cached = null;
	if ( is_string( $cached ) ) {
		return $cached;
	}

	$api  = 'https://api.wrrapd.com/img/og/';
	$path = wrrapd_x_card_path();

	if ( wrrapd_x_card_is_apply_host() ) {
		if ( preg_match( '#^/wraprider(/|$)#', $path ) ) {
			$cached = $api . 'wraprider-og.jpg';
			return $cached;
		}
		if ( preg_match( '#^/(drive|joyrider)(/|$)#', $path ) || preg_match( '#^/driver#', $path ) ) {
			$cached = $api . 'joyrider-og.jpg';
			return $cached;
		}
		$cached = $api . 'wrapstar-og.jpg';
		return $cached;
	}

	if ( preg_match( '#^/buy/?$#', $path ) ) {
		$cached = $api . 'wrrapd-buy-card.jpg';
		return $cached;
	}

	$essays = array(
		'/holiday-gifting-season'        => 'wrrapd-essay-holiday-card.jpg',
		'/give-them-a-season'            => 'wrrapd-essay-season-card.jpg',
		'/what-belongs-under-the-ribbon' => 'wrrapd-essay-ribbon-card.jpg',
	);
	foreach ( $essays as $slug => $file ) {
		if ( $path === $slug || $path === $slug . '/' ) {
			$cached = $api . $file;
			return $cached;
		}
	}

	if ( function_exists( 'is_singular' ) && is_singular( 'post' ) ) {
		$cached = $api . 'wrrapd-blog-card.jpg';
		return $cached;
	}

	// Homepage + /share/ + default.
	$cached = $api . 'wrrapd-x-home-e.jpg';
	return $cached;
}

/**
 * Minimal HTML for social crawlers — no WordPress chrome, no logo fallbacks.
 */
function wrrapd_x_card_emit_share_document() {
	$img   = wrrapd_x_card_image_url();
	$title = 'Wrrapd | Wrapping Happiness';
	$desc  = 'Gift wrapping and delivery, done for you. Shop with our free Chrome extension, or paste any gift link.';
	$url   = 'https://wrrapd.com/share/';
	if ( ! headers_sent() ) {
		status_header( 200 );
		header( 'Content-Type: text/html; charset=UTF-8' );
		header( 'Cache-Control: no-store, no-cache, must-revalidate, max-age=0' );
		header( 'X-Wrrapd-Card: force-10' );
	}
	echo '<!DOCTYPE html><html lang="en"><head>';
	echo '<meta charset="utf-8" />';
	echo '<title>' . esc_html( $title ) . '</title>';
	echo '<meta name="description" content="' . esc_attr( $desc ) . '" />';
	echo '<meta name="robots" content="max-image-preview:large" />';
	echo '<meta property="og:locale" content="en_US" />';
	echo '<meta property="og:type" content="website" />';
	echo '<meta property="og:site_name" content="Wrrapd" />';
	echo '<meta property="og:title" content="' . esc_attr( $title ) . '" />';
	echo '<meta property="og:description" content="' . esc_attr( $desc ) . '" />';
	echo '<meta property="og:url" content="' . esc_url( $url ) . '" />';
	echo '<meta property="og:image" content="' . esc_url( $img ) . '" />';
	echo '<meta property="og:image:secure_url" content="' . esc_url( $img ) . '" />';
	echo '<meta property="og:image:width" content="1200" />';
	echo '<meta property="og:image:height" content="630" />';
	echo '<meta property="og:image:type" content="image/jpeg" />';
	echo '<meta name="twitter:card" content="summary_large_image" />';
	echo '<meta name="twitter:title" content="' . esc_attr( $title ) . '" />';
	echo '<meta name="twitter:description" content="' . esc_attr( $desc ) . '" />';
	echo '<meta name="twitter:image" content="' . esc_url( $img ) . '" />';
	echo '</head><body><p><a href="https://wrrapd.com/">Wrrapd</a></p></body></html>';
	exit;
}

if ( wrrapd_x_card_is_bot() ) {
	if ( ! defined( 'DONOTCACHEPAGE' ) ) {
		define( 'DONOTCACHEPAGE', true );
	}
}

add_filter(
	'w3tc_can_cache',
	function ( $can ) {
		$path = wrrapd_x_card_path();
		if ( $path === '/share' || wrrapd_x_card_is_bot() ) {
			return false;
		}
		return $can;
	},
	0
);

function wrrapd_x_card_rewrite( $html ) {
	if ( ! is_string( $html ) || $html === '' ) {
		return $html;
	}
	$img = wrrapd_x_card_image_url();

	$html = preg_replace(
		'#(<meta[^>]+(?:property|name)=["\'](?:og:image|og:image:secure_url|twitter:image)["\'][^>]+content=["\'])[^"\']+(["\'])#i',
		'$1' . $img . '$2',
		$html
	);

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
		$path = wrrapd_x_card_path();

		// Clean share URL for X/FB. Humans go to the real homepage.
		if ( $path === '/share' ) {
			if ( ! defined( 'DONOTCACHEPAGE' ) ) {
				define( 'DONOTCACHEPAGE', true );
			}
			if ( wrrapd_x_card_is_bot() || isset( $_GET['card'] ) ) {
				wrrapd_x_card_emit_share_document();
			}
			wp_safe_redirect( 'https://wrrapd.com/', 302 );
			exit;
		}

		if ( ! headers_sent() && wrrapd_x_card_is_bot() ) {
			header( 'Cache-Control: no-store, no-cache, must-revalidate, max-age=0' );
			header( 'Pragma: no-cache' );
			header( 'X-Wrrapd-Card: force-10' );
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
