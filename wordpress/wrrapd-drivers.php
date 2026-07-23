<?php
/**
 * Plugin Name: Wrrapd Drivers Portal (MU)
 * Description: Courier Driver application + onboarding on apply.wrrapd.com /driver and pros.wrrapd.com /driver-onboarding. Parallel to WrapStars.
 * Author: Wrrapd
 *
 * Install alongside WrapStars MU-plugins on the dedicated apply/pros WordPress:
 *   wp-content/mu-plugins/wrrapd-drivers.php
 *   wp-content/mu-plugins/wrrapd-drivers-apply.php
 *   wp-content/mu-plugins/wrrapd-drivers-ops-api.php
 *   wp-content/mu-plugins/wrrapd-drivers.css
 *
 * @package WrrapdDrivers
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WRRAPD_DRIVERS_BUILD', '2026-07-23-v1' );
define( 'WRRAPD_DRIVERS_INVITE_TTL_DAYS', 15 );
define( 'WRRAPD_DRIVERS_CPT', 'wrrapd_driver_app' );

/** Reuse WrapStars host helpers when present; otherwise local defaults. */
function wrrapd_drivers_apply_host() {
	if ( function_exists( 'wrrapd_wrapstars_apply_host' ) ) {
		return wrrapd_wrapstars_apply_host();
	}
	if ( defined( 'WRRAPD_WRAPSTARS_APPLY_HOST' ) && WRRAPD_WRAPSTARS_APPLY_HOST !== '' ) {
		return strtolower( (string) WRRAPD_WRAPSTARS_APPLY_HOST );
	}
	return 'apply.wrrapd.com';
}

function wrrapd_drivers_pros_host() {
	if ( function_exists( 'wrrapd_wrapstars_pros_host' ) ) {
		return wrrapd_wrapstars_pros_host();
	}
	if ( defined( 'WRRAPD_WRAPSTARS_PROS_HOST' ) && WRRAPD_WRAPSTARS_PROS_HOST !== '' ) {
		return strtolower( (string) WRRAPD_WRAPSTARS_PROS_HOST );
	}
	return 'pros.wrrapd.com';
}

function wrrapd_drivers_current_host() {
	$host = isset( $_SERVER['HTTP_HOST'] ) ? strtolower( (string) $_SERVER['HTTP_HOST'] ) : '';
	return preg_replace( '/:\d+$/', '', $host );
}

function wrrapd_drivers_force_enable() {
	return ( defined( 'WRRAPD_WRAPSTARS_FORCE_ENABLE' ) && WRRAPD_WRAPSTARS_FORCE_ENABLE )
		|| ( defined( 'WRRAPD_DRIVERS_FORCE_ENABLE' ) && WRRAPD_DRIVERS_FORCE_ENABLE );
}

function wrrapd_drivers_is_apply_host() {
	if ( function_exists( 'wrrapd_wrapstars_is_apply_host' ) ) {
		return wrrapd_wrapstars_is_apply_host();
	}
	return wrrapd_drivers_current_host() === wrrapd_drivers_apply_host() || wrrapd_drivers_force_enable();
}

function wrrapd_drivers_is_pros_host() {
	if ( function_exists( 'wrrapd_wrapstars_is_pros_host' ) ) {
		return wrrapd_wrapstars_is_pros_host();
	}
	return wrrapd_drivers_current_host() === wrrapd_drivers_pros_host() || wrrapd_drivers_force_enable();
}

function wrrapd_drivers_is_portal_host() {
	return wrrapd_drivers_is_apply_host() || wrrapd_drivers_is_pros_host() || wrrapd_drivers_force_enable();
}

function wrrapd_drivers_unified_host() {
	return wrrapd_drivers_apply_host() === wrrapd_drivers_pros_host();
}

if ( ! wrrapd_drivers_is_portal_host() ) {
	return;
}

$wrrapd_drv_apply = dirname( __FILE__ ) . '/wrrapd-drivers-apply.php';
if ( is_readable( $wrrapd_drv_apply ) ) {
	require_once $wrrapd_drv_apply;
}
$wrrapd_drv_ops = dirname( __FILE__ ) . '/wrrapd-drivers-ops-api.php';
if ( is_readable( $wrrapd_drv_ops ) ) {
	require_once $wrrapd_drv_ops;
}

function wrrapd_drivers_onboarding_steps() {
	return array(
		'welcome'     => 'Welcome & Overview',
		'agreement'   => 'Driver Independent Contractor Agreement',
		'policies'    => 'Policies & Safety',
		'orientation' => 'Orientation & Quiz',
		'background'  => 'Background Check',
		'insurance'   => 'Vehicle Insurance',
		'identity'    => 'Identity & License',
		'w9'          => 'W-9 Tax Form',
		'tax_1099'    => '1099 & Tax Acknowledgments',
		'bank_payout' => 'Connect Bank / Payouts',
		'activation'  => 'App Download & Final Review',
	);
}

function wrrapd_drivers_next_onboarding_step( $step ) {
	$steps = array_keys( wrrapd_drivers_onboarding_steps() );
	$idx   = array_search( $step, $steps, true );
	if ( $idx === false || ! isset( $steps[ $idx + 1 ] ) ) {
		return 'activation';
	}
	return $steps[ $idx + 1 ];
}

add_action( 'init', 'wrrapd_drivers_register_cpt' );
add_action( 'init', 'wrrapd_drivers_register_roles' );
add_action( 'init', 'wrrapd_drivers_maybe_handle_posts', 6 );
add_action( 'admin_menu', 'wrrapd_drivers_admin_menu' );
add_action( 'wp_enqueue_scripts', 'wrrapd_drivers_enqueue_assets', 20 );
add_action( 'template_redirect', 'wrrapd_drivers_host_routing', 2 );
add_action( 'admin_init', 'wrrapd_drivers_block_driver_wp_admin' );
add_filter( 'login_redirect', 'wrrapd_drivers_login_redirect', 11, 3 );
add_filter( 'body_class', 'wrrapd_drivers_body_class' );

add_shortcode( 'wrrapd_driver_landing', 'wrrapd_drivers_shortcode_landing' );
add_shortcode( 'wrrapd_driver_apply', 'wrrapd_drivers_shortcode_apply' );
add_shortcode( 'wrrapd_driver_thankyou', 'wrrapd_drivers_shortcode_thankyou' );
add_shortcode( 'wrrapd_driver_login', 'wrrapd_drivers_shortcode_login' );
add_shortcode( 'wrrapd_driver_onboarding', 'wrrapd_drivers_shortcode_onboarding' );
add_shortcode( 'wrrapd_driver_decline', 'wrrapd_drivers_shortcode_decline' );

function wrrapd_drivers_apply_url( $path = '/' ) {
	$path = '/' . ltrim( (string) $path, '/' );
	return 'https://' . wrrapd_drivers_apply_host() . $path;
}

function wrrapd_drivers_pros_url( $path = '/' ) {
	$path = '/' . ltrim( (string) $path, '/' );
	return 'https://' . wrrapd_drivers_pros_host() . $path;
}

function wrrapd_drivers_portal_login_url( $redirect = '', $greet = '' ) {
	$url = wrrapd_drivers_apply_url( '/driver-login/' );
	if ( $redirect !== '' ) {
		$url = add_query_arg( 'redirect_to', $redirect, $url );
	}
	$greet = trim( (string) $greet );
	if ( $greet !== '' && strcasecmp( $greet, 'there' ) !== 0 ) {
		$url = add_query_arg( 'greet', $greet, $url );
	}
	return $url;
}

