<?php
/**
 * Order-through-us page at /buy/.
 *
 * Shoppers paste product links and buy through Wrrapd. Wrrapd gift-wraps every item and delivers it.
 * The page runs in the browser against api.wrrapd.com (lib/buy/ on the pay server); payment is on
 * pay.wrrapd.com/buy/pay. No WordPress page record is needed. Kept out of search until counsel
 * has reviewed the purchasing terms.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WRRAPD_BUY_BUILD', '2026-10-20-buy-v82' );

function wrrapd_buy_is_request() {
	$path = wp_parse_url( isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '', PHP_URL_PATH );
	return is_string( $path ) && preg_match( '#^/buy/?$#', $path );
}

function wrrapd_buy_extension_url() {
	if ( function_exists( 'wrrapd_chrome_extension_install_url' ) ) {
		return wrrapd_chrome_extension_install_url();
	}
	return 'https://chromewebstore.google.com/detail/wrrapd/lobngnjcjeimefihnobdmocicopikoip';
}

function wrrapd_buy_render() {
	if ( ! wrrapd_buy_is_request() ) {
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

	add_filter(
		'pre_get_document_title',
		function () {
			return 'Order through us | Wrrapd';
		},
		99
	);
	// Keep /buy out of Google; social bots need an indexable page or X/FB skip the card.
	$ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? strtolower( (string) $_SERVER['HTTP_USER_AGENT'] ) : '';
	$social = false;
	foreach ( array( 'twitterbot', 'facebookexternalhit', 'linkedinbot', 'slackbot', 'discordbot', 'whatsapp', 'telegrambot' ) as $needle ) {
		if ( $ua !== '' && strpos( $ua, $needle ) !== false ) {
			$social = true;
			break;
		}
	}
	if ( ! $social ) {
		add_filter(
			'wp_robots',
			function ( $robots ) {
				$robots['noindex']  = true;
				$robots['nofollow'] = true;
				return $robots;
			}
		);
	}
	add_filter(
		'body_class',
		function ( $classes ) {
			$kit       = (int) get_option( 'elementor_active_kit' );
			$classes[] = 'wrrapd-buy-page';
			$classes[] = 'page';
			$classes[] = 'elementor-default';
			$classes[] = 'elementor-template-full-width';
			if ( $kit ) {
				$classes[] = 'elementor-kit-' . $kit;
			}
			return array_unique( $classes );
		}
	);

	add_action( 'wp_head', 'wrrapd_buy_output_share_tags', 1 );
	add_action( 'wp_head', 'wrrapd_buy_header_match_css', 10000 );
	add_action( 'wp_body_open', 'wrrapd_buy_retailer_strip', 6 );

	$base = content_url( 'mu-plugins/' );
	wp_enqueue_style(
		'wrrapd-buy-font',
		'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,460;0,9..144,560;0,9..144,650;1,9..144,560&display=swap',
		array(),
		null
	);
	wp_enqueue_style( 'wrrapd-buy', $base . 'wrrapd-buy-for-you.css', array( 'wrrapd-buy-font' ), WRRAPD_BUY_BUILD );
	wp_enqueue_script( 'wrrapd-buy', $base . 'wrrapd-buy-for-you.js', array(), WRRAPD_BUY_BUILD, true );
	wp_localize_script(
		'wrrapd-buy',
		'WRRAPD_BUY',
		array(
			'api'          => 'https://api.wrrapd.com',
			'pay'          => 'https://pay.wrrapd.com/buy/pay',
			'extensionUrl' => wrrapd_buy_extension_url(),
			'build'        => WRRAPD_BUY_BUILD,
		)
	);

	get_header();
	echo '<main id="wrrapd-buy" class="wrrapd-buy" data-build="' . esc_attr( WRRAPD_BUY_BUILD ) . '">';
	echo '<noscript><p class="wb-note">Please turn on JavaScript to use this page.</p></noscript>';
	echo '</main>';
	get_footer();
	exit;
}
add_action( 'template_redirect', 'wrrapd_buy_render', 1 );

/**
 * The landing page scopes its header logo, tagline, and retailer-strip spacing to body.home
 * (header layout CSS, Customizer CSS, home-top tighten). Same rules for /buy/.
 */

