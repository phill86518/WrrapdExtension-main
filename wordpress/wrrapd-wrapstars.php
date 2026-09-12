<?php
/**
 * Plugin Name: Wrrapd WrapStars Portal (MU)
 * Description: Independent gift-wrapper (WrapStar) application + onboarding for apply.wrrapd.com and pros.wrrapd.com only. Not loaded on wrrapd.com.
 * Author: Wrrapd
 *
 * Install on the **dedicated WrapStars WordPress** (separate from wrrapd.com):
 *   wp-content/mu-plugins/wrrapd-wrapstars.php
 *   wp-content/mu-plugins/wrrapd-boldsign.php
 *   wp-content/mu-plugins/wrrapd-wrapstars.css
 *
 * wp-config.php — see wordpress/WRAPSTARS-DEPLOY.md
 *
 * @package WrrapdWrapStars
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WRRAPD_WRAPSTARS_BUILD', '2026-09-12-hire-timestamps' );
/** Approval / re-invite onboarding credentials remain valid this many days. */
define( 'WRRAPD_WRAPSTARS_INVITE_TTL_DAYS', 15 );

$wrrapd_boldsign = dirname( __FILE__ ) . '/wrrapd-boldsign.php';
if ( is_readable( $wrrapd_boldsign ) ) {
	require_once $wrrapd_boldsign;
}
$wrrapd_apply = dirname( __FILE__ ) . '/wrrapd-wrapstars-apply.php';
if ( is_readable( $wrrapd_apply ) ) {
	require_once $wrrapd_apply;
}
$wrrapd_profile = dirname( __FILE__ ) . '/wrrapd-wrapstars-profile.php';
if ( is_readable( $wrrapd_profile ) ) {
	require_once $wrrapd_profile;
}
$wrrapd_ops_api = dirname( __FILE__ ) . '/wrrapd-wrapstars-ops-api.php';
if ( is_readable( $wrrapd_ops_api ) ) {
	require_once $wrrapd_ops_api;
}

/** @return string */
function wrrapd_wrapstars_apply_host() {
	if ( defined( 'WRRAPD_WRAPSTARS_APPLY_HOST' ) && WRRAPD_WRAPSTARS_APPLY_HOST !== '' ) {
		return strtolower( (string) WRRAPD_WRAPSTARS_APPLY_HOST );
	}
	return 'apply.wrrapd.com';
}

/** @return string */
function wrrapd_wrapstars_pros_host() {
	if ( defined( 'WRRAPD_WRAPSTARS_PROS_HOST' ) && WRRAPD_WRAPSTARS_PROS_HOST !== '' ) {
		return strtolower( (string) WRRAPD_WRAPSTARS_PROS_HOST );
	}
	return 'pros.wrrapd.com';
}

/** @return string */
function wrrapd_wrapstars_current_host() {
	$host = isset( $_SERVER['HTTP_HOST'] ) ? strtolower( (string) $_SERVER['HTTP_HOST'] ) : '';
	return preg_replace( '/:\d+$/', '', $host );
}

/** @return bool */
function wrrapd_wrapstars_force_enable() {
	return defined( 'WRRAPD_WRAPSTARS_FORCE_ENABLE' ) && WRRAPD_WRAPSTARS_FORCE_ENABLE;
}

/** @return bool */
function wrrapd_wrapstars_is_apply_host() {
	if ( wrrapd_wrapstars_force_enable() && defined( 'WRRAPD_WRAPSTARS_DEV_MODE' ) && WRRAPD_WRAPSTARS_DEV_MODE === 'apply' ) {
		return true;
	}
	return wrrapd_wrapstars_current_host() === wrrapd_wrapstars_apply_host();
}

/** @return bool */
function wrrapd_wrapstars_is_pros_host() {
	if ( wrrapd_wrapstars_force_enable() && defined( 'WRRAPD_WRAPSTARS_DEV_MODE' ) && WRRAPD_WRAPSTARS_DEV_MODE === 'pros' ) {
		return true;
	}
	return wrrapd_wrapstars_current_host() === wrrapd_wrapstars_pros_host();
}

/** @return bool */
function wrrapd_wrapstars_is_portal_host() {
	return wrrapd_wrapstars_is_apply_host() || wrrapd_wrapstars_is_pros_host() || wrrapd_wrapstars_force_enable();
}

/** Single WP install serves both apply + pros URLs (SiteGround cannot share docroot yet). */
function wrrapd_wrapstars_unified_host() {
	return wrrapd_wrapstars_apply_host() === wrrapd_wrapstars_pros_host();
}

/**
 * Do not run WrapStars logic on the consumer site.
 */
if ( ! wrrapd_wrapstars_is_portal_host() ) {
	return;
}

/** CPT slug. */
define( 'WRRAPD_WRAPSTARS_CPT', 'wrrapd_wrapstar_app' );

/**
 * Onboarding step registry (pros.wrrapd.com) — single source of truth.
 *
 * Order matters: a step unlocks only when every earlier step is complete.
 * Each entry: label (rail + page title), short (rail sub-line), minutes (estimate
 * shown to the WrapStar), path (URL under pros host), group (rail section header).
 *
 * Renderers: `wrrapd_wrapstars_render_step_<key>()`; submit handlers live in
 * `wrrapd_wrapstars_process_onboarding_step()`. BoldSign e-sign: agreement, w9.
 * Legacy key `po_box` is an alias of `workspace` (meta `step_po_box` still counts).
 *
 * Full map + edit guide: docs/WRAPSTAR-ONBOARDING-PORTAL.md
 *
 * @return array<string, array{label:string,short:string,minutes:int,path:string,group:string}>
 */
function wrrapd_wrapstars_onboarding_step_registry() {
	return array(
		'welcome'     => array( 'label' => 'Welcome', 'short' => 'What to expect', 'minutes' => 2, 'path' => '/onboarding/', 'group' => 'Get started' ),
		'agreement'   => array( 'label' => 'Independent Contractor Agreement', 'short' => 'Review & e-sign', 'minutes' => 8, 'path' => '/onboarding/agreement/', 'group' => 'Agreements' ),
		'policies'    => array( 'label' => 'WrapStar Standards & Policies', 'short' => 'Read & acknowledge', 'minutes' => 6, 'path' => '/onboarding/policies/', 'group' => 'Agreements' ),
		'orientation' => array( 'label' => 'Orientation & Quiz', 'short' => 'Learn the workflow', 'minutes' => 10, 'path' => '/onboarding/orientation/', 'group' => 'Training' ),
		'background'  => array( 'label' => 'Background Check', 'short' => 'Authorize screening', 'minutes' => 3, 'path' => '/onboarding/background/', 'group' => 'Verification' ),
		'insurance'   => array( 'label' => 'Proof of Insurance', 'short' => 'Upload your certificate', 'minutes' => 5, 'path' => '/onboarding/insurance/', 'group' => 'Verification' ),
		'identity'    => array( 'label' => 'Identity Verification', 'short' => 'Confirm your ID', 'minutes' => 3, 'path' => '/onboarding/identity/', 'group' => 'Verification' ),
		'workspace'   => array( 'label' => 'Wrapping Location & Handoff', 'short' => 'Where & when', 'minutes' => 4, 'path' => '/onboarding/workspace/', 'group' => 'Your setup' ),
		'w9'          => array( 'label' => 'W-9 Tax Form', 'short' => 'E-sign', 'minutes' => 5, 'path' => '/onboarding/w-9/', 'group' => 'Tax & payouts' ),
		'tax_1099'    => array( 'label' => 'Tax Acknowledgments', 'short' => 'Confirm contractor status', 'minutes' => 2, 'path' => '/onboarding/tax-1099/', 'group' => 'Tax & payouts' ),
		'bank_payout' => array( 'label' => 'Payout Setup', 'short' => 'Direct deposit', 'minutes' => 4, 'path' => '/onboarding/bank-payout/', 'group' => 'Tax & payouts' ),
		'activation'  => array( 'label' => 'Final Review', 'short' => 'We activate you', 'minutes' => 0, 'path' => '/onboarding/activation/', 'group' => 'Finish' ),
	);
}

/**
 * Onboarding step keys => labels, in order (derived from the registry).
 *
 * @return array<string, string>
 */
function wrrapd_wrapstars_onboarding_steps() {
	$out = array();
	foreach ( wrrapd_wrapstars_onboarding_step_registry() as $key => $meta ) {
		$out[ $key ] = $meta['label'];
	}
	return $out;
}

/** Map legacy step keys to current ones (`po_box` → `workspace`). */
function wrrapd_wrapstars_normalize_step_key( $step ) {
	$step = (string) $step;
	if ( $step === 'po_box' ) {
		return 'workspace';
	}
	return $step;
}

/** Next step key after $step (or activation if last). */
function wrrapd_wrapstars_next_onboarding_step( $step ) {
	$steps = array_keys( wrrapd_wrapstars_onboarding_steps() );
	$idx   = array_search( $step, $steps, true );
	if ( $idx === false || ! isset( $steps[ $idx + 1 ] ) ) {
		return 'activation';
	}
	return $steps[ $idx + 1 ];
}

// --- Bootstrap ---

add_action( 'init', 'wrrapd_wrapstars_register_cpt' );
add_action( 'init', 'wrrapd_wrapstars_register_roles' );
add_action( 'init', 'wrrapd_wrapstars_maybe_handle_posts', 5 );
add_action( 'admin_menu', 'wrrapd_wrapstars_admin_menu' );
add_action( 'wp_enqueue_scripts', 'wrrapd_wrapstars_enqueue_assets' );
add_action( 'wp_enqueue_scripts', 'wrrapd_wrapstars_strip_third_party_chrome', 99999 );
add_action( 'wp_print_scripts', 'wrrapd_wrapstars_strip_third_party_chrome', 99999 );
add_action( 'wp_head', 'wrrapd_wrapstars_output_favicon', 3 );
add_action( 'wp_head', 'wrrapd_wrapstars_output_social_meta', 2 );
add_action( 'wp_body_open', 'wrrapd_wrapstars_output_portal_header', 5 );
add_action( 'wp_footer', 'wrrapd_wrapstars_footer_once', 100 );
add_action( 'wp_footer', 'wrrapd_wrapstars_output_landing_scripts', 120 );
add_action( 'template_redirect', 'wrrapd_wrapstars_host_routing', 1 );
add_action( 'init', 'wrrapd_wrapstars_block_wp_login_on_portal', 1 );
add_action( 'admin_init', 'wrrapd_wrapstars_block_wrapstar_wp_admin' );
add_filter( 'login_redirect', 'wrrapd_wrapstars_login_redirect', 10, 3 );
add_filter( 'body_class', 'wrrapd_wrapstars_body_class' );
add_filter( 'language_attributes', 'wrrapd_wrapstars_language_attributes' );
add_filter( 'show_admin_bar', 'wrrapd_wrapstars_hide_admin_bar', 99999 );
add_action( 'after_setup_theme', 'wrrapd_wrapstars_force_hide_admin_bar', 100 );
add_action( 'init', 'wrrapd_wrapstars_strip_admin_bar_hooks', 999 );
add_filter( 'document_title_parts', 'wrrapd_wrapstars_document_title_parts', 20 );
add_filter( 'pre_get_document_title', 'wrrapd_wrapstars_pre_get_document_title', 20 );
add_filter( 'option_blogname', 'wrrapd_wrapstars_filter_blogname' );
add_filter( 'option_blogdescription', 'wrrapd_wrapstars_filter_blogdescription' );
add_filter( 'oembed_response_data', 'wrrapd_wrapstars_oembed_response_data', 20, 4 );
add_filter( 'the_content', 'wrrapd_wrapstars_force_path_shortcode_content', 999 );
add_filter( 'elementor/frontend/the_content', 'wrrapd_wrapstars_force_path_shortcode_content', 999 );

add_shortcode( 'wrrapd_wrapstar_landing', 'wrrapd_wrapstars_shortcode_landing' );
add_shortcode( 'wrrapd_wrapstar_apply', 'wrrapd_wrapstars_shortcode_apply' );
add_shortcode( 'wrrapd_wrapstar_thankyou', 'wrrapd_wrapstars_shortcode_thankyou' );
add_shortcode( 'wrrapd_wrapstar_status', 'wrrapd_wrapstars_shortcode_status' );
add_shortcode( 'wrrapd_wrapstar_login', 'wrrapd_wrapstars_shortcode_login' );
add_shortcode( 'wrrapd_wrapstar_onboarding', 'wrrapd_wrapstars_shortcode_onboarding' );
add_shortcode( 'wrrapd_wrapstar_sign', 'wrrapd_wrapstars_shortcode_sign' );
add_shortcode( 'wrrapd_wrapstar_profile', 'wrrapd_wrapstars_shortcode_profile' );
add_shortcode( 'wrrapd_wrapstar_decline', 'wrrapd_wrapstars_shortcode_decline' );

// --- URLs ---

function wrrapd_wrapstars_apply_url( $path = '/' ) {
	$path = '/' . ltrim( (string) $path, '/' );
	return 'https://' . wrrapd_wrapstars_apply_host() . $path;
}

function wrrapd_wrapstars_pros_url( $path = '/' ) {
	$path = '/' . ltrim( (string) $path, '/' );
	return 'https://' . wrrapd_wrapstars_pros_host() . $path;
}

/** Front-end WrapStar login (approved only — not wp-login.php). */
function wrrapd_wrapstars_portal_login_url( $redirect = '', $greet = '' ) {
	$url = wrrapd_wrapstars_apply_url( '/wrapstar-login/' );
	if ( $redirect !== '' ) {
		// add_query_arg encodes — do not rawurlencode twice.
		$url = add_query_arg( 'redirect_to', $redirect, $url );
	}
	$greet = trim( (string) $greet );
	if ( $greet !== '' && strcasecmp( $greet, 'there' ) !== 0 ) {
		$url = add_query_arg( 'greet', $greet, $url );
	}
	return $url;
}

/** True for WP Administrators (manage_options) — staff only on apply/pros. */
function wrrapd_wrapstars_is_wp_administrator( $user = null ) {
	if ( $user instanceof WP_User ) {
		return user_can( $user, 'manage_options' );
	}
	return is_user_logged_in() && current_user_can( 'manage_options' );
}

/**
 * Admin bar on apply/pros: Administrators only.
 * WrapStars, Drivers, and other non-staff never see the WP bar.
 */
function wrrapd_wrapstars_hide_admin_bar( $show ) {
	if ( is_admin() || ! wrrapd_wrapstars_is_portal_host() ) {
		return $show;
	}
	// Public apply/pros pages must not reserve the 32px admin-bar gap,
	// even when an Administrator previews them. Use wp-admin to edit.
	return false;
}

/** Belt-and-suspenders for the admin bar on portal hosts. */
function wrrapd_wrapstars_force_hide_admin_bar() {
	if ( is_admin() || ! wrrapd_wrapstars_is_portal_host() ) {
		return;
	}
	show_admin_bar( false );
}

function wrrapd_wrapstars_strip_admin_bar_hooks() {
	if ( is_admin() || ! wrrapd_wrapstars_is_portal_host() ) {
		return;
	}
	remove_action( 'wp_head', '_admin_bar_bump_cb' );
	remove_action( 'wp_head', 'wp_admin_bar_header' );
	remove_action( 'wp_footer', 'wp_admin_bar_render', 1000 );
	add_filter( 'show_admin_bar', '__return_false', 100000 );
}

/**
 * Put the portal class on <html> so admin-bar margin-top:32px can be killed.
 * body.wrrapd-wrapstars-portal alone cannot override html { margin-top }.
 *
 * @param string $output language_attributes() markup.
 * @return string
 */
function wrrapd_wrapstars_language_attributes( $output ) {
	if ( is_admin() || ! wrrapd_wrapstars_is_portal_host() ) {
		return $output;
	}
	if ( str_contains( $output, 'wrrapd-wrapstars-portal' ) ) {
		return $output;
	}
	if ( preg_match( '/\bclass="/', $output ) ) {
		return preg_replace( '/\bclass="/', 'class="wrrapd-wrapstars-portal ', $output, 1 );
	}
	return trim( $output ) . ' class="wrrapd-wrapstars-portal"';
}

/**
 * Strip leading serial numbers from titles (e.g. "25. Drive with Wrrapd" → "Drive with Wrrapd").
 *
 * @param string $title Title.
 * @return string
 */
function wrrapd_wrapstars_strip_title_serial( $title ) {
	$title = html_entity_decode( (string) $title, ENT_QUOTES, 'UTF-8' );
	$title = preg_replace( '/^\s*\d+\s*[.\)\-–—:]\s*/u', '', $title );
	return trim( (string) $title );
}

/**
 * Portal site name for tabs, oEmbed, and link previews (never "My WordPress").
 *
 * @param string $name Blog name.
 * @return string
 */
function wrrapd_wrapstars_filter_blogname( $name ) {
	if ( is_admin() && ! wp_doing_ajax() ) {
		return $name;
	}
	return 'Wrrapd';
}

/**
 * @param string $desc Blog description / tagline.
 * @return string
 */
function wrrapd_wrapstars_filter_blogdescription( $desc ) {
	if ( is_admin() && ! wp_doing_ajax() ) {
		return $desc;
	}
	return 'Become a WrapStar or Drive with Wrrapd';
}

/**
 * Request path without query string (leading slash).
 *
 * @return string
 */
function wrrapd_wrapstars_request_path() {
	$uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '/';
	$path = '/' . trim( (string) strtok( $uri, '?' ), '/' );
	return ( $path === '//' || $path === '' ) ? '/' : $path;
}

/**
 * Share-card copy for a portal path (and optional page title).
 *
 * @param string $path  URL path with leading slash.
 * @param string $title Optional WP page title.
 * @return array{title:string,description:string,image:string}
 */
function wrrapd_wrapstars_social_card_for_path( $path, $title = '' ) {
	$path = '/' . trim( (string) $path, '/' );
	if ( $path === '//' || $path === '' ) {
		$path = '/';
	}
	$logo = function_exists( 'wrrapd_wrapstars_brand_logo_url' )
		? wrrapd_wrapstars_brand_logo_url()
		: 'https://wrrapd.com/wp-content/uploads/2025/03/Wrrapd_f-Logo-800-x-458-px.png';
	$wrap = 'https://apply.wrrapd.com/wp-content/uploads/2026/07/Applications_Wrrapd-mp4-image.jpg';
	$card = array(
		'title'       => 'Become a WrapStar',
		'description' => 'Wrap gifts from home and get paid for your craft. Independent gift-wrapping with Wrrapd — now accepting applications in Florida & Georgia.',
		'image'       => $wrap,
	);

	if ( preg_match( '#^/drive(/|$)#', $path ) || preg_match( '#^/driver#', $path ) ) {
		$card['title']       = 'Become a JoyRider';
		$card['description'] = 'Deliver wrapped gifts on your schedule. Apply to become a Wrrapd JoyRider — launching in Florida & Georgia.';
		$card['image']       = $logo;
	} elseif ( preg_match( '#^/thank-you(/|$)#', $path ) ) {
		$card['title']       = 'Thank you for applying';
		$card['description'] = 'We received your WrapStar application. We will be in touch within about seven days.';
		$card['image']       = $logo;
	} elseif ( preg_match( '#^/apply(/|$)#', $path ) ) {
		$card['title']       = 'Apply to become a WrapStar';
		$card['description'] = 'Start your WrapStar application — wrap beautiful gifts from home and get paid for your craft.';
		$card['image']       = $wrap;
	} elseif ( preg_match( '#^/(onboarding|login|status|profile|driver-onboarding)#', $path ) ) {
		$card['title']       = 'Wrrapd Applications';
		$card['description'] = 'WrapStar and JoyRider applications for Wrrapd.';
		$card['image']       = $logo;
	} elseif ( $path === '/' ) {
		$card['title']       = 'Become a WrapStar';
		$card['description'] = 'Wrap gifts from home and get paid for your craft. Independent gift-wrapping with Wrrapd — now accepting applications in Florida & Georgia.';
		$card['image']       = $wrap;
	} else {
		$clean = wrrapd_wrapstars_strip_title_serial( (string) $title );
		if ( $clean !== '' && stripos( $clean, 'WordPress' ) === false ) {
			$card['title'] = $clean;
		}
		$card['image'] = $logo;
	}

	if ( defined( 'WRRAPD_WRAPSTARS_OG_IMAGE' ) && WRRAPD_WRAPSTARS_OG_IMAGE !== '' ) {
		$card['image'] = (string) WRRAPD_WRAPSTARS_OG_IMAGE;
	}

	return $card;
}

/**
 * Share-card copy for the current portal request.
 *
 * @return array{title:string,description:string,image:string}
 */
function wrrapd_wrapstars_social_card() {
	$path  = wrrapd_wrapstars_request_path();
	$title = function_exists( 'get_the_title' ) ? (string) get_the_title() : '';
	if ( ( $path === '/' || ( function_exists( 'is_front_page' ) && is_front_page() ) ) ) {
		$path = '/';
	}
	return wrrapd_wrapstars_social_card_for_path( $path, $title );
}

/**
 * Open Graph / Twitter cards so shared links show the Wrrapd logo and real messaging.
 */
function wrrapd_wrapstars_output_social_meta() {
	if ( is_admin() || ! wrrapd_wrapstars_is_portal_host() ) {
		return;
	}
	$card = wrrapd_wrapstars_social_card();
	$url  = home_url( wrrapd_wrapstars_request_path() );
	if ( function_exists( 'wp_get_canonical_url' ) ) {
		$canon = wp_get_canonical_url();
		if ( is_string( $canon ) && $canon !== '' ) {
			$url = $canon;
		}
	}

	echo "\n<!-- Wrrapd portal share meta -->\n";
	echo '<meta name="description" content="' . esc_attr( $card['description'] ) . '" />' . "\n";
	echo '<meta property="og:locale" content="en_US" />' . "\n";
	echo '<meta property="og:type" content="website" />' . "\n";
	echo '<meta property="og:site_name" content="Wrrapd" />' . "\n";
	echo '<meta property="og:title" content="' . esc_attr( $card['title'] ) . '" />' . "\n";
	echo '<meta property="og:description" content="' . esc_attr( $card['description'] ) . '" />' . "\n";
	echo '<meta property="og:url" content="' . esc_url( $url ) . '" />' . "\n";
	echo '<meta property="og:image" content="' . esc_url( $card['image'] ) . '" />' . "\n";
	echo '<meta property="og:image:secure_url" content="' . esc_url( $card['image'] ) . '" />' . "\n";
	echo '<meta property="og:image:alt" content="Wrrapd" />' . "\n";
	echo '<meta name="twitter:card" content="summary_large_image" />' . "\n";
	echo '<meta name="twitter:title" content="' . esc_attr( $card['title'] ) . '" />' . "\n";
	echo '<meta name="twitter:description" content="' . esc_attr( $card['description'] ) . '" />' . "\n";
	echo '<meta name="twitter:image" content="' . esc_url( $card['image'] ) . '" />' . "\n";
	echo '<meta name="application-name" content="Wrrapd" />' . "\n";
}

/**
 * oEmbed cards used by Slack / iMessage / embeds — never "My WordPress".
 *
 * @param array   $data   Response data.
 * @param WP_Post $post   Post.
 * @param int     $width  Width.
 * @param int     $height Height.
 * @return array
 */
function wrrapd_wrapstars_oembed_response_data( $data, $post, $width, $height ) {
	if ( ! is_array( $data ) ) {
		return $data;
	}
	$path = '/';
	if ( $post instanceof WP_Post ) {
		$permalink = get_permalink( $post );
		if ( is_string( $permalink ) && $permalink !== '' ) {
			$parsed = wp_parse_url( $permalink, PHP_URL_PATH );
			if ( is_string( $parsed ) && $parsed !== '' ) {
				$path = $parsed;
			}
		}
	}
	$card                  = wrrapd_wrapstars_social_card_for_path( $path, $post instanceof WP_Post ? (string) $post->post_title : '' );
	$data['provider_name'] = 'Wrrapd';
	$data['title']         = $card['title'];
	$data['author_name']   = 'Wrrapd';
	unset( $data['author_url'] );
	if ( ! empty( $card['image'] ) ) {
		$data['thumbnail_url']    = $card['image'];
		$data['thumbnail_width']  = 800;
		$data['thumbnail_height'] = 458;
	}
	return $data;
}

/**
 * Never title portal tabs "My WordPress"; hide page-title serial numbers in the browser tab.
 *
 * @param array $parts Title parts.
 * @return array
 */
function wrrapd_wrapstars_document_title_parts( $parts ) {
	if ( ! is_array( $parts ) ) {
		return $parts;
	}
	$parts['site'] = 'Wrrapd';
	if ( isset( $parts['title'] ) && is_string( $parts['title'] ) && $parts['title'] !== '' ) {
		$parts['title'] = wrrapd_wrapstars_strip_title_serial( $parts['title'] );
		if ( $parts['title'] === '' || strcasecmp( $parts['title'], 'My WordPress' ) === 0 || stripos( $parts['title'], 'WordPress' ) !== false ) {
			$card           = wrrapd_wrapstars_social_card();
			$parts['title'] = $card['title'];
		}
	} elseif ( is_front_page() || wrrapd_wrapstars_request_path() === '/' ) {
		$parts['title'] = 'Become a WrapStar';
	}
	return $parts;
}

/** Also strip serials from single-string document titles (some themes/SEO plugins). */
function wrrapd_wrapstars_pre_get_document_title( $title ) {
	if ( ! is_string( $title ) || $title === '' || ! wrrapd_wrapstars_is_portal_host() ) {
		return $title;
	}
	// "25. Driver Apply – WrapStars" → strip serial from the page portion only.
	$bits = preg_split( '/\s+[–—|\-]\s+/u', $title, 2 );
	if ( ! is_array( $bits ) || ! isset( $bits[0] ) ) {
		$clean = wrrapd_wrapstars_strip_title_serial( $title );
	} else {
		$bits[0] = wrrapd_wrapstars_strip_title_serial( $bits[0] );
		$clean   = implode( ' – ', $bits );
	}
	if ( stripos( $clean, 'My WordPress' ) !== false || stripos( $clean, 'WordPress' ) !== false ) {
		$card = wrrapd_wrapstars_social_card();
		return $card['title'] . ' – Wrrapd';
	}
	// Prefer Wrrapd site suffix over legacy "WrapStars".
	$clean = preg_replace( '/\s+[–—]\s+WrapStars\s*$/u', ' – Wrrapd', $clean );
	return $clean;
}