function wrrapd_drivers_onboarding_step_url( $step ) {
	$paths = array(
		'welcome'     => '/driver-onboarding/',
		'agreement'   => '/driver-onboarding/driver-agreement/',
		'policies'    => '/driver-onboarding/driver-policies/',
		'orientation' => '/driver-onboarding/driver-orientation/',
		'background'  => '/driver-onboarding/driver-background/',
		'insurance'   => '/driver-onboarding/driver-insurance/',
		'identity'    => '/driver-onboarding/driver-identity/',
		'w9'          => '/driver-onboarding/driver-w-9/',
		'tax_1099'    => '/driver-onboarding/driver-tax-1099/',
		'bank_payout' => '/driver-onboarding/driver-bank-payout/',
		'activation'  => '/driver-onboarding/driver-activation/',
	);
	$path = $paths[ $step ] ?? '/driver-onboarding/';
	return wrrapd_drivers_pros_url( $path );
}

function wrrapd_drivers_courier_app_url() {
	if ( defined( 'WRRAPD_COURIER_APP_URL' ) && WRRAPD_COURIER_APP_URL !== '' ) {
		return rtrim( (string) WRRAPD_COURIER_APP_URL, '/' );
	}
	return 'https://track.wrrapd.com/courier';
}

function wrrapd_drivers_register_roles() {
	if ( ! get_role( 'driver_applicant' ) ) {
		add_role( 'driver_applicant', 'Driver Applicant', array( 'read' => true ) );
	}
	if ( ! get_role( 'driver_approved' ) ) {
		add_role( 'driver_approved', 'Driver Approved', array( 'read' => true ) );
	}
	if ( ! get_role( 'driver_declined' ) ) {
		add_role( 'driver_declined', 'Driver Declined Offer', array( 'read' => true ) );
	}
	if ( ! get_role( 'driver_active' ) ) {
		add_role( 'driver_active', 'Driver Active', array( 'read' => true ) );
	}
}

function wrrapd_drivers_user_has_role( $user_id, $role ) {
	$user = get_userdata( $user_id );
	return $user && in_array( $role, (array) $user->roles, true );
}

function wrrapd_drivers_set_user_role( $user_id, $role ) {
	$user = new WP_User( $user_id );
	$user->set_role( $role );
}

function wrrapd_drivers_is_onboarding_eligible_user( $user_id ) {
	return wrrapd_drivers_user_has_role( $user_id, 'driver_approved' )
		|| wrrapd_drivers_user_has_role( $user_id, 'driver_active' );
}

function wrrapd_drivers_is_driver_user( $user_id ) {
	foreach ( array( 'driver_applicant', 'driver_approved', 'driver_declined', 'driver_active' ) as $role ) {
		if ( wrrapd_drivers_user_has_role( $user_id, $role ) ) {
			return true;
		}
	}
	return false;
}

