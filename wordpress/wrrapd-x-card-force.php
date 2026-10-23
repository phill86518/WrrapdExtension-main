<?php
/**
 * Plugin Name: Wrrapd X Card Force
 * Description: Social OG/Twitter cards only. Never rewrites page HTML for humans (header/body/footer stay untouched). Bots get a tiny clean card document.
 * Version: 2.4.0
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @return string
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
		return array(
			'title'       => 'Become a "WrapStar"',
			'description' => 'Wrap beautiful gifts from your own space, on your own hours. Paid hourly — rate confirmed when you’re approved.',
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

	$essays = array(
		'/holiday-gifting-season'        => array( 'title' => 'This holiday season, make the unwrapping the moment!', 'file' => 'wrrapd-essay-holiday-card.jpg', 'url' => 'https://wrrapd.com/holiday-gifting-season/' ),
		'/give-them-a-season'            => array( 'title' => 'Give them a season they can keep!', 'file' => 'wrrapd-essay-season-card.jpg', 'url' => 'https://wrrapd.com/give-them-a-season/' ),
		'/what-belongs-under-the-ribbon' => array( 'title' => 'What belongs under the ribbon this year!', 'file' => 'wrrapd-essay-ribbon-card.jpg', 'url' => 'https://wrrapd.com/what-belongs-under-the-ribbon/' ),
	);
	foreach ( $essays as $slug => $info ) {
		if ( $path === $slug || $path === $slug . '/' ) {
			return array(
				'title'       => $info['title'],
				'description' => 'Gift stories from Wrrapd.',
				'url'         => $info['url'],
				'image'       => $api . $info['file'],
			);
		}
	}

	return null;
}

/**
 * @param array{title:string,description:string,url:string,image:string} $card
 */
function wrrapd_x_card_emit_clean_document( $card ) {
	if ( ! headers_sent() ) {
		status_header( 200 );
		header( 'Content-Type: text/html; charset=UTF-8' );
		header( 'Cache-Control: no-store, no-cache, must-revalidate, max-age=0' );
		header( 'X-Wrrapd-Card: force-13' );
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

// Keep human HTML and bot card HTML in separate edge-cache keys (SiteGround proxy).
add_action(
	'send_headers',
	function () {
		if ( wrrapd_x_card_clean_payload() && ! headers_sent() ) {
			header( 'Vary: User-Agent', false );
		}
	},
	0
);

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

		// Humans: do nothing. No output buffering. No HTML rewrite. Pages render as WordPress built them.
		if ( ! wrrapd_x_card_is_bot() ) {
			return;
		}

		if ( ! defined( 'DONOTCACHEPAGE' ) ) {
			define( 'DONOTCACHEPAGE', true );
		}

		$card = wrrapd_x_card_clean_payload();
		if ( $card ) {
			wrrapd_x_card_emit_clean_document( $card );
		}
	},
	0
);

// Humans only: add OG meta in head (does not touch header/body/footer markup).
add_action(
	'wp_head',
	function () {
		if ( wrrapd_x_card_is_bot() ) {
			return;
		}
		$card = wrrapd_x_card_clean_payload();
		if ( ! $card ) {
			return;
		}
		$img = esc_url( $card['image'] );
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