/** Preferred greeting: nickname, else first name, else "there". */
function wrrapd_wrapstars_greeting_name( $app_id ) {
	$nick = trim( (string) wrrapd_wrapstars_get_meta( $app_id, 'nickname' ) );
	if ( $nick !== '' ) {
		return $nick;
	}
	$first = trim( (string) wrrapd_wrapstars_get_meta( $app_id, 'first_name' ) );
	if ( $first !== '' ) {
		return $first;
	}
	return 'there';
}

/** @return bool */
function wrrapd_wrapstars_is_onboarding_eligible_user( $user_id ) {
	return wrrapd_wrapstars_user_has_role( $user_id, 'wrapstar_approved' )
		|| wrrapd_wrapstars_user_has_role( $user_id, 'wrapstar_active' );
}

function wrrapd_wrapstars_from_email_address() {
	if ( defined( 'WRRAPD_WRAPSTARS_FROM_EMAIL' ) && WRRAPD_WRAPSTARS_FROM_EMAIL !== '' ) {
		return (string) WRRAPD_WRAPSTARS_FROM_EMAIL;
	}
	return 'admin@wrrapd.com';
}

function wrrapd_wrapstars_block_wp_login_on_portal() {
	global $pagenow;
	if ( $pagenow !== 'wp-login.php' || is_admin() ) {
		return;
	}
	if ( ! wrrapd_wrapstars_is_portal_host() ) {
		return;
	}
	$action = isset( $_REQUEST['action'] ) ? (string) $_REQUEST['action'] : '';
	// Logout, password reset, and form POSTs must never be redirected away
	// (POST often drops ?wrrapd_staff=1 from the URL — that was eating staff logins).
	if ( in_array(
		$action,
		array( 'logout', 'postpass', 'lostpassword', 'retrievepassword', 'resetpass', 'rp', 'confirmaction' ),
		true
	) ) {
		return;
	}
	if ( isset( $_SERVER['REQUEST_METHOD'] ) && strtoupper( (string) $_SERVER['REQUEST_METHOD'] ) === 'POST' ) {
		return;
	}
	// Staff login bookmark.
	if ( isset( $_GET['wrrapd_staff'] ) && (string) $_GET['wrrapd_staff'] === '1' ) {
		return;
	}
	// Visiting /wp-admin/ while logged out → WP adds redirect_to=…/wp-admin/ — allow that form.
	$redirect_to = isset( $_REQUEST['redirect_to'] ) ? (string) wp_unslash( $_REQUEST['redirect_to'] ) : '';
	if ( $redirect_to !== '' && strpos( $redirect_to, '/wp-admin' ) !== false ) {
		return;
	}
	if ( wrrapd_wrapstars_is_wp_administrator() ) {
		return;
	}
	wp_safe_redirect( wrrapd_wrapstars_apply_url( '/' ) );
	exit;
}

/** @return bool */
function wrrapd_wrapstars_is_wrapstar_user( $user_id ) {
	$user = get_userdata( $user_id );
	if ( ! $user ) {
		return false;
	}
	foreach ( array( 'wrapstar_applicant', 'wrapstar_approved', 'wrapstar_active' ) as $role ) {
		if ( in_array( $role, (array) $user->roles, true ) ) {
			return true;
		}
	}
	return false;
}

function wrrapd_wrapstars_portal_redirect_for_user( $user_id ) {
	if ( wrrapd_wrapstars_is_onboarding_eligible_user( $user_id ) ) {
		return wrrapd_wrapstars_pros_url( '/onboarding/' );
	}
	return wrrapd_wrapstars_apply_url( '/' );
}

/** @return bool */
function wrrapd_wrapstars_user_must_change_password( $user_id ) {
	$user_id = (int) $user_id;
	if ( ! $user_id ) {
		return false;
	}
	if ( get_user_meta( $user_id, '_wrrapd_ws_must_change_password', true ) === '1' ) {
		return true;
	}
	$app = wrrapd_wrapstars_get_application_by_user( $user_id );
	if ( ! $app ) {
		return false;
	}
	return wrrapd_wrapstars_get_meta( $app->ID, 'must_change_password' ) === '1';
}

function wrrapd_wrapstars_set_must_change_password( $user_id, $app_id, $required ) {
	$flag = $required ? '1' : '';
	if ( $user_id ) {
		if ( $required ) {
			update_user_meta( (int) $user_id, '_wrrapd_ws_must_change_password', '1' );
		} else {
			delete_user_meta( (int) $user_id, '_wrrapd_ws_must_change_password' );
		}
	}
	if ( $app_id ) {
		wrrapd_wrapstars_set_meta( (int) $app_id, 'must_change_password', $flag );
	}
}

/**
 * Readable temporary password for approval emails (must be changed on first login).
 * Example: Wrap4827K!
 */
function wrrapd_wrapstars_generate_temp_password() {
	return 'Wrap' . (string) wp_rand( 1000, 9999 ) . chr( wp_rand( 65, 90 ) ) . '!';
}

function wrrapd_wrapstars_admin_notify_email() {
	if ( defined( 'WRRAPD_WRAPSTARS_ADMIN_EMAIL' ) && WRRAPD_WRAPSTARS_ADMIN_EMAIL !== '' ) {
		return (string) WRRAPD_WRAPSTARS_ADMIN_EMAIL;
	}
	return 'admin@wrrapd.com';
}

/**
 * Only WP Administrators may use wp-admin on apply/pros.
 * WrapStars, Drivers, and everyone else are sent to the portal front end.
 */
function wrrapd_wrapstars_block_wrapstar_wp_admin() {
	if ( wp_doing_ajax() || ! is_user_logged_in() || current_user_can( 'manage_options' ) ) {
		return;
	}
	$user_id = get_current_user_id();
	if ( function_exists( 'wrrapd_drivers_is_driver_user' ) && wrrapd_drivers_is_driver_user( $user_id ) ) {
		wp_safe_redirect( wrrapd_drivers_portal_redirect_for_user( $user_id ) );
		exit;
	}
	if ( wrrapd_wrapstars_is_wrapstar_user( $user_id ) || wrrapd_wrapstars_is_onboarding_eligible_user( $user_id ) ) {
		wp_safe_redirect( wrrapd_wrapstars_portal_redirect_for_user( $user_id ) );
		exit;
	}
	wp_safe_redirect( wrrapd_wrapstars_apply_url( '/' ) );
	exit;
}

function wrrapd_wrapstars_login_redirect( $redirect_to, $requested_redirect_to, $user ) {
	if ( is_wp_error( $user ) || ! $user instanceof WP_User ) {
		return $redirect_to;
	}
	// Administrators → always land in wp-admin (staff dashboard).
	if ( user_can( $user, 'manage_options' ) ) {
		foreach ( array( $requested_redirect_to, $redirect_to ) as $url ) {
			if ( is_string( $url ) && $url !== '' && strpos( $url, '/wp-admin' ) !== false ) {
				return $url;
			}
		}
		return admin_url();
	}
	// Non-staff must never enter wp-admin.
	foreach ( array( $requested_redirect_to, $redirect_to ) as $url ) {
		if ( is_string( $url ) && $url !== '' && strpos( $url, '/wp-admin' ) !== false ) {
			if ( function_exists( 'wrrapd_drivers_is_onboarding_eligible_user' ) && wrrapd_drivers_is_onboarding_eligible_user( $user->ID ) ) {
				return wrrapd_drivers_portal_redirect_for_user( $user->ID );
			}
			if ( wrrapd_wrapstars_is_onboarding_eligible_user( $user->ID ) || wrrapd_wrapstars_is_wrapstar_user( $user->ID ) ) {
				return wrrapd_wrapstars_portal_redirect_for_user( $user->ID );
			}
			return wrrapd_wrapstars_apply_url( '/' );
		}
	}
	if ( wrrapd_wrapstars_is_onboarding_eligible_user( $user->ID ) ) {
		if ( $requested_redirect_to !== '' && strpos( $requested_redirect_to, 'apply.wrrapd.com' ) !== false ) {
			return $requested_redirect_to;
		}
		return wrrapd_wrapstars_portal_redirect_for_user( $user->ID );
	}
	return $redirect_to;
}

function wrrapd_wrapstars_onboarding_step_url( $step ) {
	$step     = wrrapd_wrapstars_normalize_step_key( $step );
	$registry = wrrapd_wrapstars_onboarding_step_registry();
	$path     = isset( $registry[ $step ] ) ? $registry[ $step ]['path'] : '/onboarding/';
	return wrrapd_wrapstars_pros_url( $path );
}

// --- Roles ---

function wrrapd_wrapstars_register_roles() {
	if ( ! get_role( 'wrapstar_applicant' ) ) {
		add_role( 'wrapstar_applicant', 'WrapStar Applicant', array( 'read' => true ) );
	}
	if ( ! get_role( 'wrapstar_approved' ) ) {
		add_role( 'wrapstar_approved', 'WrapStar Approved', array( 'read' => true ) );
	}
	if ( ! get_role( 'wrapstar_declined' ) ) {
		add_role( 'wrapstar_declined', 'WrapStar Declined Offer', array( 'read' => true ) );
	}
	if ( ! get_role( 'wrapstar_active' ) ) {
		add_role( 'wrapstar_active', 'WrapStar Active', array( 'read' => true ) );
	}
}

function wrrapd_wrapstars_user_has_role( $user_id, $role ) {
	$user = get_userdata( $user_id );
	return $user && in_array( $role, (array) $user->roles, true );
}

function wrrapd_wrapstars_set_user_role( $user_id, $role ) {
	$user = new WP_User( $user_id );
	$user->set_role( $role );
}

// --- CPT ---

function wrrapd_wrapstars_register_cpt() {
	register_post_type(
		WRRAPD_WRAPSTARS_CPT,
		array(
			'labels'              => array(
				'name'          => 'WrapStar Applications',
				'singular_name' => 'WrapStar Application',
			),
			'public'              => false,
			'show_ui'             => true,
			'show_in_menu'        => false,
			'capability_type'     => 'post',
			'map_meta_cap'        => true,
			'supports'            => array( 'title' ),
			'has_archive'           => false,
		)
	);
}

// --- Meta helpers ---

function wrrapd_wrapstars_meta_keys() {
	return array(
		'status'              => 'under_review',
		'user_id'             => 0,
		'full_name'           => '',
		'first_name'          => '',
		'nickname'            => '',
		'middle_name'         => '',
		'last_name'           => '',
		'email'               => '',
		'phone'               => '',
		'phone_mobile'        => '',
		'phone_work'          => '',
		'address_line1'       => '',
		'address_line2'       => '',
		'city'                => '',
		'state'               => '',
		'postal_code'         => '',
		'has_mailing_address' => '',
		'comfortable_reship'  => '',
		'wrrapd_po_daily_pickup' => '',
		'dedicated_wrap_workspace' => '',
		'comfortable_video_monitoring' => '',
		'delivery_proof_ready' => '',
		'has_vehicle'         => '',
		'can_deliver'         => '',
		'delivery_max_distance' => '',
		'has_large_format_printer' => '',
		'printer_size'        => '',
		'clean_driving_record'  => '',
		'gift_wrapping_experience' => '',
		'gig_platforms'       => '',
		'gig_platforms_other' => '',
		'business_structure'  => '',
		'business_structure_note' => '',
		'bank_account_ready'  => '',
		'ack_background_check' => '',
		'gig_experience'      => '',
		'why_wrapstar'        => '',
		'id_file'             => '',
		'ack_video'           => '',
		'ack_contact'         => '',
		'ack_zoom_interview'  => '',
		'fit_score'           => '',
		'fit_score_breakdown' => '',
		'experience_score_rationale' => '',
		'commitment_score_rationale' => '',
		'admin_notes'         => '',
		'gcs_profile_path'    => '',
		'profile_synced_at'   => '',
		'profile_local_path'  => '',
		'tier'                => 'new',
		'suspended'           => '0',
		'suspended_at'        => '',
		'unsuspended_at'      => '',
		'notes_updated_at'    => '',
		'reset_at'            => '',
		'onboarding_step'     => 'welcome',
		'step_welcome'        => '',
		'step_agreement'      => '',
		'step_policies'       => '',
		'step_orientation'    => '',
		'step_background'     => '',
		'step_insurance'      => '',
		'step_identity'       => '',
		'step_workspace'      => '',
		'step_po_box'         => '', // legacy alias of step_workspace
		'step_w9'             => '',
		'step_tax_1099'       => '',
		'step_bank_payout'    => '',
		'step_activation'     => '',
		'boldsign_ic_doc_id'  => '',
		'boldsign_w9_doc_id'  => '',
		'boldsign_ic_signed'  => '',
		'boldsign_w9_signed'  => '',
		// Policies (step `policies`)
		'policies_ack_sections' => '',
		'policies_ack_at'     => '',
		'policies_signature'  => '',
		// Background check (step `background`)
		'bg_legal_name'       => '',
		'bg_other_names'      => '',
		'bg_consent_at'       => '',
		'bg_signature'        => '',
		'bg_status'           => '', // ops: pending|clear|review
		// Identity (step `identity`)
		'identity_selfie_file' => '',
		'identity_confirmed_at' => '',
		// Insurance (step `insurance`)
		'insurance_file'      => '',
		'insurance_carrier'   => '',
		'insurance_expires'   => '',
		// Wrapping location & handoff (step `workspace`)
		'workspace_address'   => '',
		'workspace_access_notes' => '',
		'workspace_windows'   => '', // comma list: weekday_morning, weekday_midday, weekday_afternoon, weekday_evening, saturday, sunday
		'workspace_photo_file' => '',
		'po_box_address'      => '', // legacy
		'po_box_file'         => '', // legacy
		// Tax acknowledgments (step `tax_1099`)
		'tax_ack_at'          => '',
		'tax_ack_signature'   => '',
		'tax_e_delivery'      => '',
		// Payout setup (step `bank_payout`)
		'payout_method'       => '', // connect|direct_deposit
		'payout_holder_name'  => '',
		'payout_bank_name'    => '',
		'payout_account_type' => '',
		'payout_routing'      => '',
		'payout_account_last4' => '',
		'payout_proof_file'   => '',
		'payout_submitted_at' => '',
		'orientation_score'   => '',
		'submitted_at'        => '',
		'interview_at'        => '',
		'interview_skipped'   => '',
		'interview_skipped_at'=> '',
		'approved_at'         => '',
		'activated_at'        => '',
		'rejected_at'         => '',
		'reject_reason'       => '',
		'declined_at'         => '',
		'decline_token'       => '',
		'decline_note'        => '',
		'previous_declined_at'=> '',
		'reinvited_at'        => '',
		'reinvite_count'      => '0',
		'must_change_password'=> '',
		'portal_password_issued_at' => '',
		'invite_expires_at'   => '',
		'invite_expired_at'   => '',
	);
}

/**
 * Format a stored ISO hire stamp for WP Admin (site timezone).
 *
 * @param string $iso UTC/ISO timestamp.
 * @return string
 */
function wrrapd_wrapstars_format_admin_stamp( $iso ) {
	$iso = trim( (string) $iso );
	if ( $iso === '' ) {
		return '';
	}
	$ts = strtotime( $iso );
	if ( ! $ts ) {
		return $iso;
	}
	return wp_date( 'M j, Y, g:i A T', $ts );
}

/**
 * Print hire date/time rows on a WP Admin application card.
 *
 * @param int $id Application post ID.
 */
function wrrapd_wrapstars_admin_echo_hire_timeline( $id ) {
	$id   = (int) $id;
	$rows = array(
		'Application submitted' => wrrapd_wrapstars_get_meta( $id, 'submitted_at' ),
		'Interview requested'   => wrrapd_wrapstars_get_meta( $id, 'interview_at' ),
		'Interview skipped'     => wrrapd_wrapstars_get_meta( $id, 'interview_skipped_at' ),
		'Approved'              => wrrapd_wrapstars_get_meta( $id, 'approved_at' ),
		'Login invite sent'     => wrrapd_wrapstars_get_meta( $id, 'portal_password_issued_at' ),
		'Invite expires'        => function_exists( 'wrrapd_wrapstars_get_invite_expires_at' ) ? wrrapd_wrapstars_get_invite_expires_at( $id ) : wrrapd_wrapstars_get_meta( $id, 'invite_expires_at' ),
		'Invite expired'        => wrrapd_wrapstars_get_meta( $id, 'invite_expired_at' ),
		'Activated'             => wrrapd_wrapstars_get_meta( $id, 'activated_at' ),
		'Rejected'              => wrrapd_wrapstars_get_meta( $id, 'rejected_at' ),
		'Offer declined'        => wrrapd_wrapstars_get_meta( $id, 'declined_at' ),
		'Previous decline'      => wrrapd_wrapstars_get_meta( $id, 'previous_declined_at' ),
		'Reinvited'             => wrrapd_wrapstars_get_meta( $id, 'reinvited_at' ),
		'Suspended'             => wrrapd_wrapstars_get_meta( $id, 'suspended_at' ),
		'Unsuspended'           => wrrapd_wrapstars_get_meta( $id, 'unsuspended_at' ),
		'Notes updated'         => wrrapd_wrapstars_get_meta( $id, 'notes_updated_at' ),
		'Reset to review'       => wrrapd_wrapstars_get_meta( $id, 'reset_at' ),
	);
	echo '<h3>Hire dates</h3><table class="widefat" style="max-width:560px;margin:8px 0;"><tbody>';
	$any = false;
	foreach ( $rows as $label => $iso ) {
		$fmt = wrrapd_wrapstars_format_admin_stamp( $iso );
		if ( $fmt === '' ) {
			continue;
		}
		$any = true;
		echo '<tr><td>' . esc_html( $label ) . '</td><td><strong>' . esc_html( $fmt ) . '</strong></td></tr>';
	}
	if ( ! $any ) {
		echo '<tr><td colspan="2">No hire timestamps yet.</td></tr>';
	}
	echo '</tbody></table>';
}

/**
 * Seconds the approval onboarding link / temp password remain valid.
 *
 * @return int
 */
function wrrapd_wrapstars_invite_ttl_seconds() {
	$days = defined( 'WRRAPD_WRAPSTARS_INVITE_TTL_DAYS' ) ? (int) WRRAPD_WRAPSTARS_INVITE_TTL_DAYS : 15;
	if ( $days < 1 ) {
		$days = 15;
	}
	return $days * DAY_IN_SECONDS;
}

/**
 * ISO expiry for an approved invitation (explicit meta, else issued/approved + TTL).
 *
 * @param int $app_id Application post ID.
 * @return string Empty when unknown.
 */
function wrrapd_wrapstars_get_invite_expires_at( $app_id ) {
	$app_id   = (int) $app_id;
	$explicit = (string) wrrapd_wrapstars_get_meta( $app_id, 'invite_expires_at' );
	if ( $explicit !== '' ) {
		return $explicit;
	}
	$issued = (string) wrrapd_wrapstars_get_meta( $app_id, 'portal_password_issued_at' );
	if ( $issued === '' ) {
		$issued = (string) wrrapd_wrapstars_get_meta( $app_id, 'approved_at' );
	}
	if ( $issued === '' ) {
		return '';
	}
	$ts = strtotime( $issued );
	if ( ! $ts ) {
		return '';
	}
	return gmdate( 'c', $ts + wrrapd_wrapstars_invite_ttl_seconds() );
}

/**
 * True when status is approved (onboarding) and the invite window has passed.
 * Activated WrapStars are never blocked by invite expiry.
 *
 * @param int $app_id Application post ID.
 * @return bool
 */
function wrrapd_wrapstars_invite_is_expired( $app_id ) {
	$app_id = (int) $app_id;
	if ( ! $app_id ) {
		return false;
	}
	$status = (string) wrrapd_wrapstars_get_meta( $app_id, 'status' );
	if ( $status !== 'approved' ) {
		return false;
	}
	$expires = wrrapd_wrapstars_get_invite_expires_at( $app_id );
	if ( $expires === '' ) {
		return false;
	}
	$ts = strtotime( $expires );
	return $ts && time() > $ts;
}

/**
 * Invalidate an expired invitation: clear decline token and scramble portal password.
 *
 * @param int $app_id Application post ID.
 */
function wrrapd_wrapstars_invalidate_expired_invite( $app_id ) {
	$app_id = (int) $app_id;
	if ( ! $app_id || (string) wrrapd_wrapstars_get_meta( $app_id, 'status' ) !== 'approved' ) {
		return;
	}
	if ( (string) wrrapd_wrapstars_get_meta( $app_id, 'invite_expired_at' ) === '' ) {
		wrrapd_wrapstars_set_meta( $app_id, 'invite_expired_at', gmdate( 'c' ) );
	}
	wrrapd_wrapstars_set_meta( $app_id, 'decline_token', '' );
	$user_id = (int) wrrapd_wrapstars_get_meta( $app_id, 'user_id' );
	if ( $user_id && get_userdata( $user_id ) ) {
		wp_set_password( wp_generate_password( 32, true, true ), $user_id );
	}
}

/**
 * If the logged-in user's approved invite has expired, invalidate it and log them out.
 *
 * @param int $user_id User ID.
 * @return bool True when the invite was expired (caller should redirect).
 */
function wrrapd_wrapstars_enforce_active_invite_or_logout( $user_id ) {
	$user_id = (int) $user_id;
	if ( ! $user_id ) {
		return false;
	}
	$app = wrrapd_wrapstars_get_application_by_user( $user_id );
	if ( ! $app || ! wrrapd_wrapstars_invite_is_expired( $app->ID ) ) {
		return false;
	}
	wrrapd_wrapstars_invalidate_expired_invite( $app->ID );
	wp_logout();
	return true;
}

function wrrapd_wrapstars_get_meta( $post_id, $key, $default = '' ) {
	$val = get_post_meta( $post_id, '_wrrapd_ws_' . $key, true );
	return $val !== '' && $val !== false ? $val : $default;
}

function wrrapd_wrapstars_set_meta( $post_id, $key, $value ) {
	update_post_meta( $post_id, '_wrrapd_ws_' . $key, $value );
}

function wrrapd_wrapstars_get_application_by_user( $user_id ) {
	$posts = get_posts(
		array(
			'post_type'      => WRRAPD_WRAPSTARS_CPT,
			'posts_per_page' => 1,
			'meta_key'       => '_wrrapd_ws_user_id',
			'meta_value'     => (string) $user_id,
			'post_status'    => 'publish',
		)
	);
	return $posts ? $posts[0] : null;
}

function wrrapd_wrapstars_get_application_by_email( $email ) {
	$posts = get_posts(
		array(
			'post_type'      => WRRAPD_WRAPSTARS_CPT,
			'posts_per_page' => 1,
			'meta_key'       => '_wrrapd_ws_email',
			'meta_value'     => strtolower( trim( $email ) ),
			'post_status'    => 'publish',
		)
	);
	return $posts ? $posts[0] : null;
}

function wrrapd_wrapstars_step_complete( $post_id, $step ) {
	$step = wrrapd_wrapstars_normalize_step_key( $step );
	$val  = wrrapd_wrapstars_get_meta( $post_id, 'step_' . $step );
	if ( $val === '1' || $val === 1 ) {
		return true;
	}
	// Legacy: WrapStars who finished the old "PO Box" step keep credit for "workspace".
	if ( $step === 'workspace' ) {
		$legacy = wrrapd_wrapstars_get_meta( $post_id, 'step_po_box' );
		return $legacy === '1' || $legacy === 1;
	}
	return false;
}

function wrrapd_wrapstars_mark_step_complete( $post_id, $step ) {
	wrrapd_wrapstars_set_meta( $post_id, 'step_' . $step, '1' );
	$steps = array_keys( wrrapd_wrapstars_onboarding_steps() );
	$idx   = array_search( $step, $steps, true );
	if ( $idx !== false && isset( $steps[ $idx + 1 ] ) ) {
		wrrapd_wrapstars_set_meta( $post_id, 'onboarding_step', $steps[ $idx + 1 ] );
	}
}

function wrrapd_wrapstars_can_access_step( $post_id, $step ) {
	$steps = array_keys( wrrapd_wrapstars_onboarding_steps() );
	$idx   = array_search( $step, $steps, true );
	if ( $idx === false ) {
		return false;
	}
	for ( $i = 0; $i < $idx; $i++ ) {
		if ( ! wrrapd_wrapstars_step_complete( $post_id, $steps[ $i ] ) ) {
			return false;
		}
	}
	return true;
}

// --- Private file storage ---

function wrrapd_wrapstars_files_base_dir() {
	$dir = WP_CONTENT_DIR . '/wrapstars-private';
	if ( ! is_dir( $dir ) ) {
		wp_mkdir_p( $dir );
		$htaccess = $dir . '/.htaccess';
		if ( ! file_exists( $htaccess ) ) {
			file_put_contents( $htaccess, "Deny from all\n" );
		}
		$index = $dir . '/index.php';
		if ( ! file_exists( $index ) ) {
			file_put_contents( $index, "<?php\n// Silence.\n" );
		}
	}
	return $dir;
}

function wrrapd_wrapstars_app_dir( $app_id ) {
	$dir = wrrapd_wrapstars_files_base_dir() . '/' . (int) $app_id;
	wp_mkdir_p( $dir );
	return $dir;
}

/**
 * @param int    $app_id Application post id.
 * @param string $field  Form field name.
 * @param array  $allowed Allowed extensions.
 * @return array{ok:bool,path?:string,error?:string}
 */
