<?php
/**
 * Plugin Name: Wrrapd WrapRiders Portal (MU)
 * Description: WrapRider (hybrid wrap + deliver) application + onboarding on apply.wrrapd.com /wraprider and pros.wrrapd.com /wraprider-onboarding. Third hire track, parallel to WrapStars and JoyRiders — own CPT, own roles, own onboarding portal, own ops API.
 * Author: Wrrapd
 *
 * Distinct from the WrapStar CPT (wrrapd_wrapstar_app) and the JoyRider CPT (wrrapd_driver_app):
 * a WrapRider application never touches either of those tables. After Command Center activation
 * the WrapRider signs in to their OWN app (wraprider.wrrapd.com) with the email + password issued
 * here. WrapRiders are refused on the WrapStar and JoyRider apps — third role, third login.
 *
 * Install alongside WrapStars / Drivers MU-plugins on the dedicated apply/pros WordPress:
 *   wp-content/mu-plugins/wrrapd-wrapriders.php
 *   wp-content/mu-plugins/wrrapd-wrapriders-apply.php
 *   wp-content/mu-plugins/wrrapd-wrapriders-apply.js
 *   wp-content/mu-plugins/wrrapd-wrapriders-ops-api.php
 *   wp-content/mu-plugins/wrrapd-wrapriders.css
 *
 * @package WrrapdWrapriders
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$wrrapd_esign = dirname( __FILE__ ) . '/wrrapd-esign-agreements.php';
if ( file_exists( $wrrapd_esign ) ) {
	require_once $wrrapd_esign;
}
if ( ! function_exists( 'wrrapd_onboarding_login_url' ) ) {
	$wrrapd_ob_login = dirname( __FILE__ ) . '/wrrapd-onboarding-login.php';
	if ( is_readable( $wrrapd_ob_login ) ) {
		require_once $wrrapd_ob_login;
	}
}

define( 'WRRAPD_WRAPRIDERS_BUILD', '2026-09-20-apply-contrast' );
define( 'WRRAPD_WRAPRIDERS_INVITE_TTL_DAYS', 15 );
define( 'WRRAPD_WRAPRIDERS_CPT', 'wrrapd_wraprider_app' );

/** Reuse WrapStars host helpers when present; otherwise local defaults. */
function wrrapd_wrapriders_apply_host() {
	if ( function_exists( 'wrrapd_wrapstars_apply_host' ) ) {
		return wrrapd_wrapstars_apply_host();
	}
	if ( defined( 'WRRAPD_WRAPSTARS_APPLY_HOST' ) && WRRAPD_WRAPSTARS_APPLY_HOST !== '' ) {
		return strtolower( (string) WRRAPD_WRAPSTARS_APPLY_HOST );
	}
	return 'apply.wrrapd.com';
}

function wrrapd_wrapriders_pros_host() {
	if ( function_exists( 'wrrapd_wrapstars_pros_host' ) ) {
		return wrrapd_wrapstars_pros_host();
	}
	if ( defined( 'WRRAPD_WRAPSTARS_PROS_HOST' ) && WRRAPD_WRAPSTARS_PROS_HOST !== '' ) {
		return strtolower( (string) WRRAPD_WRAPSTARS_PROS_HOST );
	}
	return 'pros.wrrapd.com';
}

function wrrapd_wrapriders_current_host() {
	$host = isset( $_SERVER['HTTP_HOST'] ) ? strtolower( (string) $_SERVER['HTTP_HOST'] ) : '';
	return preg_replace( '/:\d+$/', '', $host );
}

function wrrapd_wrapriders_force_enable() {
	return ( defined( 'WRRAPD_WRAPSTARS_FORCE_ENABLE' ) && WRRAPD_WRAPSTARS_FORCE_ENABLE )
		|| ( defined( 'WRRAPD_WRAPRIDERS_FORCE_ENABLE' ) && WRRAPD_WRAPRIDERS_FORCE_ENABLE );
}

function wrrapd_wrapriders_is_apply_host() {
	if ( function_exists( 'wrrapd_wrapstars_is_apply_host' ) ) {
		return wrrapd_wrapstars_is_apply_host();
	}
	return wrrapd_wrapriders_current_host() === wrrapd_wrapriders_apply_host() || wrrapd_wrapriders_force_enable();
}

function wrrapd_wrapriders_is_pros_host() {
	if ( function_exists( 'wrrapd_wrapstars_is_pros_host' ) ) {
		return wrrapd_wrapstars_is_pros_host();
	}
	return wrrapd_wrapriders_current_host() === wrrapd_wrapriders_pros_host() || wrrapd_wrapriders_force_enable();
}

function wrrapd_wrapriders_is_portal_host() {
	return wrrapd_wrapriders_is_apply_host() || wrrapd_wrapriders_is_pros_host() || wrrapd_wrapriders_force_enable();
}

function wrrapd_wrapriders_unified_host() {
	return wrrapd_wrapriders_apply_host() === wrrapd_wrapriders_pros_host();
}

if ( ! wrrapd_wrapriders_is_portal_host() ) {
	return;
}

$wrrapd_wr_apply = dirname( __FILE__ ) . '/wrrapd-wrapriders-apply.php';
if ( is_readable( $wrrapd_wr_apply ) ) {
	require_once $wrrapd_wr_apply;
}
$wrrapd_wr_ops = dirname( __FILE__ ) . '/wrrapd-wrapriders-ops-api.php';
if ( is_readable( $wrrapd_wr_ops ) ) {
	require_once $wrrapd_wr_ops;
}

function wrrapd_wrapriders_onboarding_steps() {
	return array(
		'welcome'     => 'Welcome & Overview',
		'agreement'   => 'Contractor Agreements',
		'policies'    => 'Wrap & Delivery Standards',
		'orientation' => 'Orientation & Quiz',
		'background'  => 'Background Check',
		'insurance'   => 'Vehicle Insurance',
		'identity'    => 'Identity & License',
		'workspace'   => 'Wrapping Location',
		'w9'          => 'W-9 Tax Form',
		'tax_1099'    => '1099 & Tax Acknowledgments',
		'bank_payout' => 'Connect Bank / Payouts',
		'activation'  => 'Apps & Final Review',
	);
}

function wrrapd_wrapriders_next_onboarding_step( $step ) {
	$steps = array_keys( wrrapd_wrapriders_onboarding_steps() );
	$idx   = array_search( $step, $steps, true );
	if ( $idx === false || ! isset( $steps[ $idx + 1 ] ) ) {
		return 'activation';
	}
	return $steps[ $idx + 1 ];
}

add_action( 'init', 'wrrapd_wrapriders_register_cpt' );
add_action( 'init', 'wrrapd_wrapriders_register_roles' );
add_action( 'init', 'wrrapd_wrapriders_maybe_handle_posts', 6 );
add_action( 'admin_menu', 'wrrapd_wrapriders_admin_menu' );
add_action( 'wp_enqueue_scripts', 'wrrapd_wrapriders_enqueue_assets', 20 );
add_action( 'template_redirect', 'wrrapd_wrapriders_host_routing', 2 );
add_action( 'admin_init', 'wrrapd_wrapriders_block_wraprider_wp_admin' );
add_filter( 'login_redirect', 'wrrapd_wrapriders_login_redirect', 11, 3 );
add_filter( 'body_class', 'wrrapd_wrapriders_body_class' );

add_shortcode( 'wrrapd_wraprider_landing', 'wrrapd_wrapriders_shortcode_landing' );
add_shortcode( 'wrrapd_wraprider_apply', 'wrrapd_wrapriders_shortcode_apply' );
add_shortcode( 'wrrapd_wraprider_thankyou', 'wrrapd_wrapriders_shortcode_thankyou' );
add_shortcode( 'wrrapd_wraprider_login', 'wrrapd_wrapriders_shortcode_login' );
add_shortcode( 'wrrapd_wraprider_onboarding', 'wrrapd_wrapriders_shortcode_onboarding' );
add_shortcode( 'wrrapd_wraprider_decline', 'wrrapd_wrapriders_shortcode_decline' );
add_shortcode( 'wrrapd_wraprider_profile', 'wrrapd_wrapriders_shortcode_profile' );
add_filter( 'the_content', 'wrrapd_wrapriders_force_thankyou_content', 999 );
add_filter( 'elementor/frontend/the_content', 'wrrapd_wrapriders_force_thankyou_content', 999 );

/** Current request path without query string, leading slash, no trailing slash (root = "/"). */
function wrrapd_wrapriders_request_path() {
	$uri  = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '/';
	$path = '/' . trim( (string) strtok( $uri, '?' ), '/' );
	return $path === '//' ? '/' : $path;
}

/**
 * Path → shortcode + document title for every WrapRider screen. No WordPress/Elementor page is
 * required: real pages at these slugs get their content replaced, 404s get a virtual page.
 *
 * @param string $path Request path.
 * @return array{shortcode:string,title:string,noindex:bool}|null
 */
function wrrapd_wrapriders_screen_for_path( $path ) {
	$path = (string) $path;
	if ( preg_match( '#^/wraprider-onboarding(/|$)#', $path ) ) {
		return array( 'shortcode' => '[wrrapd_wraprider_onboarding]', 'title' => 'Onboarding · Wrrapd', 'noindex' => true );
	}
	if ( preg_match( '#^/wraprider/apply(/|$)#', $path ) ) {
		return array( 'shortcode' => '[wrrapd_wraprider_apply]', 'title' => 'Apply to become a WrapRider · Wrrapd', 'noindex' => false );
	}
	if ( preg_match( '#^/wraprider/thank-you(/|$)#', $path ) ) {
		return array( 'shortcode' => '[wrrapd_wraprider_thankyou]', 'title' => 'Thank you · WrapRider · Wrrapd', 'noindex' => true );
	}
	if ( preg_match( '#^/wraprider/login(/|$)#', $path ) ) {
		return array( 'shortcode' => '[wrrapd_wraprider_login]', 'title' => 'WrapRider portal login · Wrrapd', 'noindex' => true );
	}
	if ( preg_match( '#^/wraprider/decline(/|$)#', $path ) ) {
		return array( 'shortcode' => '[wrrapd_wraprider_decline]', 'title' => 'Decline WrapRider offer · Wrrapd', 'noindex' => true );
	}
	if ( preg_match( '#^/wraprider/profile(/|$)#', $path ) ) {
		return array( 'shortcode' => '[wrrapd_wraprider_profile]', 'title' => 'WrapRider profile · Wrrapd', 'noindex' => true );
	}
	if ( preg_match( '#^/wraprider/?$#', $path ) ) {
		return array( 'shortcode' => '[wrrapd_wraprider_landing]', 'title' => 'Become a WrapRider · Wrrapd', 'noindex' => false );
	}
	return null;
}

/**
 * Existing WP page at a WrapRider slug: replace its content with the right shortcode so a
 * mis-set Elementor page can never show the wrong screen.
 *
 * @param string $content Existing page content.
 * @return string
 */
function wrrapd_wrapriders_force_thankyou_content( $content ) {
	if ( is_admin() || ! wrrapd_wrapriders_is_portal_host() || ! is_main_query() ) {
		return $content;
	}
	$screen = wrrapd_wrapriders_screen_for_path( wrrapd_wrapriders_request_path() );
	if ( ! $screen ) {
		return $content;
	}
	return do_shortcode( $screen['shortcode'] );
}

/**
 * No WordPress page at a WrapRider slug: on the 404 render a minimal themed document around the
 * shortcode (wp_head/wp_footer still run so theme + MU CSS/JS load).
 */
