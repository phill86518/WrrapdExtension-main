<?php
/**
 * "We buy it for you" page at /buy/.
 *
 * Shoppers paste product links; Wrrapd buys the items, gift-wraps every one, and delivers them.
 * The page runs in the browser against api.wrrapd.com (lib/buy/ on the pay server); payment is on
 * pay.wrrapd.com/buy/pay. No WordPress page record is needed. Kept out of search until counsel
 * has reviewed the purchasing terms.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WRRAPD_BUY_BUILD', '2026-10-13-buy-v3' );

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
			return 'We buy it, gift-wrap it, and deliver it | Wrrapd';
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
			$classes[] = 'wrrapd-buy-page';
			return $classes;
		}
	);

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