function wrrapd_drivers_register_cpt() {
	register_post_type(
		WRRAPD_DRIVERS_CPT,
		array(
			'labels'          => array(
				'name'          => 'Driver Applications',
				'singular_name' => 'Driver Application',
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

function wrrapd_drivers_get_meta( $post_id, $key, $default = '' ) {
	$val = get_post_meta( $post_id, '_wrrapd_drv_' . $key, true );
	return $val !== '' && $val !== false ? $val : $default;
}

function wrrapd_drivers_set_meta( $post_id, $key, $value ) {
	update_post_meta( $post_id, '_wrrapd_drv_' . $key, $value );
}

function wrrapd_drivers_get_application_by_user( $user_id ) {
	$posts = get_posts(
		array(
			'post_type'      => WRRAPD_DRIVERS_CPT,
			'posts_per_page' => 1,
			'meta_key'       => '_wrrapd_drv_user_id',
			'meta_value'     => (string) $user_id,
			'post_status'    => 'publish',
		)
	);
	return $posts ? $posts[0] : null;
}

function wrrapd_drivers_get_application_by_email( $email ) {
	$email = strtolower( trim( (string) $email ) );
	if ( ! is_email( $email ) ) {
		return null;
	}
	$posts = get_posts(
		array(
			'post_type'      => WRRAPD_DRIVERS_CPT,
			'posts_per_page' => 1,
			'meta_key'       => '_wrrapd_drv_email',
			'meta_value'     => $email,
			'post_status'    => 'publish',
		)
	);
	return $posts ? $posts[0] : null;
}

function wrrapd_drivers_greeting_name( $app_id ) {
	$nick = trim( (string) wrrapd_drivers_get_meta( $app_id, 'nickname' ) );
	if ( $nick !== '' ) {
		return $nick;
	}
	$first = trim( (string) wrrapd_drivers_get_meta( $app_id, 'first_name' ) );
	if ( $first !== '' ) {
		return $first;
	}
	return 'there';
}

function wrrapd_drivers_from_email_address() {
	if ( function_exists( 'wrrapd_wrapstars_from_email_address' ) ) {
		return wrrapd_wrapstars_from_email_address();
	}
	return 'admin@wrrapd.com';
}

function wrrapd_drivers_admin_notify_email() {
	if ( defined( 'WRRAPD_DRIVERS_ADMIN_EMAIL' ) && WRRAPD_DRIVERS_ADMIN_EMAIL !== '' ) {
		return (string) WRRAPD_DRIVERS_ADMIN_EMAIL;
	}
	if ( defined( 'WRRAPD_WRAPSTARS_ADMIN_EMAIL' ) && WRRAPD_WRAPSTARS_ADMIN_EMAIL !== '' ) {
		return (string) WRRAPD_WRAPSTARS_ADMIN_EMAIL;
	}
	return 'admin@wrrapd.com';
}

function wrrapd_drivers_brand_logo_url() {
	if ( function_exists( 'wrrapd_wrapstars_brand_logo_url' ) ) {
		return wrrapd_wrapstars_brand_logo_url();
	}
	return 'https://wrrapd.com/wp-content/uploads/wrrapd-logo.png';
}

function wrrapd_drivers_send_email( $to, $subject, $body, $is_html = false ) {
	if ( function_exists( 'wrrapd_wrapstars_send_email' ) ) {
		return wrrapd_wrapstars_send_email( $to, $subject, $body, $is_html );
	}
	$headers = array( 'From: Wrrapd <' . wrrapd_drivers_from_email_address() . '>' );
	if ( $is_html ) {
		$headers[] = 'Content-Type: text/html; charset=UTF-8';
	}
	return wp_mail( $to, $subject, $body, $headers );
}

function wrrapd_drivers_generate_temp_password() {
	return 'Drive' . (string) wp_rand( 1000, 9999 ) . chr( wp_rand( 65, 90 ) ) . '!';
}

function wrrapd_drivers_invite_ttl_seconds() {
	$days = defined( 'WRRAPD_DRIVERS_INVITE_TTL_DAYS' ) ? (int) WRRAPD_DRIVERS_INVITE_TTL_DAYS : 15;
	if ( $days < 1 ) {
		$days = 15;
	}
	return $days * DAY_IN_SECONDS;
}

function wrrapd_drivers_get_invite_expires_at( $app_id ) {
	$explicit = (string) wrrapd_drivers_get_meta( $app_id, 'invite_expires_at' );
	if ( $explicit !== '' ) {
		return $explicit;
	}
	$issued = (string) wrrapd_drivers_get_meta( $app_id, 'portal_password_issued_at' );
	if ( $issued === '' ) {
		$issued = (string) wrrapd_drivers_get_meta( $app_id, 'approved_at' );
	}
	if ( $issued === '' ) {
		return '';
	}
	$ts = strtotime( $issued );
	return $ts ? gmdate( 'c', $ts + wrrapd_drivers_invite_ttl_seconds() ) : '';
}

function wrrapd_drivers_invite_is_expired( $app_id ) {
	if ( (string) wrrapd_drivers_get_meta( $app_id, 'status' ) !== 'approved' ) {
		return false;
	}
	$expires = wrrapd_drivers_get_invite_expires_at( $app_id );
	if ( $expires === '' ) {
		return false;
	}
	$ts = strtotime( $expires );
	return $ts && time() > $ts;
}

function wrrapd_drivers_invalidate_expired_invite( $app_id ) {
	if ( (string) wrrapd_drivers_get_meta( $app_id, 'status' ) !== 'approved' ) {
		return;
	}
	if ( (string) wrrapd_drivers_get_meta( $app_id, 'invite_expired_at' ) === '' ) {
		wrrapd_drivers_set_meta( $app_id, 'invite_expired_at', gmdate( 'c' ) );
	}
	wrrapd_drivers_set_meta( $app_id, 'decline_token', '' );
	$user_id = (int) wrrapd_drivers_get_meta( $app_id, 'user_id' );
	if ( $user_id && get_userdata( $user_id ) ) {
		wp_set_password( wp_generate_password( 32, true, true ), $user_id );
	}
}

function wrrapd_drivers_enforce_active_invite_or_logout( $user_id ) {
	$app = wrrapd_drivers_get_application_by_user( $user_id );
	if ( ! $app || ! wrrapd_drivers_invite_is_expired( $app->ID ) ) {
		return false;
	}
	wrrapd_drivers_invalidate_expired_invite( $app->ID );
	wp_logout();
	return true;
}

function wrrapd_drivers_step_complete( $app_id, $step ) {
	return (string) wrrapd_drivers_get_meta( $app_id, 'step_' . $step ) === '1';
}

function wrrapd_drivers_mark_step_complete( $app_id, $step ) {
	wrrapd_drivers_set_meta( $app_id, 'step_' . $step, '1' );
	wrrapd_drivers_set_meta( $app_id, 'onboarding_step', wrrapd_drivers_next_onboarding_step( $step ) );
}

function wrrapd_drivers_can_access_step( $app_id, $step ) {
	$steps = array_keys( wrrapd_drivers_onboarding_steps() );
	$idx   = array_search( $step, $steps, true );
	if ( $idx === false ) {
		return false;
	}
	for ( $i = 0; $i < $idx; $i++ ) {
		if ( ! wrrapd_drivers_step_complete( $app_id, $steps[ $i ] ) ) {
			return false;
		}
	}
	return true;
}

function wrrapd_drivers_set_must_change_password( $user_id, $app_id, $must ) {
	wrrapd_drivers_set_meta( $app_id, 'must_change_password', $must ? '1' : '' );
	if ( $must ) {
		update_user_meta( $user_id, '_wrrapd_drv_must_change_password', '1' );
	} else {
		delete_user_meta( $user_id, '_wrrapd_drv_must_change_password' );
	}
}

function wrrapd_drivers_user_must_change_password( $user_id ) {
	return get_user_meta( $user_id, '_wrrapd_drv_must_change_password', true ) === '1';
}

function wrrapd_drivers_portal_redirect_for_user( $user_id ) {
	return wrrapd_drivers_pros_url( '/driver-onboarding/' );
}

function wrrapd_drivers_handle_upload( $app_id, $field, $allowed = array( 'jpg', 'jpeg', 'png', 'pdf' ) ) {
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

function wrrapd_drivers_block_driver_wp_admin() {
	if ( wp_doing_ajax() || ! is_user_logged_in() || current_user_can( 'manage_options' ) ) {
		return;
	}
	if ( wrrapd_drivers_is_driver_user( get_current_user_id() ) ) {
		wp_safe_redirect( wrrapd_drivers_portal_redirect_for_user( get_current_user_id() ) );
		exit;
	}
}

function wrrapd_drivers_login_redirect( $redirect_to, $requested_redirect_to, $user ) {
	if ( is_wp_error( $user ) || ! $user instanceof WP_User ) {
		return $redirect_to;
	}
	if ( user_can( $user, 'manage_options' ) ) {
		return $redirect_to;
	}
	if ( wrrapd_drivers_is_onboarding_eligible_user( $user->ID ) ) {
		if ( $requested_redirect_to !== '' && strpos( $requested_redirect_to, 'driver-onboarding' ) !== false ) {
			return $requested_redirect_to;
		}
		return wrrapd_drivers_portal_redirect_for_user( $user->ID );
	}
	return $redirect_to;
}

function wrrapd_drivers_body_class( $classes ) {
	$classes[] = 'wrrapd-drivers-portal';
	return $classes;
}

function wrrapd_drivers_enqueue_assets() {
	if ( ! wrrapd_drivers_is_portal_host() ) {
		return;
	}
	$uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '';
	$need = (bool) preg_match( '#/(driver|driver-login|driver-onboarding|driver-decline)(/|$)#', $uri );
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
	$drv_css = dirname( __FILE__ ) . '/wrrapd-drivers.css';
	if ( is_readable( $drv_css ) ) {
		wp_enqueue_style(
			'wrrapd-drivers',
			content_url( 'mu-plugins/wrrapd-drivers.css' ),
			array( 'wrrapd-wrapstars' ),
			WRRAPD_DRIVERS_BUILD
		);
	}
}

function wrrapd_drivers_host_routing() {
	if ( is_admin() ) {
		return;
	}
	$uri  = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '/';
	$path = '/' . trim( strtok( $uri, '?' ), '/' );
	if ( $path === '//' || $path === '' ) {
		$path = '/';
	}

	$is_drive_apply = (bool) preg_match( '#^/driver(/|$)#', $path )
		|| (bool) preg_match( '#^/(driver-login|driver-decline)(/|$)#', $path );
	$is_drive_ob = (bool) preg_match( '#^/driver-onboarding#', $path );

	if ( wrrapd_drivers_unified_host() ) {
		if ( $is_drive_ob ) {
			if ( ! is_user_logged_in() || ! wrrapd_drivers_is_onboarding_eligible_user( get_current_user_id() ) ) {
				wp_safe_redirect( wrrapd_drivers_portal_login_url( wrrapd_drivers_apply_url( $path ) ) );
				exit;
			}
			if ( wrrapd_drivers_enforce_active_invite_or_logout( get_current_user_id() ) ) {
				wp_safe_redirect( add_query_arg( 'invite_expired', '1', wrrapd_drivers_portal_login_url( wrrapd_drivers_apply_url( $path ) ) ) );
				exit;
			}
		}
		if ( preg_match( '#^/driver-login(/|$)#', $path ) && is_user_logged_in() && wrrapd_drivers_is_onboarding_eligible_user( get_current_user_id() ) ) {
			if ( wrrapd_drivers_enforce_active_invite_or_logout( get_current_user_id() ) ) {
				wp_safe_redirect( add_query_arg( 'invite_expired', '1', wrrapd_drivers_portal_login_url() ) );
				exit;
			}
			wp_safe_redirect( wrrapd_drivers_portal_redirect_for_user( get_current_user_id() ) );
			exit;
		}
		return;
	}

	if ( wrrapd_drivers_is_apply_host() ) {
		if ( $is_drive_ob ) {
			wp_safe_redirect( wrrapd_drivers_pros_url( $path ) );
			exit;
		}
		if ( preg_match( '#^/driver-login(/|$)#', $path ) && is_user_logged_in() && wrrapd_drivers_is_onboarding_eligible_user( get_current_user_id() ) ) {
			if ( wrrapd_drivers_enforce_active_invite_or_logout( get_current_user_id() ) ) {
				wp_safe_redirect( add_query_arg( 'invite_expired', '1', wrrapd_drivers_portal_login_url() ) );
				exit;
			}
			wp_safe_redirect( wrrapd_drivers_portal_redirect_for_user( get_current_user_id() ) );
			exit;
		}
		return;
	}

	if ( wrrapd_drivers_is_pros_host() ) {
		if ( $is_drive_apply ) {
			wp_safe_redirect( wrrapd_drivers_apply_url( $path ) );
			exit;
		}
		if ( $is_drive_ob ) {
			if ( ! is_user_logged_in() || ! wrrapd_drivers_is_onboarding_eligible_user( get_current_user_id() ) ) {
				wp_safe_redirect( wrrapd_drivers_portal_login_url( wrrapd_drivers_pros_url( $path ) ) );
				exit;
			}
			if ( wrrapd_drivers_enforce_active_invite_or_logout( get_current_user_id() ) ) {
				wp_safe_redirect( add_query_arg( 'invite_expired', '1', wrrapd_drivers_portal_login_url( wrrapd_drivers_pros_url( $path ) ) ) );
				exit;
			}
		}
	}
}

function wrrapd_drivers_maybe_handle_posts() {
	if ( empty( $_POST['wrrapd_drv_action'] ) ) {
		return;
	}
	$action = sanitize_text_field( wp_unslash( $_POST['wrrapd_drv_action'] ) );
	if ( $action === 'apply' ) {
		wrrapd_drivers_process_application();
	} elseif ( $action === 'portal_login' ) {
		wrrapd_drivers_process_portal_login();
	} elseif ( $action === 'onboarding_step' ) {
		wrrapd_drivers_process_onboarding_step();
	} elseif ( $action === 'orientation_quiz' ) {
		wrrapd_drivers_process_orientation_quiz();
	} elseif ( $action === 'change_password' ) {
		wrrapd_drivers_process_change_password();
	} elseif ( $action === 'decline_offer' ) {
		wrrapd_drivers_process_decline_offer();
	}
}

function wrrapd_drivers_process_portal_login() {
	if ( ! isset( $_POST['wrrapd_drv_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_drv_nonce'] ) ), 'wrrapd_drv_login' ) ) {
		return;
	}
	$email    = sanitize_email( wp_unslash( $_POST['email'] ?? '' ) );
	$password = (string) wp_unslash( $_POST['password'] ?? '' );
	$user     = wp_authenticate( $email, $password );
	if ( is_wp_error( $user ) ) {
		$GLOBALS['wrrapd_drv_login_error'] = 'Invalid email or password.';
		return;
	}
	if ( ! wrrapd_drivers_is_onboarding_eligible_user( $user->ID ) ) {
		$GLOBALS['wrrapd_drv_login_error'] = 'This login is for approved Drivers only.';
		return;
	}
	$app = wrrapd_drivers_get_application_by_user( $user->ID );
	if ( $app && (string) wrrapd_drivers_get_meta( $app->ID, 'status' ) === 'declined' ) {
		$GLOBALS['wrrapd_drv_login_error'] = 'This invitation was declined.';
		return;
	}
	if ( $app && wrrapd_drivers_invite_is_expired( $app->ID ) ) {
		wrrapd_drivers_invalidate_expired_invite( $app->ID );
		$GLOBALS['wrrapd_drv_login_error'] = 'Your invitation has expired. Contact us to resend.';
		return;
	}
	wp_set_current_user( $user->ID );
	wp_set_auth_cookie( $user->ID, true );
	$redirect = isset( $_POST['redirect_to'] ) ? esc_url_raw( wp_unslash( $_POST['redirect_to'] ) ) : '';
	if ( $redirect === '' || strpos( $redirect, 'driver-onboarding' ) === false ) {
		$redirect = wrrapd_drivers_portal_redirect_for_user( $user->ID );
	}
	wp_safe_redirect( $redirect );
	exit;
}

function wrrapd_drivers_process_change_password() {
	if ( ! is_user_logged_in() || ! isset( $_POST['wrrapd_drv_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_drv_nonce'] ) ), 'wrrapd_drv_change_pw' ) ) {
		return;
	}
	$user_id = get_current_user_id();
	$pw1     = (string) wp_unslash( $_POST['password'] ?? '' );
	$pw2     = (string) wp_unslash( $_POST['password2'] ?? '' );
	if ( strlen( $pw1 ) < 10 ) {
		$GLOBALS['wrrapd_drv_pw_error'] = 'Password must be at least 10 characters.';
		return;
	}
	if ( $pw1 !== $pw2 ) {
		$GLOBALS['wrrapd_drv_pw_error'] = 'Passwords do not match.';
		return;
	}
	wp_set_password( $pw1, $user_id );
	$app = wrrapd_drivers_get_application_by_user( $user_id );
	if ( $app ) {
		wrrapd_drivers_set_must_change_password( $user_id, $app->ID, false );
	}
	wp_set_current_user( $user_id );
	wp_set_auth_cookie( $user_id, true );
	wp_safe_redirect( wrrapd_drivers_portal_redirect_for_user( $user_id ) );
	exit;
}

function wrrapd_drivers_process_onboarding_step() {
	if ( ! is_user_logged_in() || ! isset( $_POST['wrrapd_drv_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_drv_nonce'] ) ), 'wrrapd_drv_onboarding' ) ) {
		return;
	}
	$app = wrrapd_drivers_get_application_by_user( get_current_user_id() );
	if ( ! $app || (string) wrrapd_drivers_get_meta( $app->ID, 'status' ) !== 'approved' ) {
		return;
	}
	$step = sanitize_text_field( wp_unslash( $_POST['step'] ?? '' ) );
	if ( ! wrrapd_drivers_can_access_step( $app->ID, $step ) ) {
		return;
	}
	$placeholders = array( 'policies', 'background', 'identity', 'tax_1099', 'bank_payout', 'agreement', 'w9' );
	if ( $step === 'welcome' ) {
		wrrapd_drivers_mark_step_complete( $app->ID, 'welcome' );
		wp_safe_redirect( wrrapd_drivers_onboarding_step_url( 'agreement' ) );
		exit;
	}
	if ( in_array( $step, $placeholders, true ) ) {
		if ( empty( $_POST['placeholder_ack'] ) && empty( $_POST['step_ack'] ) ) {
			$GLOBALS['wrrapd_drv_ob_error'] = 'Please acknowledge to continue.';
			return;
		}
		wrrapd_drivers_mark_step_complete( $app->ID, $step );
		wp_safe_redirect( wrrapd_drivers_onboarding_step_url( wrrapd_drivers_next_onboarding_step( $step ) ) );
		exit;
	}
	if ( $step === 'insurance' ) {
		$upload = wrrapd_drivers_handle_upload( $app->ID, 'insurance_file' );
		if ( ! $upload['ok'] ) {
			$GLOBALS['wrrapd_drv_ob_error'] = $upload['error'];
			return;
		}
		wrrapd_drivers_set_meta( $app->ID, 'insurance_file', $upload['path'] );
		wrrapd_drivers_mark_step_complete( $app->ID, 'insurance' );
		wp_safe_redirect( wrrapd_drivers_onboarding_step_url( 'identity' ) );
		exit;
	}
}