function wrrapd_wrapstars_handle_upload( $app_id, $field, $allowed = array( 'jpg', 'jpeg', 'png', 'pdf' ) ) {
	if ( empty( $_FILES[ $field ]['name'] ) ) {
		return array( 'ok' => false, 'error' => 'No file uploaded.' );
	}
	$file = $_FILES[ $field ];
	if ( ! empty( $file['error'] ) ) {
		return array( 'ok' => false, 'error' => 'Upload error.' );
	}
	$ext = strtolower( pathinfo( $file['name'], PATHINFO_EXTENSION ) );
	if ( ! in_array( $ext, $allowed, true ) ) {
		return array( 'ok' => false, 'error' => 'File type not allowed.' );
	}
	if ( $file['size'] > 10 * 1024 * 1024 ) {
		return array( 'ok' => false, 'error' => 'File too large (max 10 MB).' );
	}
	$dest_name = $field . '_' . time() . '.' . $ext;
	$dest      = wrrapd_wrapstars_app_dir( $app_id ) . '/' . $dest_name;
	if ( ! move_uploaded_file( $file['tmp_name'], $dest ) ) {
		return array( 'ok' => false, 'error' => 'Could not save file.' );
	}
	wrrapd_wrapstars_maybe_mirror_upload_to_gcs( $app_id, $dest, $dest_name );
	return array( 'ok' => true, 'path' => $dest );
}

/**
 * Stage uploads on SiteGround, mirror to GCS when configured (saves VM disk).
 *
 * wp-config.php (Phase 2):
 *   define( 'WRRAPD_WRAPSTARS_GCS_UPLOAD_URL', 'https://…/api/wrapstars/upload' );
 *   define( 'WRRAPD_WRAPSTARS_GCS_UPLOAD_SECRET', '…' );
 */
function wrrapd_wrapstars_maybe_mirror_upload_to_gcs( $app_id, $local_path, $filename ) {
	if ( ! defined( 'WRRAPD_WRAPSTARS_GCS_UPLOAD_URL' ) || WRRAPD_WRAPSTARS_GCS_UPLOAD_URL === '' ) {
		return;
	}
	if ( ! is_readable( $local_path ) ) {
		return;
	}
	$body = file_get_contents( $local_path );
	if ( $body === false ) {
		return;
	}
	$headers = array( 'Content-Type' => 'application/octet-stream' );
	if ( defined( 'WRRAPD_WRAPSTARS_GCS_UPLOAD_SECRET' ) && WRRAPD_WRAPSTARS_GCS_UPLOAD_SECRET !== '' ) {
		$headers['X-Wrrapd-Upload-Secret'] = (string) WRRAPD_WRAPSTARS_GCS_UPLOAD_SECRET;
	}
	$response = wp_remote_post(
		add_query_arg(
			array(
				'app_id'   => (int) $app_id,
				'filename' => $filename,
			),
			WRRAPD_WRAPSTARS_GCS_UPLOAD_URL
		),
		array(
			'timeout' => 30,
			'headers' => $headers,
			'body'    => $body,
		)
	);
	if ( is_wp_error( $response ) ) {
		return;
	}
	$code = (int) wp_remote_retrieve_response_code( $response );
	if ( $code >= 200 && $code < 300 ) {
		$json = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		if ( is_array( $json ) && ! empty( $json['gcs_path'] ) ) {
			wrrapd_wrapstars_set_meta( (int) $app_id, 'gcs_' . preg_replace( '/[^a-z0-9_]/', '', strtolower( $filename ) ), (string) $json['gcs_path'] );
		}
	}
}

// --- Host routing ---

function wrrapd_wrapstars_host_routing() {
	if ( is_admin() ) {
		return;
	}
	$uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '/';
	$path = strtok( $uri, '?' );
	$path = '/' . trim( $path, '/' );
	if ( $path === '/' ) {
		$path = '/';
	}

	if ( wrrapd_wrapstars_unified_host() ) {
		if ( preg_match( '#^/onboarding#', $path ) ) {
			if ( ! is_user_logged_in() || ! wrrapd_wrapstars_is_onboarding_eligible_user( get_current_user_id() ) ) {
				wp_safe_redirect( wrrapd_wrapstars_portal_login_url( wrrapd_wrapstars_apply_url( $path ) ) );
				exit;
			}
			if ( wrrapd_wrapstars_enforce_active_invite_or_logout( get_current_user_id() ) ) {
				wp_safe_redirect(
					add_query_arg(
						'invite_expired',
						'1',
						wrrapd_wrapstars_portal_login_url( wrrapd_wrapstars_apply_url( $path ) )
					)
				);
				exit;
			}
		}
		if ( preg_match( '#^/(wrapstar-login|login)(/|$)#', $path ) ) {
			if ( is_user_logged_in() && wrrapd_wrapstars_is_onboarding_eligible_user( get_current_user_id() ) ) {
				if ( wrrapd_wrapstars_enforce_active_invite_or_logout( get_current_user_id() ) ) {
					wp_safe_redirect(
						add_query_arg( 'invite_expired', '1', wrrapd_wrapstars_portal_login_url() )
					);
					exit;
				}
				wp_safe_redirect( wrrapd_wrapstars_portal_redirect_for_user( get_current_user_id() ) );
				exit;
			}
		}
		if ( preg_match( '#^/dashboard(/|$)#', $path ) ) {
			wp_safe_redirect( wrrapd_wrapstars_apply_url( '/thank-you/' ) );
			exit;
		}
		return;
	}

	if ( wrrapd_wrapstars_is_apply_host() ) {
		if ( preg_match( '#^/onboarding#', $path ) ) {
			wp_safe_redirect( wrrapd_wrapstars_pros_url( $path ) );
			exit;
		}
		if ( preg_match( '#^/(wrapstar-login|login)(/|$)#', $path ) && is_user_logged_in() && wrrapd_wrapstars_is_onboarding_eligible_user( get_current_user_id() ) ) {
			if ( wrrapd_wrapstars_enforce_active_invite_or_logout( get_current_user_id() ) ) {
				wp_safe_redirect(
					add_query_arg( 'invite_expired', '1', wrrapd_wrapstars_portal_login_url() )
				);
				exit;
			}
			wp_safe_redirect( wrrapd_wrapstars_portal_redirect_for_user( get_current_user_id() ) );
			exit;
		}
		if ( preg_match( '#^/dashboard(/|$)#', $path ) ) {
			wp_safe_redirect( wrrapd_wrapstars_apply_url( '/thank-you/' ) );
			exit;
		}
		return;
	}

	if ( wrrapd_wrapstars_is_pros_host() ) {
		if ( preg_match( '#^/(apply|dashboard|thank-you|decline-offer)(/|$)#', $path ) ) {
			wp_safe_redirect( wrrapd_wrapstars_apply_url( $path ) );
			exit;
		}
		if ( preg_match( '#^/(wrapstar-login|login)(/|$)#', $path ) ) {
			wp_safe_redirect( wrrapd_wrapstars_apply_url( '/wrapstar-login/' ) );
			exit;
		}
		if ( preg_match( '#^/onboarding#', $path ) ) {
			if ( ! is_user_logged_in() || ! wrrapd_wrapstars_is_onboarding_eligible_user( get_current_user_id() ) ) {
				wp_safe_redirect( wrrapd_wrapstars_portal_login_url( wrrapd_wrapstars_pros_url( $path ) ) );
				exit;
			}
			if ( wrrapd_wrapstars_enforce_active_invite_or_logout( get_current_user_id() ) ) {
				wp_safe_redirect(
					add_query_arg(
						'invite_expired',
						'1',
						wrrapd_wrapstars_portal_login_url( wrrapd_wrapstars_pros_url( $path ) )
					)
				);
				exit;
			}
		}
	}
}

/**
 * Dedicated confirmation pages must never show the landing / apply form.
 * The live /thank-you/ page was a WordPress page titled "Thank you!" that still
 * contained [wrrapd_wrapstar_landing]. This filter wins regardless of Elementor.
 *
 * @param string $content Existing page content.
 * @return string
 */
function wrrapd_wrapstars_force_path_shortcode_content( $content ) {
	if ( is_admin() || ! wrrapd_wrapstars_is_portal_host() ) {
		return $content;
	}
	$path = wrrapd_wrapstars_request_path();
	if ( preg_match( '#^/thank-you(/|$)#', $path ) ) {
		return do_shortcode( '[wrrapd_wrapstar_thankyou]' );
	}
	return $content;
}

function wrrapd_wrapstars_body_class( $classes ) {
	$classes[] = 'wrrapd-wrapstars-portal';
	if ( wrrapd_wrapstars_is_apply_host() ) {
		$classes[] = 'wrrapd-wrapstars-apply-host';
	}
	if ( wrrapd_wrapstars_is_pros_host() ) {
		$classes[] = 'wrrapd-wrapstars-pros-host';
	}
	$uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '';
	if ( str_contains( $uri, '/onboarding' ) ) {
		$classes[] = 'wrrapd-wrapstars-onboarding-host';
	}
	if ( preg_match( '#/(thank-you|driver-thank-you)(/|$)#', $uri ) ) {
		$classes[] = 'wrrapd-wrapstars-thankyou-host';
	}
	return $classes;
}

/** @return string */
function wrrapd_wrapstars_google_places_api_key() {
	if ( defined( 'WRRAPD_WRAPSTARS_GOOGLE_PLACES_API_KEY' ) && WRRAPD_WRAPSTARS_GOOGLE_PLACES_API_KEY !== '' ) {
		return (string) WRRAPD_WRAPSTARS_GOOGLE_PLACES_API_KEY;
	}
	if ( defined( 'WRRAPD_GOOGLE_PLACES_API_KEY' ) && WRRAPD_GOOGLE_PLACES_API_KEY !== '' ) {
		return (string) WRRAPD_GOOGLE_PLACES_API_KEY;
	}
	// Same key as checkout.html — browser calls use WP proxy; add https://apply.wrrapd.com/* for direct client use.
	return 'AIzaSyDpZREUIh84APl6ivKxWxM6zENaVJZvmo4';
}

/** Referer sent on server-side Google Places/Address requests (key allows pay.wrrapd.com). */
function wrrapd_wrapstars_google_places_proxy_referer() {
	if ( defined( 'WRRAPD_WRAPSTARS_GOOGLE_PLACES_PROXY_REFERER' ) && WRRAPD_WRAPSTARS_GOOGLE_PLACES_PROXY_REFERER !== '' ) {
		return (string) WRRAPD_WRAPSTARS_GOOGLE_PLACES_PROXY_REFERER;
	}
	return 'https://pay.wrrapd.com/';
}

/** @return array<string, string> */
function wrrapd_wrapstars_google_places_request_headers() {
	return array(
		'Content-Type' => 'application/json',
		'X-Goog-Api-Key' => wrrapd_wrapstars_google_places_api_key(),
		'Referer'        => wrrapd_wrapstars_google_places_proxy_referer(),
	);
}

function wrrapd_wrapstars_ajax_places_autocomplete() {
	check_ajax_referer( 'wrrapd_ws_places', 'nonce' );
	if ( ! wrrapd_wrapstars_is_apply_host() ) {
		wp_send_json_error( array( 'message' => 'Forbidden' ), 403 );
	}
	$input = sanitize_text_field( wp_unslash( $_GET['input'] ?? '' ) );
	if ( strlen( $input ) < 2 ) {
		wp_send_json_success( array( 'predictions' => array() ) );
	}
	$response = wp_remote_post(
		'https://places.googleapis.com/v1/places:autocomplete',
		array(
			'headers' => wrrapd_wrapstars_google_places_request_headers(),
			'body'    => wp_json_encode(
				array(
					'input'                 => $input,
					'includedRegionCodes'   => array( 'us' ),
				)
			),
			'timeout' => 10,
		)
	);
	if ( is_wp_error( $response ) ) {
		wp_send_json_success( array( 'predictions' => array() ) );
	}
	$data = json_decode( (string) wp_remote_retrieve_body( $response ), true );
	if ( ! is_array( $data ) || empty( $data['suggestions'] ) ) {
		wp_send_json_success( array( 'predictions' => array() ) );
	}
	$predictions = array();
	foreach ( $data['suggestions'] as $suggestion ) {
		$prediction = $suggestion['placePrediction'] ?? array();
		$place_id   = (string) ( $prediction['placeId'] ?? '' );
		$text       = (string) ( $prediction['text']['text'] ?? '' );
		if ( $place_id === '' || $text === '' ) {
			continue;
		}
		$predictions[] = array(
			'description' => $text,
			'placeId'     => $place_id,
		);
	}
	wp_send_json_success( array( 'predictions' => $predictions ) );
}

function wrrapd_wrapstars_ajax_places_details() {
	check_ajax_referer( 'wrrapd_ws_places', 'nonce' );
	if ( ! wrrapd_wrapstars_is_apply_host() ) {
		wp_send_json_error( array( 'message' => 'Forbidden' ), 403 );
	}
	$place_id = sanitize_text_field( wp_unslash( $_GET['place_id'] ?? '' ) );
	if ( $place_id === '' ) {
		wp_send_json_error( array( 'message' => 'Missing place id' ), 400 );
	}
	$url      = 'https://places.googleapis.com/v1/places/' . rawurlencode( $place_id ) . '?fields=addressComponents';
	$response = wp_remote_get(
		$url,
		array(
			'headers' => wrrapd_wrapstars_google_places_request_headers(),
			'timeout' => 10,
		)
	);
	if ( is_wp_error( $response ) ) {
		wp_send_json_error( array( 'message' => 'Details unavailable' ), 502 );
	}
	$data = json_decode( (string) wp_remote_retrieve_body( $response ), true );
	if ( ! is_array( $data ) || empty( $data['addressComponents'] ) ) {
		wp_send_json_error( array( 'message' => 'Details unavailable' ), 502 );
	}
	wp_send_json_success( array( 'addressComponents' => $data['addressComponents'] ) );
}

function wrrapd_wrapstars_ajax_validate_address() {
	check_ajax_referer( 'wrrapd_ws_places', 'nonce' );
	if ( ! wrrapd_wrapstars_is_apply_host() ) {
		wp_send_json_error( array( 'message' => 'Forbidden' ), 403 );
	}
	$raw = file_get_contents( 'php://input' );
	$body = is_string( $raw ) ? json_decode( $raw, true ) : null;
	if ( ! is_array( $body ) ) {
		wp_send_json_error( array( 'message' => 'Invalid request' ), 400 );
	}
	$line1 = sanitize_text_field( wp_unslash( (string) ( $body['line1'] ?? '' ) ) );
	$line2 = sanitize_text_field( wp_unslash( (string) ( $body['line2'] ?? '' ) ) );
	$city  = sanitize_text_field( wp_unslash( (string) ( $body['city'] ?? '' ) ) );
	$state = strtoupper( sanitize_text_field( wp_unslash( (string) ( $body['state'] ?? '' ) ) ) );
	$zip   = sanitize_text_field( wp_unslash( (string) ( $body['postal_code'] ?? '' ) ) );
	$lines = array_values( array_filter( array( $line1, $line2 ) ) );
	if ( ! $lines || $city === '' || $zip === '' ) {
		wp_send_json_success( array( 'suggested' => null ) );
	}
	$key = wrrapd_wrapstars_google_places_api_key();
	$url = 'https://addressvalidation.googleapis.com/v1:validateAddress?key=' . rawurlencode( $key );
	$address_payload = array(
		'addressLines'         => $lines,
		'locality'             => $city,
		'postalCode'           => $zip,
		'regionCode'           => 'US',
	);
	if ( $state !== '' && $state !== 'OTHER' ) {
		$address_payload['administrativeArea'] = $state;
	}
	$response = wp_remote_post(
		$url,
		array(
			'headers' => wrrapd_wrapstars_google_places_request_headers(),
			'body'    => wp_json_encode(
				array(
					'address' => $address_payload,
				)
			),
			'timeout' => 12,
		)
	);
	if ( is_wp_error( $response ) ) {
		wp_send_json_success( array( 'suggested' => null ) );
	}
	$data = json_decode( (string) wp_remote_retrieve_body( $response ), true );
	wp_send_json_success( array( 'result' => is_array( $data ) ? $data : null ) );
}

add_action( 'wp_ajax_nopriv_wrrapd_ws_places_autocomplete', 'wrrapd_wrapstars_ajax_places_autocomplete' );
add_action( 'wp_ajax_wrrapd_ws_places_autocomplete', 'wrrapd_wrapstars_ajax_places_autocomplete' );
add_action( 'wp_ajax_nopriv_wrrapd_ws_places_details', 'wrrapd_wrapstars_ajax_places_details' );
add_action( 'wp_ajax_wrrapd_ws_places_details', 'wrrapd_wrapstars_ajax_places_details' );
add_action( 'wp_ajax_nopriv_wrrapd_ws_validate_address', 'wrrapd_wrapstars_ajax_validate_address' );
add_action( 'wp_ajax_wrrapd_ws_validate_address', 'wrrapd_wrapstars_ajax_validate_address' );

function wrrapd_wrapstars_strip_third_party_chrome() {
	if ( is_admin() || ! wrrapd_wrapstars_is_portal_host() ) {
		return;
	}
	global $wp_scripts, $wp_styles;
	$needles = array( 'sg-ai', 'sg_ai', 'sgai', 'ai-studio', 'ai_studio' );
	if ( $wp_scripts instanceof WP_Scripts ) {
		foreach ( array_keys( (array) $wp_scripts->registered ) as $handle ) {
			foreach ( $needles as $needle ) {
				if ( str_contains( (string) $handle, $needle ) ) {
					wp_dequeue_script( $handle );
					wp_deregister_script( $handle );
					break;
				}
			}
		}
	}
	if ( $wp_styles instanceof WP_Styles ) {
		foreach ( array_keys( (array) $wp_styles->registered ) as $handle ) {
			foreach ( $needles as $needle ) {
				if ( str_contains( (string) $handle, $needle ) ) {
					wp_dequeue_style( $handle );
					wp_deregister_style( $handle );
					break;
				}
			}
		}
	}
}

function wrrapd_wrapstars_enqueue_assets() {
	$css = dirname( __FILE__ ) . '/wrrapd-wrapstars.css';
	if ( is_readable( $css ) ) {
		wp_enqueue_style( 'wrrapd-wrapstars', content_url( 'mu-plugins/wrrapd-wrapstars.css' ), array(), WRRAPD_WRAPSTARS_BUILD );
	}
	wp_enqueue_style(
		'wrrapd-wrapstars-fonts',
		'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,560;9..144,600;9..144,700&display=swap',
		array(),
		null
	);

	if ( wrrapd_wrapstars_is_portal_host() ) {
		$uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '';
		if ( str_contains( $uri, '/apply' ) ) {
			$js = dirname( __FILE__ ) . '/wrrapd-wrapstars-apply.js';
			if ( is_readable( $js ) ) {
				$apply_js_ver = WRRAPD_WRAPSTARS_BUILD . '-' . (string) filemtime( $js );
				wp_enqueue_script( 'wrrapd-wrapstars-apply', content_url( 'mu-plugins/wrrapd-wrapstars-apply.js' ), array(), $apply_js_ver, true );
				wp_add_inline_script(
					'wrrapd-wrapstars-apply',
					"(function(){function n(){document.querySelectorAll('.pac-container').forEach(function(e){e.remove();});}n();if(window.MutationObserver){new MutationObserver(n).observe(document.documentElement,{childList:!0,subtree:!0});}})();",
					'before'
				);
				wp_localize_script(
					'wrrapd-wrapstars-apply',
					'wrrapdWrapstarApply',
					array(
						'ajaxUrl'     => admin_url( 'admin-ajax.php' ),
						'placesNonce' => wp_create_nonce( 'wrrapd_ws_places' ),
					)
				);
			}
		}
	}
}

/** @return string */
function wrrapd_wrapstars_brand_logo_url() {
	if ( defined( 'WRRAPD_WRAPSTARS_LOGO_URL' ) && WRRAPD_WRAPSTARS_LOGO_URL !== '' ) {
		return (string) WRRAPD_WRAPSTARS_LOGO_URL;
	}
	return 'https://wrrapd.com/wp-content/uploads/2025/03/Wrrapd_f-Logo-800-x-458-px.png';
}

/** @return string */
function wrrapd_wrapstars_brand_tagline_url() {
	if ( defined( 'WRRAPD_WRAPSTARS_TAGLINE_URL' ) && WRRAPD_WRAPSTARS_TAGLINE_URL !== '' ) {
		return (string) WRRAPD_WRAPSTARS_TAGLINE_URL;
	}
	return 'https://wrrapd.com/wp-content/uploads/2025/03/WrappingHappiness-2.png';
}

/** @return string */
function wrrapd_wrapstars_brand_icon_url() {
	if ( defined( 'WRRAPD_WRAPSTARS_ICON_URL' ) && WRRAPD_WRAPSTARS_ICON_URL !== '' ) {
		return (string) WRRAPD_WRAPSTARS_ICON_URL;
	}
	return 'https://wrrapd.com/wp-content/uploads/2023/02/ms-icon-144x144-1.png';
}

function wrrapd_wrapstars_output_favicon() {
	if ( is_admin() ) {
		return;
	}
	$icon_32 = 'https://wrrapd.com/wp-content/uploads/2023/02/ms-icon-144x144-1-100x100.png';
	$icon    = wrrapd_wrapstars_brand_icon_url();
	echo '<link rel="icon" href="' . esc_url( $icon_32 ) . '" sizes="32x32" />' . "\n";
	echo '<link rel="icon" href="' . esc_url( $icon ) . '" sizes="192x192" />' . "\n";
	echo '<link rel="apple-touch-icon" href="' . esc_url( $icon ) . '" />' . "\n";
}

function wrrapd_wrapstars_output_portal_header() {
	if ( is_admin() ) {
		return;
	}
	$home_url = 'https://wrrapd.com/';

	echo '<header class="wrrapd-wrapstars-site-header" role="banner">';
	echo '<div class="wrrapd-wrapstars-site-header__brand-row">';
	echo '<div class="wrrapd-wrapstars-brand">';
	echo '<a class="wrrapd-wrapstars-brand__logo" href="' . esc_url( $home_url ) . '" rel="home">';
	echo '<img src="' . esc_url( wrrapd_wrapstars_brand_logo_url() ) . '" width="800" height="458" alt="Wrrapd" decoding="async" />';
	echo '</a>';
	echo '<img class="wrrapd-wrapstars-brand__tagline" src="' . esc_url( wrrapd_wrapstars_brand_tagline_url() ) . '" width="344" height="65" alt="Wrapping Happiness!" decoding="async" />';
	echo '</div>';
	echo '</div>';
	if ( is_user_logged_in() && wrrapd_wrapstars_is_onboarding_eligible_user( get_current_user_id() ) ) {
		echo '<nav class="wrrapd-wrapstars-portal-util" aria-label="WrapStar portal">';
		if ( wrrapd_wrapstars_is_pros_host() ) {
			echo '<a href="' . esc_url( wrrapd_wrapstars_pros_url( '/profile/' ) ) . '">Profile</a>';
			echo '<span aria-hidden="true">·</span>';
		}
		echo '<a href="' . esc_url( wrrapd_wrapstars_pros_url( '/onboarding/' ) ) . '">Onboarding</a>';
		echo '<span aria-hidden="true">·</span>';
		echo '<a href="' . esc_url( wp_logout_url( home_url( '/' ) ) ) . '">Log out</a>';
		echo '</nav>';
	}
	echo '</header>';
}

function wrrapd_wrapstars_output_portal_footer() {
	if ( is_admin() ) {
		return;
	}
	$year = gmdate( 'Y' );
	echo '<footer class="wrrapd-wrapstars-site-footer" role="contentinfo">';
	echo '<div class="wrrapd-wrapstars-site-footer__inner">';
	echo '<div class="wrrapd-wrapstars-site-footer__brand">';
	echo '<a href="https://wrrapd.com/"><img src="https://wrrapd.com/wp-content/uploads/2022/04/cropped-Wrrapd_f-Logo.png" width="240" height="137" alt="Wrrapd" loading="lazy" decoding="async" /></a>';
	echo '<p class="wrrapd-wrapstars-site-footer__address">7901 4th St N, Ste 300<br />St. Petersburg, FL 33702</p>';
	echo '<p class="wrrapd-wrapstars-site-footer__copy">© ' . esc_html( $year ) . ' Wrrapd Inc.; all rights reserved.</p>';
	echo '</div>';
	echo '<div class="wrrapd-wrapstars-site-footer__social" aria-label="Social links">';
	echo '<a href="https://www.facebook.com/wrrapd" target="_blank" rel="noopener noreferrer" aria-label="Facebook">';
	echo '<svg viewBox="0 0 512 512" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M504 256C504 119 393 8 256 8S8 119 8 256c0 123.78 90.69 226.38 209.25 245V327.69h-63V256h63v-54.64c0-62.15 37-96.48 93.67-96.48 27.14 0 55.52 4.84 55.52 4.84v61h-31.28c-30.8 0-40.41 19.12-40.41 38.73V256h68.78l-11 71.69h-57.78V501C413.31 482.31 504 385.79 504 256z"/></svg>';
	echo '</a>';
	echo '<a href="https://www.x.com/wrrapd" target="_blank" rel="noopener noreferrer" aria-label="X">';
	echo '<svg viewBox="0 0 512 512" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z"/></svg>';
	echo '</a>';
	echo '</div>';
	echo '</div></footer>';
}