function wrrapd_wrapriders_virtual_profile_page() {
	if ( is_admin() || ! wrrapd_wrapriders_is_portal_host() || ! is_404() ) {
		return;
	}
	$screen = wrrapd_wrapriders_screen_for_path( wrrapd_wrapriders_request_path() );
	if ( ! $screen ) {
		return;
	}
	// Virtual hire URLs are not real WP posts — clear the 404 flag so lost-page footers
	// and error404 body styles never paint over a working WrapRider screen.
	global $wp_query;
	if ( $wp_query instanceof WP_Query ) {
		$wp_query->is_404  = false;
		$wp_query->is_page = true;
	}
	status_header( 200 );
	nocache_headers();
	?>
<!doctype html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<?php if ( $screen['noindex'] ) : ?>
<meta name="robots" content="noindex" />
<?php endif; ?>
<title><?php echo esc_html( $screen['title'] ); ?></title>
<?php wp_head(); ?>
<style id="wrrapd-virtual-no-strip">main.wrrapd-virtual-page__main{padding-top:0!important;margin:0!important;background:#f8fafc!important}main.wrrapd-virtual-page__main:has(.wrrapd-wrapstars-cinema-hero),main.wrrapd-virtual-page__main:has(.wrrapd-wrapriders-landing-hero){background:#0a0a0a!important}</style>
</head>
<body <?php body_class( 'wrrapd-virtual-page wrrapd-wrapriders-portal' ); ?>>
<?php wp_body_open(); ?>
<main class="wrrapd-virtual-page__main"><?php echo do_shortcode( $screen['shortcode'] ); ?></main>
<?php wp_footer(); ?>
</body>
</html>
	<?php
	exit;
}
add_action( 'template_redirect', 'wrrapd_wrapriders_virtual_profile_page', 4 );

function wrrapd_wrapriders_apply_url( $path = '/' ) {
	$path = '/' . ltrim( (string) $path, '/' );
	return 'https://' . wrrapd_wrapriders_apply_host() . $path;
}

function wrrapd_wrapriders_pros_url( $path = '/' ) {
	$path = '/' . ltrim( (string) $path, '/' );
	return 'https://' . wrrapd_wrapriders_pros_host() . $path;
}

function wrrapd_wrapriders_portal_login_url( $redirect = '', $greet = '' ) {
	if ( function_exists( 'wrrapd_onboarding_login_url' ) ) {
		if ( $redirect === '' ) {
			$redirect = wrrapd_wrapriders_pros_url( '/wraprider-onboarding/' );
		}
		return wrrapd_onboarding_login_url( $redirect, $greet );
	}
	$url = wrrapd_wrapriders_apply_url( '/onboarding/' );
	if ( $redirect !== '' ) {
		$url = add_query_arg( 'redirect_to', $redirect, $url );
	}
	$greet = trim( (string) $greet );
	if ( $greet !== '' && strcasecmp( $greet, 'there' ) !== 0 ) {
		$url = add_query_arg( 'greet', $greet, $url );
	}
	return $url;
}

/** Post-activation WrapRider role portal login. */
function wrrapd_wrapriders_role_portal_login_url( $redirect = '' ) {
	$url = wrrapd_wrapriders_apply_url( '/wraprider/login/' );
	if ( $redirect !== '' ) {
		$url = add_query_arg( 'redirect_to', $redirect, $url );
	}
	return $url;
}

function wrrapd_wrapriders_onboarding_step_url( $step ) {
	$paths = array(
		'welcome'     => '/wraprider-onboarding/',
		'agreement'   => '/wraprider-onboarding/wraprider-agreement/',
		'policies'    => '/wraprider-onboarding/wraprider-policies/',
		'orientation' => '/wraprider-onboarding/wraprider-orientation/',
		'background'  => '/wraprider-onboarding/wraprider-background/',
		'insurance'   => '/wraprider-onboarding/wraprider-insurance/',
		'identity'    => '/wraprider-onboarding/wraprider-identity/',
		'workspace'   => '/wraprider-onboarding/wraprider-workspace/',
		'w9'          => '/wraprider-onboarding/wraprider-w-9/',
		'tax_1099'    => '/wraprider-onboarding/wraprider-tax-1099/',
		'bank_payout' => '/wraprider-onboarding/wraprider-bank-payout/',
		'activation'  => '/wraprider-onboarding/wraprider-activation/',
	);
	$path = $paths[ $step ] ?? '/wraprider-onboarding/';
	return wrrapd_wrapriders_pros_url( $path );
}

/**
 * Post-activation WrapRider App (Cloud Run, wraprider.wrrapd.com) — the WrapRider's OWN app with
 * its own login. WrapRiders do not sign in to the WrapStar or JoyRider apps.
 * Override with WRRAPD_WRAPRIDER_APP_URL in wp-config.php.
 */
function wrrapd_wrapriders_app_url() {
	if ( defined( 'WRRAPD_WRAPRIDER_APP_URL' ) && WRRAPD_WRAPRIDER_APP_URL !== '' ) {
		return rtrim( (string) WRRAPD_WRAPRIDER_APP_URL, '/' );
	}
	return 'https://wraprider.wrrapd.com';
}

/** Back-compat aliases — both the wrap and delivery sides live in the one WrapRider App. */
function wrrapd_wrapriders_courier_app_url() {
	return wrrapd_wrapriders_app_url();
}
function wrrapd_wrapriders_wrap_app_url() {
	return wrrapd_wrapriders_app_url();
}

/** "wraprider.wrrapd.com" for emails / copy. */
function wrrapd_wrapriders_app_hosts_text() {
	return preg_replace( '#^https?://#', '', wrrapd_wrapriders_app_url() );
}

/** WrapRider profile page on the apply/pros WordPress. */
function wrrapd_wrapriders_profile_url() {
	return wrrapd_wrapriders_apply_url( '/wraprider/profile/' );
}

function wrrapd_wrapriders_register_roles() {
	if ( ! get_role( 'wraprider_applicant' ) ) {
		add_role( 'wraprider_applicant', 'WrapRider Applicant', array( 'read' => true ) );
	}
	if ( ! get_role( 'wraprider_approved' ) ) {
		add_role( 'wraprider_approved', 'WrapRider Approved', array( 'read' => true ) );
	}
	if ( ! get_role( 'wraprider_declined' ) ) {
		add_role( 'wraprider_declined', 'WrapRider Declined Offer', array( 'read' => true ) );
	}
	if ( ! get_role( 'wraprider_active' ) ) {
		add_role( 'wraprider_active', 'WrapRider Active', array( 'read' => true ) );
	}
}

function wrrapd_wrapriders_user_has_role( $user_id, $role ) {
	$user = get_userdata( $user_id );
	return $user && in_array( $role, (array) $user->roles, true );
}

function wrrapd_wrapriders_set_user_role( $user_id, $role ) {
	$user = new WP_User( $user_id );
	$user->set_role( $role );
}

/**
 * Once Command Center approves onboarding (status active) the onboarding portal is closed for
 * that WrapRider — they use wraprider.wrrapd.com from then on. Command Center can temporarily
 * reopen it (meta onboarding_reopened = 1) for the rare re-sign / re-upload case.
 *
 * @return bool
 */
function wrrapd_wrapriders_onboarding_closed_for_user( $user_id ) {
	static $cache = array();
	$user_id = (int) $user_id;
	if ( isset( $cache[ $user_id ] ) ) {
		return $cache[ $user_id ];
	}
	$closed = false;
	$app    = wrrapd_wrapriders_get_application_by_user( $user_id );
	if ( $app ) {
		$closed = (string) wrrapd_wrapriders_get_meta( $app->ID, 'status' ) === 'active'
			&& (string) wrrapd_wrapriders_get_meta( $app->ID, 'onboarding_reopened' ) !== '1';
	}
	$cache[ $user_id ] = $closed;
	return $closed;
}

/** Sign the user out everywhere on this WordPress (all devices). */
function wrrapd_wrapriders_destroy_user_sessions( $user_id ) {
	$user_id = (int) $user_id;
	if ( $user_id <= 0 || ! class_exists( 'WP_Session_Tokens' ) ) {
		return;
	}
	WP_Session_Tokens::get_instance( $user_id )->destroy_all();
}

function wrrapd_wrapriders_is_onboarding_eligible_user( $user_id ) {
	$has_role = wrrapd_wrapriders_user_has_role( $user_id, 'wraprider_approved' )
		|| wrrapd_wrapriders_user_has_role( $user_id, 'wraprider_active' );
	if ( ! $has_role ) {
		return false;
	}
	return ! wrrapd_wrapriders_onboarding_closed_for_user( $user_id );
}

function wrrapd_wrapriders_is_wraprider_user( $user_id ) {
	foreach ( array( 'wraprider_applicant', 'wraprider_approved', 'wraprider_declined', 'wraprider_active' ) as $role ) {
		if ( wrrapd_wrapriders_user_has_role( $user_id, $role ) ) {
			return true;
		}
	}
	return false;
}

function wrrapd_wrapriders_register_cpt() {
	register_post_type(
		WRRAPD_WRAPRIDERS_CPT,
		array(
			'labels'          => array(
				'name'          => 'WrapRider Applications',
				'singular_name' => 'WrapRider Application',
			),
			'public'          => false,
			'show_ui'         => true,
			'show_in_menu'    => false,
			'capability_type' => 'post',
			'map_meta_cap'    => true,
			'supports'        => array( 'title' ),
			'has_archive'     => false,
		)
	);
}

function wrrapd_wrapriders_get_meta( $post_id, $key, $default = '' ) {
	$val = get_post_meta( $post_id, '_wrrapd_wr_' . $key, true );
	return $val !== '' && $val !== false ? $val : $default;
}

function wrrapd_wrapriders_set_meta( $post_id, $key, $value ) {
	update_post_meta( $post_id, '_wrrapd_wr_' . $key, $value );
}

function wrrapd_wrapriders_get_application_by_user( $user_id ) {
	$posts = get_posts(
		array(
			'post_type'      => WRRAPD_WRAPRIDERS_CPT,
			'posts_per_page' => 1,
			'meta_key'       => '_wrrapd_wr_user_id',
			'meta_value'     => (string) $user_id,
			'post_status'    => 'publish',
		)
	);
	return $posts ? $posts[0] : null;
}

function wrrapd_wrapriders_get_application_by_email( $email ) {
	$email = strtolower( trim( (string) $email ) );
	if ( ! is_email( $email ) ) {
		return null;
	}
	$posts = get_posts(
		array(
			'post_type'      => WRRAPD_WRAPRIDERS_CPT,
			'posts_per_page' => 1,
			'meta_key'       => '_wrrapd_wr_email',
			'meta_value'     => $email,
			'post_status'    => 'publish',
		)
	);
	return $posts ? $posts[0] : null;
}

function wrrapd_wrapriders_greeting_name( $app_id ) {
	$nick = trim( (string) wrrapd_wrapriders_get_meta( $app_id, 'nickname' ) );
	if ( $nick !== '' ) {
		return $nick;
	}
	$first = trim( (string) wrrapd_wrapriders_get_meta( $app_id, 'first_name' ) );
	if ( $first !== '' ) {
		return $first;
	}
	return 'there';
}

function wrrapd_wrapriders_from_email_address() {
	if ( function_exists( 'wrrapd_wrapstars_from_email_address' ) ) {
		return wrrapd_wrapstars_from_email_address();
	}
	return 'admin@wrrapd.com';
}

function wrrapd_wrapriders_admin_notify_email() {
	if ( defined( 'WRRAPD_WRAPRIDERS_ADMIN_EMAIL' ) && WRRAPD_WRAPRIDERS_ADMIN_EMAIL !== '' ) {
		return (string) WRRAPD_WRAPRIDERS_ADMIN_EMAIL;
	}
	if ( defined( 'WRRAPD_WRAPSTARS_ADMIN_EMAIL' ) && WRRAPD_WRAPSTARS_ADMIN_EMAIL !== '' ) {
		return (string) WRRAPD_WRAPSTARS_ADMIN_EMAIL;
	}
	return 'admin@wrrapd.com';
}

function wrrapd_wrapriders_brand_logo_url() {
	if ( function_exists( 'wrrapd_wrapstars_brand_logo_url' ) ) {
		return wrrapd_wrapstars_brand_logo_url();
	}
	return 'https://wrrapd.com/wp-content/uploads/wrrapd-logo.png';
}

function wrrapd_wrapriders_send_email( $to, $subject, $body, $is_html = false ) {
	if ( function_exists( 'wrrapd_wrapstars_send_email' ) ) {
		return wrrapd_wrapstars_send_email( $to, $subject, $body, $is_html );
	}
	$headers = array( 'From: Wrrapd <' . wrrapd_wrapriders_from_email_address() . '>' );
	if ( $is_html ) {
		$headers[] = 'Content-Type: text/html; charset=UTF-8';
	}
	return wp_mail( $to, $subject, $body, $headers );
}

function wrrapd_wrapriders_generate_temp_password() {
	return 'Drive' . (string) wp_rand( 1000, 9999 ) . chr( wp_rand( 65, 90 ) ) . '!';
}

function wrrapd_wrapriders_invite_ttl_seconds() {
	$days = defined( 'WRRAPD_WRAPRIDERS_INVITE_TTL_DAYS' ) ? (int) WRRAPD_WRAPRIDERS_INVITE_TTL_DAYS : 15;
	if ( $days < 1 ) {
		$days = 15;
	}
	return $days * DAY_IN_SECONDS;
}

function wrrapd_wrapriders_get_invite_expires_at( $app_id ) {
	$explicit = (string) wrrapd_wrapriders_get_meta( $app_id, 'invite_expires_at' );
	if ( $explicit !== '' ) {
		return $explicit;
	}
	$issued = (string) wrrapd_wrapriders_get_meta( $app_id, 'portal_password_issued_at' );
	if ( $issued === '' ) {
		$issued = (string) wrrapd_wrapriders_get_meta( $app_id, 'approved_at' );
	}
	if ( $issued === '' ) {
		return '';
	}
	$ts = strtotime( $issued );
	return $ts ? gmdate( 'c', $ts + wrrapd_wrapriders_invite_ttl_seconds() ) : '';
}

/**
 * Format a stored ISO hire stamp for WP Admin (site timezone).
 *
 * @param string $iso UTC/ISO timestamp.
 * @return string
 */
function wrrapd_wrapriders_format_admin_stamp( $iso ) {
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
 * Print hire date/time rows on a WP Admin WrapRider card.
 *
 * @param int $id Application post ID.
 */
function wrrapd_wrapriders_admin_echo_hire_timeline( $id ) {
	$id   = (int) $id;
	$rows = array(
		'Application submitted' => wrrapd_wrapriders_get_meta( $id, 'submitted_at' ),
		'Interview requested'   => wrrapd_wrapriders_get_meta( $id, 'interview_at' ),
		'Interview skipped'     => wrrapd_wrapriders_get_meta( $id, 'interview_skipped_at' ),
		'Approved'              => wrrapd_wrapriders_get_meta( $id, 'approved_at' ),
		'Login invite sent'     => wrrapd_wrapriders_get_meta( $id, 'portal_password_issued_at' ),
		'Invite expires'        => wrrapd_wrapriders_get_invite_expires_at( $id ),
		'Invite expired'        => wrrapd_wrapriders_get_meta( $id, 'invite_expired_at' ),
		'Activated'             => wrrapd_wrapriders_get_meta( $id, 'activated_at' ),
		'Rejected'              => wrrapd_wrapriders_get_meta( $id, 'rejected_at' ),
		'Offer declined'        => wrrapd_wrapriders_get_meta( $id, 'declined_at' ),
		'Previous decline'      => wrrapd_wrapriders_get_meta( $id, 'previous_declined_at' ),
		'Reinvited'             => wrrapd_wrapriders_get_meta( $id, 'reinvited_at' ),
		'Suspended'             => wrrapd_wrapriders_get_meta( $id, 'suspended_at' ),
		'Unsuspended'           => wrrapd_wrapriders_get_meta( $id, 'unsuspended_at' ),
		'Notes updated'         => wrrapd_wrapriders_get_meta( $id, 'notes_updated_at' ),
		'Reset to review'       => wrrapd_wrapriders_get_meta( $id, 'reset_at' ),
	);
	echo '<h3>Hire dates</h3><table class="widefat" style="max-width:560px;margin:8px 0;"><tbody>';
	$any = false;
	foreach ( $rows as $label => $iso ) {
		$fmt = wrrapd_wrapriders_format_admin_stamp( $iso );
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

function wrrapd_wrapriders_invite_is_expired( $app_id ) {
	if ( (string) wrrapd_wrapriders_get_meta( $app_id, 'status' ) !== 'approved' ) {
		return false;
	}
	$expires = wrrapd_wrapriders_get_invite_expires_at( $app_id );
	if ( $expires === '' ) {
		return false;
	}
	$ts = strtotime( $expires );
	return $ts && time() > $ts;
}

function wrrapd_wrapriders_invalidate_expired_invite( $app_id ) {
	if ( (string) wrrapd_wrapriders_get_meta( $app_id, 'status' ) !== 'approved' ) {
		return;
	}
	if ( (string) wrrapd_wrapriders_get_meta( $app_id, 'invite_expired_at' ) === '' ) {
		wrrapd_wrapriders_set_meta( $app_id, 'invite_expired_at', gmdate( 'c' ) );
	}
	wrrapd_wrapriders_set_meta( $app_id, 'decline_token', '' );
	$user_id = (int) wrrapd_wrapriders_get_meta( $app_id, 'user_id' );
	if ( $user_id && get_userdata( $user_id ) ) {
		wp_set_password( wp_generate_password( 32, true, true ), $user_id );
	}
}

function wrrapd_wrapriders_enforce_active_invite_or_logout( $user_id ) {
	$app = wrrapd_wrapriders_get_application_by_user( $user_id );
	if ( ! $app || ! wrrapd_wrapriders_invite_is_expired( $app->ID ) ) {
		return false;
	}
	wrrapd_wrapriders_invalidate_expired_invite( $app->ID );
	wp_logout();
	return true;
}

function wrrapd_wrapriders_step_complete( $app_id, $step ) {
	return (string) wrrapd_wrapriders_get_meta( $app_id, 'step_' . $step ) === '1';
}

function wrrapd_wrapriders_mark_step_complete( $app_id, $step ) {
	wrrapd_wrapriders_set_meta( $app_id, 'step_' . $step, '1' );
	wrrapd_wrapriders_set_meta( $app_id, 'onboarding_step', wrrapd_wrapriders_next_onboarding_step( $step ) );
}

function wrrapd_wrapriders_can_access_step( $app_id, $step ) {
	$steps = array_keys( wrrapd_wrapriders_onboarding_steps() );
	$idx   = array_search( $step, $steps, true );
	if ( $idx === false ) {
		return false;
	}
	for ( $i = 0; $i < $idx; $i++ ) {
		if ( ! wrrapd_wrapriders_step_complete( $app_id, $steps[ $i ] ) ) {
			return false;
		}
	}
	return true;
}

function wrrapd_wrapriders_set_must_change_password( $user_id, $app_id, $must ) {
	wrrapd_wrapriders_set_meta( $app_id, 'must_change_password', $must ? '1' : '' );
	if ( $must ) {
		update_user_meta( $user_id, '_wrrapd_wr_must_change_password', '1' );
	} else {
		delete_user_meta( $user_id, '_wrrapd_wr_must_change_password' );
	}
}

function wrrapd_wrapriders_user_must_change_password( $user_id ) {
	return get_user_meta( $user_id, '_wrrapd_wr_must_change_password', true ) === '1';
}

function wrrapd_wrapriders_portal_redirect_for_user( $user_id ) {
	return wrrapd_wrapriders_pros_url( '/wraprider-onboarding/' );
}

function wrrapd_wrapriders_handle_upload( $app_id, $field, $allowed = array( 'jpg', 'jpeg', 'png', 'pdf' ) ) {
	if ( empty( $_FILES[ $field ]['name'] ) ) {
		return array( 'ok' => false, 'error' => 'Please upload the required file.' );
	}
	if ( ! function_exists( 'wp_handle_upload' ) ) {
		require_once ABSPATH . 'wp-admin/includes/file.php';
	}
	$file = $_FILES[ $field ];
	$ext  = strtolower( pathinfo( (string) $file['name'], PATHINFO_EXTENSION ) );
	if ( ! in_array( $ext, $allowed, true ) ) {
		return array( 'ok' => false, 'error' => 'Invalid file type. Allowed: ' . implode( ', ', $allowed ) );
	}
	$upload = wp_handle_upload(
		$file,
		array(
			'test_form' => false,
			'mimes'     => array(
				'jpg|jpeg|jpe' => 'image/jpeg',
				'png'          => 'image/png',
				'pdf'          => 'application/pdf',
			),
		)
	);
	if ( isset( $upload['error'] ) ) {
		return array( 'ok' => false, 'error' => (string) $upload['error'] );
	}
	return array( 'ok' => true, 'path' => (string) ( $upload['url'] ?? $upload['file'] ?? '' ) );
}

function wrrapd_wrapriders_block_wraprider_wp_admin() {
	if ( wp_doing_ajax() || ! is_user_logged_in() || current_user_can( 'manage_options' ) ) {
		return;
	}
	if ( wrrapd_wrapriders_is_wraprider_user( get_current_user_id() ) ) {
		wp_safe_redirect( wrrapd_wrapriders_portal_redirect_for_user( get_current_user_id() ) );
		exit;
	}
}

function wrrapd_wrapriders_login_redirect( $redirect_to, $requested_redirect_to, $user ) {
	if ( is_wp_error( $user ) || ! $user instanceof WP_User ) {
		return $redirect_to;
	}
	// Administrators are handled by WrapStars login_redirect → wp-admin.
	if ( user_can( $user, 'manage_options' ) ) {
		foreach ( array( $requested_redirect_to, $redirect_to ) as $url ) {
			if ( is_string( $url ) && $url !== '' && strpos( $url, '/wp-admin' ) !== false ) {
				return $url;
			}
		}
		return admin_url();
	}
	if ( wrrapd_wrapriders_is_onboarding_eligible_user( $user->ID ) ) {
		if ( $requested_redirect_to !== '' && strpos( $requested_redirect_to, 'wraprider-onboarding' ) !== false ) {
			return $requested_redirect_to;
		}
		return wrrapd_wrapriders_portal_redirect_for_user( $user->ID );
	}
	return $redirect_to;
}

function wrrapd_wrapriders_body_class( $classes ) {
	$classes[] = 'wrrapd-wrapriders-portal';
	return $classes;
}

function wrrapd_wrapriders_enqueue_assets() {
	if ( ! wrrapd_wrapriders_is_portal_host() ) {
		return;
	}
	$uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '';
	$need = (bool) preg_match( '#/(wraprider|wraprider-onboarding)(/|$)#', $uri );
	if ( ! $need && ! is_singular() ) {
		// Still load on pages that may use shortcodes without path match.
		$need = true;
	}
	$ws_css = dirname( __FILE__ ) . '/wrrapd-wrapstars.css';
	if ( is_readable( $ws_css ) && ! wp_style_is( 'wrrapd-wrapstars', 'enqueued' ) ) {
		wp_enqueue_style(
			'wrrapd-wrapstars',
			content_url( 'mu-plugins/wrrapd-wrapstars.css' ),
			array(),
			defined( 'WRRAPD_WRAPSTARS_BUILD' ) ? WRRAPD_WRAPSTARS_BUILD : '1'
		);
	}
	$drv_css = dirname( __FILE__ ) . '/wrrapd-wrapriders.css';
	if ( is_readable( $drv_css ) ) {
		wp_enqueue_style(
			'wrrapd-wrapriders',
			content_url( 'mu-plugins/wrrapd-wrapriders.css' ),
			array( 'wrrapd-wrapstars' ),
			WRRAPD_WRAPRIDERS_BUILD
		);
	}
	// Multi-step WrapRider apply wizard (same UX family as WrapStars apply).
	if ( preg_match( '#/wraprider/apply(/|$)#', $uri ) ) {
		$js = dirname( __FILE__ ) . '/wrrapd-wrapriders-apply.js';
		if ( is_readable( $js ) ) {
			$ver = WRRAPD_WRAPRIDERS_BUILD . '-' . (string) filemtime( $js );
			wp_enqueue_script( 'wrrapd-wrapriders-apply', content_url( 'mu-plugins/wrrapd-wrapriders-apply.js' ), array(), $ver, true );
		}
	}
}

function wrrapd_wrapriders_host_routing() {
	if ( is_admin() ) {
		return;
	}
	$uri  = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '/';
	$path = '/' . trim( strtok( $uri, '?' ), '/' );
	if ( $path === '//' || $path === '' ) {
		$path = '/';
	}

	// Apply-host screens: /wraprider/, /wraprider/apply/, /wraprider/thank-you/, /wraprider/login/,
	// /wraprider/decline/, /wraprider/profile/. Pros-host screens: /wraprider-onboarding/…
	$is_drive_apply = (bool) preg_match( '#^/wraprider(/|$)#', $path );
	$is_drive_ob    = (bool) preg_match( '#^/wraprider-onboarding(/|$)#', $path );
	$is_login       = (bool) preg_match( '#^/wraprider/login(/|$)#', $path );

	if ( wrrapd_wrapriders_unified_host() ) {
		if ( $is_drive_ob ) {
			if ( ! is_user_logged_in() || ! wrrapd_wrapriders_is_onboarding_eligible_user( get_current_user_id() ) ) {
				wp_safe_redirect( wrrapd_wrapriders_portal_login_url( wrrapd_wrapriders_apply_url( $path ) ) );
				exit;
			}
			if ( wrrapd_wrapriders_enforce_active_invite_or_logout( get_current_user_id() ) ) {
				wp_safe_redirect( add_query_arg( 'invite_expired', '1', wrrapd_wrapriders_portal_login_url( wrrapd_wrapriders_apply_url( $path ) ) ) );
				exit;
			}
		}
		if ( $is_login && is_user_logged_in() && wrrapd_wrapriders_is_onboarding_eligible_user( get_current_user_id() ) ) {
			if ( wrrapd_wrapriders_enforce_active_invite_or_logout( get_current_user_id() ) ) {
				wp_safe_redirect( add_query_arg( 'invite_expired', '1', wrrapd_wrapriders_portal_login_url() ) );
				exit;
			}
			wp_safe_redirect( wrrapd_wrapriders_portal_redirect_for_user( get_current_user_id() ) );
			exit;
		}
		return;
	}

	if ( wrrapd_wrapriders_is_apply_host() ) {
		if ( $is_drive_ob ) {
			wp_safe_redirect( wrrapd_wrapriders_pros_url( $path ) );
			exit;
		}
		// Onboarding applicants use shared /onboarding/; this URL is the post-activation portal.
		if ( $is_login && ! is_user_logged_in() ) {
			// Allow the role-portal form to render; onboarders are steered in the shortcode.
			return;
		}
		if ( $is_login && is_user_logged_in() && wrrapd_wrapriders_is_onboarding_eligible_user( get_current_user_id() ) ) {
			if ( wrrapd_wrapriders_enforce_active_invite_or_logout( get_current_user_id() ) ) {
				wp_safe_redirect( add_query_arg( 'invite_expired', '1', wrrapd_wrapriders_portal_login_url() ) );
				exit;
			}
			wp_safe_redirect( wrrapd_wrapriders_portal_login_url( wrrapd_wrapriders_pros_url( '/wraprider-onboarding/' ) ) );
			exit;
		}
		return;
	}

	if ( wrrapd_wrapriders_is_pros_host() ) {
		if ( $is_drive_apply ) {
			wp_safe_redirect( wrrapd_wrapriders_apply_url( $path ) );
			exit;
		}
		if ( $is_drive_ob ) {
			if ( ! is_user_logged_in() || ! wrrapd_wrapriders_is_onboarding_eligible_user( get_current_user_id() ) ) {
				wp_safe_redirect( wrrapd_wrapriders_portal_login_url( wrrapd_wrapriders_pros_url( $path ) ) );
				exit;
			}
			if ( wrrapd_wrapriders_enforce_active_invite_or_logout( get_current_user_id() ) ) {
				wp_safe_redirect( add_query_arg( 'invite_expired', '1', wrrapd_wrapriders_portal_login_url( wrrapd_wrapriders_pros_url( $path ) ) ) );
				exit;
			}
		}
	}
}

function wrrapd_wrapriders_maybe_handle_posts() {
	if ( empty( $_POST['wrrapd_wr_action'] ) ) {
		return;
	}
	$action = sanitize_text_field( wp_unslash( $_POST['wrrapd_wr_action'] ) );
	if ( $action === 'apply' ) {
		wrrapd_wrapriders_process_application();
	} elseif ( $action === 'portal_login' ) {
		wrrapd_wrapriders_process_portal_login();
	} elseif ( $action === 'onboarding_step' ) {
		wrrapd_wrapriders_process_onboarding_step();
	} elseif ( $action === 'orientation_quiz' ) {
		wrrapd_wrapriders_process_orientation_quiz();
	} elseif ( $action === 'change_password' ) {
		wrrapd_wrapriders_process_change_password();
	} elseif ( $action === 'decline_offer' ) {
		wrrapd_wrapriders_process_decline_offer();
	} elseif ( $action === 'save_profile' ) {
		wrrapd_wrapriders_process_profile_save();
	} elseif ( $action === 'profile_password' ) {
		wrrapd_wrapriders_process_profile_password();
	}
}

/**
 * WrapRider profile — contact & mailing edits (approved / active only).
 */
function wrrapd_wrapriders_process_profile_save() {
	if ( ! is_user_logged_in() || ! isset( $_POST['wrrapd_wr_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_wr_nonce'] ) ), 'wrrapd_wr_profile' ) ) {
		return;
	}
	$user_id = get_current_user_id();
	$app     = wrrapd_wrapriders_get_application_by_user( $user_id );
	if ( ! $app ) {
		$GLOBALS['wrrapd_wr_profile_errors'] = array( 'No WrapRider application is linked to this account.' );
		return;
	}
	if ( ! in_array( (string) wrrapd_wrapriders_get_meta( $app->ID, 'status' ), array( 'approved', 'active' ), true ) ) {
		$GLOBALS['wrrapd_wr_profile_errors'] = array( 'Profile editing is available after approval.' );
		return;
	}
	$first = sanitize_text_field( wp_unslash( $_POST['first_name'] ?? '' ) );
	$last  = sanitize_text_field( wp_unslash( $_POST['last_name'] ?? '' ) );
	$email = sanitize_email( wp_unslash( $_POST['email'] ?? '' ) );
	if ( $first === '' || $last === '' || ! is_email( $email ) ) {
		$GLOBALS['wrrapd_wr_profile_errors'] = array( 'First name, last name, and a valid email are required.' );
		return;
	}
	$middle = sanitize_text_field( wp_unslash( $_POST['middle_name'] ?? '' ) );
	wrrapd_wrapriders_set_meta( $app->ID, 'first_name', $first );
	wrrapd_wrapriders_set_meta( $app->ID, 'middle_name', $middle );
	wrrapd_wrapriders_set_meta( $app->ID, 'last_name', $last );
	wrrapd_wrapriders_set_meta( $app->ID, 'full_name', trim( preg_replace( '/\s+/', ' ', $first . ' ' . $middle . ' ' . $last ) ) );
	wrrapd_wrapriders_set_meta( $app->ID, 'nickname', sanitize_text_field( wp_unslash( $_POST['nickname'] ?? '' ) ) );
	wrrapd_wrapriders_set_meta( $app->ID, 'email', strtolower( $email ) );
	$mobile = sanitize_text_field( wp_unslash( $_POST['phone_mobile'] ?? '' ) );
	wrrapd_wrapriders_set_meta( $app->ID, 'phone_mobile', $mobile );
	wrrapd_wrapriders_set_meta( $app->ID, 'phone', $mobile );
	wrrapd_wrapriders_set_meta( $app->ID, 'address_line1', sanitize_text_field( wp_unslash( $_POST['address_line1'] ?? '' ) ) );
	wrrapd_wrapriders_set_meta( $app->ID, 'address_line2', sanitize_text_field( wp_unslash( $_POST['address_line2'] ?? '' ) ) );
	wrrapd_wrapriders_set_meta( $app->ID, 'city', sanitize_text_field( wp_unslash( $_POST['city'] ?? '' ) ) );
	wrrapd_wrapriders_set_meta( $app->ID, 'state', strtoupper( sanitize_text_field( wp_unslash( $_POST['state'] ?? '' ) ) ) );
	wrrapd_wrapriders_set_meta( $app->ID, 'postal_code', sanitize_text_field( wp_unslash( $_POST['postal_code'] ?? '' ) ) );
	wrrapd_wrapriders_set_meta( $app->ID, 'vehicle_type', sanitize_text_field( wp_unslash( $_POST['vehicle_type'] ?? '' ) ) );
	wrrapd_wrapriders_set_meta( $app->ID, 'profile_updated_at', gmdate( 'c' ) );
	$user = get_userdata( $user_id );
	if ( $user && strtolower( (string) $user->user_email ) !== strtolower( $email ) && ! email_exists( $email ) ) {
		wp_update_user( array( 'ID' => $user_id, 'user_email' => strtolower( $email ), 'display_name' => wrrapd_wrapriders_get_meta( $app->ID, 'full_name' ) ) );
	}
	$GLOBALS['wrrapd_wr_profile_ok'] = true;
}

/**
 * WrapRider profile — password change at any time after approval.
 */
function wrrapd_wrapriders_process_profile_password() {
	if ( ! is_user_logged_in() || ! isset( $_POST['wrrapd_wr_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_wr_nonce'] ) ), 'wrrapd_wr_profile_pw' ) ) {
		$GLOBALS['wrrapd_wr_profile_pw_error'] = 'Security check failed. Please try again.';
		return;
	}
	$user_id = get_current_user_id();
	$user    = get_userdata( $user_id );
	$current = (string) wp_unslash( $_POST['current_password'] ?? '' );
	$new     = (string) wp_unslash( $_POST['new_password'] ?? '' );
	$confirm = (string) wp_unslash( $_POST['confirm_password'] ?? '' );
	if ( ! $user || ! wp_check_password( $current, $user->user_pass, $user_id ) ) {
		$GLOBALS['wrrapd_wr_profile_pw_error'] = 'Current password is incorrect.';
		return;
	}
	if ( strlen( $new ) < 10 ) {
		$GLOBALS['wrrapd_wr_profile_pw_error'] = 'Choose a new password with at least 10 characters.';
		return;
	}
	if ( $new !== $confirm ) {
		$GLOBALS['wrrapd_wr_profile_pw_error'] = 'New password and confirmation do not match.';
		return;
	}
	if ( $new === $current ) {
		$GLOBALS['wrrapd_wr_profile_pw_error'] = 'Pick a password different from your current one.';
		return;
	}
	wp_set_password( $new, $user_id );
	$app = wrrapd_wrapriders_get_application_by_user( $user_id );
	if ( $app ) {
		wrrapd_wrapriders_set_must_change_password( $user_id, (int) $app->ID, false );
		wrrapd_wrapriders_set_meta( $app->ID, 'password_changed_at', gmdate( 'c' ) );
	}
	wp_set_current_user( $user_id );
	wp_set_auth_cookie( $user_id, true );
	$GLOBALS['wrrapd_wr_profile_pw_ok'] = true;
}