function wrrapd_drivers_process_orientation_quiz() {
	if ( ! is_user_logged_in() || ! isset( $_POST['wrrapd_drv_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_drv_nonce'] ) ), 'wrrapd_drv_onboarding' ) ) {
		return;
	}
	$app = wrrapd_drivers_get_application_by_user( get_current_user_id() );
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
	if ( ( $_POST['q3'] ?? '' ) === 'wrapstar' ) {
		$score++;
	}
	wrrapd_drivers_set_meta( $app->ID, 'orientation_score', (string) $score );
	if ( $score < 3 ) {
		$GLOBALS['wrrapd_drv_ob_error'] = 'Please review the answers and try again (need 3/3).';
		return;
	}
	wrrapd_drivers_mark_step_complete( $app->ID, 'orientation' );
	wp_safe_redirect( wrrapd_drivers_onboarding_step_url( 'background' ) );
	exit;
}

function wrrapd_drivers_process_decline_offer() {
	if ( ! isset( $_POST['wrrapd_drv_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_drv_nonce'] ) ), 'wrrapd_drv_decline' ) ) {
		return;
	}
	$app_id = (int) ( $_POST['app'] ?? 0 );
	$token  = sanitize_text_field( wp_unslash( $_POST['token'] ?? '' ) );
	$note   = sanitize_textarea_field( wp_unslash( $_POST['decline_note'] ?? '' ) );
	$result = wrrapd_drivers_mark_offer_declined( $app_id, $note, $token );
	$GLOBALS['wrrapd_drv_decline_result'] = $result;
}