function wrrapd_wrapstars_output_landing_scripts() {
	if ( is_admin() || ! wrrapd_wrapstars_is_portal_host() ) {
		return;
	}
	?>
	<script id="wrrapd-wrapstars-landing">
	(function () {
		var shell = document.querySelector('.wrrapd-wrapstars-onboarding-shell');
		if (shell) {
			var nav = shell.querySelector('#wrrapd-ws-ob-nav');
			var backdrop = shell.querySelector('[data-ws-ob-nav-close]');
			var openBtn = shell.querySelector('[data-ws-ob-nav-open]');
			function setOpen(open) {
				shell.classList.toggle('is-nav-open', open);
				if (openBtn) openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
				if (backdrop) backdrop.hidden = !open;
				document.documentElement.classList.toggle('wrrapd-ws-ob-nav-lock', open);
			}
			if (openBtn) openBtn.addEventListener('click', function () { setOpen(true); });
			if (backdrop) backdrop.addEventListener('click', function () { setOpen(false); });
			shell.querySelectorAll('.wrrapd-wrapstars-steps--sidebar a').forEach(function (a) {
				a.addEventListener('click', function () { setOpen(false); });
			});
			document.addEventListener('keydown', function (e) {
				if (e.key === 'Escape') setOpen(false);
			});
		}
	})();
	</script>
	<?php
}

/** Print footer once per request at wp_footer (outside theme content wrappers). */
function wrrapd_wrapstars_footer_once() {
	static $done = false;
	if ( $done || is_admin() || ! wrrapd_wrapstars_is_portal_host() ) {
		return;
	}
	$done = true;
	wrrapd_wrapstars_output_portal_footer();
	echo '<script id="wrrapd-wrapstars-chrome-strip">';
	echo '(function(){function wipe(){document.querySelectorAll("footer.wp-block-template-part,.wp-block-template-part[class*=footer],#sg-ai-studio-root,#sg-ai-studio,.sg-ai-studio,[class*=sg-ai],[id*=sg-ai]").forEach(function(n){try{n.remove();}catch(e){}}); } wipe(); if(window.MutationObserver){new MutationObserver(wipe).observe(document.documentElement,{childList:true,subtree:true});}})();';
	echo '</script>';
}

// --- POST handlers ---

function wrrapd_wrapstars_maybe_handle_posts() {
	if ( $_SERVER['REQUEST_METHOD'] !== 'POST' || empty( $_POST['wrrapd_ws_action'] ) ) {
		return;
	}
	$action = sanitize_text_field( wp_unslash( $_POST['wrrapd_ws_action'] ) );

	if ( $action === 'apply' ) {
		wrrapd_wrapstars_process_application();
	}
	if ( $action === 'portal_login' ) {
		wrrapd_wrapstars_process_portal_login();
	}
	if ( $action === 'onboarding_step' ) {
		wrrapd_wrapstars_process_onboarding_step();
	}
	if ( $action === 'orientation_quiz' ) {
		wrrapd_wrapstars_process_orientation_quiz();
	}
	if ( $action === 'save_profile' ) {
		wrrapd_wrapstars_process_profile_save();
	}
	if ( $action === 'change_password' ) {
		wrrapd_wrapstars_process_change_password();
	}
	if ( $action === 'decline_offer' ) {
		wrrapd_wrapstars_process_decline_offer();
	}
}

function wrrapd_wrapstars_process_portal_login() {
	if ( ! isset( $_POST['wrrapd_ws_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_ws_nonce'] ) ), 'wrrapd_ws_login' ) ) {
		return;
	}

	$email    = sanitize_email( wp_unslash( $_POST['email'] ?? '' ) );
	$password = isset( $_POST['password'] ) ? (string) wp_unslash( $_POST['password'] ) : '';
	$redirect = isset( $_POST['redirect_to'] ) ? esc_url_raw( wp_unslash( $_POST['redirect_to'] ) ) : '';

	if ( ! is_email( $email ) || $password === '' ) {
		$GLOBALS['wrrapd_ws_login_error'] = 'Enter your email and password.';
		return;
	}

	$user = wp_signon(
		array(
			'user_login'    => $email,
			'user_password' => $password,
			'remember'      => ! empty( $_POST['remember'] ),
		),
		false
	);

	if ( is_wp_error( $user ) ) {
		$GLOBALS['wrrapd_ws_login_error'] = 'Invalid email or password.';
		return;
	}

	$app = wrrapd_wrapstars_get_application_by_user( $user->ID );
	if ( ! $app ) {
		$app = wrrapd_wrapstars_get_application_by_email( $email );
	}
	$status = $app ? (string) wrrapd_wrapstars_get_meta( $app->ID, 'status' ) : '';
	if ( $status === 'declined' ) {
		wp_logout();
		$GLOBALS['wrrapd_ws_login_error'] = 'This invitation was declined. Contact admin@wrrapd.com if that was a mistake.';
		return;
	}
	if ( $app && wrrapd_wrapstars_invite_is_expired( $app->ID ) ) {
		wrrapd_wrapstars_invalidate_expired_invite( $app->ID );
		wp_logout();
		$GLOBALS['wrrapd_ws_login_error'] = 'This onboarding invitation expired after 15 days. Email us and we will send you a fresh welcome email.';
		return;
	}
	if ( ! wrrapd_wrapstars_is_onboarding_eligible_user( $user->ID ) ) {
		wp_logout();
		$GLOBALS['wrrapd_ws_login_error'] = 'Login is only available after your application is approved. Check your email for next steps.';
		return;
	}

	// First login after approval always starts with password change (then onboarding).
	wp_safe_redirect( wrrapd_wrapstars_portal_redirect_for_user( $user->ID ) );
	exit;
}

function wrrapd_wrapstars_process_onboarding_step() {
	if ( ( ! wrrapd_wrapstars_is_pros_host() && ! wrrapd_wrapstars_unified_host() ) || ! is_user_logged_in() ) {
		return;
	}
	if ( ! isset( $_POST['wrrapd_ws_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_ws_nonce'] ) ), 'wrrapd_ws_onboarding' ) ) {
		return;
	}

	$step = wrrapd_wrapstars_normalize_step_key( sanitize_text_field( wp_unslash( $_POST['step'] ?? '' ) ) );
	$app  = wrrapd_wrapstars_get_application_by_user( get_current_user_id() );
	if ( ! $app || ! wrrapd_wrapstars_can_access_step( $app->ID, $step ) ) {
		return;
	}
	$app_id = $app->ID;

	$fail = static function ( $msg ) {
		$GLOBALS['wrrapd_ws_onboarding_error'] = $msg;
	};
	$done = static function ( $step ) use ( $app_id ) {
		wrrapd_wrapstars_mark_step_complete( $app_id, $step );
		wp_safe_redirect( wrrapd_wrapstars_onboarding_step_url( wrrapd_wrapstars_next_onboarding_step( $step ) ) );
		exit;
	};
	$text = static function ( $key ) {
		return sanitize_text_field( wp_unslash( $_POST[ $key ] ?? '' ) );
	};

	switch ( $step ) {
		case 'welcome':
			$done( 'welcome' );
			break;

		case 'policies':
			$sections = array_keys( wrrapd_wrapstars_policy_sections() );
			$acks     = isset( $_POST['policy_ack'] ) && is_array( $_POST['policy_ack'] ) ? array_map( 'sanitize_key', wp_unslash( $_POST['policy_ack'] ) ) : array();
			$missing  = array_diff( $sections, $acks );
			$sig      = $text( 'policies_signature' );
			if ( $missing !== array() ) {
				$fail( 'Please acknowledge every section before continuing.' );
				return;
			}
			if ( $sig === '' ) {
				$fail( 'Please type your full name to sign.' );
				return;
			}
			wrrapd_wrapstars_set_meta( $app_id, 'policies_ack_sections', implode( ',', $sections ) );
			wrrapd_wrapstars_set_meta( $app_id, 'policies_ack_at', gmdate( 'c' ) );
			wrrapd_wrapstars_set_meta( $app_id, 'policies_signature', $sig );
			$done( 'policies' );
			break;

		case 'background':
			$legal = $text( 'bg_legal_name' );
			$sig   = $text( 'bg_signature' );
			if ( $legal === '' ) {
				$fail( 'Please enter your full legal name exactly as it appears on your ID.' );
				return;
			}
			if ( empty( $_POST['bg_consent'] ) ) {
				$fail( 'Please authorize the background check to continue.' );
				return;
			}
			if ( $sig === '' ) {
				$fail( 'Please type your full name to sign.' );
				return;
			}
			wrrapd_wrapstars_set_meta( $app_id, 'bg_legal_name', $legal );
			wrrapd_wrapstars_set_meta( $app_id, 'bg_other_names', $text( 'bg_other_names' ) );
			wrrapd_wrapstars_set_meta( $app_id, 'bg_consent_at', gmdate( 'c' ) );
			wrrapd_wrapstars_set_meta( $app_id, 'bg_signature', $sig );
			if ( wrrapd_wrapstars_get_meta( $app_id, 'bg_status' ) === '' ) {
				wrrapd_wrapstars_set_meta( $app_id, 'bg_status', 'pending' );
			}
			$done( 'background' );
			break;

		case 'insurance':
			$upload = wrrapd_wrapstars_handle_upload( $app_id, 'insurance_coi' );
			if ( ! $upload['ok'] ) {
				$fail( $upload['error'] );
				return;
			}
			wrrapd_wrapstars_set_meta( $app_id, 'insurance_file', $upload['path'] );
			wrrapd_wrapstars_set_meta( $app_id, 'insurance_carrier', $text( 'insurance_carrier' ) );
			wrrapd_wrapstars_set_meta( $app_id, 'insurance_expires', $text( 'insurance_expires' ) );
			$done( 'insurance' );
			break;

		case 'identity':
			if ( empty( $_POST['identity_confirm'] ) ) {
				$fail( 'Please confirm that the ID on file is yours and current.' );
				return;
			}
			$upload = wrrapd_wrapstars_handle_upload( $app_id, 'identity_selfie', array( 'jpg', 'jpeg', 'png' ) );
			if ( ! $upload['ok'] ) {
				$fail( 'Please upload a clear photo of yourself holding your ID (JPG or PNG). ' . $upload['error'] );
				return;
			}
			wrrapd_wrapstars_set_meta( $app_id, 'identity_selfie_file', $upload['path'] );
			wrrapd_wrapstars_set_meta( $app_id, 'identity_confirmed_at', gmdate( 'c' ) );
			$done( 'identity' );
			break;

		case 'workspace':
			$address = sanitize_textarea_field( wp_unslash( $_POST['workspace_address'] ?? '' ) );
			$windows = isset( $_POST['workspace_windows'] ) && is_array( $_POST['workspace_windows'] ) ? array_map( 'sanitize_key', wp_unslash( $_POST['workspace_windows'] ) ) : array();
			$allowed = array_keys( wrrapd_wrapstars_workspace_window_options() );
			$windows = array_values( array_intersect( $windows, $allowed ) );
			if ( $address === '' ) {
				$fail( 'Please enter the address where your gifts will be dropped off and picked up.' );
				return;
			}
			if ( $windows === array() ) {
				$fail( 'Please choose at least one handoff window.' );
				return;
			}
			wrrapd_wrapstars_set_meta( $app_id, 'workspace_address', $address );
			wrrapd_wrapstars_set_meta( $app_id, 'workspace_access_notes', sanitize_textarea_field( wp_unslash( $_POST['workspace_access_notes'] ?? '' ) ) );
			wrrapd_wrapstars_set_meta( $app_id, 'workspace_windows', implode( ',', $windows ) );
			if ( ! empty( $_FILES['workspace_photo']['name'] ) ) {
				$upload = wrrapd_wrapstars_handle_upload( $app_id, 'workspace_photo', array( 'jpg', 'jpeg', 'png' ) );
				if ( $upload['ok'] ) {
					wrrapd_wrapstars_set_meta( $app_id, 'workspace_photo_file', $upload['path'] );
				}
			}
			$done( 'workspace' );
			break;

		case 'tax_1099':
			if ( empty( $_POST['tax_ack_ic'] ) || empty( $_POST['tax_ack_withholding'] ) || empty( $_POST['tax_ack_w9'] ) ) {
				$fail( 'Please confirm each tax acknowledgment to continue.' );
				return;
			}
			$sig = $text( 'tax_ack_signature' );
			if ( $sig === '' ) {
				$fail( 'Please type your full name to sign.' );
				return;
			}
			wrrapd_wrapstars_set_meta( $app_id, 'tax_ack_at', gmdate( 'c' ) );
			wrrapd_wrapstars_set_meta( $app_id, 'tax_ack_signature', $sig );
			wrrapd_wrapstars_set_meta( $app_id, 'tax_e_delivery', empty( $_POST['tax_e_delivery'] ) ? '0' : '1' );
			$done( 'tax_1099' );
			break;

		case 'bank_payout':
			$connect_url = defined( 'WRRAPD_WRAPSTARS_PAYOUT_CONNECT_URL' ) ? (string) WRRAPD_WRAPSTARS_PAYOUT_CONNECT_URL : '';
			if ( $connect_url !== '' ) {
				if ( empty( $_POST['payout_connect_done'] ) ) {
					$fail( 'Please finish the secure payout setup, then confirm below.' );
					return;
				}
				wrrapd_wrapstars_set_meta( $app_id, 'payout_method', 'connect' );
				wrrapd_wrapstars_set_meta( $app_id, 'payout_submitted_at', gmdate( 'c' ) );
				$done( 'bank_payout' );
				break;
			}
			$holder  = $text( 'payout_holder_name' );
			$bank    = $text( 'payout_bank_name' );
			$type    = $text( 'payout_account_type' );
			$routing = preg_replace( '/\D+/', '', $text( 'payout_routing' ) );
			$acct    = preg_replace( '/\D+/', '', $text( 'payout_account' ) );
			$acct2   = preg_replace( '/\D+/', '', $text( 'payout_account_confirm' ) );
			if ( $holder === '' || $bank === '' ) {
				$fail( 'Please enter the account holder name and bank name.' );
				return;
			}
			if ( ! in_array( $type, array( 'checking', 'savings' ), true ) ) {
				$fail( 'Please choose checking or savings.' );
				return;
			}
			if ( strlen( $routing ) !== 9 ) {
				$fail( 'Routing number must be 9 digits.' );
				return;
			}
			if ( strlen( $acct ) < 4 || strlen( $acct ) > 17 ) {
				$fail( 'Please enter a valid account number.' );
				return;
			}
			if ( $acct !== $acct2 ) {
				$fail( 'Account numbers do not match.' );
				return;
			}
			$upload = wrrapd_wrapstars_handle_upload( $app_id, 'payout_proof' );
			if ( ! $upload['ok'] ) {
				$fail( 'Please upload a voided check or bank letter (PDF or image). ' . $upload['error'] );
				return;
			}
			// Only the last four digits of the account number are retained here; the
			// uploaded proof (private storage) is the record of truth for payout entry.
			wrrapd_wrapstars_set_meta( $app_id, 'payout_method', 'direct_deposit' );
			wrrapd_wrapstars_set_meta( $app_id, 'payout_holder_name', $holder );
			wrrapd_wrapstars_set_meta( $app_id, 'payout_bank_name', $bank );
			wrrapd_wrapstars_set_meta( $app_id, 'payout_account_type', $type );
			wrrapd_wrapstars_set_meta( $app_id, 'payout_routing', $routing );
			wrrapd_wrapstars_set_meta( $app_id, 'payout_account_last4', substr( $acct, -4 ) );
			wrrapd_wrapstars_set_meta( $app_id, 'payout_proof_file', $upload['path'] );
			wrrapd_wrapstars_set_meta( $app_id, 'payout_submitted_at', gmdate( 'c' ) );
			$done( 'bank_payout' );
			break;

		default:
			break;
	}
}

/**
 * Handoff windows a WrapStar can offer (step `workspace`).
 *
 * @return array<string, string>
 */
function wrrapd_wrapstars_workspace_window_options() {
	return array(
		'weekday_morning'   => 'Weekdays · morning (8–11 am)',
		'weekday_midday'    => 'Weekdays · midday (11 am–2 pm)',
		'weekday_afternoon' => 'Weekdays · afternoon (2–5 pm)',
		'weekday_evening'   => 'Weekdays · evening (5–8 pm)',
		'saturday'          => 'Saturdays',
		'sunday'            => 'Sundays',
	);
}

/**
 * WrapStar Standards & Policies — each section requires its own acknowledgment.
 * Approved-WrapStar audience (behind login). Keep to what the WrapStar needs to do;
 * do not describe routing, pricing, or other internal operations.
 *
 * @return array<string, array{title:string,points:string[]}>
 */
function wrrapd_wrapstars_policy_sections() {
	return array(
		'craft'        => array(
			'title'  => 'Presentation standards',
			'points' => array(
				'Crisp folds, hidden tape, squared corners, and clean seams on every box.',
				'Paper, ribbon, tissue and tags follow the order card exactly — no substitutions without approval from your Wrrapd contact.',
				'Gift tags and cards are placed as instructed. Never add personal notes, business cards, or your own branding.',
				'Work in a clean, pet-free, smoke-free area. Gifts must arrive smelling like nothing.',
			),
		),
		'custody'      => array(
			'title'  => 'Care, custody & documentation',
			'points' => array(
				'You are responsible for every item from the moment it is handed to you until it is handed back.',
				'Record a short, continuous video of each order while it is in your care: opening the package, wrapping, and sealing/labeling the finished gift.',
				'Upload clear photos of the finished wrap before handoff. Missing documentation is treated as an incomplete order.',
				'Never open retail packaging, test, use, or photograph the contents beyond what is needed to wrap them.',
			),
		),
		'timing'       => array(
			'title'  => 'Windows & reliability',
			'points' => array(
				'Gifts are dropped off and collected during the handoff windows you have offered. Finished gifts must be sealed, labeled and ready before the pickup window opens.',
				'Most orders are completed the same day they arrive. If anything will make you miss a window, flag it immediately in your WrapStar Console.',
				'Repeated late or missed handoffs may pause your account.',
			),
		),
		'privacy'      => array(
			'title'  => 'Privacy & conduct',
			'points' => array(
				'Recipient names, addresses and order details are confidential. Do not share, store, or reuse them.',
				'Do not contact customers or recipients for any reason. All communication goes through Wrrapd.',
				'Do not post photos or videos of orders on social media without written permission from Wrrapd.',
				'Treat every courier, teammate, and Wrrapd contact with courtesy and professionalism.',
			),
		),
		'independent'  => array(
			'title'  => 'Independent contractor status',
			'points' => array(
				'You choose the windows you offer and may decline orders that do not fit your schedule.',
				'You provide your own workspace, tools, and supplies unless an order specifies materials that Wrrapd supplies.',
				'You are responsible for your own taxes, insurance, and licenses. Wrrapd does not withhold taxes.',
				'Either party may end the relationship as described in your Independent Contractor Agreement.',
			),
		),
	);
}

/**
 * Orientation modules shown above the quiz (step `orientation`).
 *
 * @return array<int, array{title:string,points:string[]}>
 */
function wrrapd_wrapstars_orientation_modules() {
	return array(
		array(
			'title'  => '1 · How an order reaches you',
			'points' => array(
				'You offer handoff windows in your WrapStar Console. When an order is assigned to you, you will see the wrap instructions and the drop-off window.',
				'A Wrrapd courier brings the packages to your wrapping location during that window. Check the contents against the order card before you start.',
				'Anything missing or damaged? Photograph it and flag it in the Console right away — do not wrap it.',
			),
		),
		array(
			'title'  => '2 · The wrap',
			'points' => array(
				'Start your documentation video before you open the outer package, and keep it running until the gift is sealed and labeled.',
				'Follow the order card: paper, ribbon, tissue, tag, card placement, and any custom design notes.',
				'Finish with clear photos of the wrapped gift (front, top, and any tag or card) and upload them in the Console.',
			),
		),
		array(
			'title'  => '3 · The handoff',
			'points' => array(
				'Seal and label each finished gift exactly as the Console instructs, and have it ready before the pickup window opens.',
				'Your courier confirms the handoff in their app. You do not deliver, and you never meet the recipient.',
				'Once the handoff is confirmed, the order is complete and counts toward your next payout.',
			),
		),
		array(
			'title'  => '4 · Standards that protect you',
			'points' => array(
				'Keep your liability and inland-marine (bailee) insurance active — it protects you while gifts are in your care.',
				'New WrapStars start with lower-value orders while your ratings build. Consistent quality unlocks more (and larger) orders.',
				'Missing documentation, late handoffs, or contacting recipients can lead to suspension or deactivation.',
			),
		),
	);
}

function wrrapd_wrapstars_orientation_questions() {
	return array(
		array(
			'q'       => 'When should your documentation video start and stop?',
			'a'       => 'before_open_until_sealed',
			'choices' => array(
				'before_open_until_sealed' => 'Before opening the outer package, running until the gift is sealed and labeled',
				'finished_only'            => 'Only a quick clip of the finished gift',
				'optional'                 => 'Video is optional if the photos look good',
			),
		),
		array(
			'q'       => 'How do the packages get to you, and how do finished gifts leave?',
			'a'       => 'courier_both',
			'choices' => array(
				'courier_both'   => 'A Wrrapd courier drops them off and picks them up during my handoff windows',
				'i_collect'      => 'I collect them from a pickup point and deliver them myself',
				'customer_visit' => 'The customer brings them to me and collects them later',
			),
		),
		array(
			'q'       => 'A recipient\'s name and address are on the order card. What may you do with that information?',
			'a'       => 'nothing',
			'choices' => array(
				'nothing'      => 'Nothing — it is confidential and I never contact recipients or customers',
				'thank_you'    => 'Send a quick thank-you note or text',
				'social_share' => 'Share a photo with the name blurred out',
			),
		),
		array(
			'q'       => 'Who is responsible for a gift while it is in your possession?',
			'a'       => 'wrapstar',
			'choices' => array(
				'wrrapd'   => 'Wrrapd only',
				'wrapstar' => 'I am, which is why I keep my insurance active',
				'customer' => 'The customer',
			),
		),
		array(
			'q'       => 'You realize you cannot finish an order before its pickup window. What do you do?',
			'a'       => 'flag_now',
			'choices' => array(
				'flag_now'   => 'Flag it immediately in my WrapStar Console so the window can be adjusted',
				'wait'       => 'Wait for the courier and explain in person',
				'skip_video' => 'Skip the documentation video to save time',
			),
		),
	);
}

function wrrapd_wrapstars_process_orientation_quiz() {
	if ( ( ! wrrapd_wrapstars_is_pros_host() && ! wrrapd_wrapstars_unified_host() ) || ! is_user_logged_in() ) {
		return;
	}
	if ( ! isset( $_POST['wrrapd_ws_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_ws_nonce'] ) ), 'wrrapd_ws_quiz' ) ) {
		return;
	}

	$app = wrrapd_wrapstars_get_application_by_user( get_current_user_id() );
	if ( ! $app || ! wrrapd_wrapstars_can_access_step( $app->ID, 'orientation' ) ) {
		return;
	}

	$questions = wrrapd_wrapstars_orientation_questions();
	$correct   = 0;
	foreach ( $questions as $i => $q ) {
		$ans = sanitize_text_field( wp_unslash( $_POST[ 'q' . $i ] ?? '' ) );
		if ( $ans === $q['a'] ) {
			++$correct;
		}
	}
	$score = (int) round( ( $correct / count( $questions ) ) * 100 );
	wrrapd_wrapstars_set_meta( $app->ID, 'orientation_score', (string) $score );

	if ( $score < 80 ) {
		$GLOBALS['wrrapd_ws_quiz_error'] = 'Score ' . $score . '% — you need 80% to pass. Please review the orientation and try again.';
		return;
	}

	wrrapd_wrapstars_mark_step_complete( $app->ID, 'orientation' );
	wp_safe_redirect( wrrapd_wrapstars_onboarding_step_url( wrrapd_wrapstars_next_onboarding_step( 'orientation' ) ) );
	exit;
}

// --- BoldSign ---

/**
 * @param int    $app_id Application id.
 * @param string $doc    ic_agreement|w9.
 * @return array{ok:bool,sign_url?:string,document_id?:string,error?:string}
 */
function wrrapd_wrapstars_boldsign_prepare( $app_id, $doc ) {
	$app = get_post( $app_id );
	if ( ! $app ) {
		return array( 'ok' => false, 'error' => 'Application not found.' );
	}

	$email = wrrapd_wrapstars_get_meta( $app_id, 'email' );
	$name  = wrrapd_wrapstars_get_meta( $app_id, 'full_name' );
	$user  = wp_get_current_user();
	if ( strtolower( $user->user_email ) !== strtolower( $email ) ) {
		return array( 'ok' => false, 'error' => 'Signer email does not match application.' );
	}

	$client = wrrapd_boldsign_client();
	if ( ! $client->is_configured() ) {
		return array( 'ok' => false, 'error' => 'BoldSign is not configured. Contact Wrrapd support.' );
	}

	$meta_doc_key = $doc === 'w9' ? 'boldsign_w9_doc_id' : 'boldsign_ic_doc_id';
	$signed_key   = $doc === 'w9' ? 'boldsign_w9_signed' : 'boldsign_ic_signed';
	$template_id  = $doc === 'w9'
		? ( defined( 'WRRAPD_BOLDSIGN_W9_TEMPLATE_ID' ) ? (string) WRRAPD_BOLDSIGN_W9_TEMPLATE_ID : '' )
		: ( defined( 'WRRAPD_BOLDSIGN_IC_TEMPLATE_ID' ) ? (string) WRRAPD_BOLDSIGN_IC_TEMPLATE_ID : '' );
	$title        = $doc === 'w9' ? 'WrapStar W-9' : 'WrapStar Independent Contractor Agreement';
	$redirect     = wrrapd_wrapstars_pros_url( '/onboarding/' . ( $doc === 'w9' ? 'w-9' : 'agreement' ) . '/?signed=1' );
	$step         = $doc === 'w9' ? 'w9' : 'agreement';

	if ( wrrapd_wrapstars_get_meta( $app_id, $signed_key ) === '1' ) {
		return array( 'ok' => true, 'already_signed' => true );
	}

	$document_id = wrrapd_wrapstars_get_meta( $app_id, $meta_doc_key );
	if ( $document_id === '' ) {
		$send = $client->send_from_template( $template_id, $title, $name, $email, $redirect );
		if ( ! $send['ok'] ) {
			return $send;
		}
		$document_id = $send['document_id'];
		wrrapd_wrapstars_set_meta( $app_id, $meta_doc_key, $document_id );
	}

	$link = $client->get_embedded_sign_link( $document_id, $email, $redirect );
	if ( ! $link['ok'] ) {
		return $link;
	}

	return array(
		'ok'          => true,
		'sign_url'    => $link['sign_url'],
		'document_id' => $document_id,
		'step'        => $step,
	);
}