function wrrapd_wrapriders_process_portal_login() {
	if ( ! isset( $_POST['wrrapd_wr_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_wr_nonce'] ) ), 'wrrapd_wr_login' ) ) {
		return;
	}
	$email    = sanitize_email( wp_unslash( $_POST['email'] ?? '' ) );
	$password = (string) wp_unslash( $_POST['password'] ?? '' );
	$user     = wp_authenticate( $email, $password );
	if ( is_wp_error( $user ) ) {
		$GLOBALS['wrrapd_wr_login_error'] = 'Invalid email or password.';
		return;
	}
	if ( wrrapd_wrapriders_onboarding_closed_for_user( $user->ID ) ) {
		// Activated → role app.
		wp_set_current_user( $user->ID );
		wp_set_auth_cookie( $user->ID, true );
		$app_url = function_exists( 'wrrapd_wrapriders_app_url' ) ? wrrapd_wrapriders_app_url() : 'https://wraprider.wrrapd.com/';
		wp_safe_redirect( $app_url );
		exit;
	}
	if ( wrrapd_wrapriders_is_onboarding_eligible_user( $user->ID ) ) {
		// Still onboarding → shared door / onboarding destination.
		wp_set_current_user( $user->ID );
		wp_set_auth_cookie( $user->ID, true );
		wp_safe_redirect( wrrapd_wrapriders_portal_redirect_for_user( $user->ID ) );
		exit;
	}
	$GLOBALS['wrrapd_wr_login_error'] = 'This login is for approved WrapRiders only.';
	return;
}