function wrrapd_drivers_provision_approved_user( $app_id ) {
	$email = strtolower( (string) wrrapd_drivers_get_meta( $app_id, 'email' ) );
	$name  = (string) wrrapd_drivers_get_meta( $app_id, 'full_name' );
	if ( ! is_email( $email ) ) {
		return new WP_Error( 'invalid_email', 'Application email missing.' );
	}
	$password = wrrapd_drivers_generate_temp_password();
	$user_id  = (int) wrrapd_drivers_get_meta( $app_id, 'user_id' );
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
	$first = (string) wrrapd_drivers_get_meta( $app_id, 'first_name' );
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
	wrrapd_drivers_set_meta( $app_id, 'user_id', $user_id );
	wrrapd_drivers_set_user_role( $user_id, 'driver_approved' );
	wrrapd_drivers_set_meta( $app_id, 'portal_password_issued_at', gmdate( 'c' ) );
	wrrapd_drivers_set_meta( $app_id, 'invite_expires_at', gmdate( 'c', time() + wrrapd_drivers_invite_ttl_seconds() ) );
	wrrapd_drivers_set_meta( $app_id, 'invite_expired_at', '' );
	wrrapd_drivers_set_must_change_password( $user_id, $app_id, true );
	wrrapd_drivers_set_meta( $app_id, 'declined_at', '' );
	$decline_token = wp_generate_password( 40, false, false );
	wrrapd_drivers_set_meta( $app_id, 'decline_token', $decline_token );
	return array(
		'user_id'       => $user_id,
		'password'      => $password,
		'decline_token' => $decline_token,
	);
}

function wrrapd_drivers_decline_offer_url( $app_id, $token ) {
	return add_query_arg(
		array(
			'app'   => (int) $app_id,
			'token' => rawurlencode( (string) $token ),
		),
		wrrapd_drivers_apply_url( '/driver-decline/' )
	);
}

function wrrapd_drivers_send_approval_credentials_email( $app_id, $password, $context = 'approve' ) {
	$email   = wrrapd_drivers_get_meta( $app_id, 'email' );
	$greet   = wrrapd_drivers_greeting_name( $app_id );
	$login   = wrrapd_drivers_portal_login_url( wrrapd_drivers_pros_url( '/driver-onboarding/' ), $greet );
	$token   = (string) wrrapd_drivers_get_meta( $app_id, 'decline_token' );
	$decline = $token !== '' ? wrrapd_drivers_decline_offer_url( $app_id, $token ) : wrrapd_drivers_apply_url( '/driver-decline/' );
	$subject = 'Congratulations — welcome to the Wrrapd Driver network';
	$lead    = 'We are thrilled to welcome you as a Wrrapd Delivery Driver.';
	if ( $context === 'reinvite' ) {
		$subject = 'Welcome back — your Wrrapd Driver invitation is open';
		$lead    = 'We are delighted to reopen your Driver invitation.';
	} elseif ( $context === 'resend' ) {
		$subject = 'Your Wrrapd Driver login details';
		$lead    = 'Here are fresh portal credentials. Earlier temporary passwords no longer work.';
	}
	$body  = "Hi {$greet},\n\n{$lead}\n\n";
	$body .= "Please log in to begin onboarding. You will choose a new password first.\n\n";
	$body .= "Login: {$login}\nUsername: {$email}\nTemporary password: {$password}\n\n";
	$body .= "This link and password expire in 15 days.\n\n";
	$body .= "Decline this offer (no login): {$decline}\n\n";
	$body .= "— Team Wrrapd\n";
	wrrapd_drivers_send_email( $email, $subject, $body );
}

function wrrapd_drivers_mark_offer_declined( $app_id, $note = '', $token = null ) {
	$app_id = (int) $app_id;
	$app    = get_post( $app_id );
	if ( ! $app || $app->post_type !== WRRAPD_DRIVERS_CPT ) {
		return array( 'ok' => false, 'error' => 'Application not found.' );
	}
	$status = (string) wrrapd_drivers_get_meta( $app_id, 'status' );
	if ( ! in_array( $status, array( 'approved', 'under_review', 'interview' ), true ) ) {
		return array( 'ok' => false, 'error' => 'Offer cannot be declined from status “' . $status . '”.' );
	}
	if ( $token !== null ) {
		$expected = (string) wrrapd_drivers_get_meta( $app_id, 'decline_token' );
		if ( $expected === '' || ! hash_equals( $expected, (string) $token ) ) {
			return array( 'ok' => false, 'error' => 'Invalid or expired decline link.' );
		}
	}
	wrrapd_drivers_set_meta( $app_id, 'status', 'declined' );
	wrrapd_drivers_set_meta( $app_id, 'declined_at', gmdate( 'c' ) );
	wrrapd_drivers_set_meta( $app_id, 'decline_note', $note );
	wrrapd_drivers_set_meta( $app_id, 'decline_token', '' );
	$user_id = (int) wrrapd_drivers_get_meta( $app_id, 'user_id' );
	if ( $user_id && get_userdata( $user_id ) ) {
		wrrapd_drivers_set_user_role( $user_id, 'driver_declined' );
		wp_set_password( wp_generate_password( 32, true, true ), $user_id );
	}
	return array( 'ok' => true, 'status' => 'declined' );
}

function wrrapd_drivers_reinvite_declined_offer( $app_id, $admin_note = '' ) {
	$app_id = (int) $app_id;
	$app    = get_post( $app_id );
	if ( ! $app || $app->post_type !== WRRAPD_DRIVERS_CPT ) {
		return array( 'ok' => false, 'error' => 'Application not found.' );
	}
	if ( (string) wrrapd_drivers_get_meta( $app_id, 'status' ) !== 'declined' ) {
		return array( 'ok' => false, 'error' => 'Only declined offers can be re-invited.' );
	}
	wrrapd_drivers_set_meta( $app_id, 'previous_declined_at', wrrapd_drivers_get_meta( $app_id, 'declined_at' ) );
	wrrapd_drivers_set_meta( $app_id, 'status', 'approved' );
	wrrapd_drivers_set_meta( $app_id, 'approved_at', gmdate( 'c' ) );
	wrrapd_drivers_set_meta( $app_id, 'onboarding_step', 'welcome' );
	wrrapd_drivers_set_meta( $app_id, 'reinvited_at', gmdate( 'c' ) );
	$count = (int) wrrapd_drivers_get_meta( $app_id, 'reinvite_count', '0' );
	wrrapd_drivers_set_meta( $app_id, 'reinvite_count', (string) ( $count + 1 ) );
	if ( $admin_note !== '' ) {
		wrrapd_drivers_set_meta( $app_id, 'admin_notes', $admin_note );
	}
	$provision = wrrapd_drivers_provision_approved_user( $app_id );
	if ( is_wp_error( $provision ) ) {
		return array( 'ok' => false, 'error' => $provision->get_error_message() );
	}
	wrrapd_drivers_send_approval_credentials_email( $app_id, $provision['password'], 'reinvite' );
	return array( 'ok' => true, 'password' => $provision['password'] );
}

function wrrapd_drivers_resend_approval_invite( $app_id ) {
	$app_id = (int) $app_id;
	if ( (string) wrrapd_drivers_get_meta( $app_id, 'status' ) !== 'approved' ) {
		return array( 'ok' => false, 'error' => 'Resend requires approved status.' );
	}
	$provision = wrrapd_drivers_provision_approved_user( $app_id );
	if ( is_wp_error( $provision ) ) {
		return array( 'ok' => false, 'error' => $provision->get_error_message() );
	}
	wrrapd_drivers_send_approval_credentials_email( $app_id, $provision['password'], 'resend' );
	return array( 'ok' => true );
}