/**
 * BoldSign webhook: mark agreement/w9 signed and store PDF.
 *
 * @param string $document_id BoldSign document id.
 */
function wrrapd_wrapstars_handle_boldsign_completed( $document_id ) {
	$posts = get_posts(
		array(
			'post_type'      => WRRAPD_WRAPSTARS_CPT,
			'posts_per_page' => 1,
			'post_status'    => 'publish',
			'meta_query'     => array(
				'relation' => 'OR',
				array(
					'key'   => '_wrrapd_ws_boldsign_ic_doc_id',
					'value' => $document_id,
				),
				array(
					'key'   => '_wrrapd_ws_boldsign_w9_doc_id',
					'value' => $document_id,
				),
			),
		)
	);
	if ( ! $posts ) {
		return;
	}
	$app_id = $posts[0]->ID;
	$ic_id  = wrrapd_wrapstars_get_meta( $app_id, 'boldsign_ic_doc_id' );
	$w9_id  = wrrapd_wrapstars_get_meta( $app_id, 'boldsign_w9_doc_id' );

	$client = wrrapd_boldsign_client();
	$dl     = $client->download_document( $document_id );
	if ( $dl['ok'] ) {
		$fname = ( $document_id === $ic_id ) ? 'ic_agreement_signed.pdf' : 'w9_signed.pdf';
		$path  = wrrapd_wrapstars_app_dir( $app_id ) . '/' . $fname;
		file_put_contents( $path, $dl['bytes'] );
	}

	if ( $document_id === $ic_id ) {
		wrrapd_wrapstars_set_meta( $app_id, 'boldsign_ic_signed', '1' );
		wrrapd_wrapstars_mark_step_complete( $app_id, 'agreement' );
	}
	if ( $document_id === $w9_id ) {
		wrrapd_wrapstars_set_meta( $app_id, 'boldsign_w9_signed', '1' );
		wrrapd_wrapstars_mark_step_complete( $app_id, 'w9' );
	}
}

// Poll fallback when ?signed=1
function wrrapd_wrapstars_maybe_poll_boldsign() {
	if ( empty( $_GET['signed'] ) || ! is_user_logged_in() ) {
		return;
	}
	$app = wrrapd_wrapstars_get_application_by_user( get_current_user_id() );
	if ( ! $app ) {
		return;
	}
	foreach ( array( 'boldsign_ic_doc_id', 'boldsign_w9_doc_id' ) as $key ) {
		$doc_id = wrrapd_wrapstars_get_meta( $app->ID, $key );
		if ( $doc_id !== '' ) {
			wrrapd_wrapstars_handle_boldsign_completed( $doc_id );
		}
	}
}
add_action( 'template_redirect', 'wrrapd_wrapstars_maybe_poll_boldsign', 20 );

// --- Email ---

/**
 * @param string       $to      Recipient.
 * @param string       $subject Subject.
 * @param string       $body    Plain or HTML body.
 * @param bool         $is_html HTML content-type when true.
 */
function wrrapd_wrapstars_send_email( $to, $subject, $body, $is_html = false ) {
	$headers   = array(
		$is_html ? 'Content-Type: text/html; charset=UTF-8' : 'Content-Type: text/plain; charset=UTF-8',
	);
	$from      = wrrapd_wrapstars_from_email_address();
	$headers[] = 'From: Wrrapd <' . $from . '>';
	$headers[] = 'Reply-To: ' . $from;
	wp_mail( $to, $subject, $body, $headers );
}

// --- Shortcodes ---

function wrrapd_wrapstars_hero_image_url() {
	if ( defined( 'WRRAPD_WRAPSTARS_HERO_IMAGE' ) && WRRAPD_WRAPSTARS_HERO_IMAGE !== '' ) {
		return esc_url( WRRAPD_WRAPSTARS_HERO_IMAGE );
	}
	return '';
}

function wrrapd_wrapstars_hero_video_url() {
	if ( defined( 'WRRAPD_WRAPSTARS_HERO_VIDEO' ) && WRRAPD_WRAPSTARS_HERO_VIDEO !== '' ) {
		return esc_url( WRRAPD_WRAPSTARS_HERO_VIDEO );
	}
	static $cached = null;
	if ( $cached !== null ) {
		return $cached;
	}
	$cached = '';
	$attachments = get_posts(
		array(
			'post_type'      => 'attachment',
			'post_mime_type' => 'video',
			'posts_per_page' => 30,
			'post_status'    => 'inherit',
			'orderby'        => 'date',
			'order'          => 'DESC',
		)
	);
	foreach ( $attachments as $att ) {
		$title = strtolower( (string) $att->post_title );
		$file  = strtolower( (string) get_attached_file( $att->ID ) );
		if ( strpos( $title, 'applications_wrrapd' ) !== false || strpos( $file, 'applications_wrrapd' ) !== false ) {
			$cached = esc_url( wp_get_attachment_url( $att->ID ) );
			break;
		}
	}
	return $cached;
}

/**
 * Create or reset portal credentials when a candidate is approved.
 *
 * @return array{user_id:int,password:string,decline_token:string}|WP_Error
 */
function wrrapd_wrapstars_provision_approved_user( $app_id ) {
	$email = strtolower( (string) wrrapd_wrapstars_get_meta( $app_id, 'email' ) );
	$name  = (string) wrrapd_wrapstars_get_meta( $app_id, 'full_name' );
	if ( ! is_email( $email ) ) {
		return new WP_Error( 'invalid_email', 'Application email missing.' );
	}

	$password = wrrapd_wrapstars_generate_temp_password();
	$user_id  = (int) wrrapd_wrapstars_get_meta( $app_id, 'user_id' );

	if ( $user_id && get_userdata( $user_id ) ) {
		wp_set_password( $password, $user_id );
	} elseif ( email_exists( $email ) ) {
		$user_id = (int) email_exists( $email );
		wp_set_password( $password, $user_id );
	} else {
		$user_id = wp_create_user( $email, $password, $email );
		if ( is_wp_error( $user_id ) ) {
			return $user_id;
		}
	}

	$first = (string) wrrapd_wrapstars_get_meta( $app_id, 'first_name' );
	if ( $first === '' ) {
		$first = (string) strtok( $name, ' ' );
	}
	wp_update_user(
		array(
			'ID'           => $user_id,
			'display_name' => $name,
			'first_name'   => $first,
		)
	);
	wrrapd_wrapstars_set_meta( $app_id, 'user_id', $user_id );
	wrrapd_wrapstars_set_user_role( $user_id, 'wrapstar_approved' );
	wrrapd_wrapstars_set_meta( $app_id, 'portal_password_issued_at', gmdate( 'c' ) );
	wrrapd_wrapstars_set_meta( $app_id, 'invite_expires_at', gmdate( 'c', time() + wrrapd_wrapstars_invite_ttl_seconds() ) );
	wrrapd_wrapstars_set_meta( $app_id, 'invite_expired_at', '' );
	wrrapd_wrapstars_set_must_change_password( $user_id, $app_id, true );
	// Clear active decline timestamp so re-approval / re-invite works (keep decline_note for history).
	wrrapd_wrapstars_set_meta( $app_id, 'declined_at', '' );

	$decline_token = wp_generate_password( 40, false, false );
	wrrapd_wrapstars_set_meta( $app_id, 'decline_token', $decline_token );

	return array(
		'user_id'       => $user_id,
		'password'      => $password,
		'decline_token' => $decline_token,
	);
}

function wrrapd_wrapstars_decline_offer_url( $app_id, $token ) {
	return add_query_arg(
		array(
			'app'   => (int) $app_id,
			'token' => rawurlencode( (string) $token ),
		),
		wrrapd_wrapstars_apply_url( '/decline-offer/' )
	);
}

/**
 * Welcome / re-invite / resend credentials email (HTML).
 *
 * @param int    $app_id   Application ID.
 * @param string $password Temporary password.
 * @param string $context  approve|reinvite|resend.
 */
function wrrapd_wrapstars_send_approval_credentials_email( $app_id, $password, $context = 'approve' ) {
	$email   = wrrapd_wrapstars_get_meta( $app_id, 'email' );
	$greet   = wrrapd_wrapstars_greeting_name( $app_id );
	$login   = wrrapd_wrapstars_portal_login_url(
		wrrapd_wrapstars_pros_url( '/onboarding/' ),
		wrrapd_wrapstars_greeting_name( $app_id )
	);
	$token   = (string) wrrapd_wrapstars_get_meta( $app_id, 'decline_token' );
	$decline = $token !== '' ? wrrapd_wrapstars_decline_offer_url( $app_id, $token ) : wrrapd_wrapstars_apply_url( '/decline-offer/' );
	$context = in_array( $context, array( 'approve', 'reinvite', 'resend' ), true ) ? $context : 'approve';
	$logo    = wrrapd_wrapstars_brand_logo_url();
	$from    = wrrapd_wrapstars_from_email_address();

	if ( $context === 'reinvite' ) {
		$subject = 'Welcome back to the Wrrapd family of WrapStars';
		$lead    = 'We are delighted to reopen your WrapStar invitation and would be honored to welcome you into the Wrrapd family.';
	} elseif ( $context === 'resend' ) {
		$subject = 'Your Wrrapd WrapStar login details';
		$lead    = 'With our compliments, here are fresh portal credentials. Any temporary password from an earlier message will no longer work.';
	} else {
		$subject = 'Congratulations — welcome to the Wrrapd family of WrapStars';
		$lead    = 'We are thrilled to welcome you into the Wrrapd family of WrapStars.';
	}

	$e_greet   = esc_html( $greet );
	$e_email   = esc_html( $email );
	$e_pass    = esc_html( $password );
	$e_login   = esc_url( $login );
	$e_decline = esc_url( $decline );
	$e_logo    = esc_url( $logo );
	$e_from    = esc_html( $from );
	$e_lead    = esc_html( $lead );

	$html = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>'
		. '<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap" rel="stylesheet"/>'
		. '<title>' . esc_html( $subject ) . '</title></head>'
		. '<body style="margin:0;padding:0;background:#e8eee8;">'
		. '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(145deg,#9aab9f,#c5cfc9,#a8b8ae);padding:28px 12px;">'
		. '<tr><td align="center">'
		. '<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fffefb;border-radius:16px;overflow:hidden;border:1px solid rgba(26,39,68,0.12);box-shadow:0 16px 40px rgba(15,23,42,0.14);">'
		// Header / logo top-right
		. '<tr><td style="padding:22px 28px 8px;background:#faf8f4;border-bottom:1px solid rgba(26,39,68,0.08);">'
		. '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>'
		. '<td style="font-family:Fraunces,Georgia,serif;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#475569;font-weight:600;">WrapStar invitation</td>'
		. '<td align="right"><a href="https://wrrapd.com/" style="text-decoration:none;"><img src="' . $e_logo . '" width="140" height="80" alt="Wrrapd" style="display:block;width:140px;height:auto;border:0;"/></a></td>'
		. '</tr></table></td></tr>'
		// Body
		. '<tr><td style="padding:28px 32px 12px;font-family:Fraunces,Georgia,\'Times New Roman\',serif;color:#0f172a;">'
		. '<p style="margin:0 0 18px;font-size:18px;line-height:1.45;color:#1e293b;">Hi ' . $e_greet . ',</p>'
		. '<p style="margin:0 0 10px;font-size:42px;line-height:1.1;font-weight:700;color:#c9a227;letter-spacing:-0.02em;">Congratulations!</p>'
		. '<p style="margin:0 0 18px;font-size:22px;line-height:1.35;font-weight:600;color:#0f172a;">Welcome to the Wrrapd family of WrapStars!</p>'
		. '<p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#334155;">' . $e_lead . '</p>'
		. '<p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#334155;">Please log in with the details below to begin your onboarding. For your security, the first thing you will do after signing in is choose a new password.</p>'
		. '<p style="margin:0 0 22px;font-size:14px;line-height:1.55;color:#64748b;">This login link and temporary password expire <strong>15 days</strong> after this email is sent. If they expire, reply to this message and we will gladly resend your invitation.</p>'
		. '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;background:#f4f7f4;border-radius:12px;border:1px solid rgba(26,39,68,0.1);">'
		. '<tr><td style="padding:18px 20px;font-family:Fraunces,Georgia,serif;font-size:15px;line-height:1.7;color:#0f172a;">'
		. '<p style="margin:0 0 8px;"><a href="' . $e_login . '" style="color:#a88417;font-weight:700;text-decoration:underline;">Please log in to the WrapStar portal</a></p>'
		. '<p style="margin:0;">Username: <strong>' . $e_email . '</strong><br/>Temporary password: <strong style="letter-spacing:0.02em;">' . $e_pass . '</strong></p>'
		. '</td></tr></table>'
		. '<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#475569;">During onboarding you will complete agreements, policies, orientation, insurance, tax forms, and bank / payout setup — we will guide you each step of the way.</p>'
		. '<p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#64748b;">If you have decided not to join us as a WrapStar, you may politely decline this invitation here (no login required):<br/>'
		. '<a href="' . $e_decline . '" style="color:#9a3412;">Decline this offer</a></p>'
		. '<p style="margin:22px 0 0;font-size:16px;line-height:1.6;color:#0f172a;">Once again — welcome. We are so glad you are here. Please reach out with any questions you might have; we are happy to help.</p>'
		. '<p style="margin:22px 0 0;font-size:16px;line-height:1.5;color:#0f172a;">Warmly,<br/><strong>Team Wrrapd</strong><br/>'
		. '<a href="mailto:' . $e_from . '" style="color:#a88417;">' . $e_from . '</a></p>'
		. '</td></tr>'
		. '<tr><td style="padding:14px 32px 22px;font-family:Fraunces,Georgia,serif;font-size:12px;color:#94a3b8;border-top:1px solid rgba(26,39,68,0.08);">© Wrrapd Inc. · Wrapping Happiness</td></tr>'
		. '</table></td></tr></table></body></html>';

	wrrapd_wrapstars_send_email( $email, $subject, $html, true );
}

/**
 * Return an approved/declined app to under_review for re-testing hire flow.
 *
 * @return array{ok:bool,error?:string}
 */
function wrrapd_wrapstars_reset_application_to_under_review( $app_id ) {
	$app_id = (int) $app_id;
	$app    = get_post( $app_id );
	if ( ! $app || $app->post_type !== WRRAPD_WRAPSTARS_CPT ) {
		return array( 'ok' => false, 'error' => 'Application not found.' );
	}
	$status = (string) wrrapd_wrapstars_get_meta( $app_id, 'status' );
	if ( ! in_array( $status, array( 'approved', 'declined', 'interview', 'rejected' ), true ) ) {
		return array( 'ok' => false, 'error' => 'Reset is only available from approved, declined, interview, or rejected.' );
	}

	wrrapd_wrapstars_set_meta( $app_id, 'status', 'under_review' );
	wrrapd_wrapstars_set_meta( $app_id, 'approved_at', '' );
	wrrapd_wrapstars_set_meta( $app_id, 'activated_at', '' );
	wrrapd_wrapstars_set_meta( $app_id, 'interview_at', '' );
	wrrapd_wrapstars_set_meta( $app_id, 'interview_skipped', '' );
	wrrapd_wrapstars_set_meta( $app_id, 'interview_skipped_at', '' );
	wrrapd_wrapstars_set_meta( $app_id, 'declined_at', '' );
	wrrapd_wrapstars_set_meta( $app_id, 'decline_token', '' );
	wrrapd_wrapstars_set_meta( $app_id, 'rejected_at', '' );
	wrrapd_wrapstars_set_meta( $app_id, 'must_change_password', '' );
	wrrapd_wrapstars_set_meta( $app_id, 'invite_expires_at', '' );
	wrrapd_wrapstars_set_meta( $app_id, 'invite_expired_at', '' );
	wrrapd_wrapstars_set_meta( $app_id, 'portal_password_issued_at', '' );
	wrrapd_wrapstars_set_meta( $app_id, 'onboarding_step', 'welcome' );
	wrrapd_wrapstars_set_meta( $app_id, 'suspended', '0' );
	wrrapd_wrapstars_set_meta( $app_id, 'reset_at', gmdate( 'c' ) );

	foreach ( array_keys( wrrapd_wrapstars_onboarding_steps() ) as $step ) {
		wrrapd_wrapstars_set_meta( $app_id, 'step_' . $step, '' );
	}

	$user_id = (int) wrrapd_wrapstars_get_meta( $app_id, 'user_id' );
	if ( $user_id && get_userdata( $user_id ) ) {
		wrrapd_wrapstars_set_user_role( $user_id, 'wrapstar_applicant' );
		delete_user_meta( $user_id, '_wrrapd_ws_must_change_password' );
		wp_set_password( wp_generate_password( 32, true, true ), $user_id );
	}

	return array( 'ok' => true, 'status' => 'under_review' );
}

/**
 * Re-open a declined invitation: status → approved, new credentials, welcome email.
 *
 * @return array{ok:bool,error?:string,password?:string}
 */
function wrrapd_wrapstars_reinvite_declined_offer( $app_id, $admin_note = '' ) {
	$app_id = (int) $app_id;
	$app    = get_post( $app_id );
	if ( ! $app || $app->post_type !== WRRAPD_WRAPSTARS_CPT ) {
		return array( 'ok' => false, 'error' => 'Application not found.' );
	}
	$status = (string) wrrapd_wrapstars_get_meta( $app_id, 'status' );
	if ( $status !== 'declined' ) {
		return array( 'ok' => false, 'error' => 'Only declined invitations can be re-opened.' );
	}

	$prev_declined = (string) wrrapd_wrapstars_get_meta( $app_id, 'declined_at' );
	if ( $prev_declined !== '' ) {
		wrrapd_wrapstars_set_meta( $app_id, 'previous_declined_at', $prev_declined );
	}
	$count = (int) wrrapd_wrapstars_get_meta( $app_id, 'reinvite_count', '0' );
	wrrapd_wrapstars_set_meta( $app_id, 'reinvite_count', (string) ( $count + 1 ) );
	wrrapd_wrapstars_set_meta( $app_id, 'reinvited_at', gmdate( 'c' ) );
	wrrapd_wrapstars_set_meta( $app_id, 'status', 'approved' );
	wrrapd_wrapstars_set_meta( $app_id, 'approved_at', gmdate( 'c' ) );
	wrrapd_wrapstars_set_meta( $app_id, 'declined_at', '' );
	// Keep decline_note for history; ops can clear via notes if desired.
	if ( wrrapd_wrapstars_get_meta( $app_id, 'onboarding_step' ) === '' ) {
		wrrapd_wrapstars_set_meta( $app_id, 'onboarding_step', 'welcome' );
	}
	if ( $admin_note !== '' ) {
		wrrapd_wrapstars_set_meta( $app_id, 'admin_notes', $admin_note );
	}

	$provision = wrrapd_wrapstars_provision_approved_user( $app_id );
	if ( is_wp_error( $provision ) ) {
		return array( 'ok' => false, 'error' => $provision->get_error_message() );
	}
	wrrapd_wrapstars_send_approval_credentials_email( $app_id, $provision['password'], 'reinvite' );
	wrrapd_wrapstars_sync_profile_to_gcs( $app_id );

	return array( 'ok' => true, 'password' => $provision['password'] );
}

/**
 * Resend welcome credentials while status remains approved (lost email, etc.).
 *
 * @return array{ok:bool,error?:string,password?:string}
 */
function wrrapd_wrapstars_resend_approval_invite( $app_id ) {
	$app_id = (int) $app_id;
	$app    = get_post( $app_id );
	if ( ! $app || $app->post_type !== WRRAPD_WRAPSTARS_CPT ) {
		return array( 'ok' => false, 'error' => 'Application not found.' );
	}
	if ( (string) wrrapd_wrapstars_get_meta( $app_id, 'status' ) !== 'approved' ) {
		return array( 'ok' => false, 'error' => 'Resend is only available for approved (onboarding) invitations.' );
	}
	$provision = wrrapd_wrapstars_provision_approved_user( $app_id );
	if ( is_wp_error( $provision ) ) {
		return array( 'ok' => false, 'error' => $provision->get_error_message() );
	}
	wrrapd_wrapstars_send_approval_credentials_email( $app_id, $provision['password'], 'resend' );
	return array( 'ok' => true, 'password' => $provision['password'] );
}

/**
 * Mark an approved invitation as declined (candidate chose not to join).
 *
 * @return array{ok:bool,error?:string}
 */
function wrrapd_wrapstars_mark_offer_declined( $app_id, $note = '' ) {
	$app_id = (int) $app_id;
	$app    = get_post( $app_id );
	if ( ! $app || $app->post_type !== WRRAPD_WRAPSTARS_CPT ) {
		return array( 'ok' => false, 'error' => 'Application not found.' );
	}
	$status = (string) wrrapd_wrapstars_get_meta( $app_id, 'status' );
	if ( $status === 'declined' ) {
		return array( 'ok' => true );
	}
	if ( $status !== 'approved' ) {
		return array( 'ok' => false, 'error' => 'Only approved invitations can be declined.' );
	}

	wrrapd_wrapstars_set_meta( $app_id, 'status', 'declined' );
	wrrapd_wrapstars_set_meta( $app_id, 'declined_at', gmdate( 'c' ) );
	wrrapd_wrapstars_set_meta( $app_id, 'decline_token', '' );
	if ( $note !== '' ) {
		wrrapd_wrapstars_set_meta( $app_id, 'decline_note', $note );
	}

	$user_id = (int) wrrapd_wrapstars_get_meta( $app_id, 'user_id' );
	if ( $user_id && get_userdata( $user_id ) ) {
		wrrapd_wrapstars_set_user_role( $user_id, 'wrapstar_declined' );
		wrrapd_wrapstars_set_must_change_password( $user_id, $app_id, false );
		// Invalidate temp credentials.
		wp_set_password( wp_generate_password( 32, true, true ), $user_id );
	}

	$name  = wrrapd_wrapstars_get_meta( $app_id, 'full_name' );
	$email = wrrapd_wrapstars_get_meta( $app_id, 'email' );
	$admin = wrrapd_wrapstars_admin_notify_email();
	$admin_body  = "A WrapStar invitation was declined.\n\n";
	$admin_body .= "Name: {$name}\nEmail: {$email}\nApp ID: {$app_id}\n";
	if ( $note !== '' ) {
		$admin_body .= "Note: {$note}\n";
	}
	wrrapd_wrapstars_send_email( $admin, 'WrapStar declined invitation — ' . $name, $admin_body );

	return array( 'ok' => true );
}

function wrrapd_wrapstars_process_decline_offer() {
	if ( ! isset( $_POST['wrrapd_ws_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_ws_nonce'] ) ), 'wrrapd_ws_decline' ) ) {
		$GLOBALS['wrrapd_ws_decline_error'] = 'Security check failed. Please try again.';
		return;
	}
	$app_id = (int) ( $_POST['app_id'] ?? 0 );
	$token  = sanitize_text_field( wp_unslash( $_POST['token'] ?? '' ) );
	$note   = sanitize_textarea_field( wp_unslash( $_POST['decline_note'] ?? '' ) );
	$stored = (string) wrrapd_wrapstars_get_meta( $app_id, 'decline_token' );
	if ( ! $app_id || $token === '' || $stored === '' || ! hash_equals( $stored, $token ) ) {
		$GLOBALS['wrrapd_ws_decline_error'] = 'This decline link is invalid or has already been used.';
		return;
	}
	if ( wrrapd_wrapstars_invite_is_expired( $app_id ) ) {
		wrrapd_wrapstars_invalidate_expired_invite( $app_id );
		$GLOBALS['wrrapd_ws_decline_error'] = 'This invitation expired after 15 days and can no longer be declined online. Contact ' . wrrapd_wrapstars_from_email_address() . ' if you need help.';
		return;
	}
	$result = wrrapd_wrapstars_mark_offer_declined( $app_id, $note );
	if ( empty( $result['ok'] ) ) {
		$GLOBALS['wrrapd_ws_decline_error'] = $result['error'] ?? 'Could not decline.';
		return;
	}
	$GLOBALS['wrrapd_ws_decline_done'] = true;
}

function wrrapd_wrapstars_process_change_password() {
	if ( ! is_user_logged_in() ) {
		return;
	}
	if ( ! isset( $_POST['wrrapd_ws_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_ws_nonce'] ) ), 'wrrapd_ws_change_password' ) ) {
		$GLOBALS['wrrapd_ws_pw_error'] = 'Security check failed. Please try again.';
		return;
	}
	$user_id = get_current_user_id();
	if ( ! wrrapd_wrapstars_user_must_change_password( $user_id ) ) {
		wp_safe_redirect( wrrapd_wrapstars_pros_url( '/onboarding/' ) );
		exit;
	}
	$current = isset( $_POST['current_password'] ) ? (string) wp_unslash( $_POST['current_password'] ) : '';
	$new     = isset( $_POST['new_password'] ) ? (string) wp_unslash( $_POST['new_password'] ) : '';
	$confirm = isset( $_POST['confirm_password'] ) ? (string) wp_unslash( $_POST['confirm_password'] ) : '';
	$user    = get_userdata( $user_id );
	if ( ! $user || ! wp_check_password( $current, $user->user_pass, $user_id ) ) {
		$GLOBALS['wrrapd_ws_pw_error'] = 'Current (temporary) password is incorrect.';
		return;
	}
	if ( strlen( $new ) < 10 ) {
		$GLOBALS['wrrapd_ws_pw_error'] = 'Choose a new password with at least 10 characters.';
		return;
	}
	if ( $new !== $confirm ) {
		$GLOBALS['wrrapd_ws_pw_error'] = 'New password and confirmation do not match.';
		return;
	}
	if ( $new === $current ) {
		$GLOBALS['wrrapd_ws_pw_error'] = 'Pick a different password than the temporary one from your email.';
		return;
	}
	wp_set_password( $new, $user_id );
	$app = wrrapd_wrapstars_get_application_by_user( $user_id );
	wrrapd_wrapstars_set_must_change_password( $user_id, $app ? (int) $app->ID : 0, false );
	if ( $app ) {
		wrrapd_wrapstars_set_meta( $app->ID, 'password_changed_at', gmdate( 'c' ) );
	}
	// Re-authenticate after password reset (wp_set_password clears cookies).
	wp_set_current_user( $user_id );
	wp_set_auth_cookie( $user_id, true );
	wp_safe_redirect( wrrapd_wrapstars_pros_url( '/onboarding/' ) );
	exit;
}