function wrrapd_wrapriders_process_change_password() {
	if ( ! is_user_logged_in() || ! isset( $_POST['wrrapd_wr_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_wr_nonce'] ) ), 'wrrapd_wr_change_pw' ) ) {
		return;
	}
	$user_id = get_current_user_id();
	$pw1     = (string) wp_unslash( $_POST['password'] ?? '' );
	$pw2     = (string) wp_unslash( $_POST['password2'] ?? '' );
	if ( strlen( $pw1 ) < 10 ) {
		$GLOBALS['wrrapd_wr_pw_error'] = 'Password must be at least 10 characters.';
		return;
	}
	if ( $pw1 !== $pw2 ) {
		$GLOBALS['wrrapd_wr_pw_error'] = 'Passwords do not match.';
		return;
	}
	wp_set_password( $pw1, $user_id );
	$app = wrrapd_wrapriders_get_application_by_user( $user_id );
	if ( $app ) {
		wrrapd_wrapriders_set_must_change_password( $user_id, $app->ID, false );
	}
	wp_set_current_user( $user_id );
	wp_set_auth_cookie( $user_id, true );
	wp_safe_redirect( wrrapd_wrapriders_portal_redirect_for_user( $user_id ) );
	exit;
}

function wrrapd_wrapriders_process_onboarding_step() {
	if ( ! is_user_logged_in() || ! isset( $_POST['wrrapd_wr_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_wr_nonce'] ) ), 'wrrapd_wr_onboarding' ) ) {
		return;
	}
	$app = wrrapd_wrapriders_get_application_by_user( get_current_user_id() );
	if ( ! $app || (string) wrrapd_wrapriders_get_meta( $app->ID, 'status' ) !== 'approved' ) {
		return;
	}
	$step = sanitize_text_field( wp_unslash( $_POST['step'] ?? '' ) );
	if ( ! wrrapd_wrapriders_can_access_step( $app->ID, $step ) ) {
		return;
	}
	$placeholders = array( 'policies', 'background', 'identity', 'tax_1099', 'bank_payout', 'w9' );
	if ( $step === 'welcome' ) {
		wrrapd_wrapriders_mark_step_complete( $app->ID, 'welcome' );
		wp_safe_redirect( wrrapd_wrapriders_onboarding_step_url( 'agreement' ) );
		exit;
	}
	if ( $step === 'agreement' ) {
		if ( wrrapd_wrapriders_step_complete( $app->ID, 'agreement' ) || (string) wrrapd_wrapriders_get_meta( $app->ID, 'esign_accepted_at' ) !== '' ) {
			$GLOBALS['wrrapd_wr_ob_error'] = 'These agreements are already accepted.';
			return;
		}
		if ( ! function_exists( 'wrrapd_esign_validate_acceptance' ) ) {
			$GLOBALS['wrrapd_wr_ob_error'] = 'Agreement module missing. Contact support.';
			return;
		}
		$esign = wrrapd_esign_validate_acceptance( 'wraprider' );
		if ( empty( $esign['ok'] ) ) {
			$GLOBALS['wrrapd_wr_ob_error'] = $esign['error'] ?? 'Please accept the agreements to continue.';
			return;
		}
		wrrapd_esign_store_meta(
			static function ( $k, $v ) use ( $app ) {
				wrrapd_wrapriders_set_meta( $app->ID, $k, $v );
			},
			$esign['meta']
		);
		wrrapd_wrapriders_set_meta( $app->ID, 'ic_signed_at', $esign['meta']['esign_accepted_at'] );
		wrrapd_wrapriders_mark_step_complete( $app->ID, 'agreement' );
		wp_safe_redirect( wrrapd_wrapriders_onboarding_step_url( wrrapd_wrapriders_next_onboarding_step( 'agreement' ) ) );
		exit;
	}
	if ( in_array( $step, $placeholders, true ) ) {
		if ( empty( $_POST['placeholder_ack'] ) && empty( $_POST['step_ack'] ) ) {
			$GLOBALS['wrrapd_wr_ob_error'] = 'Please acknowledge to continue.';
			return;
		}
		wrrapd_wrapriders_mark_step_complete( $app->ID, $step );
		wp_safe_redirect( wrrapd_wrapriders_onboarding_step_url( wrrapd_wrapriders_next_onboarding_step( $step ) ) );
		exit;
	}
	if ( $step === 'insurance' ) {
		$upload = wrrapd_wrapriders_handle_upload( $app->ID, 'insurance_file' );
		if ( ! $upload['ok'] ) {
			$GLOBALS['wrrapd_wr_ob_error'] = $upload['error'];
			return;
		}
		wrrapd_wrapriders_set_meta( $app->ID, 'insurance_file', $upload['path'] );
		wrrapd_wrapriders_mark_step_complete( $app->ID, 'insurance' );
		wp_safe_redirect( wrrapd_wrapriders_onboarding_step_url( 'identity' ) );
		exit;
	}
	if ( $step === 'workspace' ) {
		$address = sanitize_text_field( wp_unslash( $_POST['workspace_address'] ?? '' ) );
		$windows = isset( $_POST['workspace_windows'] ) && is_array( $_POST['workspace_windows'] )
			? array_values( array_filter( array_map( 'sanitize_text_field', wp_unslash( $_POST['workspace_windows'] ) ) ) )
			: array();
		$notes   = sanitize_textarea_field( wp_unslash( $_POST['workspace_notes'] ?? '' ) );
		if ( $address === '' ) {
			$GLOBALS['wrrapd_wr_ob_error'] = 'Please enter the address where you will wrap.';
			return;
		}
		if ( empty( $windows ) ) {
			$GLOBALS['wrrapd_wr_ob_error'] = 'Pick at least one hand-off window.';
			return;
		}
		if ( empty( $_POST['workspace_ack'] ) ) {
			$GLOBALS['wrrapd_wr_ob_error'] = 'Please confirm your wrapping space to continue.';
			return;
		}
		wrrapd_wrapriders_set_meta( $app->ID, 'workspace_address', $address );
		wrrapd_wrapriders_set_meta( $app->ID, 'workspace_windows', implode( ',', $windows ) );
		wrrapd_wrapriders_set_meta( $app->ID, 'workspace_notes', $notes );
		wrrapd_wrapriders_set_meta( $app->ID, 'workspace_confirmed_at', gmdate( 'c' ) );
		wrrapd_wrapriders_mark_step_complete( $app->ID, 'workspace' );
		wp_safe_redirect( wrrapd_wrapriders_onboarding_step_url( 'w9' ) );
		exit;
	}
}

/** Hand-off windows a WrapRider can offer for inbound packages / supplies. */
function wrrapd_wrapriders_workspace_window_options() {
	return array(
		'weekday_morning'   => 'Weekday mornings',
		'weekday_afternoon' => 'Weekday afternoons',
		'weekday_evening'   => 'Weekday evenings',
		'weekend'           => 'Weekends',
	);
}

function wrrapd_wrapriders_process_orientation_quiz() {
	if ( ! is_user_logged_in() || ! isset( $_POST['wrrapd_wr_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_wr_nonce'] ) ), 'wrrapd_wr_onboarding' ) ) {
		return;
	}
	$app = wrrapd_wrapriders_get_application_by_user( get_current_user_id() );
	if ( ! $app ) {
		return;
	}
	$score = 0;
	if ( ( $_POST['q1'] ?? '' ) === 'scan' ) {
		$score++;
	}
	if ( ( $_POST['q2'] ?? '' ) === 'proof' ) {
		$score++;
	}
	if ( ( $_POST['q3'] ?? '' ) === 'both' ) {
		$score++;
	}
	wrrapd_wrapriders_set_meta( $app->ID, 'orientation_score', (string) $score );
	if ( $score < 3 ) {
		$GLOBALS['wrrapd_wr_ob_error'] = 'Please review the answers and try again (need 3/3).';
		return;
	}
	wrrapd_wrapriders_mark_step_complete( $app->ID, 'orientation' );
	wp_safe_redirect( wrrapd_wrapriders_onboarding_step_url( 'background' ) );
	exit;
}

function wrrapd_wrapriders_process_decline_offer() {
	if ( ! isset( $_POST['wrrapd_wr_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_wr_nonce'] ) ), 'wrrapd_wr_decline' ) ) {
		return;
	}
	$app_id = (int) ( $_POST['app'] ?? 0 );
	$token  = sanitize_text_field( wp_unslash( $_POST['token'] ?? '' ) );
	$note   = sanitize_textarea_field( wp_unslash( $_POST['decline_note'] ?? '' ) );
	$result = wrrapd_wrapriders_mark_offer_declined( $app_id, $note, $token );
	$GLOBALS['wrrapd_wr_decline_result'] = $result;
}

function wrrapd_wrapriders_provision_approved_user( $app_id ) {
	$email = strtolower( (string) wrrapd_wrapriders_get_meta( $app_id, 'email' ) );
	$name  = (string) wrrapd_wrapriders_get_meta( $app_id, 'full_name' );
	if ( ! is_email( $email ) ) {
		return new WP_Error( 'invalid_email', 'Application email missing.' );
	}
	$password = wrrapd_wrapriders_generate_temp_password();
	$user_id  = (int) wrrapd_wrapriders_get_meta( $app_id, 'user_id' );
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
	$first = (string) wrrapd_wrapriders_get_meta( $app_id, 'first_name' );
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
	wrrapd_wrapriders_set_meta( $app_id, 'user_id', $user_id );
	wrrapd_wrapriders_set_user_role( $user_id, 'wraprider_approved' );
	wrrapd_wrapriders_set_meta( $app_id, 'portal_password_issued_at', gmdate( 'c' ) );
	wrrapd_wrapriders_set_meta( $app_id, 'invite_expires_at', gmdate( 'c', time() + wrrapd_wrapriders_invite_ttl_seconds() ) );
	wrrapd_wrapriders_set_meta( $app_id, 'invite_expired_at', '' );
	wrrapd_wrapriders_set_must_change_password( $user_id, $app_id, true );
	wrrapd_wrapriders_set_meta( $app_id, 'declined_at', '' );
	$decline_token = wp_generate_password( 40, false, false );
	wrrapd_wrapriders_set_meta( $app_id, 'decline_token', $decline_token );
	return array(
		'user_id'       => $user_id,
		'password'      => $password,
		'decline_token' => $decline_token,
	);
}

function wrrapd_wrapriders_decline_offer_url( $app_id, $token ) {
	return add_query_arg(
		array(
			'app'   => (int) $app_id,
			'token' => rawurlencode( (string) $token ),
		),
		wrrapd_wrapriders_apply_url( '/wraprider/decline/' )
	);
}

function wrrapd_wrapriders_send_approval_credentials_email( $app_id, $password, $context = 'approve' ) {
	$email   = wrrapd_wrapriders_get_meta( $app_id, 'email' );
	$greet   = wrrapd_wrapriders_greeting_name( $app_id );
	$login   = wrrapd_wrapriders_portal_login_url( wrrapd_wrapriders_pros_url( '/wraprider-onboarding/' ), $greet );
	$token   = (string) wrrapd_wrapriders_get_meta( $app_id, 'decline_token' );
	$decline = $token !== '' ? wrrapd_wrapriders_decline_offer_url( $app_id, $token ) : wrrapd_wrapriders_apply_url( '/wraprider/decline/' );
	$subject = 'Congratulations — welcome to the Wrrapd WrapRider network';
	$lead    = 'We are thrilled to welcome you as a Wrrapd WrapRider.';
	if ( $context === 'reinvite' ) {
		$subject = 'Welcome back — your Wrrapd WrapRider invitation is open';
		$lead    = 'We are delighted to reopen your WrapRider invitation.';
	} elseif ( $context === 'resend' ) {
		$subject = 'Your Wrrapd WrapRider login details';
		$lead    = 'Here are fresh portal credentials. Earlier temporary passwords no longer work.';
	}
	$body  = "Hi {$greet},\n\n{$lead}\n\n";
	$body .= "Please log in to begin onboarding. You will choose a new password first.\n\n";
	$body .= "Login: {$login}\nUsername: {$email}\nTemporary password: {$password}\n\n";
	$body .= "This link and password expire in 15 days.\n\n";
	$body .= "Decline this offer (no login): {$decline}\n\n";
	$body .= "— Team Wrrapd\n";
	wrrapd_wrapriders_send_email( $email, $subject, $body );
}

function wrrapd_wrapriders_mark_offer_declined( $app_id, $note = '', $token = null ) {
	$app_id = (int) $app_id;
	$app    = get_post( $app_id );
	if ( ! $app || $app->post_type !== WRRAPD_WRAPRIDERS_CPT ) {
		return array( 'ok' => false, 'error' => 'Application not found.' );
	}
	$status = (string) wrrapd_wrapriders_get_meta( $app_id, 'status' );
	if ( ! in_array( $status, array( 'approved', 'under_review', 'interview' ), true ) ) {
		return array( 'ok' => false, 'error' => 'Offer cannot be declined from status “' . $status . '”.' );
	}
	if ( $token !== null ) {
		$expected = (string) wrrapd_wrapriders_get_meta( $app_id, 'decline_token' );
		if ( $expected === '' || ! hash_equals( $expected, (string) $token ) ) {
			return array( 'ok' => false, 'error' => 'Invalid or expired decline link.' );
		}
	}
	wrrapd_wrapriders_set_meta( $app_id, 'status', 'declined' );
	wrrapd_wrapriders_set_meta( $app_id, 'declined_at', gmdate( 'c' ) );
	wrrapd_wrapriders_set_meta( $app_id, 'decline_note', $note );
	wrrapd_wrapriders_set_meta( $app_id, 'decline_token', '' );
	$user_id = (int) wrrapd_wrapriders_get_meta( $app_id, 'user_id' );
	if ( $user_id && get_userdata( $user_id ) ) {
		wrrapd_wrapriders_set_user_role( $user_id, 'wraprider_declined' );
		wp_set_password( wp_generate_password( 32, true, true ), $user_id );
	}
	return array( 'ok' => true, 'status' => 'declined' );
}

function wrrapd_wrapriders_reinvite_declined_offer( $app_id, $admin_note = '' ) {
	$app_id = (int) $app_id;
	$app    = get_post( $app_id );
	if ( ! $app || $app->post_type !== WRRAPD_WRAPRIDERS_CPT ) {
		return array( 'ok' => false, 'error' => 'Application not found.' );
	}
	if ( (string) wrrapd_wrapriders_get_meta( $app_id, 'status' ) !== 'declined' ) {
		return array( 'ok' => false, 'error' => 'Only declined offers can be re-invited.' );
	}
	wrrapd_wrapriders_set_meta( $app_id, 'previous_declined_at', wrrapd_wrapriders_get_meta( $app_id, 'declined_at' ) );
	wrrapd_wrapriders_set_meta( $app_id, 'status', 'approved' );
	wrrapd_wrapriders_set_meta( $app_id, 'approved_at', gmdate( 'c' ) );
	wrrapd_wrapriders_set_meta( $app_id, 'onboarding_step', 'welcome' );
	wrrapd_wrapriders_set_meta( $app_id, 'reinvited_at', gmdate( 'c' ) );
	$count = (int) wrrapd_wrapriders_get_meta( $app_id, 'reinvite_count', '0' );
	wrrapd_wrapriders_set_meta( $app_id, 'reinvite_count', (string) ( $count + 1 ) );
	if ( $admin_note !== '' ) {
		wrrapd_wrapriders_set_meta( $app_id, 'admin_notes', $admin_note );
	}
	$provision = wrrapd_wrapriders_provision_approved_user( $app_id );
	if ( is_wp_error( $provision ) ) {
		return array( 'ok' => false, 'error' => $provision->get_error_message() );
	}
	wrrapd_wrapriders_send_approval_credentials_email( $app_id, $provision['password'], 'reinvite' );
	return array( 'ok' => true, 'password' => $provision['password'] );
}

function wrrapd_wrapriders_resend_approval_invite( $app_id ) {
	$app_id = (int) $app_id;
	if ( (string) wrrapd_wrapriders_get_meta( $app_id, 'status' ) !== 'approved' ) {
		return array( 'ok' => false, 'error' => 'Resend requires approved status.' );
	}
	$provision = wrrapd_wrapriders_provision_approved_user( $app_id );
	if ( is_wp_error( $provision ) ) {
		return array( 'ok' => false, 'error' => $provision->get_error_message() );
	}
	wrrapd_wrapriders_send_approval_credentials_email( $app_id, $provision['password'], 'resend' );
	return array( 'ok' => true );
}