function wrrapd_drivers_reset_application_to_under_review( $app_id ) {
	$app_id = (int) $app_id;
	$app    = get_post( $app_id );
	if ( ! $app || $app->post_type !== WRRAPD_DRIVERS_CPT ) {
		return array( 'ok' => false, 'error' => 'Application not found.' );
	}
	$status = (string) wrrapd_drivers_get_meta( $app_id, 'status' );
	if ( ! in_array( $status, array( 'approved', 'declined', 'interview', 'rejected' ), true ) ) {
		return array( 'ok' => false, 'error' => 'Reset is only available from approved, declined, interview, or rejected.' );
	}
	wrrapd_drivers_set_meta( $app_id, 'status', 'under_review' );
	foreach ( array( 'approved_at', 'activated_at', 'interview_at', 'declined_at', 'decline_token', 'rejected_at', 'must_change_password', 'invite_expires_at', 'invite_expired_at' ) as $k ) {
		wrrapd_drivers_set_meta( $app_id, $k, '' );
	}
	wrrapd_drivers_set_meta( $app_id, 'onboarding_step', 'welcome' );
	wrrapd_drivers_set_meta( $app_id, 'suspended', '0' );
	foreach ( array_keys( wrrapd_drivers_onboarding_steps() ) as $step ) {
		wrrapd_drivers_set_meta( $app_id, 'step_' . $step, '' );
	}
	$user_id = (int) wrrapd_drivers_get_meta( $app_id, 'user_id' );
	if ( $user_id && get_userdata( $user_id ) ) {
		wrrapd_drivers_set_user_role( $user_id, 'driver_applicant' );
		delete_user_meta( $user_id, '_wrrapd_drv_must_change_password' );
		wp_set_password( wp_generate_password( 32, true, true ), $user_id );
	}
	return array( 'ok' => true );
}


function wrrapd_drivers_detect_onboarding_step_from_uri() {
	$uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '';
	$map = array(
		'/driver-onboarding/driver-agreement'   => 'agreement',
		'/driver-onboarding/driver-policies'    => 'policies',
		'/driver-onboarding/driver-orientation' => 'orientation',
		'/driver-onboarding/driver-background'  => 'background',
		'/driver-onboarding/driver-insurance'   => 'insurance',
		'/driver-onboarding/driver-identity'    => 'identity',
		'/driver-onboarding/driver-w-9'         => 'w9',
		'/driver-onboarding/driver-tax-1099'    => 'tax_1099',
		'/driver-onboarding/driver-bank-payout' => 'bank_payout',
		'/driver-onboarding/driver-activation'  => 'activation',
		'/driver-onboarding'             => 'welcome',
	);
	foreach ( $map as $needle => $step ) {
		if ( strpos( $uri, $needle ) !== false ) {
			return $step;
		}
	}
	return 'welcome';
}

function wrrapd_drivers_render_change_password_gate() {
	$err = $GLOBALS['wrrapd_drv_pw_error'] ?? '';
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-drivers">
		<div class="wrrapd-wrapstars-card">
			<h1>Choose your password</h1>
			<p>For your security, set a new password before continuing Driver onboarding.</p>
			<?php if ( $err ) : ?>
				<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $err ); ?></div>
			<?php endif; ?>
			<form method="post" class="wrrapd-wrapstars-form">
				<?php wp_nonce_field( 'wrrapd_drv_change_pw', 'wrrapd_drv_nonce' ); ?>
				<input type="hidden" name="wrrapd_drv_action" value="change_password" />
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

function wrrapd_drivers_placeholder_step_config( $step ) {
	$all = array(
		'agreement'   => array(
			'title' => 'Driver independent contractor agreement',
			'lead'  => 'Review and e-sign the Delivery Driver IC agreement (BoldSign template when configured via WRRAPD_BOLDSIGN_DRIVER_IC_TEMPLATE_ID). Until then, acknowledge to continue.',
			'needs' => array( 'Driver / courier IC agreement PDF', 'BoldSign template ID' ),
			'vendor'=> 'BoldSign send-from-template when WRRAPD_BOLDSIGN_DRIVER_IC_TEMPLATE_ID is set.',
			'ack'   => 'I understand this step is a placeholder and I will re-sign when the final Driver agreement is published.',
		),
		'policies'    => array(
			'title' => 'Policies & safety',
			'lead'  => 'Acknowledge Driver safety, package handling, and proof-of-delivery standards.',
			'needs' => array( 'Driver handbook PDF', 'Safety / vehicle standards PDF' ),
			'vendor'=> 'In-app PDF + checkbox.',
			'ack'   => 'I will follow Wrrapd Driver safety and delivery standards when final policies are published.',
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
			'lead'  => 'E-sign W-9 via BoldSign (shared WrapStar W-9 template or Driver-specific when provided).',
			'needs' => array( 'BoldSign W-9 template' ),
			'vendor'=> 'BoldSign W-9.',
			'ack'   => 'I will complete the W-9 when e-sign is enabled and confirm my tax details are accurate.',
		),
		'tax_1099'    => array(
			'title' => '1099 & tax acknowledgments',
			'lead'  => 'Acknowledge independent-contractor tax treatment for Driver earnings.',
			'needs' => array( '1099 acknowledgment PDF' ),
			'vendor'=> 'Checkbox attestation.',
			'ack'   => 'I understand I am an independent contractor and Wrrapd may issue a Form 1099 when required.',
		),
		'bank_payout' => array(
			'title' => 'Connect bank / payouts',
			'lead'  => 'Connect the account for Driver payouts (Stripe Connect later).',
			'needs' => array( 'Stripe Connect' ),
			'vendor'=> 'Stripe Connect Express.',
			'ack'   => 'I have a US bank account ready for Driver payouts and will connect it when enabled.',
		),
	);
	return $all[ $step ] ?? null;
}

function wrrapd_drivers_render_step_placeholder( $app_id, $step ) {
	$cfg = wrrapd_drivers_placeholder_step_config( $step );
	if ( ! $cfg ) {
		echo '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err">Unknown step.</div>';
		return;
	}
	$err = $GLOBALS['wrrapd_drv_ob_error'] ?? '';
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
			<?php wp_nonce_field( 'wrrapd_drv_onboarding', 'wrrapd_drv_nonce' ); ?>
			<input type="hidden" name="wrrapd_drv_action" value="onboarding_step" />
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

function wrrapd_drivers_render_step_welcome( $app_id ) {
	$greet = wrrapd_drivers_greeting_name( $app_id );
	?>
	<div class="wrrapd-wrapstars-card wrrapd-wrapstars-card--hero">
		<p class="wrrapd-wrapstars-welcome__hello">Dear <?php echo esc_html( $greet === 'there' ? 'Driver' : $greet ); ?>,</p>
		<p class="wrrapd-wrapstars-ob-lead">Welcome to the Wrrapd Driver network. This onboarding confirms agreements, screening, insurance, tax, and payout details before you can accept delivery offers in the Driver app.</p>
		<p class="wrrapd-wrapstars-ob-lead">Complete each step promptly so ops can activate your account. After activation you will download the Driver app and start scheduling deliveries.</p>
		<form method="post" class="wrrapd-wrapstars-ob-actions">
			<?php wp_nonce_field( 'wrrapd_drv_onboarding', 'wrrapd_drv_nonce' ); ?>
			<input type="hidden" name="wrrapd_drv_action" value="onboarding_step" />
			<input type="hidden" name="step" value="welcome" />
			<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Continue</button>
		</form>
	</div>
	<?php
}

function wrrapd_drivers_render_step_orientation( $app_id ) {
	$err = $GLOBALS['wrrapd_drv_ob_error'] ?? '';
	?>
	<div class="wrrapd-wrapstars-card">
		<h2>Orientation quiz</h2>
		<p class="wrrapd-wrapstars-ob-lead">Answer all three correctly to continue.</p>
		<?php if ( $err ) : ?><div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $err ); ?></div><?php endif; ?>
		<form method="post" class="wrrapd-wrapstars-form">
			<?php wp_nonce_field( 'wrrapd_drv_onboarding', 'wrrapd_drv_nonce' ); ?>
			<input type="hidden" name="wrrapd_drv_action" value="orientation_quiz" />
			<label>How do you load delivery details for a wrapped gift?
				<select name="q1" required>
					<option value="">Select…</option>
					<option value="scan">Scan the box QR in the Driver app</option>
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
			<label>Who wraps the gift before your pickup?
				<select name="q3" required>
					<option value="">Select…</option>
					<option value="wrapstar">A WrapStar (separate from Drivers)</option>
					<option value="me">I wrap it myself as the Driver</option>
					<option value="customer">The customer wraps it</option>
				</select>
			</label>
			<button type="submit" class="wrrapd-wrapstars-btn">Submit quiz</button>
		</form>
	</div>
	<?php
}

