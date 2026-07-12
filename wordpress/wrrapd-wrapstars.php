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

define( 'WRRAPD_WRAPSTARS_BUILD', '2026-07-11-wrapstars-apply-wizard-v24' );

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

/** Onboarding step keys in order. */
function wrrapd_wrapstars_onboarding_steps() {
	return array(
		'welcome'     => 'Welcome & Overview',
		'agreement'   => 'Independent Contractor Agreement',
		'insurance'   => 'Proof of Insurance',
		'orientation' => 'Orientation & Quiz',
		'po_box'      => 'PO Box / Mailing Address',
		'w9'          => 'W-9 Tax Form',
		'activation'  => 'Final Review',
	);
}

// --- Bootstrap ---

add_action( 'init', 'wrrapd_wrapstars_register_cpt' );
add_action( 'init', 'wrrapd_wrapstars_register_roles' );
add_action( 'init', 'wrrapd_wrapstars_maybe_handle_posts', 5 );
add_action( 'admin_menu', 'wrrapd_wrapstars_admin_menu' );
add_action( 'wp_enqueue_scripts', 'wrrapd_wrapstars_enqueue_assets' );
add_action( 'wp_head', 'wrrapd_wrapstars_output_favicon', 3 );
add_action( 'wp_body_open', 'wrrapd_wrapstars_output_portal_header', 5 );
add_action( 'wp_footer', 'wrrapd_wrapstars_footer_once', 100 );
add_action( 'wp_footer', 'wrrapd_wrapstars_output_landing_scripts', 120 );
add_action( 'template_redirect', 'wrrapd_wrapstars_host_routing', 1 );
add_action( 'init', 'wrrapd_wrapstars_block_wp_login_on_portal', 1 );
add_action( 'admin_init', 'wrrapd_wrapstars_block_wrapstar_wp_admin' );
add_filter( 'login_redirect', 'wrrapd_wrapstars_login_redirect', 10, 3 );
add_filter( 'body_class', 'wrrapd_wrapstars_body_class' );