function wrrapd_wrapriders_reset_application_to_under_review( $app_id ) {
	$app_id = (int) $app_id;
	$app    = get_post( $app_id );
	if ( ! $app || $app->post_type !== WRRAPD_WRAPRIDERS_CPT ) {
		return array( 'ok' => false, 'error' => 'Application not found.' );
	}
	$status = (string) wrrapd_wrapriders_get_meta( $app_id, 'status' );
	if ( ! in_array( $status, array( 'approved', 'declined', 'interview', 'rejected' ), true ) ) {
		return array( 'ok' => false, 'error' => 'Reset is only available from approved, declined, interview, or rejected.' );
	}
	wrrapd_wrapriders_set_meta( $app_id, 'status', 'under_review' );
	foreach ( array( 'approved_at', 'activated_at', 'interview_at', 'interview_skipped', 'interview_skipped_at', 'declined_at', 'decline_token', 'rejected_at', 'must_change_password', 'invite_expires_at', 'invite_expired_at', 'portal_password_issued_at' ) as $k ) {
		wrrapd_wrapriders_set_meta( $app_id, $k, '' );
	}
	wrrapd_wrapriders_set_meta( $app_id, 'onboarding_step', 'welcome' );
	wrrapd_wrapriders_set_meta( $app_id, 'suspended', '0' );
	wrrapd_wrapriders_set_meta( $app_id, 'reset_at', gmdate( 'c' ) );
	foreach ( array_keys( wrrapd_wrapriders_onboarding_steps() ) as $step ) {
		wrrapd_wrapriders_set_meta( $app_id, 'step_' . $step, '' );
	}
	$user_id = (int) wrrapd_wrapriders_get_meta( $app_id, 'user_id' );
	if ( $user_id && get_userdata( $user_id ) ) {
		wrrapd_wrapriders_set_user_role( $user_id, 'wraprider_applicant' );
		delete_user_meta( $user_id, '_wrrapd_wr_must_change_password' );
		wp_set_password( wp_generate_password( 32, true, true ), $user_id );
	}
	return array( 'ok' => true );
}


function wrrapd_wrapriders_detect_onboarding_step_from_uri() {
	$uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '';
	$map = array(
		'/wraprider-onboarding/wraprider-agreement'   => 'agreement',
		'/wraprider-onboarding/wraprider-policies'    => 'policies',
		'/wraprider-onboarding/wraprider-orientation' => 'orientation',
		'/wraprider-onboarding/wraprider-background'  => 'background',
		'/wraprider-onboarding/wraprider-insurance'   => 'insurance',
		'/wraprider-onboarding/wraprider-identity'    => 'identity',
		'/wraprider-onboarding/wraprider-workspace'   => 'workspace',
		'/wraprider-onboarding/wraprider-w-9'         => 'w9',
		'/wraprider-onboarding/wraprider-tax-1099'    => 'tax_1099',
		'/wraprider-onboarding/wraprider-bank-payout' => 'bank_payout',
		'/wraprider-onboarding/wraprider-activation'  => 'activation',
		'/wraprider-onboarding'             => 'welcome',
	);
	foreach ( $map as $needle => $step ) {
		if ( strpos( $uri, $needle ) !== false ) {
			return $step;
		}
	}
	return 'welcome';
}

function wrrapd_wrapriders_render_change_password_gate() {
	$err = $GLOBALS['wrrapd_wr_pw_error'] ?? '';
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapriders">
		<div class="wrrapd-wrapstars-card">
			<h1>Choose your password</h1>
			<p>For your security, set a new password before continuing Onboarding.</p>
			<?php if ( $err ) : ?>
				<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $err ); ?></div>
			<?php endif; ?>
			<form method="post" class="wrrapd-wrapstars-form">
				<?php wp_nonce_field( 'wrrapd_wr_change_pw', 'wrrapd_wr_nonce' ); ?>
				<input type="hidden" name="wrrapd_wr_action" value="change_password" />
				<label>New password (min 10 characters)
					<input type="password" name="password" required minlength="10" autocomplete="new-password" />
				</label>
				<label>Confirm password
					<input type="password" name="password2" required minlength="10" autocomplete="new-password" />
				</label>
				<button type="submit" class="wrrapd-wrapstars-btn">Save and continue</button>
			</form>
		</div>
	</div>
	<?php
	return ob_get_clean();
}

function wrrapd_wrapriders_placeholder_step_config( $step ) {
	$all = array(
		'agreement'   => array(
			'title' => 'WrapRider independent contractor agreement',
			'lead'  => 'You are an independent contractor who both wraps and delivers. Inbound gifts and supplies are dropped at your wrapping space; you wrap to Wrrapd standards, then load the finished gifts, scan each barcode for the delivery address (and whether flowers go with it), and make the final delivery. Pay and other commercial terms are in the Compensation Schedule you will see in the apps after activation — not on this page.',
			'needs' => array( 'WrapRider IC agreement (own legal suite — not the WrapStar or JoyRider agreement)', 'BoldSign template when WRRAPD_BOLDSIGN_WRAPRIDER_IC_TEMPLATE_ID is set' ),
			'vendor'=> 'BoldSign send-from-template when WRRAPD_BOLDSIGN_WRAPRIDER_IC_TEMPLATE_ID is set.',
			'ack'   => 'I have read these WrapRider duties and agree I am an independent contractor. I will e-sign the full agreement when it is presented.',
		),
		'policies'    => array(
			'title' => 'Wrap & delivery standards',
			'lead'  => 'Acknowledge Wrrapd wrap quality standards, workspace / video-monitoring expectations, safe package handling, and proof-of-delivery standards.',
			'needs' => array( 'WrapRider handbook PDF (wrap + delivery)', 'Safety / vehicle standards PDF' ),
			'vendor'=> 'In-app PDF + checkbox.',
			'ack'   => 'I will follow Wrrapd wrap quality, safety, and delivery standards when final policies are published.',
		),
		'background'  => array(
			'title' => 'Background check',
			'lead'  => 'Authorized at apply. Vendor screening (e.g. Checkr) will launch here.',
			'needs' => array( 'Screening vendor invite' ),
			'vendor'=> 'Checkr or similar + webhook.',
			'ack'   => 'I authorize a background check when the vendor integration is enabled.',
		),
		'identity'    => array(
			'title' => 'Identity & license',
			'lead'  => 'Confirm government ID and valid driver license on file.',
			'needs' => array( 'License re-verify', 'Optional liveness check' ),
			'vendor'=> 'Persona / similar.',
			'ack'   => 'I confirm my ID and driver license submitted at application are accurate and valid.',
		),
		'w9'          => array(
			'title' => 'W-9 tax form',
			'lead'  => 'E-sign W-9 via BoldSign (shared W-9 template).',
			'needs' => array( 'BoldSign W-9 template' ),
			'vendor'=> 'BoldSign W-9.',
			'ack'   => 'I will complete the W-9 when e-sign is enabled and confirm my tax details are accurate.',
		),
		'tax_1099'    => array(
			'title' => '1099 & tax acknowledgments',
			'lead'  => 'Acknowledge independent-contractor tax treatment for WrapRider earnings (wrapping and delivery).',
			'needs' => array( '1099 acknowledgment PDF' ),
			'vendor'=> 'Checkbox attestation.',
			'ack'   => 'I understand I am an independent contractor and Wrrapd may issue a Form 1099 when required.',
		),
		'bank_payout' => array(
			'title' => 'Connect bank / payouts',
			'lead'  => 'Connect the account for WrapRider payouts (Stripe Connect later).',
			'needs' => array( 'Stripe Connect' ),
			'vendor'=> 'Stripe Connect Express.',
			'ack'   => 'I have a US bank account ready for WrapRider payouts and will connect it when enabled.',
		),
	);
	return $all[ $step ] ?? null;
}

function wrrapd_wrapriders_render_step_placeholder( $app_id, $step ) {
	$cfg = wrrapd_wrapriders_placeholder_step_config( $step );
	if ( ! $cfg ) {
		echo '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err">Unknown step.</div>';
		return;
	}
	$err = $GLOBALS['wrrapd_wr_ob_error'] ?? '';
	?>
	<div class="wrrapd-wrapstars-card">
		<p class="wrrapd-wrapstars-pill wrrapd-wrapstars-pill--placeholder">Placeholder — final documents / vendor coming soon</p>
		<h2><?php echo esc_html( $cfg['title'] ); ?></h2>
		<p class="wrrapd-wrapstars-ob-lead"><?php echo esc_html( $cfg['lead'] ); ?></p>
		<?php if ( $err ) : ?><div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $err ); ?></div><?php endif; ?>
		<ul class="wrrapd-wrapstars-ob-needs">
			<?php foreach ( $cfg['needs'] as $need ) : ?>
				<li><?php echo esc_html( $need ); ?></li>
			<?php endforeach; ?>
		</ul>
		<p class="wrrapd-wrapstars-ob-note"><?php echo esc_html( $cfg['vendor'] ); ?></p>
		<form method="post" class="wrrapd-wrapstars-ob-actions wrrapd-wrapstars-form">
			<?php wp_nonce_field( 'wrrapd_wr_onboarding', 'wrrapd_wr_nonce' ); ?>
			<input type="hidden" name="wrrapd_wr_action" value="onboarding_step" />
			<input type="hidden" name="step" value="<?php echo esc_attr( $step ); ?>" />
			<label class="ws-check">
				<input type="checkbox" name="placeholder_ack" value="1" required />
				<span><?php echo esc_html( $cfg['ack'] ); ?></span>
			</label>
			<button type="submit" class="wrrapd-wrapstars-btn">Continue</button>
		</form>
	</div>
	<?php
}

function wrrapd_wrapriders_render_step_welcome( $app_id ) {
	$greet = wrrapd_wrapriders_greeting_name( $app_id );
	?>
	<div class="wrrapd-wrapstars-card wrrapd-wrapstars-card--hero">
		<p class="wrrapd-wrapstars-welcome__hello">Dear <?php echo esc_html( $greet === 'there' ? 'there' : $greet ); ?>,</p>
		<p class="wrrapd-wrapstars-ob-lead">Congratulations on being invited to continue. You are an <strong>applicant</strong> completing onboarding for the wrap-and-deliver contractor track. You are not engaged as a WrapRider until Wrrapd activates you. </p>
		<p class="wrrapd-wrapstars-ob-lead">Complete each step promptly so ops can activate your account. After activation the same email and password open the WrapRider app.</p>
		<form method="post" class="wrrapd-wrapstars-ob-actions">
			<?php wp_nonce_field( 'wrrapd_wr_onboarding', 'wrrapd_wr_nonce' ); ?>
			<input type="hidden" name="wrrapd_wr_action" value="onboarding_step" />
			<input type="hidden" name="step" value="welcome" />
			<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Continue</button>
		</form>
	</div>
	<?php
}

function wrrapd_wrapriders_render_step_orientation( $app_id ) {
	$err = $GLOBALS['wrrapd_wr_ob_error'] ?? '';
	?>
	<div class="wrrapd-wrapstars-card">
		<h2>Orientation quiz</h2>
		<p class="wrrapd-wrapstars-ob-lead">Answer all three correctly to continue.</p>
		<?php if ( $err ) : ?><div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $err ); ?></div><?php endif; ?>
		<form method="post" class="wrrapd-wrapstars-form">
			<?php wp_nonce_field( 'wrrapd_wr_onboarding', 'wrrapd_wr_nonce' ); ?>
			<input type="hidden" name="wrrapd_wr_action" value="orientation_quiz" />
			<label>How do you load delivery details for a gift you finished wrapping?
				<select name="q1" required>
					<option value="">Select…</option>
					<option value="scan">Scan the box QR in the WrapRider app</option>
					<option value="call">Call the customer for the address</option>
					<option value="guess">Guess from the order number</option>
				</select>
			</label>
			<label>What must you capture at delivery?
				<select name="q2" required>
					<option value="">Select…</option>
					<option value="proof">Proof of delivery as instructed in the app</option>
					<option value="none">Nothing — just leave the package</option>
					<option value="video_wrap">Re-wrap the gift on camera</option>
				</select>
			</label>
			<label>As a WrapRider, which parts of an order are yours?
				<select name="q3" required>
					<option value="">Select…</option>
					<option value="both">Both — I wrap the gift in my space, then deliver it</option>
					<option value="wrap_only">Wrapping only — a JoyRider delivers</option>
					<option value="deliver_only">Delivery only — a WrapStar wraps</option>
				</select>
			</label>
			<button type="submit" class="wrrapd-wrapstars-btn">Submit quiz</button>
		</form>
	</div>
	<?php
}

function wrrapd_wrapriders_render_step_insurance( $app_id ) {
	$err = $GLOBALS['wrrapd_wr_ob_error'] ?? '';
	?>
	<div class="wrrapd-wrapstars-card">
		<h2>Vehicle insurance</h2>
		<p class="wrrapd-wrapstars-ob-lead">Upload a certificate of insurance (or declaration page) for the vehicle you will use for deliveries.</p>
		<?php if ( $err ) : ?><div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $err ); ?></div><?php endif; ?>
		<form method="post" enctype="multipart/form-data" class="wrrapd-wrapstars-form">
			<?php wp_nonce_field( 'wrrapd_wr_onboarding', 'wrrapd_wr_nonce' ); ?>
			<input type="hidden" name="wrrapd_wr_action" value="onboarding_step" />
			<input type="hidden" name="step" value="insurance" />
			<label>Insurance file (PDF or image)
				<input type="file" name="insurance_file" accept=".pdf,.jpg,.jpeg,.png" required />
			</label>
			<button type="submit" class="wrrapd-wrapstars-btn">Upload and continue</button>
		</form>
	</div>
	<?php
}

function wrrapd_wrapriders_render_step_workspace( $app_id ) {
	$err     = $GLOBALS['wrrapd_wr_ob_error'] ?? '';
	$address = (string) wrrapd_wrapriders_get_meta( $app_id, 'workspace_address' );
	if ( $address === '' ) {
		$address = trim( implode( ', ', array_filter( array(
			(string) wrrapd_wrapriders_get_meta( $app_id, 'address_line1' ),
			(string) wrrapd_wrapriders_get_meta( $app_id, 'address_line2' ),
			trim( (string) wrrapd_wrapriders_get_meta( $app_id, 'city' ) . ', ' . (string) wrrapd_wrapriders_get_meta( $app_id, 'state' ) . ' ' . (string) wrrapd_wrapriders_get_meta( $app_id, 'postal_code' ), ', ' ),
		) ) ) );
	}
	$chosen  = array_filter( explode( ',', (string) wrrapd_wrapriders_get_meta( $app_id, 'workspace_windows' ) ) );
	$notes   = (string) wrrapd_wrapriders_get_meta( $app_id, 'workspace_notes' );
	?>
	<div class="wrrapd-wrapstars-card">
		<h2>Wrapping location</h2>
		<p class="wrrapd-wrapstars-ob-lead">Inbound gifts and wrapping supplies are dropped at your wrapping space, and you leave from there for deliveries. Confirm the address and when hand-offs work for you.</p>
		<?php if ( $err ) : ?><div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $err ); ?></div><?php endif; ?>
		<form method="post" class="wrrapd-wrapstars-form">
			<?php wp_nonce_field( 'wrrapd_wr_onboarding', 'wrrapd_wr_nonce' ); ?>
			<input type="hidden" name="wrrapd_wr_action" value="onboarding_step" />
			<input type="hidden" name="step" value="workspace" />
			<label>Address where you will wrap
				<input type="text" name="workspace_address" value="<?php echo esc_attr( $address ); ?>" required autocomplete="street-address" />
			</label>
			<fieldset class="wrrapd-wrapstars-fieldset">
				<legend>Hand-off windows</legend>
				<?php foreach ( wrrapd_wrapriders_workspace_window_options() as $value => $label ) : ?>
					<label class="ws-check">
						<input type="checkbox" name="workspace_windows[]" value="<?php echo esc_attr( $value ); ?>" <?php checked( in_array( $value, $chosen, true ) ); ?> />
						<span><?php echo esc_html( $label ); ?></span>
					</label>
				<?php endforeach; ?>
			</fieldset>
			<label>Anything ops should know about the space <span class="ws-optional">(optional)</span>
				<textarea name="workspace_notes" rows="3"><?php echo esc_textarea( $notes ); ?></textarea>
			</label>
			<label class="ws-check">
				<input type="checkbox" name="workspace_ack" value="1" required />
				<span>This is a clean, dedicated space where I can wrap and store gifts safely between drop-off and delivery.</span>
			</label>
			<button type="submit" class="wrrapd-wrapstars-btn">Save and continue</button>
		</form>
	</div>
	<?php
}