function wrrapd_drivers_render_step_insurance( $app_id ) {
	$err = $GLOBALS['wrrapd_drv_ob_error'] ?? '';
	?>
	<div class="wrrapd-wrapstars-card">
		<h2>Vehicle insurance</h2>
		<p class="wrrapd-wrapstars-ob-lead">Upload a certificate of insurance (or declaration page) for the vehicle you will use for deliveries.</p>
		<?php if ( $err ) : ?><div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $err ); ?></div><?php endif; ?>
		<form method="post" enctype="multipart/form-data" class="wrrapd-wrapstars-form">
			<?php wp_nonce_field( 'wrrapd_drv_onboarding', 'wrrapd_drv_nonce' ); ?>
			<input type="hidden" name="wrrapd_drv_action" value="onboarding_step" />
			<input type="hidden" name="step" value="insurance" />
			<label>Insurance file (PDF or image)
				<input type="file" name="insurance_file" accept=".pdf,.jpg,.jpeg,.png" required />
			</label>
			<button type="submit" class="wrrapd-wrapstars-btn">Upload and continue</button>
		</form>
	</div>
	<?php
}

function wrrapd_drivers_render_step_activation( $app_id ) {
	$app_url = wrrapd_drivers_courier_app_url();
	?>
	<div class="wrrapd-wrapstars-card">
		<h2>Final review &amp; Driver app</h2>
		<p class="wrrapd-wrapstars-ob-lead">You have completed onboarding steps. Ops will <strong>Activate</strong> your account in Command Center. After activation, sign in to the Driver app with your name or Driver ID and the contractor passcode provided by Wrrapd.</p>
		<div class="wrrapd-drivers-app-cta">
			<p><strong>Download / open the Driver app</strong></p>
			<p><a class="wrrapd-wrapstars-btn" href="<?php echo esc_url( $app_url ); ?>" target="_blank" rel="noopener">Open Driver Console</a></p>
			<p class="wrrapd-wrapstars-ob-note">App Store / Play Store links and QR codes will appear here when the native shells are published. Until then use the web Driver Console above.</p>
		</div>
		<p class="wrrapd-wrapstars-ob-note">No further action is needed here — watch email from <?php echo esc_html( wrrapd_drivers_from_email_address() ); ?> for activation confirmation.</p>
	</div>
	<?php
}

function wrrapd_drivers_shortcode_landing() {
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-drivers wrrapd-drivers-flex">
		<section class="wrrapd-drivers-hero">
			<div class="wrrapd-drivers-hero__inner">
				<p class="wrrapd-drivers-hero__kicker">Wrrapd Drivers · Florida &amp; Georgia</p>
				<h1>Start earning with Wrrapd Drivers</h1>
				<p class="wrrapd-drivers-hero__lead">If you are 21 or older with an eligible vehicle, a smartphone, and a valid driver license, you can deliver wrapped gifts on your schedule. See offers in the Driver app before you accept.</p>
				<a class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--xl wrrapd-wrapstars-btn--hero" href="<?php echo esc_url( wrrapd_drivers_apply_url( '/driver/driver-apply/' ) ); ?>">Apply to drive</a>
			</div>
		</section>

		<section class="wrrapd-drivers-section">
			<h2>Download the app after you are activated</h2>
			<p>Apply on the web first. After approval and onboarding, ops activates your account — then you sign in to the Driver app to accept delivery offers.</p>
			<div class="wrrapd-drivers-app-cards">
				<div class="wrrapd-drivers-app-card">
					<h3>iPhone</h3>
					<p>Use Safari or the App Store when the Driver app is published. Until then, open the web console on your phone.</p>
					<a class="wrrapd-wrapstars-btn" href="<?php echo esc_url( wrrapd_drivers_courier_app_url() ); ?>">Open Driver Console</a>
				</div>
				<div class="wrrapd-drivers-app-card">
					<h3>Android</h3>
					<p>Use Chrome or Google Play when the Driver app is published. Until then, open the web console on your phone.</p>
					<a class="wrrapd-wrapstars-btn" href="<?php echo esc_url( wrrapd_drivers_courier_app_url() ); ?>">Open Driver Console</a>
				</div>
			</div>
		</section>

		<section class="wrrapd-drivers-section wrrapd-drivers-split">
			<div>
				<h2>What happens after you apply</h2>
				<ol class="wrrapd-drivers-steps">
					<li>Submit your application (about five minutes).</li>
					<li>We review within about seven days — we may schedule a brief interview.</li>
					<li>If approved, complete Driver onboarding (agreements, insurance, tax).</li>
					<li>Ops activates you — then download the app and start delivering.</li>
				</ol>
				<p><a href="<?php echo esc_url( wrrapd_drivers_apply_url( '/apply/' ) ); ?>">Looking for WrapStars gift-wrapping instead?</a></p>
			</div>
			<div>
				<h2>FAQ</h2>
				<details class="wrrapd-wrapstars-faq-dd__item"><summary>What is involved in onboarding?</summary><p>Agreements, orientation quiz, background check authorization, vehicle insurance upload, identity confirmation, W-9 / tax acknowledgments, and bank setup. Ops activates you when steps are complete.</p></details>
				<details class="wrrapd-wrapstars-faq-dd__item"><summary>What is a delivery offer?</summary><p>An offer in the Driver app to pick up a wrapped gift from a WrapStar and deliver it to the recipient. You see details before you accept.</p></details>
				<details class="wrrapd-wrapstars-faq-dd__item"><summary>Do I wrap the gifts?</summary><p>No. WrapStars wrap; Drivers deliver. You scan the box QR for final-mile details.</p></details>
				<details class="wrrapd-wrapstars-faq-dd__item"><summary>Where is this available?</summary><p>Launching in Florida and Georgia. Other states may be limited at first.</p></details>
			</div>
		</section>

		<section class="wrrapd-drivers-check">
			<div>
				<h2>Check requirements</h2>
				<p>Confirm a few basics — age, license, vehicle, and smartphone — then start your application.</p>
				<a class="wrrapd-wrapstars-btn" href="<?php echo esc_url( wrrapd_drivers_apply_url( '/driver/driver-apply/' ) ); ?>">Check requirements &amp; apply</a>
			</div>
		</section>
	</div>
	<?php
	return ob_get_clean();
}

function wrrapd_drivers_shortcode_thankyou() {
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-drivers">
		<section class="wrrapd-wrapstars-dasher-apply-head">
			<p class="wrrapd-wrapstars-dasher-kicker">Application received</p>
			<h1>Thank you for applying</h1>
			<p class="wrrapd-wrapstars-dasher-lead">We have received your Driver application. We will be in touch within about <strong>7 days</strong>. Watch for email from <strong><?php echo esc_html( wrrapd_drivers_from_email_address() ); ?></strong>.</p>
		</section>
		<div class="wrrapd-wrapstars-card">
			<ul>
				<li>Your application is <strong>under review</strong>.</li>
				<li>We may contact you for a brief interview.</li>
				<li>If approved, you will receive login credentials for Driver onboarding.</li>
			</ul>
			<p><a href="<?php echo esc_url( wrrapd_drivers_apply_url( '/driver/' ) ); ?>">Back to Drivers</a>
			· <a href="<?php echo esc_url( wrrapd_drivers_apply_url( '/' ) ); ?>">WrapStar applications</a></p>
		</div>
	</div>
	<?php
	return ob_get_clean();
}