add_shortcode( 'wrrapd_wrapstar_landing', 'wrrapd_wrapstars_shortcode_landing' );
add_shortcode( 'wrrapd_wrapstar_apply', 'wrrapd_wrapstars_shortcode_apply' );
add_shortcode( 'wrrapd_wrapstar_thankyou', 'wrrapd_wrapstars_shortcode_thankyou' );
add_shortcode( 'wrrapd_wrapstar_status', 'wrrapd_wrapstars_shortcode_status' );
add_shortcode( 'wrrapd_wrapstar_login', 'wrrapd_wrapstars_shortcode_login' );
add_shortcode( 'wrrapd_wrapstar_onboarding', 'wrrapd_wrapstars_shortcode_onboarding' );
add_shortcode( 'wrrapd_wrapstar_sign', 'wrrapd_wrapstars_shortcode_sign' );
add_shortcode( 'wrrapd_wrapstar_profile', 'wrrapd_wrapstars_shortcode_profile' );

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
function wrrapd_wrapstars_portal_login_url( $redirect = '' ) {
	$url = wrrapd_wrapstars_apply_url( '/wrapstar-login/' );
	if ( $redirect !== '' ) {
		$url = add_query_arg( 'redirect_to', rawurlencode( $redirect ), $url );
	}
	return $url;
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
	if ( in_array( $action, array( 'logout', 'postpass' ), true ) ) {
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

function wrrapd_wrapstars_admin_notify_email() {
	if ( defined( 'WRRAPD_WRAPSTARS_ADMIN_EMAIL' ) && WRRAPD_WRAPSTARS_ADMIN_EMAIL !== '' ) {
		return (string) WRRAPD_WRAPSTARS_ADMIN_EMAIL;
	}
	return 'admin@wrrapd.com';
}

function wrrapd_wrapstars_block_wrapstar_wp_admin() {
	if ( wp_doing_ajax() || ! is_user_logged_in() || current_user_can( 'manage_options' ) ) {
		return;
	}
	if ( wrrapd_wrapstars_is_wrapstar_user( get_current_user_id() ) ) {
		wp_safe_redirect( wrrapd_wrapstars_portal_redirect_for_user( get_current_user_id() ) );
		exit;
	}
}

function wrrapd_wrapstars_login_redirect( $redirect_to, $requested_redirect_to, $user ) {
	if ( is_wp_error( $user ) || ! $user instanceof WP_User ) {
		return $redirect_to;
	}
	if ( user_can( $user, 'manage_options' ) ) {
		return $redirect_to;
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
	$paths = array(
		'welcome'     => '/onboarding/',
		'agreement'   => '/onboarding/agreement/',
		'insurance'   => '/onboarding/insurance/',
		'orientation' => '/onboarding/orientation/',
		'po_box'      => '/onboarding/po-box/',
		'w9'          => '/onboarding/w-9/',
		'activation'  => '/onboarding/activation/',
	);
	$path = $paths[ $step ] ?? '/onboarding/';
	return wrrapd_wrapstars_pros_url( $path );
}

// --- Roles ---

function wrrapd_wrapstars_register_roles() {
	if ( get_role( 'wrapstar_applicant' ) ) {
		return;
	}
	add_role( 'wrapstar_applicant', 'WrapStar Applicant', array( 'read' => true ) );
	add_role( 'wrapstar_approved', 'WrapStar Approved', array( 'read' => true ) );
	add_role( 'wrapstar_active', 'WrapStar Active', array( 'read' => true ) );
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
		'onboarding_step'     => 'welcome',
		'step_welcome'        => '',
		'step_agreement'      => '',
		'step_insurance'      => '',
		'step_orientation'    => '',
		'step_po_box'         => '',
		'step_w9'             => '',
		'step_activation'     => '',
		'boldsign_ic_doc_id'  => '',
		'boldsign_w9_doc_id'  => '',
		'boldsign_ic_signed'  => '',
		'boldsign_w9_signed'  => '',
		'insurance_file'      => '',
		'po_box_address'      => '',
		'po_box_file'         => '',
		'orientation_score'   => '',
		'submitted_at'        => '',
		'interview_at'        => '',
		'approved_at'         => '',
		'activated_at'        => '',
		'rejected_at'         => '',
		'reject_reason'       => '',
	);
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
	$val = wrrapd_wrapstars_get_meta( $post_id, 'step_' . $step );
	return $val === '1' || $val === 1;
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
		}
		if ( preg_match( '#^/(wrapstar-login|login)(/|$)#', $path ) ) {
			if ( is_user_logged_in() && wrrapd_wrapstars_is_onboarding_eligible_user( get_current_user_id() ) ) {
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
		if ( preg_match( '#^/(apply|dashboard|thank-you)(/|$)#', $path ) ) {
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
		}
	}
}

function wrrapd_wrapstars_body_class( $classes ) {
	$classes[] = 'wrrapd-wrapstars-portal';
	if ( wrrapd_wrapstars_is_apply_host() ) {
		$classes[] = 'wrrapd-wrapstars-apply-host';
	}
	if ( wrrapd_wrapstars_is_pros_host() ) {
		$classes[] = 'wrrapd-wrapstars-pros-host';
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

function wrrapd_wrapstars_enqueue_assets() {
	$css = dirname( __FILE__ ) . '/wrrapd-wrapstars.css';
	if ( is_readable( $css ) ) {
		wp_enqueue_style( 'wrrapd-wrapstars', content_url( 'mu-plugins/wrrapd-wrapstars.css' ), array(), WRRAPD_WRAPSTARS_BUILD );
	}
	wp_enqueue_style( 'wrrapd-wrapstars-fonts', 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560&family=Roboto:wght@400;700&family=Source+Sans+3:wght@400;600;700;800&display=swap', array(), null );

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
		document.querySelectorAll('.wrrapd-wrapstars-pay__tabs').forEach(function (tablist) {
			var tabs = tablist.querySelectorAll('[role="tab"]');
			var root = tablist.closest('.wrrapd-wrapstars-pay');
			if (!root) return;
			var panels = root.querySelectorAll('[role="tabpanel"]');
			tabs.forEach(function (tab) {
				tab.addEventListener('click', function () {
					var id = tab.getAttribute('data-pay-tab');
					tabs.forEach(function (t) {
						var on = t === tab;
						t.setAttribute('aria-selected', on ? 'true' : 'false');
						t.classList.toggle('is-active', on);
					});
					panels.forEach(function (panel) {
						var show = panel.getAttribute('data-pay-panel') === id;
						panel.hidden = !show;
						panel.classList.toggle('is-active', show);
					});
				});
			});
		});
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

	if ( ! wrrapd_wrapstars_is_onboarding_eligible_user( $user->ID ) ) {
		wp_logout();
		$GLOBALS['wrrapd_ws_login_error'] = 'Login is only available after your application is approved. Check your email for next steps.';
		return;
	}

	if ( $redirect !== '' && strpos( $redirect, wrrapd_wrapstars_apply_host() ) !== false ) {
		wp_safe_redirect( $redirect );
		exit;
	}

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

	$step = sanitize_text_field( wp_unslash( $_POST['step'] ?? '' ) );
	$app  = wrrapd_wrapstars_get_application_by_user( get_current_user_id() );
	if ( ! $app || ! wrrapd_wrapstars_can_access_step( $app->ID, $step ) ) {
		return;
	}

	if ( $step === 'welcome' ) {
		wrrapd_wrapstars_mark_step_complete( $app->ID, 'welcome' );
		wp_safe_redirect( wrrapd_wrapstars_pros_url( '/onboarding/agreement/' ) );
		exit;
	}

	if ( $step === 'insurance' ) {
		$upload = wrrapd_wrapstars_handle_upload( $app->ID, 'insurance_coi' );
		if ( ! $upload['ok'] ) {
			$GLOBALS['wrrapd_ws_onboarding_error'] = $upload['error'];
			return;
		}
		wrrapd_wrapstars_set_meta( $app->ID, 'insurance_file', $upload['path'] );
		wrrapd_wrapstars_mark_step_complete( $app->ID, 'insurance' );
		wp_safe_redirect( wrrapd_wrapstars_pros_url( '/onboarding/orientation/' ) );
		exit;
	}

	if ( $step === 'po_box' ) {
		$po = sanitize_textarea_field( wp_unslash( $_POST['po_box_address'] ?? '' ) );
		if ( $po === '' ) {
			$GLOBALS['wrrapd_ws_onboarding_error'] = 'PO Box / mailing address is required.';
			return;
		}
		$upload = wrrapd_wrapstars_handle_upload( $app->ID, 'po_box_proof' );
		if ( ! $upload['ok'] ) {
			$GLOBALS['wrrapd_ws_onboarding_error'] = $upload['error'];
			return;
		}
		wrrapd_wrapstars_set_meta( $app->ID, 'po_box_address', $po );
		wrrapd_wrapstars_set_meta( $app->ID, 'po_box_file', $upload['path'] );
		wrrapd_wrapstars_mark_step_complete( $app->ID, 'po_box' );
		wp_safe_redirect( wrrapd_wrapstars_pros_url( '/onboarding/w-9/' ) );
		exit;
	}
}

function wrrapd_wrapstars_orientation_questions() {
	return array(
		array(
			'q' => 'What video proof is required on every order?',
			'a' => 'unboxing_wrap_handoff',
			'choices' => array(
				'unboxing_wrap_handoff' => 'Unboxing, wrapping, and outbound carrier handoff',
				'photo_only'            => 'One photo only',
				'optional'              => 'Video is optional',
			),
		),
		array(
			'q' => 'What insurance must WrapStars carry before activation?',
			'a' => 'gl_inland',
			'choices' => array(
				'gl_only'    => 'General liability only',
				'gl_inland'  => '$1M+ general liability AND inland marine / bailee coverage',
				'none'       => 'No insurance required',
			),
		),
		array(
			'q' => 'Who is responsible for loss, theft, or damage to customer goods in your possession?',
			'a' => 'wrapstar',
			'choices' => array(
				'wrrapd'    => 'Wrrapd only',
				'wrapstar'  => 'The WrapStar (you), per the IC agreement',
				'customer'  => 'The customer',
			),
		),
		array(
			'q' => 'New WrapStars typically start with which orders?',
			'a' => 'low_value',
			'choices' => array(
				'high_value' => 'Highest-value orders first',
				'low_value'  => 'Lower-value orders until performance is proven',
				'all'        => 'All orders equally from day one',
			),
		),
		array(
			'q' => 'What happens if you miss required video proof on an order?',
			'a' => 'deactivation_risk',
			'choices' => array(
				'nothing'           => 'Nothing',
				'warning_only'      => 'Warning only, no consequences',
				'deactivation_risk' => 'Risk of suspension or deactivation',
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
	wp_safe_redirect( wrrapd_wrapstars_pros_url( '/onboarding/po-box/' ) );
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

function wrrapd_wrapstars_send_email( $to, $subject, $body ) {
	$headers = array( 'Content-Type: text/plain; charset=UTF-8' );
	$from    = wrrapd_wrapstars_from_email_address();
	$headers[] = 'From: WrapStars <' . $from . '>';
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
 * @return array{user_id:int,password:string}|WP_Error
 */
function wrrapd_wrapstars_provision_approved_user( $app_id ) {
	$email = strtolower( (string) wrrapd_wrapstars_get_meta( $app_id, 'email' ) );
	$name  = (string) wrrapd_wrapstars_get_meta( $app_id, 'full_name' );
	if ( ! is_email( $email ) ) {
		return new WP_Error( 'invalid_email', 'Application email missing.' );
	}

	$password = wp_generate_password( 14, true, false );
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

	wp_update_user(
		array(
			'ID'           => $user_id,
			'display_name' => $name,
			'first_name'   => strtok( $name, ' ' ),
		)
	);
	wrrapd_wrapstars_set_meta( $app_id, 'user_id', $user_id );
	wrrapd_wrapstars_set_user_role( $user_id, 'wrapstar_approved' );
	wrrapd_wrapstars_set_meta( $app_id, 'portal_password_issued_at', gmdate( 'c' ) );

	return array(
		'user_id'  => $user_id,
		'password' => $password,
	);
}

function wrrapd_wrapstars_send_approval_credentials_email( $app_id, $password ) {
	$email = wrrapd_wrapstars_get_meta( $app_id, 'email' );
	$name  = wrrapd_wrapstars_get_meta( $app_id, 'full_name' );
	$login = wrrapd_wrapstars_portal_login_url( wrrapd_wrapstars_pros_url( '/onboarding/' ) );

	$body  = "Hi {$name},\n\n";
	$body .= "Congratulations — you've been approved as a WrapStar!\n\n";
	$body .= "Log in to begin onboarding:\n{$login}\n\n";
	$body .= "Username: {$email}\n";
	$body .= "Temporary password: {$password}\n\n";
	$body .= "You'll complete agreements, insurance, orientation, PO Box setup, W-9, and more.\n\n";
	$body .= "— WrapStars Team\n";

	wrrapd_wrapstars_send_email( $email, 'Approved — your WrapStar login credentials', $body );
}

function wrrapd_wrapstars_output_theme_cleanup_css() {
	if ( is_admin() ) {
		return;
	}
	echo '<style id="wrrapd-wrapstars-theme-cleanup">';
	echo 'body.wrrapd-wrapstars-portal header.wp-block-template-part,body.wrrapd-wrapstars-portal footer.wp-block-template-part{display:none!important;height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .wp-block-site-title,body.wrrapd-wrapstars-portal nav.wp-block-navigation,body.wrrapd-wrapstars-portal .wp-block-post-title,body.wrrapd-wrapstars-portal .entry-header,body.wrrapd-wrapstars-portal h1.wp-block-post-title{display:none!important;height:0!important;margin:0!important;padding:0!important;}';
	echo 'body.wrrapd-wrapstars-portal,body.wrrapd-wrapstars-portal .wp-site-blocks,body.wrrapd-wrapstars-portal article,body.wrrapd-wrapstars-portal .type-page{padding:0!important;margin:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .wp-site-blocks{padding-top:0!important;margin-top:0!important;gap:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .wp-site-blocks>*{margin-block-start:0!important;margin-block-end:0!important;}';
	echo 'body.wrrapd-wrapstars-portal main.wp-block-group,body.wrrapd-wrapstars-portal main.wp-block-group>.wp-block-group,body.wrrapd-wrapstars-portal .entry-content,body.wrrapd-wrapstars-portal .wp-block-post-content{margin:0!important;padding:0!important;max-width:none!important;padding-block:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .has-global-padding,body.wrrapd-wrapstars-portal .wp-block-group.has-global-padding{padding:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .is-layout-flow>*+*,body.wrrapd-wrapstars-portal .is-layout-constrained>*+*{margin-block-start:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .wp-block-group__inner-container{padding:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .is-layout-constrained > :where(:not(.alignleft):not(.alignright):not(.alignfull)){max-width:none!important;margin-inline:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .entry-content > *:first-child,body.wrrapd-wrapstars-portal .wp-block-post-content > *:first-child{margin-top:0!important;padding-top:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .elementor,body.wrrapd-wrapstars-portal .elementor .e-con,body.wrrapd-wrapstars-portal .elementor .e-con-inner,body.wrrapd-wrapstars-portal .elementor-shortcode,body.wrrapd-wrapstars-portal .elementor-widget-shortcode{margin:0!important;padding:0!important;max-width:none!important;width:100%!important;background:transparent!important;overflow:visible!important;}';
	echo 'body.wrrapd-wrapstars-portal .entry-content .wrrapd-wrapstars-site-footer{display:none!important;}';
	echo 'body.wrrapd-wrapstars-portal .wrrapd-wrapstars-dasher{padding-top:0!important;margin-top:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .wrrapd-wrapstars-site-header+.wp-site-blocks,body.wrrapd-wrapstars-portal .wrrapd-wrapstars-site-header~.wp-site-blocks{margin-top:0!important;padding-top:0!important;}';
	echo 'body.wrrapd-wrapstars-portal .site,body.wrrapd-wrapstars-portal #page{margin:0!important;padding:0!important;}';
	echo '</style>';
}
add_action( 'wp_head', 'wrrapd_wrapstars_output_theme_cleanup_css', 98 );

function wrrapd_wrapstars_shortcode_landing() {
	$video = wrrapd_wrapstars_hero_video_url();
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
				<p class="wrrapd-wrapstars-cinema-hero__kicker">Now accepting applications · Florida &amp; Georgia</p>
				<h1>Become a WrapStar today!</h1>
				<p class="wrrapd-wrapstars-cinema-hero__tagline">Deliver smiles and get paid.</p>
				<p class="wrrapd-wrapstars-cinema-hero__sub">Independent gift-wrapping for people who care about presentation, reliability, and the joy of a beautifully wrapped surprise.</p>
				<a class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--xl wrrapd-wrapstars-btn--hero" href="<?php echo esc_url( wrrapd_wrapstars_apply_url( '/apply/' ) ); ?>">Start your application</a>
			</div>
		</section>

		<div class="wrrapd-wrapstars-dasher-body">
			<section class="wrrapd-wrapstars-dasher-band">
				<div class="wrrapd-wrapstars-dasher-band__item wrrapd-wrapstars-dasher-box">
					<h2>Craft the moment</h2>
					<p>Every package is someone's surprise. Wrap with care, pride, and an eye for detail that turns delivery into delight.</p>
				</div>
				<div class="wrrapd-wrapstars-dasher-band__item wrrapd-wrapstars-dasher-box">
					<h2>Hit your deadlines</h2>
					<p>Wrapped gifts must be completed and delivered the same day or by the next day at the latest. Speed and reliability are essential.</p>
				</div>
				<div class="wrrapd-wrapstars-dasher-band__item wrrapd-wrapstars-dasher-box">
					<h2>Join a trusted network</h2>
					<p>Video proof on every order, insurance standards, and a brand built on making unwrapping unforgettable.</p>
				</div>
			</section>

			<section class="wrrapd-wrapstars-pay">
				<h2 class="wrrapd-wrapstars-section-title">How does WrapStar pay work?</h2>
				<p class="wrrapd-wrapstars-pay__lead">We built a pay model designed to be fair and transparent for independent gift-wrappers. You see what you will earn before you accept an order — base pay, peak bonuses when demand surges, and any customer tips on top.</p>
				<div class="wrrapd-wrapstars-pay__tabs" role="tablist" aria-label="WrapStar pay topics">
					<button type="button" class="wrrapd-wrapstars-pay__tab is-active" role="tab" aria-selected="true" data-pay-tab="base" id="pay-tab-base" aria-controls="pay-panel-base">Base Pay</button>
					<button type="button" class="wrrapd-wrapstars-pay__tab" role="tab" aria-selected="false" data-pay-tab="peak" id="pay-tab-peak" aria-controls="pay-panel-peak">Peak Periods</button>
					<button type="button" class="wrrapd-wrapstars-pay__tab" role="tab" aria-selected="false" data-pay-tab="tips" id="pay-tab-tips" aria-controls="pay-panel-tips">Tips</button>
				</div>
				<div class="wrrapd-wrapstars-pay__panels">
					<div class="wrrapd-wrapstars-pay__panel is-active" role="tabpanel" id="pay-panel-base" data-pay-panel="base" aria-labelledby="pay-tab-base">
						<p><strong>Base pay</strong> is your guaranteed earnings for each completed wrap order. Before you accept, you will see the payout for that job — including pick-up, professional wrapping, video proof, and delivery or handoff within the required window (same day or next day).</p>
						<p>Pay reflects the size of the order, materials involved, and delivery timing. You are always an independent contractor, not an employee.</p>
					</div>
					<div class="wrrapd-wrapstars-pay__panel" role="tabpanel" id="pay-panel-peak" data-pay-panel="peak" aria-labelledby="pay-tab-peak" hidden>
						<p><strong>Peak periods</strong> are busy gift seasons when demand spikes — Christmas, Valentine's Day, Mother's Day, graduation season, and other holidays when customers need wrapping fast.</p>
						<p>During these surges, WrapStars may earn <strong>peak pay bonuses</strong> on top of base pay. Accept orders you can complete on time; turnaround stays same day or next day even when volume is high.</p>
					</div>
					<div class="wrrapd-wrapstars-pay__panel" role="tabpanel" id="pay-panel-tips" data-pay-panel="tips" aria-labelledby="pay-tab-tips" hidden>
						<p><strong>Tips</strong> are optional amounts customers may add when they love the presentation and service. Tips belong to you and are paid on top of base pay and any peak bonuses.</p>
						<p>Great craftsmanship, clear communication, and on-time delivery are what earn repeat customers and generous tips.</p>
					</div>
				</div>
			</section>

			<section class="wrrapd-wrapstars-reqs-dd">
				<h2 class="wrrapd-wrapstars-section-title">Requirements</h2>
				<div class="wrrapd-wrapstars-reqs-dd__grid">
					<div class="wrrapd-wrapstars-reqs-dd__item">
						<span class="wrrapd-wrapstars-reqs-dd__num" aria-hidden="true">1</span>
						<h3>Age</h3>
						<p>WrapStars must be <strong>19 years or older</strong>.</p>
						<p class="wrrapd-wrapstars-reqs-dd__note">Launching in <strong>Florida</strong> and <strong>Georgia</strong> first — applicants in other states are welcome; service may be limited initially.</p>
					</div>
					<div class="wrrapd-wrapstars-reqs-dd__item">
						<span class="wrrapd-wrapstars-reqs-dd__num" aria-hidden="true">2</span>
						<h3>Equipment</h3>
						<p>A smartphone for video proof, quality wrapping supplies, and a clean workspace to wrap professionally.</p>
					</div>
					<div class="wrrapd-wrapstars-reqs-dd__item">
						<span class="wrrapd-wrapstars-reqs-dd__num" aria-hidden="true">3</span>
						<h3>Documentation</h3>
						<p>Government-issued photo ID at application. After approval, you'll complete onboarding — including liability and inland marine insurance — before your first paid orders.</p>
					</div>
				</div>
			</section>

			<section class="wrrapd-wrapstars-faq-dd">
				<h2 class="wrrapd-wrapstars-section-title">Frequently asked questions</h2>
				<details class="wrrapd-wrapstars-faq-dd__item">
					<summary>How does wrapping with WrapStars work?</summary>
					<p>Customers place gift-wrap orders through Wrrapd. When an order is available in your area, you see the payout and deadline before accepting. You pick up items, wrap them to brand standards, record video proof, and deliver or hand off — all within the same-day or next-day window.</p>
				</details>
				<details class="wrrapd-wrapstars-faq-dd__item">
					<summary>Where is WrapStars available?</summary>
					<p>We are launching in <strong>Florida</strong> and <strong>Georgia</strong>. Applicants in other states are welcome — service may be limited at first as the network grows.</p>
				</details>
				<details class="wrrapd-wrapstars-faq-dd__item">
					<summary>How long does it take to start?</summary>
					<p>The application takes about four minutes. We review submissions within about seven days and may invite you to a brief interview. After approval, you will complete onboarding — agreements, insurance, orientation, and tax forms — before receiving your first orders.</p>
				</details>
				<details class="wrrapd-wrapstars-faq-dd__item">
					<summary>What materials do I need to be a WrapStar?</summary>
					<p>A smartphone, quality wrapping paper and supplies, scissors, tape, and space to work neatly. During onboarding we walk you through Wrrapd presentation standards and video-proof requirements.</p>
				</details>
				<details class="wrrapd-wrapstars-faq-dd__item">
					<summary>How fast do I need to complete an order?</summary>
					<p>Every order must be wrapped and delivered the <strong>same day</strong> or by the <strong>next day at the latest</strong>. This is not optional — customers are counting on you for timely surprises.</p>
				</details>
				<details class="wrrapd-wrapstars-faq-dd__item">
					<summary>When will I hear back about my application?</summary>
					<p>Within about seven days. Updates come from admin@wrrapd.com — we may invite you to a Zoom or phone conversation before a final decision.</p>
				</details>
				<details class="wrrapd-wrapstars-faq-dd__item">
					<summary>Is gift-wrapping experience required?</summary>
					<p>Not necessarily. We look for reliability, presentation, and professionalism — the qualities that make every unwrap feel special. A neat sample or portfolio can help, but attitude and follow-through matter most.</p>
				</details>
				<details class="wrrapd-wrapstars-faq-dd__item">
					<summary>When do I receive login access?</summary>
					<p>After approval only. Your credentials and onboarding link arrive by email from admin@wrrapd.com. There is no login while your application is under review.</p>
				</details>
			</section>

			<section class="wrrapd-wrapstars-dasher-cta wrrapd-wrapstars-dasher-box wrrapd-wrapstars-dasher-box--wide">
				<h2>Become a WrapStar today!</h2>
				<p>Deliver smiles and get paid. Have your driver license or passport ready — the application takes about five minutes.</p>
				<a class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--xl" href="<?php echo esc_url( wrrapd_wrapstars_apply_url( '/apply/' ) ); ?>">Apply now</a>
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
			<p><a class="wrrapd-wrapstars-btn" href="<?php echo esc_url( wrrapd_wrapstars_apply_url( '/' ) ); ?>">Back to home</a></p>
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

	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapstars-dasher">
		<section class="wrrapd-wrapstars-dasher-apply-head">
			<p class="wrrapd-wrapstars-dasher-kicker">Approved WrapStars only</p>
			<h1>Log in to onboarding</h1>
			<p class="wrrapd-wrapstars-dasher-lead">Use the email and temporary password from your approval email. This page is not for applicants still under review.</p>
		</section>
		<?php if ( $error ) : ?>
			<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $error ); ?></div>
		<?php endif; ?>
		<form class="wrrapd-wrapstars-form wrrapd-wrapstars-card" method="post" action="">
			<?php wp_nonce_field( 'wrrapd_ws_login', 'wrrapd_ws_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="portal_login" />
			<?php if ( $redirect !== '' ) : ?>
				<input type="hidden" name="redirect_to" value="<?php echo esc_attr( $redirect ); ?>" />
			<?php endif; ?>
			<label>Email address <input type="email" name="email" required autocomplete="username" /></label>
			<label>Password <input type="password" name="password" required autocomplete="current-password" /></label>
			<label class="ws-check"><input type="checkbox" name="remember" value="1" /> <span>Keep me logged in</span></label>
			<button type="submit" class="wrrapd-wrapstars-btn">Log in</button>
		</form>
		<p class="wrrapd-wrapstars-form-foot">Not approved yet? <a href="<?php echo esc_url( wrrapd_wrapstars_apply_url( '/apply/' ) ); ?>">Apply to become a WrapStar</a></p>
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

	$atts = shortcode_atts( array( 'step' => '' ), $atts, 'wrrapd_wrapstar_onboarding' );
	$step = $atts['step'] !== '' ? $atts['step'] : wrrapd_wrapstars_detect_onboarding_step_from_uri();

	$app = wrrapd_wrapstars_get_application_by_user( get_current_user_id() );
	if ( ! $app || wrrapd_wrapstars_get_meta( $app->ID, 'status' ) !== 'approved' ) {
		return '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">Onboarding is available after approval. Check your email for login credentials.</div>';
	}

	if ( ! wrrapd_wrapstars_can_access_step( $app->ID, $step ) ) {
		$current = wrrapd_wrapstars_get_meta( $app->ID, 'onboarding_step', 'welcome' );
		return '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">Complete prior steps first. <a href="' . esc_url( wrrapd_wrapstars_pros_url( '/onboarding/' . $current . '/' ) ) . '">Continue onboarding</a></div>';
	}

	$steps = wrrapd_wrapstars_onboarding_steps();
	ob_start();
	echo '<div class="wrrapd-wrapstars wrrapd-wrapstars-onboarding">';
	echo '<aside class="wrrapd-wrapstars-onboarding-nav" aria-label="Onboarding steps">';
	echo '<p class="wrrapd-wrapstars-onboarding-nav__title">Onboarding</p>';
	echo '<ul class="wrrapd-wrapstars-steps wrrapd-wrapstars-steps--sidebar">';
	foreach ( $steps as $key => $label ) {
		$cls = 'is-locked';
		if ( wrrapd_wrapstars_step_complete( $app->ID, $key ) ) {
			$cls = 'is-done';
		} elseif ( $key === $step ) {
			$cls = 'is-current';
		}
		$can_open = wrrapd_wrapstars_can_access_step( $app->ID, $key );
		echo '<li class="' . esc_attr( $cls ) . '">';
		if ( $can_open ) {
			echo '<a href="' . esc_url( wrrapd_wrapstars_onboarding_step_url( $key ) ) . '">' . esc_html( $label ) . '</a>';
		} else {
			echo '<span>' . esc_html( $label ) . '</span>';
		}
		echo '</li>';
	}
	echo '</ul></aside>';
	echo '<div class="wrrapd-wrapstars-onboarding-main">';

	$err = $GLOBALS['wrrapd_ws_onboarding_error'] ?? '';
	if ( $err ) {
		echo '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err">' . esc_html( $err ) . '</div>';
	}

	switch ( $step ) {
		case 'welcome':
			wrrapd_wrapstars_render_step_welcome( $app->ID );
			break;
		case 'agreement':
			echo do_shortcode( '[wrrapd_wrapstar_sign doc="ic_agreement"]' );
			break;
		case 'insurance':
			wrrapd_wrapstars_render_step_insurance( $app->ID );
			break;
		case 'orientation':
			wrrapd_wrapstars_render_step_orientation( $app->ID );
			break;
		case 'po_box':
			wrrapd_wrapstars_render_step_po_box( $app->ID );
			break;
		case 'w9':
			echo do_shortcode( '[wrrapd_wrapstar_sign doc="w9"]' );
			break;
		case 'activation':
			wrrapd_wrapstars_render_step_activation( $app->ID );
			break;
		default:
			wrrapd_wrapstars_render_step_welcome( $app->ID );
	}
	echo '</div></div>';
	return ob_get_clean();
}

function wrrapd_wrapstars_detect_onboarding_step_from_uri() {
	$uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '';
	if ( preg_match( '#/onboarding/agreement#', $uri ) ) {
		return 'agreement';
	}
	if ( preg_match( '#/onboarding/insurance#', $uri ) ) {
		return 'insurance';
	}
	if ( preg_match( '#/onboarding/orientation#', $uri ) ) {
		return 'orientation';
	}
	if ( preg_match( '#/onboarding/po-box#', $uri ) ) {
		return 'po_box';
	}
	if ( preg_match( '#/onboarding/w-9#', $uri ) ) {
		return 'w9';
	}
	if ( preg_match( '#/onboarding/activation#', $uri ) ) {
		return 'activation';
	}
	return 'welcome';
}

function wrrapd_wrapstars_render_step_welcome( $app_id ) {
	?>
	<div class="wrrapd-wrapstars-card">
		<h2>Welcome, WrapStar!</h2>
		<p>You're joining the WrapStar network of independent gift-wrappers. Here's what to expect:</p>
		<ul>
			<li>Sign the Independent Contractor Agreement (BoldSign)</li>
			<li>Upload proof of insurance ($1M GL + inland marine)</li>
			<li>Complete orientation and pass a short quiz</li>
			<li>Set up your PO Box / mailing address</li>
			<li>Sign your W-9</li>
			<li>Final admin activation</li>
		</ul>
		<p><strong>Every order requires video proof:</strong> unboxing, wrapping, and outbound carrier handoff.</p>
		<form method="post">
			<?php wp_nonce_field( 'wrrapd_ws_onboarding', 'wrrapd_ws_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="onboarding_step" />
			<input type="hidden" name="step" value="welcome" />
			<button type="submit" class="wrrapd-wrapstars-btn">Continue</button>
		</form>
	</div>
	<?php
}

function wrrapd_wrapstars_render_step_insurance( $app_id ) {
	?>
	<div class="wrrapd-wrapstars-card">
		<h2>Proof of insurance</h2>
		<p>Upload your Certificate of Insurance (COI) showing <strong>$1M+ general liability</strong> and <strong>inland marine / bailee</strong> coverage. Activation is blocked until verified.</p>
		<form method="post" enctype="multipart/form-data">
			<?php wp_nonce_field( 'wrrapd_ws_onboarding', 'wrrapd_ws_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="onboarding_step" />
			<input type="hidden" name="step" value="insurance" />
			<label>Insurance COI (PDF or image) <input type="file" name="insurance_coi" accept=".pdf,.jpg,.jpeg,.png" required /></label>
			<button type="submit" class="wrrapd-wrapstars-btn">Upload & continue</button>
		</form>
	</div>
	<?php
}

function wrrapd_wrapstars_render_step_orientation( $app_id ) {
	$quiz_err = $GLOBALS['wrrapd_ws_quiz_error'] ?? '';
	$questions = wrrapd_wrapstars_orientation_questions();
	?>
	<div class="wrrapd-wrapstars-card">
		<h2>Orientation</h2>
		<p>Review these requirements, then pass the quiz (80% or higher).</p>
		<ul>
			<li>Record video on <strong>every</strong> order: unboxing → wrap → outbound handoff</li>
			<li>Maintain $1M+ GL and inland marine insurance at all times</li>
			<li>You are personally liable for loss, theft, or damage while goods are in your possession</li>
			<li>New WrapStars start with lower-value orders until performance is proven</li>
			<li>Missing videos or poor ratings can lead to fast deactivation</li>
		</ul>
	</div>
	<?php if ( $quiz_err ) : ?>
		<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $quiz_err ); ?></div>
	<?php endif; ?>
	<form class="wrrapd-wrapstars-card wrrapd-wrapstars-quiz" method="post">
		<?php wp_nonce_field( 'wrrapd_ws_quiz', 'wrrapd_ws_nonce' ); ?>
		<input type="hidden" name="wrrapd_ws_action" value="orientation_quiz" />
		<h3>Quiz</h3>
		<?php foreach ( $questions as $i => $q ) : ?>
			<fieldset class="ws-quiz-q">
				<legend><?php echo esc_html( ( $i + 1 ) . '. ' . $q['q'] ); ?></legend>
				<?php foreach ( $q['choices'] as $val => $label ) : ?>
					<label><input type="radio" name="q<?php echo (int) $i; ?>" value="<?php echo esc_attr( $val ); ?>" required /> <?php echo esc_html( $label ); ?></label>
				<?php endforeach; ?>
			</fieldset>
		<?php endforeach; ?>
		<button type="submit" class="wrrapd-wrapstars-btn">Submit quiz</button>
	</form>
	<?php
}

function wrrapd_wrapstars_render_step_po_box( $app_id ) {
	?>
	<div class="wrrapd-wrapstars-card">
		<h2>PO Box / mailing address</h2>
		<p>Enter the address where you will receive retailer packages. Upload USPS Form 1583, PO Box receipt, or similar proof.</p>
		<form method="post" enctype="multipart/form-data">
			<?php wp_nonce_field( 'wrrapd_ws_onboarding', 'wrrapd_ws_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="onboarding_step" />
			<input type="hidden" name="step" value="po_box" />
			<label>PO Box / mailing address <textarea name="po_box_address" rows="3" required></textarea></label>
			<label>Proof (photo or PDF) <input type="file" name="po_box_proof" accept=".pdf,.jpg,.jpeg,.png" required /></label>
			<button type="submit" class="wrrapd-wrapstars-btn">Save & continue</button>
		</form>
	</div>
	<?php
}

function wrrapd_wrapstars_render_step_activation( $app_id ) {
	$done = wrrapd_wrapstars_step_complete( $app_id, 'w9' );
	?>
	<div class="wrrapd-wrapstars-card">
		<h2>Final review</h2>
		<?php if ( $done ) : ?>
			<p>All onboarding steps are complete. Our team will review your documents and activate your account. You'll receive an email when you're live.</p>
			<p>Status: <strong>Pending activation</strong></p>
		<?php else : ?>
			<p>Complete all prior steps before final activation.</p>
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
		$next = $doc === 'w9' ? '/onboarding/activation/' : '/onboarding/insurance/';
		return '<div class="wrrapd-wrapstars-card"><div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--ok">Document signed. <a class="wrrapd-wrapstars-btn" href="' . esc_url( wrrapd_wrapstars_pros_url( $next ) ) . '">Continue</a></div></div>';
	}

	$prep = wrrapd_wrapstars_boldsign_prepare( $app->ID, $doc === 'w9' ? 'w9' : 'ic_agreement' );
	if ( ! $prep['ok'] ) {
		return '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err">' . esc_html( $prep['error'] ?? 'Signing unavailable.' ) . '</div>';
	}

	ob_start();
	?>
	<div class="wrrapd-wrapstars-card">
		<h2><?php echo $doc === 'w9' ? 'Sign W-9' : 'Sign Independent Contractor Agreement'; ?></h2>
		<p>Sign below using BoldSign. Your identity was verified when you logged in.</p>
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
		$app    = get_post( $app_id );
		if ( $app && $app->post_type === WRRAPD_WRAPSTARS_CPT ) {
			$user_id = (int) wrrapd_wrapstars_get_meta( $app_id, 'user_id' );
			$email   = wrrapd_wrapstars_get_meta( $app_id, 'email' );
			$name    = wrrapd_wrapstars_get_meta( $app_id, 'full_name' );

			if ( $action === 'save_notes' ) {
				wrrapd_wrapstars_set_meta( $app_id, 'admin_notes', sanitize_textarea_field( wp_unslash( $_POST['admin_notes'] ?? '' ) ) );
			}
			if ( $action === 'interview' ) {
				wrrapd_wrapstars_set_meta( $app_id, 'status', 'interview' );
				wrrapd_wrapstars_set_meta( $app_id, 'interview_at', gmdate( 'c' ) );
				wrrapd_wrapstars_set_meta( $app_id, 'admin_notes', sanitize_textarea_field( wp_unslash( $_POST['admin_notes'] ?? '' ) ) );
				$body  = "Hi {$name},\n\n";
				$body .= "Thank you for applying to become a WrapStar!\n\n";
				$body .= "We'd like to schedule a brief Zoom conversation as the next step in your application. ";
				$body .= "The session may be recorded for our records. We will reach out by email and/or text message to find a time that works for you.\n\n";
				$body .= "— WrapStars Team\n";
				wrrapd_wrapstars_send_email( $email, 'WrapStar application — next step: Zoom interview', $body );
			}
			if ( $action === 'approve' ) {
				wrrapd_wrapstars_set_meta( $app_id, 'status', 'approved' );
				wrrapd_wrapstars_set_meta( $app_id, 'approved_at', gmdate( 'c' ) );
				wrrapd_wrapstars_set_meta( $app_id, 'onboarding_step', 'welcome' );
				$provision = wrrapd_wrapstars_provision_approved_user( $app_id );
				if ( ! is_wp_error( $provision ) ) {
					wrrapd_wrapstars_send_approval_credentials_email( $app_id, $provision['password'] );
					wrrapd_wrapstars_sync_profile_to_gcs( $app_id );
				}
			}
			if ( $action === 'reject' ) {
				$reason = sanitize_textarea_field( wp_unslash( $_POST['reject_reason'] ?? '' ) );
				wrrapd_wrapstars_set_meta( $app_id, 'status', 'rejected' );
				wrrapd_wrapstars_set_meta( $app_id, 'rejected_at', gmdate( 'c' ) );
				wrrapd_wrapstars_set_meta( $app_id, 'reject_reason', $reason );
				wrrapd_wrapstars_send_email( $email, 'Update on your WrapStar application', "Hi {$name},\n\n{$reason}\n" );
			}
			if ( $action === 'activate' ) {
				wrrapd_wrapstars_set_meta( $app_id, 'status', 'active' );
				wrrapd_wrapstars_set_meta( $app_id, 'activated_at', gmdate( 'c' ) );
				wrrapd_wrapstars_mark_step_complete( $app_id, 'activation' );
				if ( $user_id ) {
					wrrapd_wrapstars_set_user_role( $user_id, 'wrapstar_active' );
				}
				wrrapd_wrapstars_send_email( $email, "You're live as a WrapStar", "Hi {$name},\n\nYour account is activated. You'll start with lower-value orders. Remember: video proof on every order.\n" );
			}
			if ( $action === 'suspend' ) {
				wrrapd_wrapstars_set_meta( $app_id, 'suspended', '1' );
			}
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
	echo '<p>Portal: <strong>apply.wrrapd.com</strong> (applications) · <strong>pros.wrrapd.com</strong> (onboarding)</p>';
	echo '<p>Filter: <a href="?page=wrrapd-wrapstars">All</a> | <a href="?page=wrrapd-wrapstars&status=under_review">Under review</a> | <a href="?page=wrrapd-wrapstars&status=interview">Zoom interview</a> | <a href="?page=wrrapd-wrapstars&status=approved">Approved (onboarding)</a> | <a href="?page=wrrapd-wrapstars&status=active">Active</a></p>';

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