function wrrapd_wrapriders_render_step_activation( $app_id ) {
	$app_url = wrrapd_wrapriders_app_url();
	?>
	<div class="wrrapd-wrapstars-card">
		<h2>Final review &amp; your WrapRider app</h2>
		<p class="wrrapd-wrapstars-ob-lead">You have completed onboarding. Our team now reviews your documents and activates your account. After activation, the same email and password you use here sign you in to the WrapRider app.</p>
		<div class="wrrapd-wrapriders-app-cta">
			<p><strong>WrapRider app</strong> — your wrap jobs, shift tools, deliveries, and proof of delivery in one place.</p>
			<p><a class="wrrapd-wrapstars-btn" href="<?php echo esc_url( $app_url ); ?>" target="_blank" rel="noopener">Open the WrapRider app</a></p>
			<p class="wrrapd-wrapstars-ob-note">App Store / Play Store links will appear here when the native app is published. Until then use the web app above.</p>
		</div>
		<p class="wrrapd-wrapstars-ob-note">No further action is needed here — watch email from <?php echo esc_html( wrrapd_wrapriders_from_email_address() ); ?> for activation confirmation.</p>
	</div>
	<?php
}

/**
 * Full-bleed hero video for the WrapRider landing (same pattern as WrapStars Applications_Wrrapd.mp4).
 * Looks up Media Library attachment titled/filename containing "wrrapd-wraprider-ad".
 *
 * @return string Escaped URL or empty string.
 */
function wrrapd_wrapriders_hero_video_url() {
	if ( defined( 'WRRAPD_WRAPRIDERS_HERO_VIDEO' ) && WRRAPD_WRAPRIDERS_HERO_VIDEO !== '' ) {
		return esc_url( WRRAPD_WRAPRIDERS_HERO_VIDEO );
	}
	static $cached = null;
	if ( $cached !== null ) {
		return $cached;
	}
	$cached      = '';
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
		$slug  = strtolower( (string) $att->post_name );
		if (
			strpos( $title, 'wrrapd-wraprider-ad' ) !== false
			|| strpos( $title, 'wrrapd_wraprider_ad' ) !== false
			|| strpos( $file, 'wrrapd-wraprider-ad' ) !== false
			|| strpos( $file, 'wrrapd_wraprider_ad' ) !== false
			|| strpos( $slug, 'wrrapd-wraprider-ad' ) !== false
		) {
			$cached = esc_url( wp_get_attachment_url( $att->ID ) );
			break;
		}
	}
	return $cached;
}

/**
 * Top-right landing photo (WrapRider_001). Prefers Media Library, then wrrapd.com upload.
 *
 * @return string Escaped absolute URL.
 */
function wrrapd_wrapriders_landing_visual_url() {
	if ( defined( 'WRRAPD_WRAPRIDERS_LANDING_VISUAL' ) && WRRAPD_WRAPRIDERS_LANDING_VISUAL !== '' ) {
		return esc_url( WRRAPD_WRAPRIDERS_LANDING_VISUAL );
	}
	static $cached = null;
	if ( $cached !== null ) {
		return $cached;
	}
	$cached      = '';
	$attachments = get_posts(
		array(
			'post_type'      => 'attachment',
			'post_mime_type' => 'image',
			'posts_per_page' => 40,
			'post_status'    => 'inherit',
			'orderby'        => 'date',
			'order'          => 'DESC',
		)
	);
	foreach ( $attachments as $att ) {
		$title = strtolower( (string) $att->post_title );
		$file  = strtolower( (string) basename( (string) get_attached_file( $att->ID ) ) );
		$slug  = strtolower( (string) $att->post_name );
		if (
			strpos( $title, 'wraprider_001' ) !== false
			|| strpos( $file, 'wraprider_001' ) !== false
			|| strpos( $slug, 'wraprider_001' ) !== false
		) {
			$url = wp_get_attachment_url( $att->ID );
			if ( $url ) {
				$cached = esc_url( $url );
				break;
			}
		}
	}
	if ( $cached === '' ) {
		$cached = 'https://wrrapd.com/wp-content/uploads/2026/09/WrapRider_001.jpg';
	}
	return $cached;
}

function wrrapd_wrapriders_shortcode_landing() {
	$visual = wrrapd_wrapriders_landing_visual_url();
	$apply  = wrrapd_wrapriders_apply_url( '/wraprider/apply/' );
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapstars-dasher wrrapd-wrapriders wrrapd-wrapriders-flex">
		<section class="wrrapd-wrapriders-landing-hero">
			<div class="wrrapd-wrapriders-landing-hero__copy">
				<p class="wrrapd-wrapriders-landing-hero__kicker">Now accepting applications · Florida &amp; Georgia</p>
				<h1>Become a WrapRider</h1>
				<p class="wrrapd-wrapriders-landing-hero__tagline">Craft the gift. Carry the joy.</p>
				<p class="wrrapd-wrapriders-landing-hero__sub">Turn an ordinary box into something unforgettable in your own space, then bring that finished surprise to the door yourself.</p>
				<a class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--xl wrrapd-wrapstars-btn--hero" href="<?php echo esc_url( $apply ); ?>">Start your application</a>
			</div>
			<figure class="wrrapd-wrapriders-landing-hero__visual">
				<img
					src="<?php echo esc_url( $visual ); ?>"
					alt=""
					width="1712"
					height="1152"
					decoding="async"
					fetchpriority="high"
				/>
			</figure>
		</section>

		<div class="wrrapd-wrapstars-dasher-body">
			<section class="wrrapd-wrapriders-spark" aria-hidden="true">
				<div class="wrrapd-wrapriders-spark__stage">
					<span class="wrrapd-wrapriders-spark__elf wrrapd-wrapriders-spark__elf--a"></span>
					<span class="wrrapd-wrapriders-spark__elf wrrapd-wrapriders-spark__elf--b"></span>
					<span class="wrrapd-wrapriders-spark__elf wrrapd-wrapriders-spark__elf--c"></span>
					<span class="wrrapd-wrapriders-spark__star wrrapd-wrapriders-spark__star--1"></span>
					<span class="wrrapd-wrapriders-spark__star wrrapd-wrapriders-spark__star--2"></span>
					<span class="wrrapd-wrapriders-spark__star wrrapd-wrapriders-spark__star--3"></span>
					<span class="wrrapd-wrapriders-spark__star wrrapd-wrapriders-spark__star--4"></span>
					<span class="wrrapd-wrapriders-spark__gift"></span>
				</div>
				<p class="wrrapd-wrapriders-spark__line">Tiny hands. Big mileage. Pure delight.</p>
			</section>

			<section class="wrrapd-wrapstars-dasher-band">
				<div class="wrrapd-wrapstars-dasher-band__item wrrapd-wrapstars-dasher-box">
					<h2>Ribbon to doorstep</h2>
					<p>Wrap it with care, then show up with the finished surprise — you carry the gift from ribbon to doorstep.</p>
				</div>
				<div class="wrrapd-wrapstars-dasher-band__item wrrapd-wrapstars-dasher-box">
					<h2>Your space. Your wheels.</h2>
					<p>Manage end-to-end, giftwrap items beautifully and deliver them yourself and brighten someone's special day!</p>
				</div>
				<div class="wrrapd-wrapstars-dasher-band__item wrrapd-wrapstars-dasher-box">
					<h2>Make someone light up</h2>
					<p>Enjoy the whole arc — the quiet art of wrapping, then the moment joy lands at the door.</p>
				</div>
			</section>

			<section class="wrrapd-wrapstars-reqs-dd">
				<h2 class="wrrapd-wrapstars-section-title">Requirements</h2>
				<div class="wrrapd-wrapstars-reqs-dd__grid">
					<div class="wrrapd-wrapstars-reqs-dd__item">
						<span class="wrrapd-wrapstars-reqs-dd__num" aria-hidden="true">1</span>
						<h3>Age &amp; license</h3>
						<p>WrapRiders must be <strong>21 or older</strong> and hold a valid U.S. driver license.</p>
					</div>
					<div class="wrrapd-wrapstars-reqs-dd__item">
						<span class="wrrapd-wrapstars-reqs-dd__num" aria-hidden="true">2</span>
						<h3>Vehicle &amp; insurance</h3>
						<p>An eligible personal vehicle in good working order, plus current auto insurance that meets your state requirements.</p>
					</div>
					<div class="wrrapd-wrapstars-reqs-dd__item">
						<span class="wrrapd-wrapstars-reqs-dd__num" aria-hidden="true">3</span>
						<h3>Driving record</h3>
						<p>A clean driving record. We review motor-vehicle history as part of the application process.</p>
					</div>
					<div class="wrrapd-wrapstars-reqs-dd__item">
						<span class="wrrapd-wrapstars-reqs-dd__num" aria-hidden="true">4</span>
						<h3>Smartphone</h3>
						<p>A modern smartphone with reliable data service for receiving offers, navigation, and delivery confirmation.</p>
					</div>
					<div class="wrrapd-wrapstars-reqs-dd__item">
						<span class="wrrapd-wrapstars-reqs-dd__num" aria-hidden="true">5</span>
						<h3>A place to wrap</h3>
						<p>A clean, dedicated space where you can wrap gifts and hold finished orders safely until you deliver them.</p>
					</div>
					<div class="wrrapd-wrapstars-reqs-dd__item">
						<span class="wrrapd-wrapstars-reqs-dd__num" aria-hidden="true">6</span>
						<h3>Where we launch</h3>
						<p>Currently accepting applicants in <strong>Florida</strong> and <strong>Georgia</strong>. Additional markets may open as the network grows.</p>
					</div>
				</div>
			</section>

			<section class="wrrapd-wrapstars-faq-dd">
				<h2 class="wrrapd-wrapstars-section-title">Frequently asked questions</h2>
				<details class="wrrapd-wrapstars-faq-dd__item">
					<summary>What does a WrapRider do?</summary>
					<p>A WrapRider manages the gift end to end: you wrap each order in your own space, then deliver the finished surprise to the recipient yourself.</p>
				</details>
				<details class="wrrapd-wrapstars-faq-dd__item">
					<summary>How long does the application process take?</summary>
					<p>The online application usually takes about six minutes to complete. Our team typically reviews submissions within seven days and may invite you to a short interview before a final decision.</p>
				</details>
				<details class="wrrapd-wrapstars-faq-dd__item">
					<summary>What are the driving and vehicle prerequisites?</summary>
					<p>You must be at least 21 years old, hold a valid driver license, drive an eligible personal vehicle with current insurance, and maintain a clean driving record. A smartphone is required for offers and navigation.</p>
				</details>
				<details class="wrrapd-wrapstars-faq-dd__item">
					<summary>How are WrapRiders paid?</summary>
					<p>WrapRiders are independent contractors paid an hourly rate for active wrapping and delivery time. Your personal rate is confirmed when you are approved and may vary by market.</p>
				</details>
				<details class="wrrapd-wrapstars-faq-dd__item">
					<summary>Are there incentives or milestone bonuses?</summary>
					<p>Yes. Milestone incentives may be offered for completing onboarding, finishing your first set of orders, and participating during peak gifting seasons. Details are shared during onboarding and may change as programs evolve.</p>
				</details>
				<details class="wrrapd-wrapstars-faq-dd__item">
					<summary>When and how do I receive payouts?</summary>
					<p>Approved earnings are paid on a regular schedule to the bank account you provide during onboarding. You can review activity and payout status in the WrapRider app after you are activated.</p>
				</details>
				<details class="wrrapd-wrapstars-faq-dd__item">
					<summary>Do I need gift-wrapping experience?</summary>
					<p>Prior professional experience is helpful but not required. We look for care, presentation, reliability, and a willingness to follow Wrrapd wrapping standards.</p>
				</details>
				<details class="wrrapd-wrapstars-faq-dd__item">
					<summary>Is a background check required?</summary>
					<p>Yes. Identity verification and a background check are part of the approval process before you receive access to live orders.</p>
				</details>
				<details class="wrrapd-wrapstars-faq-dd__item">
					<summary>May I choose a wrap-only or delivery-only role instead?</summary>
					<p>Yes. If you prefer to wrap gifts without delivering them, you may <a href="<?php echo esc_url( wrrapd_wrapriders_apply_url( '/apply/' ) ); ?>">apply to become a WrapStar</a>. If you prefer to deliver finished gifts only, you may <a href="<?php echo esc_url( wrrapd_wrapriders_apply_url( '/drive/' ) ); ?>">apply to become a JoyRider</a>.</p>
				</details>
				<details class="wrrapd-wrapstars-faq-dd__item">
					<summary>Where is WrapRider currently available?</summary>
					<p>We are launching in <strong>Florida</strong> and <strong>Georgia</strong>. Applicants elsewhere are welcome to apply; opportunities outside launch markets may be limited at first.</p>
				</details>
			</section>

			<section class="wrrapd-wrapstars-dasher-box wrrapd-wrapstars-dasher-box--wide" style="text-align:center;">
				<h2 class="wrrapd-wrapstars-section-title" style="margin-bottom:0.75rem;">Ready when you are</h2>
				<p style="margin:0 0 1.25rem;">Start your WrapRider application today.</p>
				<p><a class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--xl" href="<?php echo esc_url( $apply ); ?>">Start your application</a></p>
			</section>
		</div>
	</div>
	<?php
	return ob_get_clean();
}

function wrrapd_wrapriders_shortcode_thankyou() {
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapriders wrrapd-wrapstars-dasher">
		<section class="wrrapd-wrapstars-dasher-apply-head">
			<p class="wrrapd-wrapstars-dasher-kicker">Application received</p>
			<h1>Thank you for applying</h1>
			<p class="wrrapd-wrapstars-dasher-lead">We have received your WrapRider application. We will be in touch within about <strong>7 days</strong>. Watch for email from <strong><?php echo esc_html( wrrapd_wrapriders_from_email_address() ); ?></strong>.</p>
		</section>
		<div class="wrrapd-wrapstars-card wrrapd-wrapstars-dasher-thanks wrrapd-wrapstars-dasher-thanks--celebrate">
			<ul>
				<li>Your application is <strong>under review</strong>.</li>
				<li>Decisions are typically made within <strong>about 7 days</strong>.</li>
				<li>We may contact you for a brief interview.</li>
				<li>If approved, you will receive login credentials to start Onboarding.</li>
			</ul>
			<p class="wrrapd-wrapstars-dasher-thanks__note">There is no login until you are approved — we will email you when it is time.</p>
			<div class="wrrapd-wrapstars-thanks-actions">
				<a class="wrrapd-wrapstars-btn" href="<?php echo esc_url( wrrapd_wrapriders_apply_url( '/wraprider/' ) ); ?>">Back to WrapRider home</a>
				<a class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--ghost" href="<?php echo esc_url( wrrapd_wrapriders_apply_url( '/' ) ); ?>">All applications</a>
				<a class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--ghost" href="https://wrrapd.com/">Visit wrrapd.com</a>
			</div>
		</div>
	</div>
	<?php
	return ob_get_clean();
}

function wrrapd_wrapriders_shortcode_login() {
	// While still in onboarding, send people to the shared door.
	$err_hint = '';
	if ( ! empty( $_GET['use_onboarding'] ) ) {
		$err_hint = 'Use the shared onboarding login to continue setup.';
	}
	$err   = $GLOBALS['wrrapd_wr_login_error'] ?? $err_hint;
	$greet = isset( $_GET['greet'] ) ? sanitize_text_field( wp_unslash( $_GET['greet'] ) ) : '';
	$redir = isset( $_GET['redirect_to'] ) ? esc_url_raw( wp_unslash( $_GET['redirect_to'] ) ) : ( function_exists( 'wrrapd_wrapriders_app_url' ) ? wrrapd_wrapriders_app_url() : '' );
	$expired = isset( $_GET['invite_expired'] );
	$ob_url  = function_exists( 'wrrapd_onboarding_login_url' )
		? wrrapd_onboarding_login_url( wrrapd_wrapriders_pros_url( '/wraprider-onboarding/' ) )
		: wrrapd_wrapriders_portal_login_url();
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapriders">
		<div class="wrrapd-wrapstars-card wrrapd-wrapstars-login">
			<h1>WrapRider portal login</h1>
			<p>For activated WrapRiders. Still finishing onboarding? <a href="<?php echo esc_url( $ob_url ); ?>">Sign in to onboarding</a>.</p>
			<?php if ( $greet ) : ?><p>Welcome, <?php echo esc_html( $greet ); ?>.</p><?php endif; ?>
			<?php if ( $expired ) : ?><div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err">Your invitation expired. Contact us to resend.</div><?php endif; ?>
			<?php if ( $err ) : ?><div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $err ); ?></div><?php endif; ?>
			<form method="post" class="wrrapd-wrapstars-form">
				<?php wp_nonce_field( 'wrrapd_wr_login', 'wrrapd_wr_nonce' ); ?>
				<input type="hidden" name="wrrapd_wr_action" value="portal_login" />
				<input type="hidden" name="redirect_to" value="<?php echo esc_attr( $redir ); ?>" />
				<label>Email <input type="email" name="email" required autocomplete="username" /></label>
				<label>Password <input type="password" name="password" required autocomplete="current-password" /></label>
				<button type="submit" class="wrrapd-wrapstars-btn">Log in</button>
			</form>
		</div>
	</div>
	<?php
	return ob_get_clean();
}