function wrrapd_buy_output_share_tags() {
	$title = 'Order through us | Wrrapd';
	$desc  = 'Paste a gift link. We buy it, wrap it in real patterned paper, and deliver it to their door.';
	$img   = 'https://api.wrrapd.com/img/og/wrrapd-buy-card.jpg?v=20261022d';
	$url   = home_url( '/buy/' );
	echo '<meta name="description" content="' . esc_attr( $desc ) . '" />' . "\n";
	echo '<meta property="og:title" content="' . esc_attr( $title ) . '" />' . "\n";
	echo '<meta property="og:description" content="' . esc_attr( $desc ) . '" />' . "\n";
	echo '<meta property="og:url" content="' . esc_url( $url ) . '" />' . "\n";
	echo '<meta property="og:type" content="website" />' . "\n";
	echo '<meta property="og:site_name" content="Wrrapd" />' . "\n";
	echo '<meta property="og:image" content="' . esc_url( $img ) . '" />' . "\n";
	echo '<meta property="og:image:secure_url" content="' . esc_url( $img ) . '" />' . "\n";
	echo '<meta property="og:image:width" content="1200" />' . "\n";
	echo '<meta property="og:image:height" content="630" />' . "\n";
	echo '<meta property="og:image:alt" content="Wrrapd" />' . "\n";
	echo '<meta name="twitter:card" content="summary_large_image" />' . "\n";
	echo '<meta name="twitter:title" content="' . esc_attr( $title ) . '" />' . "\n";
	echo '<meta name="twitter:description" content="' . esc_attr( $desc ) . '" />' . "\n";
	echo '<meta name="twitter:image" content="' . esc_url( $img ) . '" />' . "\n";
}

function wrrapd_buy_header_match_css() {
	$b = 'body.wrrapd-buy-page:not(.logged-in)';
	echo '<style id="wrrapd-buy-header-match">';
	echo $b . ' .elementor-location-header .elementor-element-68a38868.elementor-widget img{max-height:none!important;max-width:min(19.2rem,54vw)!important;width:auto!important;height:auto!important;}';
	echo $b . ' .elementor-location-header .elementor-element-1c0d63ad img{max-height:none!important;max-width:min(11rem,34vw)!important;width:auto!important;}';
	echo '@media(max-width:1100px),(hover:none) and (pointer:coarse){' . $b . ' .elementor-location-header .elementor-element-68a38868.elementor-widget img{max-width:100%!important;max-height:clamp(4.2rem,22vw,5.5rem)!important;width:auto!important;height:auto!important;}}';
	echo '@media(max-width:767px){' . $b . ' .elementor-6078 .elementor-element.elementor-element-1c0d63ad img{max-height:1rem!important;max-width:5.5rem!important;height:auto!important;}}';
	echo 'body.wrrapd-buy-page #wrrapd-retailer-wheels-row{margin-bottom:0!important;padding-bottom:0!important;border-bottom:none!important;}';
	echo '@media(min-width:961px){body.wrrapd-buy-page #wrrapd-retailer-wheels-row .wrrapd-retailer-wheels{padding-top:.28rem!important;padding-bottom:0!important;}}';
	echo 'body.wrrapd-buy-page .wrrapd-wrap-promo-mobile__features--stack{display:none!important;margin:0!important;padding:0!important;height:0!important;overflow:hidden!important;}';
	echo '</style>';
}

/** The landing page's retailer strip under the header; that function only prints on the front page. */
function wrrapd_buy_retailer_strip() {
	global $wp_query;
	if ( ! function_exists( 'wrrapd_output_retailer_wheel_strip' ) || ! $wp_query ) {
		return;
	}
	$was               = $wp_query->is_home;
	$wp_query->is_home = true;
	wrrapd_output_retailer_wheel_strip();
	$wp_query->is_home = $was;
}
