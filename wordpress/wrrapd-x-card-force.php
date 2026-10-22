<?php
/**
 * Plugin Name: Wrrapd X Card Force
 * Description: Path-aware OG/Twitter share images. Clean card HTML for social bots on /share/ and hire landings (X often fails noisy pages and shows the logo). JPEGs on api.wrrapd.com via nginx.
 * Version: 2.3.0
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
	return isset( $_GET['wrrapd_card_debug'] ) || isset( $_GET['card'] );
}

/**
 * @return array{title:string,description:string,url:string,image:string}|null
 */
function wrrapd_x_card_clean_payload() {
	$api  = 'https://api.wrrapd.com/img/og/';
	$path = wrrapd_x_card_path();

	if ( wrrapd_x_card_is_apply_host() ) {
		if ( preg_match( '#^/wraprider(/|$)#', $path ) ) {
			return array(
				'title'       => 'Become a "WrapRider"',
				'description' => 'Wrap gifts beautifully, then deliver them yourself. Paid hourly — rate confirmed when you’re approved.',
				'url'         => 'https://apply.wrrapd.com/wraprider/',
				'image'       => $api . 'wrrapd-x-wraprider-e.jpg',
			);
		}
		if ( preg_match( '#^/(drive|joyrider)(/|$)#', $path ) || preg_match( '#^/driver#', $path ) ) {
			return array(
				'title'       => 'Become a "JoyRider"',
				'description' => 'Deliver wrapped gifts and flowers on your schedule. Paid hourly — rate confirmed when you’re approved.',
				'url'         => 'https://apply.wrrapd.com/drive/',
				'image'       => $api . 'wrrapd-x-joyrider-e.jpg',
			);
		}
		if ( preg_match( '#^/(apply)?/?$#', $path ) || preg_match( '#^/apply(/|$)#', $path ) ) {
			return array(
				'title'       => 'Become a "WrapStar"',
				'description' => 'Wrap beautiful gifts from your own space, on your own hours. Paid hourly — rate confirmed when you’re approved.',
				'url'         => 'https://apply.wrrapd.com/apply/',
				'image'       => $api . 'wrrapd-x-wrapstar-e.jpg',
			);
		}
		return array(
			'title'       => 'Become a "WrapStar"',
			'description' => 'Wrap beautiful gifts from your own space. Paid hourly — rate confirmed when you’re approved.',
			'url'         => 'https://apply.wrrapd.com/apply/',
			'image'       => $api . 'wrrapd-x-wrapstar-e.jpg',
		);
	}

	if ( $path === '/share' || $path === '/' ) {
		return array(
			'title'       => 'Wrrapd | Wrapping Happiness',
			'description' => 'Gift wrapping and delivery, done for you. Shop with our free Chrome extension, or paste any gift link.',
			'url'         => 'https://wrrapd.com/share/',
			'image'       => $api . 'wrrapd-x-home-e.jpg',
		);
	}

	if ( preg_match( '#^/buy/?$#', $path ) ) {
		return array(
			'title'       => 'Order through us | Wrrapd',
			'description' => 'Paste a gift link. We buy it, wrap it in real patterned paper, and deliver it to their door.',
			'url'         => 'https://wrrapd.com/buy/',
			'image'       => $api . 'wrrapd-buy-card.jpg',
		);
	}

	return null;
}

/**
 * Canonical image URL for rewrite / wp_head.
 */
function wrrapd_x_card_image_url() {
	static $cached = null;
	if ( is_string( $cached ) ) {
		return $cached;
	}
	$payload = wrrapd_x_card_clean_payload();
	if ( $payload ) {
		$cached = $payload['image'];
		return $cached;
	}

	$api  = 'https://api.wrrapd.com/img/og/';
	$path = wrrapd_x_card_path();
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
	$cached = $api . 'wrrapd-x-home-e.jpg';
	return $cached;
}

/**
 * Minimal HTML for social crawlers — no WordPress chrome, no logo fallbacks.
 *
 * @param array{title:string,description:string,url:string,image:string} $card
 */