function wrrapd_wrapriders_shortcode_decline() {
	$app_id = isset( $_GET['app'] ) ? (int) $_GET['app'] : 0;
	$token  = isset( $_GET['token'] ) ? sanitize_text_field( wp_unslash( $_GET['token'] ) ) : '';
	$result = $GLOBALS['wrrapd_wr_decline_result'] ?? null;
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapriders">
		<div class="wrrapd-wrapstars-card">
			<h1>Decline WrapRider offer</h1>
			<?php if ( is_array( $result ) && ! empty( $result['ok'] ) ) : ?>
				<p>Your invitation has been declined. Thank you for letting us know.</p>
			<?php elseif ( is_array( $result ) && empty( $result['ok'] ) ) : ?>
				<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $result['error'] ?? 'Could not decline.' ); ?></div>
			<?php else : ?>
				<p>If you have decided not to join as a WrapRider, you may decline below. No login required.</p>
				<form method="post" class="wrrapd-wrapstars-form">
					<?php wp_nonce_field( 'wrrapd_wr_decline', 'wrrapd_wr_nonce' ); ?>
					<input type="hidden" name="wrrapd_wr_action" value="decline_offer" />
					<input type="hidden" name="app" value="<?php echo esc_attr( (string) $app_id ); ?>" />
					<input type="hidden" name="token" value="<?php echo esc_attr( $token ); ?>" />
					<label>Optional note
						<textarea name="decline_note" rows="3"></textarea>
					</label>
					<button type="submit" class="wrrapd-wrapstars-btn">Decline this offer</button>
				</form>
			<?php endif; ?>
		</div>
	</div>
	<?php
	return ob_get_clean();
}

function wrrapd_wrapriders_shortcode_onboarding( $atts ) {
	$atts = shortcode_atts( array( 'step' => '' ), $atts, 'wrrapd_wraprider_onboarding' );
	if ( ! is_user_logged_in() || ! wrrapd_wrapriders_is_onboarding_eligible_user( get_current_user_id() ) ) {
		return '<p class="wrrapd-wrapstars-alert">Please <a href="' . esc_url( wrrapd_wrapriders_portal_login_url() ) . '">log in</a>.</p>';
	}
	if ( wrrapd_wrapriders_user_must_change_password( get_current_user_id() ) ) {
		return wrrapd_wrapriders_render_change_password_gate();
	}
	$app = wrrapd_wrapriders_get_application_by_user( get_current_user_id() );
	if ( ! $app || (string) wrrapd_wrapriders_get_meta( $app->ID, 'status' ) !== 'approved' ) {
		$status = $app ? wrrapd_wrapriders_get_meta( $app->ID, 'status' ) : '';
		if ( $status === 'active' ) {
			return '<div class="wrrapd-wrapstars-card"><p>Your WrapRider account is active. <a href="' . esc_url( wrrapd_wrapriders_app_url() ) . '">Open the WrapRider app</a>.</p></div>';
		}
		return '<p class="wrrapd-wrapstars-alert">Onboarding is available after approval.</p>';
	}
	$step = sanitize_text_field( (string) $atts['step'] );
	if ( $step === '' ) {
		$step = wrrapd_wrapriders_detect_onboarding_step_from_uri();
	}
	if ( ! wrrapd_wrapriders_can_access_step( $app->ID, $step ) ) {
		$steps = array_keys( wrrapd_wrapriders_onboarding_steps() );
		foreach ( $steps as $s ) {
			if ( ! wrrapd_wrapriders_step_complete( $app->ID, $s ) ) {
				wp_safe_redirect( wrrapd_wrapriders_onboarding_step_url( $s ) );
				exit;
			}
		}
	}
	$labels = wrrapd_wrapriders_onboarding_steps();
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapriders wrrapd-wrapstars-onboarding">
		<aside class="wrrapd-wrapstars-ob-nav">
			<p class="wrrapd-wrapstars-ob-nav__title">Onboarding</p>
			<ol>
				<?php foreach ( $labels as $key => $label ) : ?>
					<li class="<?php echo wrrapd_wrapriders_step_complete( $app->ID, $key ) ? 'is-done' : ( $key === $step ? 'is-current' : '' ); ?>">
						<a href="<?php echo esc_url( wrrapd_wrapriders_onboarding_step_url( $key ) ); ?>"><?php echo esc_html( $label ); ?></a>
					</li>
				<?php endforeach; ?>
			</ol>
			<div class="wrrapd-wrapstars-onboarding-nav__foot">
				<a href="<?php echo esc_url( wrrapd_wrapriders_profile_url() ); ?>">Profile</a>
				<a href="mailto:<?php echo esc_attr( wrrapd_wrapriders_from_email_address() ); ?>">Help</a>
				<a href="<?php echo esc_url( wp_logout_url( wrrapd_wrapriders_apply_url( '/wraprider/' ) ) ); ?>">Log out</a>
			</div>
		</aside>
		<main class="wrrapd-wrapstars-ob-main">
			<?php
			if ( $step === 'welcome' ) {
				wrrapd_wrapriders_render_step_welcome( $app->ID );
			} elseif ( $step === 'agreement' ) {
				if ( function_exists( 'wrrapd_esign_render_clickwrap' ) ) {
					wrrapd_esign_render_clickwrap(
						array(
							'suite'        => 'wraprider',
							'nonce_action' => 'wrrapd_wr_onboarding',
							'nonce_field'  => 'wrrapd_wr_nonce',
							'action_name'  => 'wrrapd_wr_action',
							'action_value' => 'onboarding_step',
							'step'         => 'agreement',
							'accepted'     => wrrapd_wrapriders_step_complete( $app->ID, 'agreement' ),
							'signed_name'  => (string) wrrapd_wrapriders_get_meta( $app->ID, 'esign_typed_name' ),
						)
					);
				} else {
					echo '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err">Agreement module missing.</div>';
				}
			} elseif ( $step === 'orientation' ) {
				wrrapd_wrapriders_render_step_orientation( $app->ID );
			} elseif ( $step === 'insurance' ) {
				wrrapd_wrapriders_render_step_insurance( $app->ID );
			} elseif ( $step === 'workspace' ) {
				wrrapd_wrapriders_render_step_workspace( $app->ID );
			} elseif ( $step === 'activation' ) {
				wrrapd_wrapriders_render_step_activation( $app->ID );
			} else {
				wrrapd_wrapriders_render_step_placeholder( $app->ID, $step );
			}
			if ( function_exists( 'wrrapd_hire_onboarding_pager' ) ) {
				wrrapd_hire_onboarding_pager(
					array_keys( $labels ),
					$step,
					'wrrapd_wrapriders_onboarding_step_url',
					static function ( $key ) use ( $app ) {
						return wrrapd_wrapriders_can_access_step( $app->ID, $key );
					}
				);
			}
			?>
		</main>
	</div>
	<?php
	return ob_get_clean();
}

/**
 * WrapRider profile page — /wraprider/profile/ on the apply host.
 * Summary from the application, documents on file, contact & vehicle (editable), username & password.
 */