function wrrapd_wrapstars_render_change_password_gate() {
	$error = $GLOBALS['wrrapd_ws_pw_error'] ?? '';
	$user  = wp_get_current_user();
	$greet = 'WrapStar';
	if ( $user && $user->ID ) {
		$app = wrrapd_wrapstars_get_application_by_user( (int) $user->ID );
		if ( $app ) {
			$greet = wrrapd_wrapstars_greeting_name( $app->ID );
			if ( $greet === 'there' ) {
				$greet = 'WrapStar';
			}
		}
	}
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapstars-onboarding-shell">
		<div class="wrrapd-wrapstars-ob-stage" style="max-width:28rem;margin:2rem auto;padding:0 1rem;">
			<div class="wrrapd-wrapstars-card wrrapd-wrapstars-card--hero">
				<p class="wrrapd-wrapstars-ob-stage__kicker">A quick first step</p>
				<h1 class="wrrapd-wrapstars-ob-stage__title">Choose your password, <?php echo esc_html( $greet ); ?></h1>
				<p class="wrrapd-wrapstars-ob-lead">Please replace the temporary password from your invitation with one you will remember. After that, onboarding begins.</p>
				<?php if ( $error ) : ?>
					<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $error ); ?></div>
				<?php endif; ?>
				<form method="post" class="wrrapd-wrapstars-form wrrapd-wrapstars-ob-actions">
					<?php wp_nonce_field( 'wrrapd_ws_change_password', 'wrrapd_ws_nonce' ); ?>
					<input type="hidden" name="wrrapd_ws_action" value="change_password" />
					<label>Current password
						<input type="password" name="current_password" required autocomplete="current-password" />
					</label>
					<label>New password (at least 10 characters)
						<input type="password" name="new_password" required minlength="10" autocomplete="new-password" />
					</label>
					<label>Confirm new password
						<input type="password" name="confirm_password" required minlength="10" autocomplete="new-password" />
					</label>
					<div class="wrrapd-wrapstars-login__actions">
						<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Save &amp; continue</button>
					</div>
				</form>
			</div>
		</div>
	</div>
	<?php
	return ob_get_clean();
}