function wrrapd_drivers_shortcode_login() {
	$err   = $GLOBALS['wrrapd_drv_login_error'] ?? '';
	$greet = isset( $_GET['greet'] ) ? sanitize_text_field( wp_unslash( $_GET['greet'] ) ) : '';
	$redir = isset( $_GET['redirect_to'] ) ? esc_url_raw( wp_unslash( $_GET['redirect_to'] ) ) : wrrapd_drivers_pros_url( '/driver-onboarding/' );
	$expired = isset( $_GET['invite_expired'] );
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-drivers">
		<div class="wrrapd-wrapstars-card wrrapd-wrapstars-login">
			<h1>Driver portal login</h1>
			<?php if ( $greet ) : ?><p>Welcome, <?php echo esc_html( $greet ); ?>.</p><?php endif; ?>
			<?php if ( $expired ) : ?><div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err">Your invitation expired. Contact us to resend.</div><?php endif; ?>
			<?php if ( $err ) : ?><div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $err ); ?></div><?php endif; ?>
			<form method="post" class="wrrapd-wrapstars-form">
				<?php wp_nonce_field( 'wrrapd_drv_login', 'wrrapd_drv_nonce' ); ?>
				<input type="hidden" name="wrrapd_drv_action" value="portal_login" />
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

function wrrapd_drivers_shortcode_decline() {
	$app_id = isset( $_GET['app'] ) ? (int) $_GET['app'] : 0;
	$token  = isset( $_GET['token'] ) ? sanitize_text_field( wp_unslash( $_GET['token'] ) ) : '';
	$result = $GLOBALS['wrrapd_drv_decline_result'] ?? null;
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-drivers">
		<div class="wrrapd-wrapstars-card">
			<h1>Decline Driver offer</h1>
			<?php if ( is_array( $result ) && ! empty( $result['ok'] ) ) : ?>
				<p>Your invitation has been declined. Thank you for letting us know.</p>
			<?php elseif ( is_array( $result ) && empty( $result['ok'] ) ) : ?>
				<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $result['error'] ?? 'Could not decline.' ); ?></div>
			<?php else : ?>
				<p>If you have decided not to join as a Driver, you may decline below. No login required.</p>
				<form method="post" class="wrrapd-wrapstars-form">
					<?php wp_nonce_field( 'wrrapd_drv_decline', 'wrrapd_drv_nonce' ); ?>
					<input type="hidden" name="wrrapd_drv_action" value="decline_offer" />
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

function wrrapd_drivers_shortcode_onboarding( $atts ) {
	$atts = shortcode_atts( array( 'step' => '' ), $atts, 'wrrapd_driver_onboarding' );
	if ( ! is_user_logged_in() || ! wrrapd_drivers_is_onboarding_eligible_user( get_current_user_id() ) ) {
		return '<p class="wrrapd-wrapstars-alert">Please <a href="' . esc_url( wrrapd_drivers_portal_login_url() ) . '">log in</a>.</p>';
	}
	if ( wrrapd_drivers_user_must_change_password( get_current_user_id() ) ) {
		return wrrapd_drivers_render_change_password_gate();
	}
	$app = wrrapd_drivers_get_application_by_user( get_current_user_id() );
	if ( ! $app || (string) wrrapd_drivers_get_meta( $app->ID, 'status' ) !== 'approved' ) {
		$status = $app ? wrrapd_drivers_get_meta( $app->ID, 'status' ) : '';
		if ( $status === 'active' ) {
			return '<div class="wrrapd-wrapstars-card"><p>Your Driver account is active. <a href="' . esc_url( wrrapd_drivers_courier_app_url() ) . '">Open the Driver app</a>.</p></div>';
		}
		return '<p class="wrrapd-wrapstars-alert">Onboarding is available after approval.</p>';
	}
	$step = sanitize_text_field( (string) $atts['step'] );
	if ( $step === '' ) {
		$step = wrrapd_drivers_detect_onboarding_step_from_uri();
	}
	if ( ! wrrapd_drivers_can_access_step( $app->ID, $step ) ) {
		$steps = array_keys( wrrapd_drivers_onboarding_steps() );
		foreach ( $steps as $s ) {
			if ( ! wrrapd_drivers_step_complete( $app->ID, $s ) ) {
				wp_safe_redirect( wrrapd_drivers_onboarding_step_url( $s ) );
				exit;
			}
		}
	}
	$labels = wrrapd_drivers_onboarding_steps();
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-drivers wrrapd-wrapstars-onboarding">
		<aside class="wrrapd-wrapstars-ob-nav">
			<p class="wrrapd-wrapstars-ob-nav__title">Driver onboarding</p>
			<ol>
				<?php foreach ( $labels as $key => $label ) : ?>
					<li class="<?php echo wrrapd_drivers_step_complete( $app->ID, $key ) ? 'is-done' : ( $key === $step ? 'is-current' : '' ); ?>">
						<a href="<?php echo esc_url( wrrapd_drivers_onboarding_step_url( $key ) ); ?>"><?php echo esc_html( $label ); ?></a>
					</li>
				<?php endforeach; ?>
			</ol>
		</aside>
		<main class="wrrapd-wrapstars-ob-main">
			<?php
			if ( $step === 'welcome' ) {
				wrrapd_drivers_render_step_welcome( $app->ID );
			} elseif ( $step === 'orientation' ) {
				wrrapd_drivers_render_step_orientation( $app->ID );
			} elseif ( $step === 'insurance' ) {
				wrrapd_drivers_render_step_insurance( $app->ID );
			} elseif ( $step === 'activation' ) {
				wrrapd_drivers_render_step_activation( $app->ID );
			} else {
				wrrapd_drivers_render_step_placeholder( $app->ID, $step );
			}
			?>
		</main>
	</div>
	<?php
	return ob_get_clean();
}

function wrrapd_drivers_admin_menu() {
	add_menu_page(
		'Drivers',
		'Drivers',
		'manage_options',
		'wrrapd-drivers',
		'wrrapd_drivers_admin_page',
		'dashicons-car',
		27
	);
}

function wrrapd_drivers_admin_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$posts = get_posts(
		array(
			'post_type'      => WRRAPD_DRIVERS_CPT,
			'posts_per_page' => 50,
			'post_status'    => 'publish',
			'orderby'        => 'date',
			'order'          => 'DESC',
		)
	);
	echo '<div class="wrap"><h1>Driver Applications</h1>';
	echo '<p>Day-to-day hiring: Command Center → Applications (Driver filter). Portal: <strong>apply.wrrapd.com/driver/</strong> · onboarding <strong>pros.wrrapd.com/driver-onboarding/</strong></p>';
	echo '<table class="widefat striped"><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Status</th><th>Submitted</th></tr></thead><tbody>';
	foreach ( $posts as $p ) {
		echo '<tr><td>' . (int) $p->ID . '</td><td>' . esc_html( wrrapd_drivers_get_meta( $p->ID, 'full_name' ) ) . '</td><td>' . esc_html( wrrapd_drivers_get_meta( $p->ID, 'email' ) ) . '</td><td>' . esc_html( wrrapd_drivers_get_meta( $p->ID, 'status' ) ) . '</td><td>' . esc_html( wrrapd_drivers_get_meta( $p->ID, 'submitted_at' ) ) . '</td></tr>';
	}
	echo '</tbody></table></div>';
}