function wrrapd_wrapriders_shortcode_profile() {
	if ( ! wrrapd_wrapriders_is_portal_host() ) {
		return '';
	}
	if ( ! is_user_logged_in() || ! wrrapd_wrapriders_is_onboarding_eligible_user( get_current_user_id() ) ) {
		$login = wrrapd_wrapriders_portal_login_url( wrrapd_wrapriders_profile_url() );
		return '<div class="wrrapd-wrapstars wrrapd-wrapriders wrrapd-wrapstars-dasher"><div class="wrrapd-wrapstars-card wrrapd-ws-profile-gate"><h1>Your WrapRider profile</h1><p>Please <a href="' . esc_url( $login ) . '">log in</a> to view your profile.</p><a class="wrrapd-wrapstars-btn" href="' . esc_url( $login ) . '">Log in</a></div></div>';
	}
	$user = wp_get_current_user();
	$app  = wrrapd_wrapriders_get_application_by_user( $user->ID );
	if ( ! $app ) {
		return '<p class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">No application is linked to this account.</p>';
	}
	$id       = (int) $app->ID;
	$status   = (string) wrrapd_wrapriders_get_meta( $id, 'status' );
	$editable = in_array( $status, array( 'approved', 'active' ), true );
	$errors   = $GLOBALS['wrrapd_wr_profile_errors'] ?? array();
	$ok       = ! empty( $GLOBALS['wrrapd_wr_profile_ok'] );
	$pw_ok    = ! empty( $GLOBALS['wrrapd_wr_profile_pw_ok'] );
	$pw_error = $GLOBALS['wrrapd_wr_profile_pw_error'] ?? '';
	$full     = (string) wrrapd_wrapriders_get_meta( $id, 'full_name' );
	$greet    = wrrapd_wrapriders_greeting_name( $id );
	$app_url  = wrrapd_wrapriders_app_url();
	$app_host = wrrapd_wrapriders_app_hosts_text();

	$fmt = static function ( $iso, $with_time = false ) {
		$ts = $iso !== '' ? strtotime( (string) $iso ) : 0;
		return $ts ? wp_date( $with_time ? 'M j, Y, g:i A' : 'M j, Y', $ts ) : '';
	};
	$submitted  = $fmt( wrrapd_wrapriders_get_meta( $id, 'submitted_at' ) );
	$approved   = $fmt( wrrapd_wrapriders_get_meta( $id, 'approved_at' ) );
	$activated  = $fmt( wrrapd_wrapriders_get_meta( $id, 'activated_at' ) );
	$pw_changed = $fmt( wrrapd_wrapriders_get_meta( $id, 'password_changed_at' ), true );

	switch ( $status ) {
		case 'active':
			$badge = array( 'Active WrapRider', 'is-active' );
			break;
		case 'approved':
			$badge = array( 'Approved · onboarding', 'is-approved' );
			break;
		case 'interview':
			$badge = array( 'Interview stage', 'is-review' );
			break;
		case 'under_review':
			$badge = array( 'Application under review', 'is-review' );
			break;
		case 'declined':
			$badge = array( 'Invitation declined', 'is-closed' );
			break;
		case 'rejected':
			$badge = array( 'Not selected', 'is-closed' );
			break;
		default:
			$badge = array( ucfirst( str_replace( '_', ' ', $status ) ), '' );
	}

	$steps = wrrapd_wrapriders_onboarding_steps();
	$done  = 0;
	$total = 0;
	foreach ( array_keys( $steps ) as $key ) {
		if ( $key === 'activation' ) {
			continue;
		}
		$total++;
		if ( wrrapd_wrapriders_step_complete( $id, $key ) ) {
			$done++;
		}
	}
	$docs = array();
	foreach ( array( 'agreement', 'policies', 'background', 'insurance', 'identity', 'workspace', 'w9', 'tax_1099', 'bank_payout' ) as $key ) {
		if ( ! isset( $steps[ $key ] ) ) {
			continue;
		}
		$is_done = wrrapd_wrapriders_step_complete( $id, $key );
		$docs[]  = array( 'label' => $steps[ $key ], 'ok' => $is_done, 'value' => $is_done ? 'Complete' : 'Pending' );
	}

	$vehicle_labels = array(
		'sedan'     => 'Sedan',
		'suv'       => 'SUV',
		'truck'     => 'Pickup truck',
		'van'       => 'Van',
		'hatchback' => 'Hatchback',
		'other'     => 'Other',
	);
	$vehicle = (string) wrrapd_wrapriders_get_meta( $id, 'vehicle_type' );

	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapriders wrrapd-wrapstars-dasher wrrapd-apply-wizard-root wrrapd-ws-profile">
		<section class="wrrapd-wrapstars-dasher-apply-head wrrapd-ws-profile__head">
			<p class="wrrapd-wrapstars-dasher-kicker">WrapRider profile</p>
			<h1><?php echo esc_html( $full !== '' ? $full : $greet ); ?></h1>
			<p class="wrrapd-ws-profile__badges">
				<span class="wrrapd-ws-profile__badge <?php echo esc_attr( $badge[1] ); ?>"><?php echo esc_html( $badge[0] ); ?></span>
				<?php if ( $activated !== '' ) : ?>
					<span class="wrrapd-ws-profile__since">WrapRider since <?php echo esc_html( $activated ); ?></span>
				<?php elseif ( $approved !== '' ) : ?>
					<span class="wrrapd-ws-profile__since">Approved <?php echo esc_html( $approved ); ?></span>
				<?php elseif ( $submitted !== '' ) : ?>
					<span class="wrrapd-ws-profile__since">Applied <?php echo esc_html( $submitted ); ?></span>
				<?php endif; ?>
			</p>
		</section>

		<?php if ( $ok ) : ?><div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--ok">Profile saved.</div><?php endif; ?>
		<?php foreach ( $errors as $err ) : ?><div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $err ); ?></div><?php endforeach; ?>

		<div class="wrrapd-ws-profile__grid">
			<section class="wrrapd-wrapstars-card wrrapd-ws-profile__card">
				<h2>At a glance</h2>
				<dl class="wrrapd-ws-profile__dl">
					<div><dt>Goes by</dt><dd><?php echo esc_html( $greet ); ?></dd></div>
					<div><dt>Status</dt><dd><?php echo esc_html( $badge[0] ); ?></dd></div>
					<?php if ( $submitted !== '' ) : ?><div><dt>Applied</dt><dd><?php echo esc_html( $submitted ); ?></dd></div><?php endif; ?>
					<?php if ( $approved !== '' ) : ?><div><dt>Approved</dt><dd><?php echo esc_html( $approved ); ?></dd></div><?php endif; ?>
					<?php if ( $activated !== '' ) : ?><div><dt>Activated</dt><dd><?php echo esc_html( $activated ); ?></dd></div><?php endif; ?>
					<?php if ( $status === 'approved' && $total > 0 ) : ?>
						<div><dt>Onboarding</dt><dd><?php echo esc_html( $done . ' of ' . $total ); ?> steps complete · <a href="<?php echo esc_url( wrrapd_wrapriders_pros_url( '/wraprider-onboarding/' ) ); ?>">Continue</a></dd></div>
					<?php endif; ?>
					<div><dt>Home base</dt><dd><?php echo esc_html( trim( wrrapd_wrapriders_get_meta( $id, 'city' ) . ', ' . wrrapd_wrapriders_get_meta( $id, 'state' ) . ' ' . wrrapd_wrapriders_get_meta( $id, 'postal_code' ) ) ); ?></dd></div>
					<?php if ( wrrapd_wrapriders_get_meta( $id, 'workspace_address' ) !== '' ) : ?><div class="is-wide"><dt>Wrapping location</dt><dd><?php echo esc_html( wrrapd_wrapriders_get_meta( $id, 'workspace_address' ) ); ?></dd></div><?php endif; ?>
					<?php if ( $vehicle !== '' ) : ?><div><dt>Vehicle</dt><dd><?php echo esc_html( $vehicle_labels[ $vehicle ] ?? ucfirst( $vehicle ) ); ?></dd></div><?php endif; ?>
					<?php if ( wrrapd_wrapriders_get_meta( $id, 'has_large_format_printer' ) !== '' ) : ?><div><dt>Custom-print wrap</dt><dd><?php echo esc_html( wrrapd_wrapriders_get_meta( $id, 'has_large_format_printer' ) === 'yes' ? 'Yes' : 'No' ); ?></dd></div><?php endif; ?>
					<?php if ( wrrapd_wrapriders_get_meta( $id, 'availability' ) !== '' ) : ?><div class="is-wide"><dt>Availability</dt><dd><?php echo esc_html( wrrapd_wrapriders_get_meta( $id, 'availability' ) ); ?></dd></div><?php endif; ?>
					<?php if ( wrrapd_wrapriders_get_meta( $id, 'delivery_experience' ) !== '' ) : ?><div class="is-wide"><dt>Delivery experience</dt><dd><?php echo esc_html( wrrapd_wrapriders_get_meta( $id, 'delivery_experience' ) ); ?></dd></div><?php endif; ?>
				</dl>
				<?php if ( $status === 'active' ) : ?>
					<p class="wrrapd-ws-profile__app"><a class="wrrapd-wrapstars-btn" href="<?php echo esc_url( $app_url ); ?>">Open the WrapRider app</a></p>
				<?php endif; ?>
			</section>

			<section class="wrrapd-wrapstars-card wrrapd-ws-profile__card">
				<h2>Documents &amp; payout</h2>
				<ul class="wrrapd-ws-profile__docs">
					<li class="<?php echo wrrapd_wrapriders_get_meta( $id, 'id_file' ) !== '' ? 'is-ok' : 'is-open'; ?>">
						<span class="wrrapd-ws-profile__mark" aria-hidden="true"><?php echo wrrapd_wrapriders_get_meta( $id, 'id_file' ) !== '' ? '✓' : '○'; ?></span>
						<span class="wrrapd-ws-profile__doclabel">Driver license</span>
						<span class="wrrapd-ws-profile__docval"><?php echo wrrapd_wrapriders_get_meta( $id, 'id_file' ) !== '' ? 'On file' : 'Not uploaded'; ?></span>
					</li>
					<li class="<?php echo wrrapd_wrapriders_get_meta( $id, 'driving_abstract_file' ) !== '' ? 'is-ok' : 'is-open'; ?>">
						<span class="wrrapd-ws-profile__mark" aria-hidden="true"><?php echo wrrapd_wrapriders_get_meta( $id, 'driving_abstract_file' ) !== '' ? '✓' : '○'; ?></span>
						<span class="wrrapd-ws-profile__doclabel">Driving record / abstract</span>
						<span class="wrrapd-ws-profile__docval"><?php echo wrrapd_wrapriders_get_meta( $id, 'driving_abstract_file' ) !== '' ? 'On file' : 'Not uploaded'; ?></span>
					</li>
					<?php foreach ( $docs as $doc ) : ?>
						<li class="<?php echo $doc['ok'] ? 'is-ok' : 'is-open'; ?>">
							<span class="wrrapd-ws-profile__mark" aria-hidden="true"><?php echo $doc['ok'] ? '✓' : '○'; ?></span>
							<span class="wrrapd-ws-profile__doclabel"><?php echo esc_html( $doc['label'] ); ?></span>
							<span class="wrrapd-ws-profile__docval"><?php echo esc_html( $doc['value'] ); ?></span>
						</li>
					<?php endforeach; ?>
				</ul>
				<p class="wrrapd-ws-profile__note">Need to update a document or bank account? Email <a href="mailto:<?php echo esc_attr( wrrapd_wrapriders_from_email_address() ); ?>"><?php echo esc_html( wrrapd_wrapriders_from_email_address() ); ?></a>.</p>
			</section>
		</div>

		<section class="wrrapd-wrapstars-card wrrapd-ws-profile__card">
			<h2>Contact, mailing &amp; vehicle</h2>
			<?php if ( ! $editable ) : ?><p class="wrrapd-ws-profile__note">Details can be edited after approval.</p><?php endif; ?>
			<form class="wrrapd-wrapstars-form" method="post">
				<?php wp_nonce_field( 'wrrapd_wr_profile', 'wrrapd_wr_nonce' ); ?>
				<input type="hidden" name="wrrapd_wr_action" value="save_profile" />
				<fieldset class="wrrapd-ws-profile__fieldset" <?php disabled( ! $editable ); ?>>
				<div class="ws-field-row ws-field-row--3">
					<div class="ws-field"><label for="wrp-first">First name</label><input type="text" id="wrp-first" name="first_name" value="<?php echo esc_attr( wrrapd_wrapriders_get_meta( $id, 'first_name' ) ); ?>" required /></div>
					<div class="ws-field"><label for="wrp-middle">Middle name</label><input type="text" id="wrp-middle" name="middle_name" value="<?php echo esc_attr( wrrapd_wrapriders_get_meta( $id, 'middle_name' ) ); ?>" /></div>
					<div class="ws-field"><label for="wrp-last">Last name</label><input type="text" id="wrp-last" name="last_name" value="<?php echo esc_attr( wrrapd_wrapriders_get_meta( $id, 'last_name' ) ); ?>" required /></div>
				</div>
				<div class="ws-field-row">
					<div class="ws-field"><label for="wrp-nick">Preferred name</label><input type="text" id="wrp-nick" name="nickname" value="<?php echo esc_attr( wrrapd_wrapriders_get_meta( $id, 'nickname' ) ); ?>" placeholder="How we greet you" /></div>
					<div class="ws-field"><label for="wrp-email">Email address</label><input type="email" id="wrp-email" name="email" value="<?php echo esc_attr( wrrapd_wrapriders_get_meta( $id, 'email' ) ); ?>" required /></div>
				</div>
				<div class="ws-field-row">
					<div class="ws-field"><label for="wrp-mobile">Mobile phone</label><input type="tel" id="wrp-mobile" name="phone_mobile" value="<?php echo esc_attr( wrrapd_wrapriders_get_meta( $id, 'phone_mobile', wrrapd_wrapriders_get_meta( $id, 'phone' ) ) ); ?>" required /></div>
					<div class="ws-field"><label for="wrp-vehicle">Vehicle</label>
						<select id="wrp-vehicle" name="vehicle_type">
							<option value="">Select…</option>
							<?php foreach ( $vehicle_labels as $val => $label ) : ?>
								<option value="<?php echo esc_attr( $val ); ?>" <?php selected( $vehicle, $val ); ?>><?php echo esc_html( $label ); ?></option>
							<?php endforeach; ?>
						</select>
					</div>
				</div>
				<div class="ws-field">
					<label for="wrp-address">Street address</label>
					<input type="text" id="wrp-address" name="address_line1" value="<?php echo esc_attr( wrrapd_wrapriders_get_meta( $id, 'address_line1' ) ); ?>" required />
					<input type="text" id="wrp-address2" name="address_line2" class="wrrapd-address-line2" value="<?php echo esc_attr( wrrapd_wrapriders_get_meta( $id, 'address_line2' ) ); ?>" placeholder="Apt, suite, unit, etc. (optional)" />
				</div>
				<div class="ws-field-row ws-field-row--3">
					<div class="ws-field"><label for="wrp-city">City</label><input type="text" id="wrp-city" name="city" value="<?php echo esc_attr( wrrapd_wrapriders_get_meta( $id, 'city' ) ); ?>" required /></div>
					<div class="ws-field"><label for="wrp-zip">ZIP code</label><input type="text" id="wrp-zip" name="postal_code" value="<?php echo esc_attr( wrrapd_wrapriders_get_meta( $id, 'postal_code' ) ); ?>" required /></div>
					<div class="ws-field"><label for="wrp-state">State</label>
						<?php if ( function_exists( 'wrrapd_wrapriders_apply_state_options' ) ) : ?>
							<select id="wrp-state" name="state" required>
								<?php $cur = wrrapd_wrapriders_get_meta( $id, 'state' ); ?>
								<?php foreach ( wrrapd_wrapriders_apply_state_options() as $value => $label ) : ?>
									<?php if ( $value === '' ) { continue; } ?>
									<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $cur, $value ); ?>><?php echo esc_html( $label ); ?></option>
								<?php endforeach; ?>
							</select>
						<?php else : ?>
							<input type="text" id="wrp-state" name="state" maxlength="2" value="<?php echo esc_attr( wrrapd_wrapriders_get_meta( $id, 'state' ) ); ?>" required />
						<?php endif; ?>
					</div>
				</div>
				<?php if ( $editable ) : ?><button type="submit" class="wrrapd-wrapstars-btn">Save profile</button><?php endif; ?>
				</fieldset>
			</form>
		</section>

		<section class="wrrapd-wrapstars-card wrrapd-ws-profile__card" id="account">
			<h2>Username &amp; password</h2>
			<?php if ( $pw_ok ) : ?><div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--ok">Password updated.</div><?php endif; ?>
			<?php if ( $pw_error !== '' ) : ?><div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $pw_error ); ?></div><?php endif; ?>
			<dl class="wrrapd-ws-profile__dl">
				<div><dt>Username</dt><dd><code><?php echo esc_html( $user->user_email ); ?></code></dd></div>
				<div><dt>Password</dt><dd>••••••••••<?php echo $pw_changed !== '' ? ' <span class="wrrapd-ws-profile__muted">· changed ' . esc_html( $pw_changed ) . '</span>' : ''; ?></dd></div>
				<div class="is-wide"><dt>Where to sign in</dt><dd>
					<?php if ( $status === 'active' ) : ?>
						<a href="<?php echo esc_url( $app_url ); ?>">WrapRider app</a> — same email and password as here.
					<?php else : ?>
						<a href="<?php echo esc_url( wrrapd_wrapriders_pros_url( '/wraprider-onboarding/' ) ); ?>">Onboarding</a> for now. Once you are activated, the same email and password open the WrapRider app: <?php echo esc_html( $app_host ); ?>.
					<?php endif; ?>
				</dd></div>
			</dl>
			<form class="wrrapd-wrapstars-form wrrapd-ws-profile__pw" method="post">
				<?php wp_nonce_field( 'wrrapd_wr_profile_pw', 'wrrapd_wr_nonce' ); ?>
				<input type="hidden" name="wrrapd_wr_action" value="profile_password" />
				<h3>Change password</h3>
				<div class="ws-field-row ws-field-row--3">
					<div class="ws-field"><label for="wrp-pw-current">Current password</label><input type="password" id="wrp-pw-current" name="current_password" required autocomplete="current-password" /></div>
					<div class="ws-field"><label for="wrp-pw-new">New password</label><input type="password" id="wrp-pw-new" name="new_password" required minlength="10" autocomplete="new-password" /></div>
					<div class="ws-field"><label for="wrp-pw-confirm">Confirm new password</label><input type="password" id="wrp-pw-confirm" name="confirm_password" required minlength="10" autocomplete="new-password" /></div>
				</div>
				<p class="wrrapd-ws-profile__note">At least 10 characters.</p>
				<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--secondary">Update password</button>
			</form>
		</section>
	</div>
	<?php
	return ob_get_clean();
}

function wrrapd_wrapriders_admin_menu() {
	add_menu_page(
		'WrapRiders',
		'WrapRiders',
		'manage_options',
		'wrrapd-wrapriders',
		'wrrapd_wrapriders_admin_page',
		'dashicons-randomize',
		28
	);
}

function wrrapd_wrapriders_admin_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	if ( isset( $_POST['wrrapd_wr_admin_action'] ) && check_admin_referer( 'wrrapd_wr_admin' ) ) {
		$app_id = (int) ( $_POST['app_id'] ?? 0 );
		$action = sanitize_text_field( wp_unslash( $_POST['wrrapd_wr_admin_action'] ) );
		if ( function_exists( 'wrrapd_wrapriders_run_admin_action' ) ) {
			wrrapd_wrapriders_run_admin_action(
				$app_id,
				$action,
				array(
					'admin_notes'   => (string) wp_unslash( $_POST['admin_notes'] ?? '' ),
					'reject_reason' => (string) wp_unslash( $_POST['reject_reason'] ?? '' ),
				)
			);
		}
	}
	$posts = get_posts(
		array(
			'post_type'      => WRRAPD_WRAPRIDERS_CPT,
			'posts_per_page' => 50,
			'post_status'    => 'publish',
			'orderby'        => 'date',
			'order'          => 'DESC',
		)
	);
	echo '<div class="wrap"><h1>WrapRider Applications</h1>';
	echo '<p>Day-to-day hiring: Command Center → Applications (WrapRider filter). This WP screen can also interview, skip interview, approve, or reject.</p>';
	echo '<p>Portal: <strong>apply.wrrapd.com/wraprider/</strong> · onboarding <strong>pros.wrrapd.com/wraprider-onboarding/</strong> · after activation: wraprider.wrrapd.com (own app + login)</p>';
	foreach ( $posts as $p ) {
		$id     = (int) $p->ID;
		$status = (string) wrrapd_wrapriders_get_meta( $id, 'status' );
		$notes  = (string) wrrapd_wrapriders_get_meta( $id, 'admin_notes' );
		$skip   = wrrapd_wrapriders_get_meta( $id, 'interview_skipped' ) === '1';
		echo '<div style="background:#fff;border:1px solid #ccc;padding:16px;margin:12px 0;max-width:960px;">';
		echo '<h2>' . esc_html( wrrapd_wrapriders_get_meta( $id, 'full_name' ) ) . ' <small>#' . $id . ' · ' . esc_html( $status ) . '</small>';
		if ( $skip ) {
			echo ' · <span style="color:#6b21a8;">Interview skipped</span>';
		}
		echo '</h2>';
		echo '<p>' . esc_html( wrrapd_wrapriders_get_meta( $id, 'email' ) ) . '</p>';
		if ( function_exists( 'wrrapd_wrapriders_admin_echo_hire_timeline' ) ) {
			wrrapd_wrapriders_admin_echo_hire_timeline( $id );
		}
		echo '<form method="post">';
		wp_nonce_field( 'wrrapd_wr_admin' );
		echo '<input type="hidden" name="app_id" value="' . $id . '" />';
		echo '<label>Reviewer notes<br/><textarea name="admin_notes" rows="2" style="width:100%;">' . esc_textarea( $notes ) . '</textarea></label><br/>';
		if ( $status === 'under_review' ) {
			echo '<button type="submit" name="wrrapd_wr_admin_action" value="save_notes" class="button">Save notes</button> ';
			echo '<button type="submit" name="wrrapd_wr_admin_action" value="interview" class="button button-primary">Mark for interview</button> ';
			echo '<button type="submit" name="wrrapd_wr_admin_action" value="approve_without_interview" class="button button-primary" onclick="return confirm(\'Approve this WrapRider without an interview? They will receive login credentials immediately.\');">Approve without interview</button> ';
			echo '<textarea name="reject_reason" placeholder="Rejection reason" rows="2" style="width:100%;margin:8px 0;"></textarea>';
			echo '<button type="submit" name="wrrapd_wr_admin_action" value="reject" class="button">Reject</button>';
		} elseif ( $status === 'interview' ) {
			echo '<button type="submit" name="wrrapd_wr_admin_action" value="save_notes" class="button">Save notes</button> ';
			echo '<button type="submit" name="wrrapd_wr_admin_action" value="approve" class="button button-primary">Passed interview — approve</button> ';
			echo '<button type="submit" name="wrrapd_wr_admin_action" value="approve_without_interview" class="button" onclick="return confirm(\'Approve this WrapRider without completing the interview?\');">Approve without interview</button> ';
			echo '<textarea name="reject_reason" placeholder="Rejection reason" rows="2" style="width:100%;margin:8px 0;"></textarea>';
			echo '<button type="submit" name="wrrapd_wr_admin_action" value="reject" class="button">Reject</button>';
		} elseif ( $status === 'approved' ) {
			echo '<button type="submit" name="wrrapd_wr_admin_action" value="activate" class="button button-primary">Activate WrapRider</button> ';
			echo '<button type="submit" name="wrrapd_wr_admin_action" value="reset_to_review" class="button">Reset to under review (test)</button>';
		} elseif ( in_array( $status, array( 'declined', 'rejected' ), true ) ) {
			echo '<button type="submit" name="wrrapd_wr_admin_action" value="reset_to_review" class="button">Reset to under review (test)</button>';
		} elseif ( $status === 'active' ) {
			if ( wrrapd_wrapriders_get_meta( $id, 'onboarding_reopened' ) === '1' ) {
				echo '<button type="submit" name="wrrapd_wr_admin_action" value="close_onboarding" class="button">Close onboarding portal</button>';
			} else {
				echo '<button type="submit" name="wrrapd_wr_admin_action" value="reopen_onboarding" class="button" onclick="return confirm(\'Reopen the onboarding portal for this active WrapRider? (Rare — only to re-sign or re-upload a document.)\');">Reopen onboarding portal (rare)</button>';
			}
		}
		echo '</form></div>';
	}
	echo '</div>';
}