function wrrapd_wrapstars_shortcode_decline() {
	$done  = ! empty( $GLOBALS['wrrapd_ws_decline_done'] );
	$error = $GLOBALS['wrrapd_ws_decline_error'] ?? '';
	$app_id = isset( $_GET['app'] ) ? (int) $_GET['app'] : (int) ( $_POST['app_id'] ?? 0 );
	$token  = isset( $_GET['token'] ) ? sanitize_text_field( wp_unslash( $_GET['token'] ) ) : sanitize_text_field( wp_unslash( $_POST['token'] ?? '' ) );

	ob_start();
	echo '<div class="wrrapd-wrapstars wrrapd-wrapstars-dasher">';
	echo '<section class="wrrapd-wrapstars-dasher-apply-head">';
	echo '<p class="wrrapd-wrapstars-dasher-kicker">WrapStar invitation</p>';
	echo '<h1>Decline offer</h1>';
	echo '</section>';

	if ( $done ) {
		echo '<div class="wrrapd-wrapstars-card"><div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--ok">Your WrapStar invitation has been declined. We\'ve closed portal access for this offer. Thank you for letting us know.</div>';
		echo '<p class="wrrapd-wrapstars-form-foot"><a href="' . esc_url( wrrapd_wrapstars_apply_url( '/' ) ) . '">Back to WrapStars</a></p></div>';
		echo '</div>';
		return ob_get_clean();
	}

	$stored = $app_id ? (string) wrrapd_wrapstars_get_meta( $app_id, 'decline_token' ) : '';
	$status = $app_id ? (string) wrrapd_wrapstars_get_meta( $app_id, 'status' ) : '';
	if ( $status === 'declined' ) {
		echo '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">This invitation was already declined.</div></div>';
		return ob_get_clean();
	}
	if ( $app_id && wrrapd_wrapstars_invite_is_expired( $app_id ) ) {
		wrrapd_wrapstars_invalidate_expired_invite( $app_id );
		echo '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err">This invitation expired after 15 days. If you need help, email ' . esc_html( wrrapd_wrapstars_from_email_address() ) . '.</div></div>';
		return ob_get_clean();
	}
	if ( ! $app_id || $token === '' || $stored === '' || ! hash_equals( $stored, $token ) ) {
		echo '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err">This decline link is invalid or expired. If you need help, email ' . esc_html( wrrapd_wrapstars_from_email_address() ) . '.</div></div>';
		return ob_get_clean();
	}
	if ( $status !== 'approved' ) {
		echo '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err">This invitation can no longer be declined online.</div></div>';
		return ob_get_clean();
	}

	$name = wrrapd_wrapstars_get_meta( $app_id, 'full_name' );
	if ( $error ) {
		echo '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err">' . esc_html( $error ) . '</div>';
	}
	?>
	<div class="wrrapd-wrapstars-card">
		<p>Hi <?php echo esc_html( $name !== '' ? $name : 'there' ); ?>, you're about to decline your WrapStar invitation. Portal login credentials from your approval email will stop working.</p>
		<form method="post" class="wrrapd-wrapstars-form">
			<?php wp_nonce_field( 'wrrapd_ws_decline', 'wrrapd_ws_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="decline_offer" />
			<input type="hidden" name="app_id" value="<?php echo esc_attr( (string) $app_id ); ?>" />
			<input type="hidden" name="token" value="<?php echo esc_attr( $token ); ?>" />
			<label>Optional note for our team
				<textarea name="decline_note" rows="3" placeholder="Reason or timing (optional)"></textarea>
			</label>
			<button type="submit" class="wrrapd-wrapstars-btn" style="background:#b91c1c;">Confirm decline</button>
		</form>
		<p class="wrrapd-wrapstars-form-foot">Changed your mind? <a href="<?php echo esc_url( wrrapd_wrapstars_portal_login_url( wrrapd_wrapstars_pros_url( '/onboarding/' ) ) ); ?>">Log in to onboarding</a></p>
	</div>
	</div>
	<?php
	return ob_get_clean();
}

function wrrapd_wrapstars_output_theme_cleanup_css() {
	if ( is_admin() ) {
		return;
	}
	static $done = false;
	if ( $done ) {
		return;
	}
	$done = true;
	echo '<style id="wrrapd-wrapstars-theme-cleanup">';
	/* Never reveal WordPress chrome on apply/pros portals — including logged-in admins. */
	echo 'html.wrrapd-wrapstars-portal,html.wrrapd-wrapstars-portal.admin-bar,html:has(body.wrrapd-wrapstars-portal),html:has(body.wrrapd-wrapstars-portal).admin-bar,body.wrrapd-wrapstars-portal.admin-bar,body.admin-bar{margin-top:0!important;padding-top:0!important;}';
	echo '#wpadminbar,html #wpadminbar,body #wpadminbar,body.wrrapd-wrapstars-portal #wpadminbar{display:none!important;visibility:hidden!important;opacity:0!important;height:0!important;max-height:0!important;overflow:hidden!important;pointer-events:none!important;}';
	echo 'body.wrrapd-wrapstars-portal .edit-link,body.wrrapd-wrapstars-portal .post-edit-link,body.wrrapd-wrapstars-portal .wp-block-post-edit-link{display:none!important;}';
	echo 'body.wrrapd-wrapstars-portal,body.wrrapd-wrapstars-portal button,body.wrrapd-wrapstars-portal input,body.wrrapd-wrapstars-portal select,body.wrrapd-wrapstars-portal textarea,body.wrrapd-wrapstars-portal label,body.wrrapd-wrapstars-portal a,body.wrrapd-wrapstars-portal p,body.wrrapd-wrapstars-portal li,body.wrrapd-wrapstars-portal h1,body.wrrapd-wrapstars-portal h2,body.wrrapd-wrapstars-portal h3{font-family:Fraunces,Georgia,serif!important;}';
	echo 'body.wrrapd-wrapstars-portal header.wp-block-template-part,body.wrrapd-wrapstars-portal footer.wp-block-template-part,body.wrrapd-wrapstars-portal header.wp-block-group,body.wrrapd-wrapstars-portal header:not(.wrrapd-wrapstars-site-header):not(.wrrapd-wrapstars-ob-topbar),body.wrrapd-wrapstars-portal .wp-site-blocks>header{display:none!important;height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .wp-block-site-title,body.wrrapd-wrapstars-portal nav.wp-block-navigation,body.wrrapd-wrapstars-portal nav.wp-block-navigation-submenu,body.wrrapd-wrapstars-portal .wp-block-navigation__responsive-container,body.wrrapd-wrapstars-portal #site-navigation,body.wrrapd-wrapstars-portal .wp-block-post-title,body.wrrapd-wrapstars-portal .entry-header,body.wrrapd-wrapstars-portal h1.wp-block-post-title{display:none!important;height:0!important;margin:0!important;padding:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .wp-block-template-part,body.wrrapd-wrapstars-portal .powered-by,body.wrrapd-wrapstars-portal a[href*="wordpress.org"]{display:none!important;}';
	echo 'body.wrrapd-wrapstars-portal,body.wrrapd-wrapstars-portal .wp-site-blocks,body.wrrapd-wrapstars-portal article,body.wrrapd-wrapstars-portal .type-page{padding:0!important;margin:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .wp-site-blocks{padding-top:0!important;margin-top:0!important;gap:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .wp-site-blocks>*{margin-block-start:0!important;margin-block-end:0!important;}';
	echo 'body.wrrapd-wrapstars-portal main.wp-block-group,body.wrrapd-wrapstars-portal main.wp-block-group>.wp-block-group,body.wrrapd-wrapstars-portal .entry-content,body.wrrapd-wrapstars-portal .wp-block-post-content{margin:0!important;padding:0!important;max-width:none!important;padding-block:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .has-global-padding,body.wrrapd-wrapstars-portal .wp-block-group.has-global-padding{padding:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .is-layout-flow>*+*,body.wrrapd-wrapstars-portal .is-layout-constrained>*+*{margin-block-start:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .wp-block-group__inner-container{padding:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .is-layout-constrained > :where(:not(.alignleft):not(.alignright):not(.alignfull)){max-width:none!important;margin-inline:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .entry-content > *:first-child,body.wrrapd-wrapstars-portal .wp-block-post-content > *:first-child{margin-top:0!important;padding-top:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .elementor,body.wrrapd-wrapstars-portal .elementor .e-con,body.wrrapd-wrapstars-portal .elementor .e-con-inner,body.wrrapd-wrapstars-portal .elementor-shortcode,body.wrrapd-wrapstars-portal .elementor-widget-shortcode,body.wrrapd-wrapstars-portal .elementor-widget-container{margin:0!important;padding:0!important;max-width:none!important;width:100%!important;background:transparent!important;overflow:visible!important;min-height:0!important;}';
	/* Empty Elementor chrome above shortcodes = white strip under portal header */
	echo 'body.wrrapd-wrapstars-portal .elementor > .e-con:not(:has(.wrrapd-wrapstars)):not(:has(.wrrapd-drivers)){display:none!important;height:0!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important;}';
	echo 'body.wrrapd-wrapstars-portal .elementor-widget-text-editor:not(:has(img)):not(:has(video)):not(:has(iframe)):has(p:empty){display:none!important;height:0!important;margin:0!important;padding:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .entry-content .wrrapd-wrapstars-site-footer{display:none!important;}';
	echo 'body.wrrapd-wrapstars-portal .wrrapd-wrapstars-dasher,body.wrrapd-wrapstars-portal .wrrapd-drivers{padding-top:0!important;margin-top:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .wrrapd-wrapstars-site-header+.wp-site-blocks,body.wrrapd-wrapstars-portal .wrrapd-wrapstars-site-header~.wp-site-blocks,body.wrrapd-wrapstars-portal .wrrapd-wrapstars-site-header+.elementor,body.wrrapd-wrapstars-portal .wrrapd-wrapstars-site-header~.elementor{margin-top:0!important;padding-top:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .site,body.wrrapd-wrapstars-portal #page{margin:0!important;padding:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .wrrapd-wrapstars-cinema-hero{margin-top:0!important;}';
	/* SiteGround AI Agent chat bubble (logged-in front-end) + leftover theme chrome */
	echo '#sg-ai-studio-root,#sg-ai-studio,.sg-ai-studio,.sgai-widget,.sg-assistant,[class*="sg-ai"],[id*="sg-ai"],[class*="sgai-"],[id*="sgai-"],iframe[src*="ai-studio"],iframe[src*="sg-ai"]{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important;}';
	echo 'body.wrrapd-wrapstars-portal footer.wp-block-template-part,body.wrrapd-wrapstars-portal .wp-block-template-part[class*="footer"],body.wrrapd-wrapstars-portal .powered-by,body.wrrapd-wrapstars-portal .wp-block-site-tagline{display:none!important;height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;}';
	echo '</style>';
}
add_action( 'wp_head', 'wrrapd_wrapstars_output_theme_cleanup_css', 0 );
add_action( 'wp_footer', 'wrrapd_wrapstars_output_theme_cleanup_css', 1 );

/**
 * All public copy for the apply.wrrapd.com landing page, in one place.
 *
 * Edit text here; `wrrapd_wrapstars_shortcode_landing()` only renders it.
 * Rules: see docs/WRAPSTARS-OPERATIONS-MODEL.md §2 — no pay mechanics, no tips,
 * no delivery/pickup by WrapStars, no description of how orders are routed.
 * Strings may contain <strong>/<em>; they are printed through wp_kses_post().
 *
 * @return array<string, mixed>
 */
function wrrapd_wrapstars_landing_content() {
	return array(
		'hero'      => array(
			'kicker'  => 'Now accepting applications · Florida &amp; Georgia',
			'title'   => 'Become a WrapStar',
			'tagline' => 'Turn your gift-wrapping talent into income.',
			'sub'     => 'Wrap beautiful gifts from your own space, on your own schedule. We bring the packages to you and collect them when you&rsquo;re done — you bring the magic.',
			'cta'     => 'Start your application',
			'note'    => 'Takes about five minutes',
		),
		'band'      => array(
			array(
				'title' => 'Wrap from where you are',
				'text'  => 'Your home studio, your craft room, your kitchen table. Packages come to you and are collected when they&rsquo;re ready — no driving, no storefront, no commute.',
			),
			array(
				'title' => 'Get paid for your craft',
				'text'  => 'Every finished order pays. Earn per completed wrap with reliable, scheduled payouts — and more orders when the gifting seasons heat up.',
			),
			array(
				'title' => 'Make the moment',
				'text'  => 'Every box is someone&rsquo;s surprise. You are the hands behind the ribbon that makes unwrapping unforgettable.',
			),
		),
		'how'       => array(
			'title' => 'How it works',
			'steps' => array(
				array( 'title' => 'Apply in minutes', 'text' => 'A few quick questions, a little about your wrapping style, and a photo ID.' ),
				array( 'title' => 'Get approved &amp; onboard', 'text' => 'A brief video chat, then e-sign your agreement and complete a short orientation.' ),
				array( 'title' => 'Receive your orders', 'text' => 'Gifts and wrapping instructions arrive at your wrapping space during a window you choose.' ),
				array( 'title' => 'Wrap, snap, hand back', 'text' => 'Wrap to Wrrapd standards, share a quick photo or short video, and hand the finished gifts over. Done.' ),
			),
		),
		'perks'     => array(
			'title' => 'Why WrapStars love it',
			'items' => array(
				array( 'title' => 'Flexible windows', 'text' => 'Tell us when you&rsquo;re available. Wrap around your life, not the other way around.' ),
				array( 'title' => 'Focus on the craft', 'text' => 'No customer calls, no doorsteps, no deliveries. Just you, the paper, and the ribbon.' ),
				array( 'title' => 'Standards &amp; support', 'text' => 'Clear presentation guides, supply recommendations, and a team that has your back.' ),
				array( 'title' => 'Seasons that sparkle', 'text' => 'Holidays, birthdays, graduations, and weddings keep the orders coming all year long.' ),
				array( 'title' => 'Custom &amp; creative', 'text' => 'Bonus opportunities for WrapStars who can print or design custom wrapping paper.' ),
				array( 'title' => 'Be first', 'text' => 'Join the founding network of WrapStars in Florida and Georgia as Wrrapd grows.' ),
			),
		),
		'reqs'      => array(
			'title' => 'Requirements',
			'items' => array(
				array(
					'title' => 'Age &amp; location',
					'text'  => 'WrapStars must be <strong>19 years or older</strong>.',
					'note'  => 'Launching in <strong>Florida</strong> and <strong>Georgia</strong> first — applicants in other states are welcome; opportunities may be limited initially.',
				),
				array(
					'title' => 'Space &amp; supplies',
					'text'  => 'A clean, dedicated wrapping area (home is perfect), quality paper, ribbon and tools, and a smartphone for photos.',
					'note'  => '',
				),
				array(
					'title' => 'Ready to onboard',
					'text'  => 'A government-issued photo ID to apply. After approval you&rsquo;ll e-sign your agreement, complete orientation and tax forms, and verify insurance before your first order.',
					'note'  => '',
				),
			),
		),
		'faq'       => array(
			'title' => 'Frequently asked questions',
			'items' => array(
				array(
					'q' => 'What does a WrapStar actually do?',
					'a' => 'You wrap. Gifts arrive at your wrapping space with clear instructions; you wrap them beautifully, share a quick photo or short video of the finished work, and hand them back. No driving, no deliveries, no customer calls.',
				),
				array(
					'q' => 'Do I need to deliver anything or pick anything up?',
					'a' => 'No. Drop-offs and pickups are handled for you. Your only job is to make each gift look incredible.',
				),
				array(
					'q' => 'How do I get paid?',
					'a' => 'You earn for every completed order and are paid on a regular payout schedule. Full payout details are shared during onboarding. WrapStars are independent contractors, not employees.',
				),
				array(
					'q' => 'Where is WrapStars available?',
					'a' => 'We are launching in <strong>Florida</strong> and <strong>Georgia</strong>. Applicants in other states are welcome — opportunities may be limited at first as the network grows.',
				),
				array(
					'q' => 'How long does it take to start?',
					'a' => 'The application takes about five minutes. We review submissions within about seven days and may invite you to a brief video conversation. After approval you complete onboarding — agreement, orientation, tax forms, and insurance — before receiving your first orders.',
				),
				array(
					'q' => 'What supplies do I need?',
					'a' => 'Quality wrapping paper, ribbon, tissue, scissors, tape, and a neat space to work. During onboarding we walk you through Wrrapd presentation standards and share our favorite supply sources.',
				),
				array(
					'q' => 'How quickly do orders need to be finished?',
					'a' => 'Gifting is time-sensitive, so most orders are wrapped the <strong>same day</strong> they arrive, within the window you have agreed to. You always know the window up front.',
				),
				array(
					'q' => 'Is gift-wrapping experience required?',
					'a' => 'Not necessarily. We look for care, presentation, and reliability — the qualities that make every unwrap feel special. A photo of something you have wrapped can help, but attitude and follow-through matter most.',
				),
				array(
					'q' => 'When will I hear back about my application?',
					'a' => 'Within about seven days. Updates come from admin@wrrapd.com — we may invite you to a Zoom or phone conversation before a final decision.',
				),
				array(
					'q' => 'When do I receive login access?',
					'a' => 'After approval only. Your credentials and onboarding link arrive by email from admin@wrrapd.com. There is no login while your application is under review.',
				),
			),
		),
		'drivers'   => array(
			'title' => 'Prefer to be on the road?',
			'text'  => 'Wrrapd also welcomes local JoyRiders who pick up finished gifts and deliver them to the door — a separate role from gift-wrapping.',
			'cta'   => 'JoyRider applications',
		),
		'final_cta' => array(
			'title' => 'Ready to become a WrapStar?',
			'text'  => 'Have your driver license or passport handy — the application takes about five minutes.',
			'cta'   => 'Apply now',
		),
	);
}

function wrrapd_wrapstars_shortcode_landing() {
	$video = wrrapd_wrapstars_hero_video_url();
	$c     = wrrapd_wrapstars_landing_content();
	$apply = wrrapd_wrapstars_apply_url( '/apply/' );
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapstars-dasher">
		<section class="wrrapd-wrapstars-cinema-hero">
			<div class="wrrapd-wrapstars-cinema-hero__media" aria-hidden="true">
				<?php if ( $video !== '' ) : ?>
					<video class="wrrapd-wrapstars-cinema-hero__video" src="<?php echo esc_url( $video ); ?>" autoplay muted loop playsinline preload="metadata"></video>
				<?php else : ?>
					<div class="wrrapd-wrapstars-cinema-hero__fallback"></div>
				<?php endif; ?>
			</div>
			<div class="wrrapd-wrapstars-cinema-hero__scrim" aria-hidden="true"></div>
			<div class="wrrapd-wrapstars-cinema-hero__content">
				<p class="wrrapd-wrapstars-cinema-hero__kicker"><?php echo wp_kses_post( $c['hero']['kicker'] ); ?></p>
				<h1><?php echo wp_kses_post( $c['hero']['title'] ); ?></h1>
				<p class="wrrapd-wrapstars-cinema-hero__tagline"><?php echo wp_kses_post( $c['hero']['tagline'] ); ?></p>
				<p class="wrrapd-wrapstars-cinema-hero__sub"><?php echo wp_kses_post( $c['hero']['sub'] ); ?></p>
				<a class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--xl wrrapd-wrapstars-btn--hero" href="<?php echo esc_url( $apply ); ?>"><?php echo wp_kses_post( $c['hero']['cta'] ); ?></a>
				<?php if ( ! empty( $c['hero']['note'] ) ) : ?>
					<p class="wrrapd-wrapstars-cinema-hero__note"><?php echo wp_kses_post( $c['hero']['note'] ); ?></p>
				<?php endif; ?>
			</div>
		</section>

		<div class="wrrapd-wrapstars-dasher-body">
			<section class="wrrapd-wrapstars-dasher-band">
				<?php foreach ( $c['band'] as $item ) : ?>
					<div class="wrrapd-wrapstars-dasher-band__item wrrapd-wrapstars-dasher-box">
						<h2><?php echo wp_kses_post( $item['title'] ); ?></h2>
						<p><?php echo wp_kses_post( $item['text'] ); ?></p>
					</div>
				<?php endforeach; ?>
			</section>

			<section class="wrrapd-wrapstars-how">
				<h2 class="wrrapd-wrapstars-section-title"><?php echo wp_kses_post( $c['how']['title'] ); ?></h2>
				<ol class="wrrapd-wrapstars-how__list">
					<?php foreach ( $c['how']['steps'] as $i => $step ) : ?>
						<li class="wrrapd-wrapstars-how__step">
							<span class="wrrapd-wrapstars-how__num" aria-hidden="true"><?php echo (int) ( $i + 1 ); ?></span>
							<h3><?php echo wp_kses_post( $step['title'] ); ?></h3>
							<p><?php echo wp_kses_post( $step['text'] ); ?></p>
						</li>
					<?php endforeach; ?>
				</ol>
				<p class="wrrapd-wrapstars-how__cta"><a class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--xl" href="<?php echo esc_url( $apply ); ?>"><?php echo wp_kses_post( $c['hero']['cta'] ); ?></a></p>
			</section>

			<section class="wrrapd-wrapstars-perks">
				<h2 class="wrrapd-wrapstars-section-title"><?php echo wp_kses_post( $c['perks']['title'] ); ?></h2>
				<ul class="wrrapd-wrapstars-perks__grid">
					<?php foreach ( $c['perks']['items'] as $perk ) : ?>
						<li class="wrrapd-wrapstars-perks__item">
							<span class="wrrapd-wrapstars-perks__mark" aria-hidden="true">✓</span>
							<div>
								<h3><?php echo wp_kses_post( $perk['title'] ); ?></h3>
								<p><?php echo wp_kses_post( $perk['text'] ); ?></p>
							</div>
						</li>
					<?php endforeach; ?>
				</ul>
			</section>

			<section class="wrrapd-wrapstars-reqs-dd">
				<h2 class="wrrapd-wrapstars-section-title"><?php echo wp_kses_post( $c['reqs']['title'] ); ?></h2>
				<div class="wrrapd-wrapstars-reqs-dd__grid">
					<?php foreach ( $c['reqs']['items'] as $i => $req ) : ?>
						<div class="wrrapd-wrapstars-reqs-dd__item">
							<span class="wrrapd-wrapstars-reqs-dd__num" aria-hidden="true"><?php echo (int) ( $i + 1 ); ?></span>
							<h3><?php echo wp_kses_post( $req['title'] ); ?></h3>
							<p><?php echo wp_kses_post( $req['text'] ); ?></p>
							<?php if ( ! empty( $req['note'] ) ) : ?>
								<p class="wrrapd-wrapstars-reqs-dd__note"><?php echo wp_kses_post( $req['note'] ); ?></p>
							<?php endif; ?>
						</div>
					<?php endforeach; ?>
				</div>
			</section>

			<section class="wrrapd-wrapstars-faq-dd">
				<h2 class="wrrapd-wrapstars-section-title"><?php echo wp_kses_post( $c['faq']['title'] ); ?></h2>
				<?php foreach ( $c['faq']['items'] as $faq ) : ?>
					<details class="wrrapd-wrapstars-faq-dd__item">
						<summary><?php echo wp_kses_post( $faq['q'] ); ?></summary>
						<p><?php echo wp_kses_post( $faq['a'] ); ?></p>
					</details>
				<?php endforeach; ?>
			</section>

			<section class="wrrapd-wrapstars-dasher-box wrrapd-wrapstars-dasher-box--wide" style="margin-bottom:1.5rem;">
				<h2><?php echo wp_kses_post( $c['drivers']['title'] ); ?></h2>
				<p><?php echo wp_kses_post( $c['drivers']['text'] ); ?></p>
				<a class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--xl" href="<?php echo esc_url( wrrapd_wrapstars_apply_url( '/drive/' ) ); ?>"><?php echo wp_kses_post( $c['drivers']['cta'] ); ?></a>
			</section>

			<section class="wrrapd-wrapstars-dasher-cta wrrapd-wrapstars-dasher-box wrrapd-wrapstars-dasher-box--wide">
				<h2><?php echo wp_kses_post( $c['final_cta']['title'] ); ?></h2>
				<p><?php echo wp_kses_post( $c['final_cta']['text'] ); ?></p>
				<a class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--xl" href="<?php echo esc_url( $apply ); ?>"><?php echo wp_kses_post( $c['final_cta']['cta'] ); ?></a>
			</section>
		</div>
	</div>
	<?php
	return ob_get_clean();
}

function wrrapd_wrapstars_shortcode_thankyou() {
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapstars-dasher">
		<section class="wrrapd-wrapstars-dasher-apply-head">
			<p class="wrrapd-wrapstars-dasher-kicker">Application received</p>
			<h1>Thank you for applying</h1>
			<p class="wrrapd-wrapstars-dasher-lead">We've received your WrapStar application. We'll be in touch within about <strong>7 days</strong>. Watch for email from <strong>admin@wrrapd.com</strong>.</p>
		</section>
		<div class="wrrapd-wrapstars-card wrrapd-wrapstars-dasher-thanks wrrapd-wrapstars-dasher-thanks--celebrate">
			<ul>
				<li>Your application is <strong>under review</strong>.</li>
				<li>Decisions are typically made within <strong>about 7 days</strong>.</li>
				<li>We may contact you for a brief <strong>Zoom or phone interview</strong>.</li>
				<li>If approved, you'll receive <strong>login credentials</strong> and a link to start onboarding.</li>
			</ul>
			<p class="wrrapd-wrapstars-dasher-thanks__note">There is no login until you are approved — we'll email you when it's time.</p>
			<div class="wrrapd-wrapstars-thanks-actions">
				<a class="wrrapd-wrapstars-btn" href="<?php echo esc_url( wrrapd_wrapstars_apply_url( '/' ) ); ?>">Back to WrapStar home</a>
				<a class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--ghost" href="https://wrrapd.com/">Visit wrrapd.com</a>
			</div>
		</div>
	</div>
	<?php
	return ob_get_clean();
}

function wrrapd_wrapstars_shortcode_status() {
	return '<div class="wrrapd-wrapstars"><div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">Application status is sent by email. If you are approved, use the login link and credentials in your approval email.</div></div>';
}

function wrrapd_wrapstars_shortcode_login() {
	$redirect = isset( $_GET['redirect_to'] ) ? esc_url_raw( wp_unslash( $_GET['redirect_to'] ) ) : '';
	$error    = $GLOBALS['wrrapd_ws_login_error'] ?? '';
	if ( $error === '' && ! empty( $_GET['invite_expired'] ) ) {
		$error = 'This onboarding invitation expired after 15 days. Email us and we will send you a fresh welcome email.';
	}
	$greet    = isset( $_GET['greet'] ) ? sanitize_text_field( wp_unslash( $_GET['greet'] ) ) : '';
	if ( $greet === '' && ! empty( $_POST['greet'] ) ) {
		$greet = sanitize_text_field( wp_unslash( $_POST['greet'] ) );
	}
	if ( $greet === '' && ! empty( $_POST['email'] ) ) {
		$app = wrrapd_wrapstars_get_application_by_email( sanitize_email( wp_unslash( $_POST['email'] ) ) );
		if ( $app ) {
			$greet = wrrapd_wrapstars_greeting_name( $app->ID );
		}
	}
	$welcome = $greet !== '' && strcasecmp( $greet, 'there' ) !== 0
		? 'Welcome to your onboarding, ' . $greet . '!'
		: 'Welcome to your onboarding!';

	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapstars-login">
		<section class="wrrapd-wrapstars-login__head">
			<p class="wrrapd-wrapstars-login__eyebrow">WrapStar onboarding</p>
			<h1><?php echo esc_html( $welcome ); ?></h1>
			<p class="wrrapd-wrapstars-login__lead">We are honored you are here. Please sign in to continue — you will choose your own password before onboarding begins.</p>
		</section>
		<?php if ( $error ) : ?>
			<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $error ); ?></div>
		<?php endif; ?>
		<form class="wrrapd-wrapstars-form wrrapd-wrapstars-card wrrapd-wrapstars-login__form" method="post" action="">
			<?php wp_nonce_field( 'wrrapd_ws_login', 'wrrapd_ws_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="portal_login" />
			<?php if ( $redirect !== '' ) : ?>
				<input type="hidden" name="redirect_to" value="<?php echo esc_attr( $redirect ); ?>" />
			<?php endif; ?>
			<?php if ( $greet !== '' ) : ?>
				<input type="hidden" name="greet" value="<?php echo esc_attr( $greet ); ?>" />
			<?php endif; ?>
			<label>Email address <input type="email" name="email" required autocomplete="username" /></label>
			<label>Password <input type="password" name="password" required autocomplete="current-password" /></label>
			<label class="ws-check"><input type="checkbox" name="remember" value="1" /> <span>Keep me signed in</span></label>
			<div class="wrrapd-wrapstars-login__actions">
				<button type="submit" class="wrrapd-wrapstars-btn">Log in</button>
			</div>
		</form>
		<p class="wrrapd-wrapstars-form-foot">Not yet approved? <a href="<?php echo esc_url( wrrapd_wrapstars_apply_url( '/apply/' ) ); ?>">Apply to become a WrapStar</a></p>
	</div>
	<?php
	return ob_get_clean();
}

function wrrapd_wrapstars_shortcode_onboarding( $atts ) {
	if ( ! wrrapd_wrapstars_is_pros_host() && ! wrrapd_wrapstars_unified_host() ) {
		return '<p>Onboarding is at <a href="' . esc_url( wrrapd_wrapstars_pros_url( '/onboarding/' ) ) . '">pros.wrrapd.com</a>.</p>';
	}
	if ( ! is_user_logged_in() ) {
		return '<p>Please <a href="' . esc_url( wrrapd_wrapstars_portal_login_url( wrrapd_wrapstars_pros_url( '/onboarding/' ) ) ) . '">log in</a>.</p>';
	}

	$user_id = get_current_user_id();
	if ( wrrapd_wrapstars_enforce_active_invite_or_logout( $user_id ) ) {
		wp_safe_redirect(
			add_query_arg(
				'invite_expired',
				'1',
				wrrapd_wrapstars_portal_login_url( wrrapd_wrapstars_pros_url( '/onboarding/' ) )
			)
		);
		exit;
	}
	if ( wrrapd_wrapstars_user_must_change_password( $user_id ) ) {
		return wrrapd_wrapstars_render_change_password_gate();
	}

	$atts = shortcode_atts( array( 'step' => '' ), $atts, 'wrrapd_wrapstar_onboarding' );
	$step = $atts['step'] !== '' ? wrrapd_wrapstars_normalize_step_key( $atts['step'] ) : wrrapd_wrapstars_detect_onboarding_step_from_uri();

	$app    = wrrapd_wrapstars_get_application_by_user( $user_id );
	$status = $app ? (string) wrrapd_wrapstars_get_meta( $app->ID, 'status' ) : '';
	if ( $status === 'declined' ) {
		return '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">This WrapStar invitation was declined. Contact ' . esc_html( wrrapd_wrapstars_from_email_address() ) . ' if that was a mistake.</div>';
	}
	if ( ! $app || $status !== 'approved' ) {
		return '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">Onboarding is available after approval. Check your email for login credentials.</div>';
	}

	$registry = wrrapd_wrapstars_onboarding_step_registry();
	if ( ! isset( $registry[ $step ] ) ) {
		$step = 'welcome';
	}
	if ( ! wrrapd_wrapstars_can_access_step( $app->ID, $step ) ) {
		// Shortcodes render after headers are sent — link instead of redirecting.
		$current = wrrapd_wrapstars_normalize_step_key( wrrapd_wrapstars_get_meta( $app->ID, 'onboarding_step', 'welcome' ) );
		$label   = $registry[ $current ]['label'] ?? 'your next step';
		return '<div class="wrrapd-wrapstars wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">This step unlocks after the ones before it. <a href="' . esc_url( wrrapd_wrapstars_onboarding_step_url( $current ) ) . '">Continue with ' . esc_html( $label ) . '</a></div>';
	}

	$step_keys  = array_keys( $registry );
	$step_total = count( $step_keys );
	$step_index = array_search( $step, $step_keys, true );
	if ( $step_index === false ) {
		$step_index = 0;
	}
	$step_num   = $step_index + 1;
	$done_count = 0;
	$minutes_left = 0;
	foreach ( $step_keys as $key ) {
		if ( $key === 'activation' ) {
			continue;
		}
		if ( wrrapd_wrapstars_step_complete( $app->ID, $key ) ) {
			$done_count++;
		} else {
			$minutes_left += (int) $registry[ $key ]['minutes'];
		}
	}
	$trackable    = max( 1, $step_total - 1 );
	$progress_pct = (int) min( 100, round( ( $done_count / $trackable ) * 100 ) );
	$display      = wrrapd_wrapstars_greeting_name( $app->ID );
	if ( $display === 'there' ) {
		$display = 'WrapStar';
	}
	$current       = $registry[ $step ];
	$current_label = $current['label'];
	$next_key      = wrrapd_wrapstars_next_onboarding_step( $step );
	$next_meta     = $registry[ $next_key ] ?? null;

	ob_start();
	echo '<div class="wrrapd-wrapstars wrrapd-wrapstars-onboarding-shell">';

	// Mobile top bar.
	echo '<header class="wrrapd-wrapstars-ob-topbar" role="banner">';
	echo '<button type="button" class="wrrapd-wrapstars-ob-menu-btn" data-ws-ob-nav-open aria-controls="wrrapd-ws-ob-nav" aria-expanded="false">Steps</button>';
	echo '<div class="wrrapd-wrapstars-ob-topbar__center">';
	echo '<span class="wrrapd-wrapstars-ob-topbar__eyebrow">WrapStar onboarding</span>';
	echo '<strong class="wrrapd-wrapstars-ob-topbar__step">' . esc_html( $current_label ) . '</strong>';
	echo '</div>';
	echo '<a class="wrrapd-wrapstars-ob-topbar__logout" href="' . esc_url( wp_logout_url( home_url( '/' ) ) ) . '">Log out</a>';
	echo '</header>';

	echo '<button type="button" class="wrrapd-wrapstars-ob-backdrop" data-ws-ob-nav-close aria-label="Close steps menu" hidden></button>';

	echo '<div class="wrrapd-wrapstars-onboarding">';

	// ---- Left rail -------------------------------------------------------
	echo '<aside id="wrrapd-ws-ob-nav" class="wrrapd-wrapstars-onboarding-nav" aria-label="Onboarding steps">';
	echo '<div class="wrrapd-wrapstars-onboarding-nav__brand">';
	echo '<a href="' . esc_url( wrrapd_wrapstars_pros_url( '/onboarding/' ) ) . '">';
	echo '<img src="' . esc_url( wrrapd_wrapstars_brand_logo_url() ) . '" width="160" height="92" alt="Wrrapd" decoding="async" />';
	echo '</a>';
	echo '<p class="wrrapd-wrapstars-onboarding-nav__title">WrapStar onboarding</p>';
	echo '<p class="wrrapd-wrapstars-onboarding-nav__hello">Hi, ' . esc_html( $display ) . '</p>';
	echo '</div>';

	echo '<div class="wrrapd-wrapstars-ob-progress" aria-label="Onboarding progress">';
	echo '<div class="wrrapd-wrapstars-ob-progress__meta"><span>Progress</span><span>' . esc_html( (string) $progress_pct ) . '%</span></div>';
	echo '<div class="wrrapd-wrapstars-ob-progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' . esc_attr( (string) $progress_pct ) . '">';
	echo '<span class="wrrapd-wrapstars-ob-progress__fill" style="width:' . esc_attr( (string) $progress_pct ) . '%"></span>';
	echo '</div>';
	echo '<p class="wrrapd-wrapstars-ob-progress__hint">' . esc_html( (string) $done_count ) . ' of ' . esc_html( (string) $trackable ) . ' steps done';
	if ( $minutes_left > 0 ) {
		echo ' · about ' . esc_html( (string) $minutes_left ) . ' min left';
	}
	echo '</p>';
	echo '</div>';

	echo '<nav class="wrrapd-wrapstars-ob-stepnav">';
	echo '<ul class="wrrapd-wrapstars-steps wrrapd-wrapstars-steps--sidebar">';
	$i          = 0;
	$last_group = '';
	foreach ( $registry as $key => $meta ) {
		$i++;
		if ( $meta['group'] !== $last_group ) {
			echo '<li class="wrrapd-wrapstars-ob-stepgroup" aria-hidden="true">' . esc_html( $meta['group'] ) . '</li>';
			$last_group = $meta['group'];
		}
		$is_done = wrrapd_wrapstars_step_complete( $app->ID, $key );
		$cls     = 'is-locked';
		if ( $is_done ) {
			$cls = 'is-done';
		} elseif ( $key === $step ) {
			$cls = 'is-current';
		}
		if ( $key === $step ) {
			$cls .= ' is-active';
		}
		$can_open = wrrapd_wrapstars_can_access_step( $app->ID, $key );
		$mark     = $is_done ? '✓' : (string) $i;
		echo '<li class="' . esc_attr( $cls ) . '">';
		$inner  = '<span class="wrrapd-wrapstars-ob-stepmark" aria-hidden="true">' . esc_html( $mark ) . '</span>';
		$inner .= '<span class="wrrapd-wrapstars-ob-steplabel"><span class="wrrapd-wrapstars-ob-steplabel__name">' . esc_html( $meta['label'] ) . '</span>';
		$inner .= '<span class="wrrapd-wrapstars-ob-steplabel__short">' . esc_html( $is_done ? 'Complete' : $meta['short'] ) . '</span></span>';
		if ( $can_open ) {
			echo '<a href="' . esc_url( wrrapd_wrapstars_onboarding_step_url( $key ) ) . '"' . ( $key === $step ? ' aria-current="step"' : '' ) . '>' . $inner . '</a>';
		} else {
			echo '<span>' . $inner . '</span>';
		}
		echo '</li>';
	}
	echo '</ul></nav>';

	echo '<div class="wrrapd-wrapstars-onboarding-nav__foot">';
	echo '<a href="' . esc_url( wrrapd_wrapstars_pros_url( '/profile/' ) ) . '">Profile</a>';
	echo '<a href="mailto:' . esc_attr( wrrapd_wrapstars_from_email_address() ) . '">Help</a>';
	echo '<a href="' . esc_url( wp_logout_url( home_url( '/' ) ) ) . '">Log out</a>';
	echo '</div>';
	echo '</aside>';

	// ---- Main stage ------------------------------------------------------
	echo '<div class="wrrapd-wrapstars-onboarding-main">';
	echo '<div class="wrrapd-wrapstars-ob-stage">';
	echo '<header class="wrrapd-wrapstars-ob-stage__header">';
	echo '<p class="wrrapd-wrapstars-ob-stage__kicker">' . esc_html( $current['group'] ) . ' · Step ' . esc_html( (string) $step_num ) . ' of ' . esc_html( (string) $step_total );
	if ( (int) $current['minutes'] > 0 ) {
		echo ' · about ' . esc_html( (string) $current['minutes'] ) . ' min';
	}
	echo '</p>';
	echo '<h1 class="wrrapd-wrapstars-ob-stage__title">' . esc_html( $current_label ) . '</h1>';
	echo '</header>';

	$err = $GLOBALS['wrrapd_ws_onboarding_error'] ?? '';
	if ( $err ) {
		echo '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err" role="alert">' . esc_html( $err ) . '</div>';
	}

	switch ( $step ) {
		case 'welcome':
			wrrapd_wrapstars_render_step_welcome( $app->ID );
			break;
		case 'agreement':
			echo do_shortcode( '[wrrapd_wrapstar_sign doc="ic_agreement"]' );
			break;
		case 'policies':
			wrrapd_wrapstars_render_step_policies( $app->ID );
			break;
		case 'orientation':
			wrrapd_wrapstars_render_step_orientation( $app->ID );
			break;
		case 'background':
			wrrapd_wrapstars_render_step_background( $app->ID );
			break;
		case 'insurance':
			wrrapd_wrapstars_render_step_insurance( $app->ID );
			break;
		case 'identity':
			wrrapd_wrapstars_render_step_identity( $app->ID );
			break;
		case 'workspace':
			wrrapd_wrapstars_render_step_workspace( $app->ID );
			break;
		case 'w9':
			echo do_shortcode( '[wrrapd_wrapstar_sign doc="w9"]' );
			break;
		case 'tax_1099':
			wrrapd_wrapstars_render_step_tax_1099( $app->ID );
			break;
		case 'bank_payout':
			wrrapd_wrapstars_render_step_bank_payout( $app->ID );
			break;
		case 'activation':
			wrrapd_wrapstars_render_step_activation( $app->ID );
			break;
		default:
			wrrapd_wrapstars_render_step_welcome( $app->ID );
	}

	// Footer helpers: what's next + help.
	echo '<div class="wrrapd-wrapstars-ob-foot">';
	if ( $step !== 'activation' && $next_meta ) {
		echo '<p class="wrrapd-wrapstars-ob-foot__next"><span>Up next</span> ' . esc_html( $next_meta['label'] );
		if ( (int) $next_meta['minutes'] > 0 ) {
			echo ' <em>· about ' . esc_html( (string) $next_meta['minutes'] ) . ' min</em>';
		}
		echo '</p>';
	}
	echo '<p class="wrrapd-wrapstars-ob-foot__help">Your progress is saved after every step — you can log out and pick up where you left off. Questions? Email <a href="mailto:' . esc_attr( wrrapd_wrapstars_from_email_address() ) . '">' . esc_html( wrrapd_wrapstars_from_email_address() ) . '</a>.</p>';
	echo '</div>';

	echo '</div></div></div></div>';
	return ob_get_clean();
}

/** Resolve the onboarding step from the request path (registry paths + legacy /po-box/). */
function wrrapd_wrapstars_detect_onboarding_step_from_uri() {
	$uri  = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_parse_url( (string) $_SERVER['REQUEST_URI'], PHP_URL_PATH ) : '';
	$uri  = rtrim( $uri, '/' ) . '/';
	$best = 'welcome';
	$len  = 0;
	foreach ( wrrapd_wrapstars_onboarding_step_registry() as $key => $meta ) {
		if ( $meta['path'] === '/onboarding/' ) {
			continue;
		}
		if ( str_contains( $uri, $meta['path'] ) && strlen( $meta['path'] ) > $len ) {
			$best = $key;
			$len  = strlen( $meta['path'] );
		}
	}
	if ( $best === 'welcome' && str_contains( $uri, '/onboarding/po-box/' ) ) {
		return 'workspace';
	}
	return $best;
}

/** Shared markup: typed-name signature field. */
function wrrapd_wrapstars_render_signature_field( $name, $label = 'Type your full legal name to sign' ) {
	?>
	<div class="wrrapd-wrapstars-ob-sign">
		<label for="<?php echo esc_attr( $name ); ?>"><?php echo esc_html( $label ); ?></label>
		<input type="text" id="<?php echo esc_attr( $name ); ?>" name="<?php echo esc_attr( $name ); ?>" class="wrrapd-wrapstars-ob-sign__input" autocomplete="name" placeholder="Your full name" required />
		<p class="wrrapd-wrapstars-ob-note">Typing your name here is your electronic signature and carries the same weight as a handwritten one. Signed <?php echo esc_html( gmdate( 'F j, Y' ) ); ?>.</p>
	</div>
	<?php
}

function wrrapd_wrapstars_render_step_welcome( $app_id ) {
	$greet    = wrrapd_wrapstars_greeting_name( $app_id );
	$registry = wrrapd_wrapstars_onboarding_step_registry();
	$groups   = array();
	$total    = 0;
	foreach ( $registry as $key => $meta ) {
		if ( in_array( $key, array( 'welcome', 'activation' ), true ) ) {
			continue;
		}
		$groups[ $meta['group'] ][] = $meta;
		$total += (int) $meta['minutes'];
	}
	?>
	<div class="wrrapd-wrapstars-card wrrapd-wrapstars-card--hero wrrapd-wrapstars-welcome">
		<p class="wrrapd-wrapstars-welcome__hello">Welcome, <?php echo esc_html( $greet === 'there' ? 'WrapStar' : $greet ); ?>!</p>
		<p class="wrrapd-wrapstars-ob-lead">You&rsquo;re in. We&rsquo;re thrilled to have you join the founding network of WrapStars. This short onboarding takes care of the agreements, verification, and setup details we need before your first gifts arrive.</p>
		<p class="wrrapd-wrapstars-ob-lead">It takes about <strong><?php echo esc_html( (string) $total ); ?> minutes</strong> in total. You can stop at any point — every step is saved as soon as you finish it.</p>

		<div class="wrrapd-wrapstars-ob-overview">
			<?php foreach ( $groups as $group => $items ) : ?>
				<div class="wrrapd-wrapstars-ob-overview__group">
					<h3><?php echo esc_html( $group ); ?></h3>
					<ul>
						<?php foreach ( $items as $meta ) : ?>
							<li><span><?php echo esc_html( $meta['label'] ); ?></span><em><?php echo esc_html( (string) $meta['minutes'] ); ?> min</em></li>
						<?php endforeach; ?>
					</ul>
				</div>
			<?php endforeach; ?>
		</div>

		<div class="wrrapd-wrapstars-ob-callout">
			<strong>Have these handy</strong>
			<span>Your government ID, your insurance certificate (or your agent&rsquo;s contact), and a voided check or bank letter for payouts.</span>
		</div>

		<form method="post" class="wrrapd-wrapstars-ob-actions wrrapd-wrapstars-login__actions">
			<?php wp_nonce_field( 'wrrapd_ws_onboarding', 'wrrapd_ws_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="onboarding_step" />
			<input type="hidden" name="step" value="welcome" />
			<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Let&rsquo;s begin</button>
		</form>
	</div>
	<?php
}

function wrrapd_wrapstars_render_step_policies( $app_id ) {
	$sections = wrrapd_wrapstars_policy_sections();
	?>
	<div class="wrrapd-wrapstars-card">
		<p class="wrrapd-wrapstars-ob-lead">These are the standards every WrapStar works to. Read each section and tick the box to acknowledge it, then sign at the bottom.</p>
		<form method="post" class="wrrapd-wrapstars-form wrrapd-wrapstars-ob-actions">
			<?php wp_nonce_field( 'wrrapd_ws_onboarding', 'wrrapd_ws_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="onboarding_step" />
			<input type="hidden" name="step" value="policies" />
			<?php foreach ( $sections as $key => $section ) : ?>
				<section class="wrrapd-wrapstars-ob-policy">
					<h3><?php echo esc_html( $section['title'] ); ?></h3>
					<ul>
						<?php foreach ( $section['points'] as $point ) : ?>
							<li><?php echo esc_html( $point ); ?></li>
						<?php endforeach; ?>
					</ul>
					<label class="ws-check">
						<input type="checkbox" name="policy_ack[]" value="<?php echo esc_attr( $key ); ?>" required />
						<span>I have read and agree to the <?php echo esc_html( strtolower( $section['title'] ) ); ?>.</span>
					</label>
				</section>
			<?php endforeach; ?>
			<?php wrrapd_wrapstars_render_signature_field( 'policies_signature' ); ?>
			<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Sign &amp; continue</button>
		</form>
	</div>
	<?php
}

function wrrapd_wrapstars_render_step_orientation( $app_id ) {
	$quiz_err  = $GLOBALS['wrrapd_ws_quiz_error'] ?? '';
	$questions = wrrapd_wrapstars_orientation_questions();
	$modules   = wrrapd_wrapstars_orientation_modules();
	?>
	<div class="wrrapd-wrapstars-card">
		<p class="wrrapd-wrapstars-ob-lead">Here is exactly how a WrapStar order flows, start to finish. Read the four short modules, then pass the quiz with <strong>80% or higher</strong> (you can retake it).</p>
		<div class="wrrapd-wrapstars-ob-modules">
			<?php foreach ( $modules as $module ) : ?>
				<details class="wrrapd-wrapstars-ob-module" open>
					<summary><?php echo esc_html( $module['title'] ); ?></summary>
					<ul>
						<?php foreach ( $module['points'] as $point ) : ?>
							<li><?php echo esc_html( $point ); ?></li>
						<?php endforeach; ?>
					</ul>
				</details>
			<?php endforeach; ?>
		</div>
	</div>
	<?php if ( $quiz_err ) : ?>
		<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err" role="alert"><?php echo esc_html( $quiz_err ); ?></div>
	<?php endif; ?>
	<form class="wrrapd-wrapstars-card wrrapd-wrapstars-quiz" method="post">
		<?php wp_nonce_field( 'wrrapd_ws_quiz', 'wrrapd_ws_nonce' ); ?>
		<input type="hidden" name="wrrapd_ws_action" value="orientation_quiz" />
		<h3>Orientation quiz</h3>
		<?php foreach ( $questions as $i => $q ) : ?>
			<fieldset class="ws-quiz-q">
				<legend><?php echo esc_html( ( $i + 1 ) . '. ' . $q['q'] ); ?></legend>
				<?php foreach ( $q['choices'] as $val => $label ) : ?>
					<label><input type="radio" name="q<?php echo (int) $i; ?>" value="<?php echo esc_attr( $val ); ?>" required /> <?php echo esc_html( $label ); ?></label>
				<?php endforeach; ?>
			</fieldset>
		<?php endforeach; ?>
		<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Submit quiz</button>
	</form>
	<?php
}

function wrrapd_wrapstars_render_step_background( $app_id ) {
	$full_name = (string) wrrapd_wrapstars_get_meta( $app_id, 'full_name' );
	?>
	<div class="wrrapd-wrapstars-card">
		<p class="wrrapd-wrapstars-ob-lead">Because gifts are entrusted to WrapStars, every WrapStar completes a background check before activation. Confirm your details and authorize the screening below — our screening partner will email you a secure link if anything further is needed.</p>
		<div class="wrrapd-wrapstars-ob-disclosure">
			<h3>Disclosure</h3>
			<p>Wrrapd Inc. may obtain a consumer report and/or investigative consumer report about you from a consumer reporting agency for the purpose of evaluating you for, and during, your engagement as an independent contractor. The report may include information about your character, general reputation, personal characteristics, criminal history, and mode of living, as permitted by law. You have the right to request a copy of the report and to dispute inaccurate information with the reporting agency. A summary of your rights under the Fair Credit Reporting Act will be provided with the screening partner&rsquo;s invitation.</p>
		</div>
		<form method="post" class="wrrapd-wrapstars-form wrrapd-wrapstars-ob-actions">
			<?php wp_nonce_field( 'wrrapd_ws_onboarding', 'wrrapd_ws_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="onboarding_step" />
			<input type="hidden" name="step" value="background" />
			<label>Full legal name (exactly as on your ID)
				<input type="text" name="bg_legal_name" value="<?php echo esc_attr( $full_name ); ?>" autocomplete="name" required />
			</label>
			<label>Other names you have used <span class="ws-optional">(optional)</span>
				<input type="text" name="bg_other_names" placeholder="Maiden name, previous legal name…" />
			</label>
			<label class="ws-check">
				<input type="checkbox" name="bg_consent" value="1" required />
				<span>I have read the disclosure above and authorize Wrrapd and its screening partner to obtain a background check on me. I understand activation may depend on the result.</span>
			</label>
			<?php wrrapd_wrapstars_render_signature_field( 'bg_signature' ); ?>
			<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Authorize &amp; continue</button>
		</form>
	</div>
	<?php
}

function wrrapd_wrapstars_render_step_insurance( $app_id ) {
	?>
	<div class="wrrapd-wrapstars-card">
		<p class="wrrapd-wrapstars-ob-lead">Insurance protects you while gifts are in your care. Upload your Certificate of Insurance (COI) showing <strong>general liability of $1,000,000 or more</strong> and <strong>inland marine / bailee coverage</strong>. Our team verifies it before activation.</p>
		<div class="wrrapd-wrapstars-ob-split">
			<div class="wrrapd-wrapstars-ob-panel">
				<h3>Don&rsquo;t have coverage yet?</h3>
				<p>Ask any business insurance agent for a small-business policy with <em>general liability</em> plus <em>inland marine (bailee&rsquo;s customer goods)</em> coverage. Many carriers quote online in minutes. Tell them you handle customers&rsquo; goods at your own location and do not transport them.</p>
			</div>
			<div class="wrrapd-wrapstars-ob-panel wrrapd-wrapstars-ob-panel--soft">
				<h3>What we look for on the COI</h3>
				<ul class="wrrapd-wrapstars-ob-needs">
					<li>Your name (or business name) as the insured</li>
					<li>General liability limit of $1M+ per occurrence</li>
					<li>Inland marine / bailee coverage line</li>
					<li>Policy dates that are current</li>
				</ul>
			</div>
		</div>
		<form method="post" enctype="multipart/form-data" class="wrrapd-wrapstars-form wrrapd-wrapstars-ob-actions">
			<?php wp_nonce_field( 'wrrapd_ws_onboarding', 'wrrapd_ws_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="onboarding_step" />
			<input type="hidden" name="step" value="insurance" />
			<div class="ws-field-row">
				<label>Insurance carrier <span class="ws-optional">(optional)</span>
					<input type="text" name="insurance_carrier" placeholder="e.g. Hiscox, Next, The Hartford" />
				</label>
				<label>Policy expiration <span class="ws-optional">(optional)</span>
					<input type="date" name="insurance_expires" />
				</label>
			</div>
			<label>Certificate of Insurance (PDF or image)
				<input type="file" name="insurance_coi" accept=".pdf,.jpg,.jpeg,.png" required />
			</label>
			<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Upload &amp; continue</button>
		</form>
	</div>
	<?php
}

function wrrapd_wrapstars_render_step_identity( $app_id ) {
	$id_file  = (string) wrrapd_wrapstars_get_meta( $app_id, 'id_file' );
	$has_id   = $id_file !== '' && file_exists( $id_file );
	$id_name  = $has_id ? basename( $id_file ) : '';
	$uploaded = (string) wrrapd_wrapstars_get_meta( $app_id, 'submitted_at' );
	?>
	<div class="wrrapd-wrapstars-card">
		<p class="wrrapd-wrapstars-ob-lead">One quick check so we know the person onboarding is the person we approved.</p>
		<div class="wrrapd-wrapstars-ob-callout <?php echo $has_id ? 'wrrapd-wrapstars-ob-callout--ok' : ''; ?>">
			<strong><?php echo $has_id ? 'Government ID on file' : 'No ID on file'; ?></strong>
			<span>
				<?php if ( $has_id ) : ?>
					Received with your application<?php echo $uploaded !== '' ? ' on ' . esc_html( gmdate( 'F j, Y', strtotime( $uploaded ) ) ) : ''; ?> (<?php echo esc_html( $id_name ); ?>).
				<?php else : ?>
					Please email a photo of your government ID to <?php echo esc_html( wrrapd_wrapstars_from_email_address() ); ?> before activation.
				<?php endif; ?>
			</span>
		</div>
		<form method="post" enctype="multipart/form-data" class="wrrapd-wrapstars-form wrrapd-wrapstars-ob-actions">
			<?php wp_nonce_field( 'wrrapd_ws_onboarding', 'wrrapd_ws_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="onboarding_step" />
			<input type="hidden" name="step" value="identity" />
			<label>Photo of you holding your ID (JPG or PNG)
				<input type="file" name="identity_selfie" accept=".jpg,.jpeg,.png" capture="user" required />
			</label>
			<p class="wrrapd-wrapstars-ob-note">Good light, face and ID both visible, no filters. This photo is stored privately and used only for verification.</p>
			<label class="ws-check">
				<input type="checkbox" name="identity_confirm" value="1" required />
				<span>I confirm the ID on file is mine, current, and matches the legal name I provided.</span>
			</label>
			<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Verify &amp; continue</button>
		</form>
	</div>
	<?php
}

function wrrapd_wrapstars_render_step_workspace( $app_id ) {
	$saved_addr = (string) wrrapd_wrapstars_get_meta( $app_id, 'workspace_address' );
	if ( $saved_addr === '' ) {
		$parts = array_filter(
			array(
				trim( (string) wrrapd_wrapstars_get_meta( $app_id, 'address_line1' ) . ' ' . (string) wrrapd_wrapstars_get_meta( $app_id, 'address_line2' ) ),
				trim( (string) wrrapd_wrapstars_get_meta( $app_id, 'city' ) . ', ' . (string) wrrapd_wrapstars_get_meta( $app_id, 'state' ) . ' ' . (string) wrrapd_wrapstars_get_meta( $app_id, 'postal_code' ), ' ,' ),
			)
		);
		$saved_addr = implode( "\n", $parts );
	}
	$saved_windows = array_filter( explode( ',', (string) wrrapd_wrapstars_get_meta( $app_id, 'workspace_windows' ) ) );
	$saved_notes   = (string) wrrapd_wrapstars_get_meta( $app_id, 'workspace_access_notes' );
	?>
	<div class="wrrapd-wrapstars-card">
		<p class="wrrapd-wrapstars-ob-lead">Tell us where gifts should be dropped off and collected, and when you are usually available for a handoff. You can fine-tune your availability week by week later in your WrapStar Console.</p>
		<form method="post" enctype="multipart/form-data" class="wrrapd-wrapstars-form wrrapd-wrapstars-ob-actions">
			<?php wp_nonce_field( 'wrrapd_ws_onboarding', 'wrrapd_ws_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="onboarding_step" />
			<input type="hidden" name="step" value="workspace" />
			<label>Wrapping location (drop-off &amp; pickup address)
				<textarea name="workspace_address" rows="3" required><?php echo esc_textarea( $saved_addr ); ?></textarea>
			</label>
			<fieldset class="wrrapd-wrapstars-ob-fieldset">
				<legend>Handoff windows you can usually offer</legend>
				<div class="wrrapd-wrapstars-ob-chips">
					<?php foreach ( wrrapd_wrapstars_workspace_window_options() as $val => $label ) : ?>
						<label class="wrrapd-wrapstars-ob-chip">
							<input type="checkbox" name="workspace_windows[]" value="<?php echo esc_attr( $val ); ?>" <?php checked( in_array( $val, $saved_windows, true ) ); ?> />
							<span><?php echo esc_html( $label ); ?></span>
						</label>
					<?php endforeach; ?>
				</div>
			</fieldset>
			<label>Access notes for your courier <span class="ws-optional">(optional)</span>
				<textarea name="workspace_access_notes" rows="2" placeholder="Gate code, side door, buzzer, where to leave packages if you step out…"><?php echo esc_textarea( $saved_notes ); ?></textarea>
			</label>
			<label>Photo of your wrapping space <span class="ws-optional">(optional, JPG/PNG)</span>
				<input type="file" name="workspace_photo" accept=".jpg,.jpeg,.png" />
			</label>
			<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Save &amp; continue</button>
		</form>
	</div>
	<?php
}

function wrrapd_wrapstars_render_step_tax_1099( $app_id ) {
	?>
	<div class="wrrapd-wrapstars-card">
		<p class="wrrapd-wrapstars-ob-lead">A few confirmations about how WrapStars are paid and taxed. Nothing to fill in — just read and confirm.</p>
		<form method="post" class="wrrapd-wrapstars-form wrrapd-wrapstars-ob-actions">
			<?php wp_nonce_field( 'wrrapd_ws_onboarding', 'wrrapd_ws_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="onboarding_step" />
			<input type="hidden" name="step" value="tax_1099" />
			<label class="ws-check">
				<input type="checkbox" name="tax_ack_ic" value="1" required />
				<span>I understand I am an <strong>independent contractor</strong>, not an employee of Wrrapd, and I am responsible for my own federal, state, and local taxes.</span>
			</label>
			<label class="ws-check">
				<input type="checkbox" name="tax_ack_withholding" value="1" required />
				<span>I understand Wrrapd does <strong>not withhold</strong> income or payroll taxes from my payouts, and that Wrrapd may issue an IRS <strong>Form 1099-NEC</strong> when my annual earnings meet the reporting threshold.</span>
			</label>
			<label class="ws-check">
				<input type="checkbox" name="tax_ack_w9" value="1" required />
				<span>I confirm the information on my W-9 is accurate and I will notify Wrrapd if my legal name, business name, address, or taxpayer ID changes.</span>
			</label>
			<label class="ws-check">
				<input type="checkbox" name="tax_e_delivery" value="1" />
				<span>I consent to receive my tax forms <strong>electronically</strong> (you may withdraw this consent at any time by emailing <?php echo esc_html( wrrapd_wrapstars_from_email_address() ); ?>).</span>
			</label>
			<?php wrrapd_wrapstars_render_signature_field( 'tax_ack_signature' ); ?>
			<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Confirm &amp; continue</button>
		</form>
	</div>
	<?php
}

function wrrapd_wrapstars_render_step_bank_payout( $app_id ) {
	$connect_url = defined( 'WRRAPD_WRAPSTARS_PAYOUT_CONNECT_URL' ) ? (string) WRRAPD_WRAPSTARS_PAYOUT_CONNECT_URL : '';
	$holder      = (string) wrrapd_wrapstars_get_meta( $app_id, 'payout_holder_name' );
	if ( $holder === '' ) {
		$holder = (string) wrrapd_wrapstars_get_meta( $app_id, 'full_name' );
	}
	?>
	<div class="wrrapd-wrapstars-card">
		<?php if ( $connect_url !== '' ) : ?>
			<p class="wrrapd-wrapstars-ob-lead">Payouts are sent by direct deposit. Set up your payout account securely with our payments partner, then come back and confirm.</p>
			<p class="wrrapd-wrapstars-ob-actions"><a class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg" href="<?php echo esc_url( $connect_url ); ?>" target="_blank" rel="noopener">Set up payouts securely</a></p>
			<form method="post" class="wrrapd-wrapstars-form wrrapd-wrapstars-ob-actions">
				<?php wp_nonce_field( 'wrrapd_ws_onboarding', 'wrrapd_ws_nonce' ); ?>
				<input type="hidden" name="wrrapd_ws_action" value="onboarding_step" />
				<input type="hidden" name="step" value="bank_payout" />
				<label class="ws-check">
					<input type="checkbox" name="payout_connect_done" value="1" required />
					<span>I have completed the secure payout setup.</span>
				</label>
				<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Confirm &amp; continue</button>
			</form>
		<?php else : ?>
			<p class="wrrapd-wrapstars-ob-lead">Payouts are sent by direct deposit to a U.S. bank account in your name (or your business&rsquo;s name). Enter your account details and upload a voided check or bank letter so we can verify them.</p>
			<form method="post" enctype="multipart/form-data" class="wrrapd-wrapstars-form wrrapd-wrapstars-ob-actions" autocomplete="off">
				<?php wp_nonce_field( 'wrrapd_ws_onboarding', 'wrrapd_ws_nonce' ); ?>
				<input type="hidden" name="wrrapd_ws_action" value="onboarding_step" />
				<input type="hidden" name="step" value="bank_payout" />
				<div class="ws-field-row">
					<label>Account holder name
						<input type="text" name="payout_holder_name" value="<?php echo esc_attr( $holder ); ?>" required />
					</label>
					<label>Bank name
						<input type="text" name="payout_bank_name" value="<?php echo esc_attr( (string) wrrapd_wrapstars_get_meta( $app_id, 'payout_bank_name' ) ); ?>" required />
					</label>
				</div>
				<div class="ws-field-row ws-field-row--3">
					<label>Account type
						<select name="payout_account_type" required>
							<option value="">Select…</option>
							<option value="checking">Checking</option>
							<option value="savings">Savings</option>
						</select>
					</label>
					<label>Routing number (9 digits)
						<input type="text" name="payout_routing" inputmode="numeric" pattern="[0-9]{9}" maxlength="9" required />
					</label>
					<label>Account number
						<input type="password" name="payout_account" inputmode="numeric" autocomplete="off" required />
					</label>
				</div>
				<label>Confirm account number
					<input type="password" name="payout_account_confirm" inputmode="numeric" autocomplete="off" required />
				</label>
				<label>Voided check or bank letter (PDF or image)
					<input type="file" name="payout_proof" accept=".pdf,.jpg,.jpeg,.png" required />
				</label>
				<p class="wrrapd-wrapstars-ob-note">For your security we keep only the last four digits of your account number in your profile; your uploaded document is stored privately and used to set up your payouts.</p>
				<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Save payout details &amp; continue</button>
			</form>
		<?php endif; ?>
	</div>
	<?php
}

function wrrapd_wrapstars_render_step_activation( $app_id ) {
	$registry = wrrapd_wrapstars_onboarding_step_registry();
	$all_done = true;
	foreach ( array_keys( $registry ) as $key ) {
		if ( $key === 'activation' ) {
			continue;
		}
		if ( ! wrrapd_wrapstars_step_complete( $app_id, $key ) ) {
			$all_done = false;
			break;
		}
	}
	?>
	<div class="wrrapd-wrapstars-card wrrapd-wrapstars-card--hero">
		<?php if ( $all_done ) : ?>
			<p class="wrrapd-wrapstars-ob-lead">Beautifully done — every step is complete. Our team is now verifying your documents, insurance, background check, and payout details. You will receive an email the moment you are activated.</p>
		<?php else : ?>
			<p class="wrrapd-wrapstars-ob-lead">Almost there. Finish the open items below and this page will update automatically.</p>
		<?php endif; ?>
		<ul class="wrrapd-wrapstars-activation-checklist">
			<?php foreach ( $registry as $key => $meta ) : ?>
				<?php if ( $key === 'activation' ) { continue; } ?>
				<?php $is_done = wrrapd_wrapstars_step_complete( $app_id, $key ); ?>
				<li class="<?php echo $is_done ? 'is-done' : 'is-open'; ?>">
					<span class="wrrapd-wrapstars-activation-checklist__mark" aria-hidden="true"><?php echo $is_done ? '✓' : '○'; ?></span>
					<span><?php echo esc_html( $meta['label'] ); ?></span>
					<?php if ( ! $is_done && wrrapd_wrapstars_can_access_step( $app_id, $key ) ) : ?>
						<a class="wrrapd-wrapstars-activation-checklist__link" href="<?php echo esc_url( wrrapd_wrapstars_onboarding_step_url( $key ) ); ?>">Open</a>
					<?php endif; ?>
				</li>
			<?php endforeach; ?>
		</ul>
		<?php if ( $all_done ) : ?>
			<div class="wrrapd-wrapstars-ob-callout wrrapd-wrapstars-ob-callout--ok">
				<strong>Pending activation</strong>
				<span>Verification usually takes a few business days. Once you are active you will receive your WrapStar Console access, set your first handoff windows, and start receiving orders.</span>
			</div>
			<div class="wrrapd-wrapstars-ob-split">
				<div class="wrrapd-wrapstars-ob-panel">
					<h3>While you wait</h3>
					<ul class="wrrapd-wrapstars-ob-needs">
						<li>Stock up on quality paper, ribbon, tissue, and tags.</li>
						<li>Set up your wrapping area with good light for your documentation videos.</li>
						<li>Re-read the presentation standards — first impressions matter.</li>
					</ul>
				</div>
				<div class="wrrapd-wrapstars-ob-panel wrrapd-wrapstars-ob-panel--soft">
					<h3>Need to change something?</h3>
					<p>Email <a href="mailto:<?php echo esc_attr( wrrapd_wrapstars_from_email_address() ); ?>"><?php echo esc_html( wrrapd_wrapstars_from_email_address() ); ?></a> and we will update your details before activation.</p>
				</div>
			</div>
		<?php endif; ?>
	</div>
	<?php
}

function wrrapd_wrapstars_shortcode_sign( $atts ) {
	if ( ! is_user_logged_in() ) {
		return '<p>Please log in.</p>';
	}
	$atts = shortcode_atts( array( 'doc' => 'ic_agreement' ), $atts );
	$doc  = $atts['doc'] === 'w9' ? 'w9' : 'ic_agreement';

	$app = wrrapd_wrapstars_get_application_by_user( get_current_user_id() );
	if ( ! $app ) {
		return '<p>No application found.</p>';
	}

	$step = $doc === 'w9' ? 'w9' : 'agreement';
	if ( ! wrrapd_wrapstars_can_access_step( $app->ID, $step ) ) {
		return '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">Complete prior onboarding steps first.</div>';
	}

	$signed_key = $doc === 'w9' ? 'boldsign_w9_signed' : 'boldsign_ic_signed';
	if ( wrrapd_wrapstars_get_meta( $app->ID, $signed_key ) === '1' ) {
		$next_url = wrrapd_wrapstars_onboarding_step_url( wrrapd_wrapstars_next_onboarding_step( $step ) );
		return '<div class="wrrapd-wrapstars-card"><div class="wrrapd-wrapstars-ob-callout wrrapd-wrapstars-ob-callout--ok"><strong>Document signed</strong><span>You\'re clear to move on.</span></div><p class="wrrapd-wrapstars-ob-actions"><a class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg" href="' . esc_url( $next_url ) . '">Continue</a></p></div>';
	}

	$prep = wrrapd_wrapstars_boldsign_prepare( $app->ID, $doc === 'w9' ? 'w9' : 'ic_agreement' );
	if ( ! $prep['ok'] ) {
		return '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err">' . esc_html( $prep['error'] ?? 'Signing unavailable.' ) . '</div>';
	}

	ob_start();
	?>
	<div class="wrrapd-wrapstars-card">
		<p class="wrrapd-wrapstars-ob-lead">Sign securely with BoldSign below. Your identity was verified when you logged in.</p>
		<iframe class="wrrapd-wrapstars-sign-frame" src="<?php echo esc_url( $prep['sign_url'] ); ?>" title="BoldSign document signing" allow="clipboard-write"></iframe>
	</div>
	<script>
	(function(){
		window.addEventListener('message', function(e) {
			if (!e.data || typeof e.data !== 'object') return;
			if (e.data.action === 'onDocumentSigned' || e.data.event === 'onDocumentSigned') {
				window.location.href = <?php echo wp_json_encode( wrrapd_wrapstars_pros_url( '/onboarding/' . ( $doc === 'w9' ? 'w-9' : 'agreement' ) . '/?signed=1' ) ); ?>;
			}
		});
	})();
	</script>
	<?php
	return ob_get_clean();
}

// --- Admin ---

function wrrapd_wrapstars_admin_menu() {
	add_menu_page(
		'WrapStars',
		'WrapStars',
		'manage_options',
		'wrrapd-wrapstars',
		'wrrapd_wrapstars_admin_page',
		'dashicons-star-filled',
		58
	);
}

function wrrapd_wrapstars_admin_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	if ( isset( $_POST['wrrapd_ws_admin_action'] ) && check_admin_referer( 'wrrapd_ws_admin' ) ) {
		$app_id = (int) ( $_POST['app_id'] ?? 0 );
		$action = sanitize_text_field( wp_unslash( $_POST['wrrapd_ws_admin_action'] ) );
		if ( function_exists( 'wrrapd_wrapstars_run_admin_action' ) ) {
			wrrapd_wrapstars_run_admin_action(
				$app_id,
				$action,
				$action === 'save_bg_status'
					? array( 'bg_status' => (string) wp_unslash( $_POST['bg_status'] ?? '' ) )
					: array(
						'admin_notes'   => (string) wp_unslash( $_POST['admin_notes'] ?? '' ),
						'reject_reason' => (string) wp_unslash( $_POST['reject_reason'] ?? '' ),
					)
			);
		}
	}

	$status_filter = isset( $_GET['status'] ) ? sanitize_text_field( wp_unslash( $_GET['status'] ) ) : '';
	$meta_query    = array();
	if ( $status_filter !== '' ) {
		$meta_query[] = array(
			'key'   => '_wrrapd_ws_status',
			'value' => $status_filter,
		);
	}

	$apps = get_posts(
		array(
			'post_type'      => WRRAPD_WRAPSTARS_CPT,
			'posts_per_page' => 100,
			'post_status'    => 'publish',
			'meta_query'     => $meta_query,
			'orderby'        => 'date',
			'order'          => 'DESC',
		)
	);

	echo '<div class="wrap"><h1>WrapStar Applications</h1>';
	echo '<p><strong>Preferred:</strong> review applications in the tracking <em>Command Center → Applications</em>. This WP screen is a fallback.</p>';
	echo '<p>Portal: <strong>apply.wrrapd.com</strong> (applications) · <strong>pros.wrrapd.com</strong> (onboarding)</p>';
	echo '<p>Filter: <a href="?page=wrrapd-wrapstars">All</a> | <a href="?page=wrrapd-wrapstars&status=under_review">Under review</a> | <a href="?page=wrrapd-wrapstars&status=interview">Zoom interview</a> | <a href="?page=wrrapd-wrapstars&status=approved">Approved (onboarding)</a> | <a href="?page=wrrapd-wrapstars&status=declined">Declined offer</a> | <a href="?page=wrrapd-wrapstars&status=active">Active</a> | <a href="?page=wrrapd-wrapstars&status=rejected">Rejected</a></p>';

	foreach ( $apps as $app ) {
		wrrapd_wrapstars_render_admin_application_card( $app->ID );
	}
	echo '</div>';
}

function wrrapd_wrapstars_admin_file_url( $app_id, $meta_key ) {
	return wp_nonce_url(
		admin_url( 'admin-ajax.php?action=wrrapd_ws_download&app_id=' . (int) $app_id . '&field=' . rawurlencode( $meta_key ) ),
		'wrrapd_ws_download_' . $app_id
	);
}

function wrrapd_wrapstars_ajax_download() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Forbidden', 403 );
	}
	$app_id = (int) ( $_GET['app_id'] ?? 0 );
	$field  = sanitize_text_field( wp_unslash( $_GET['field'] ?? '' ) );
	check_admin_referer( 'wrrapd_ws_download_' . $app_id );
	$path = wrrapd_wrapstars_get_meta( $app_id, $field );
	if ( ! $path || ! file_exists( $path ) ) {
		wp_die( 'File not found', 404 );
	}
	$mime = wp_check_filetype( $path );
	header( 'Content-Type: ' . ( $mime['type'] ?: 'application/octet-stream' ) );
	header( 'Content-Disposition: attachment; filename="' . basename( $path ) . '"' );
	readfile( $path );
	exit;
}
add_action( 'wp_ajax_wrrapd_ws_download', 'wrrapd_wrapstars_ajax_download' );