function wrrapd_x_card_emit_clean_document( $card ) {
	if ( ! headers_sent() ) {
		status_header( 200 );
		header( 'Content-Type: text/html; charset=UTF-8' );
		header( 'Cache-Control: no-store, no-cache, must-revalidate, max-age=0' );
		header( 'X-Wrrapd-Card: force-11' );
	}
	echo '<!DOCTYPE html><html lang="en"><head>';
	echo '<meta charset="utf-8" />';
	echo '<title>' . esc_html( $card['title'] ) . '</title>';
	echo '<meta name="description" content="' . esc_attr( $card['description'] ) . '" />';
	echo '<meta name="robots" content="max-image-preview:large" />';
	echo '<meta property="og:locale" content="en_US" />';
	echo '<meta property="og:type" content="website" />';
	echo '<meta property="og:site_name" content="Wrrapd" />';
	echo '<meta property="og:title" content="' . esc_attr( $card['title'] ) . '" />';
	echo '<meta property="og:description" content="' . esc_attr( $card['description'] ) . '" />';
	echo '<meta property="og:url" content="' . esc_url( $card['url'] ) . '" />';
	echo '<meta property="og:image" content="' . esc_url( $card['image'] ) . '" />';
	echo '<meta property="og:image:secure_url" content="' . esc_url( $card['image'] ) . '" />';
	echo '<meta property="og:image:width" content="1200" />';
	echo '<meta property="og:image:height" content="630" />';
	echo '<meta property="og:image:type" content="image/jpeg" />';
	echo '<meta name="twitter:card" content="summary_large_image" />';
	echo '<meta name="twitter:title" content="' . esc_attr( $card['title'] ) . '" />';
	echo '<meta name="twitter:description" content="' . esc_attr( $card['description'] ) . '" />';
	echo '<meta name="twitter:image" content="' . esc_url( $card['image'] ) . '" />';
	echo '</head><body><p><a href="' . esc_url( $card['url'] ) . '">Wrrapd</a></p></body></html>';
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
		if ( wrrapd_x_card_is_bot() || wrrapd_x_card_path() === '/share' ) {
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

	// Never rewrite header, footer, or any other visible logo URL.
	// Social posts use the banner JPEG itself. See docs/SOCIAL-SHARE-CARDS.md.

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

		// Shopper /share/ — humans → homepage; bots → clean card.
		if ( $path === '/share' && ! wrrapd_x_card_is_apply_host() ) {
			if ( ! defined( 'DONOTCACHEPAGE' ) ) {
				define( 'DONOTCACHEPAGE', true );
			}
			if ( wrrapd_x_card_is_bot() ) {
				$card = wrrapd_x_card_clean_payload();
				if ( $card ) {
					wrrapd_x_card_emit_clean_document( $card );
				}
			}
			wp_safe_redirect( 'https://wrrapd.com/', 302 );
			exit;
		}

		// Hire landings: bots get clean card HTML (stops logo fallback on X).
		if ( wrrapd_x_card_is_bot() && wrrapd_x_card_is_apply_host() ) {
			$card = wrrapd_x_card_clean_payload();
			if ( $card ) {
				wrrapd_x_card_emit_clean_document( $card );
			}
		}

		// Shopper homepage/buy for bots: clean card when we have a payload.
		if ( wrrapd_x_card_is_bot() && ! wrrapd_x_card_is_apply_host() ) {
			$card = wrrapd_x_card_clean_payload();
			if ( $card && ( $path === '/' || preg_match( '#^/buy/?$#', $path ) ) ) {
				wrrapd_x_card_emit_clean_document( $card );
			}
		}

		if ( ! headers_sent() && wrrapd_x_card_is_bot() ) {
			header( 'Cache-Control: no-store, no-cache, must-revalidate, max-age=0' );
			header( 'Pragma: no-cache' );
			header( 'X-Wrrapd-Card: force-11' );
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
