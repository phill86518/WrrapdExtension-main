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

define( 'WRRAPD_WRAPSTARS_BUILD', '2026-07-14-reinvite-declined' );

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
 * Onboarding step keys in order (pros.wrrapd.com).
 * BoldSign-backed: agreement (IC), w9. All other new steps are placeholders until
 * you supply final PDFs / vendor accounts (banking, 1099, background, etc.).
 */
function wrrapd_wrapstars_onboarding_steps() {
	return array(
		'welcome'     => 'Welcome & Overview',
		'agreement'   => 'Independent Contractor Agreement',
		'policies'    => 'Policies & Handbook',
		'orientation' => 'Orientation & Quiz',
		'background'  => 'Background Check',
		'insurance'   => 'Proof of Insurance',
		'identity'    => 'Identity Verification',
		'po_box'      => 'PO Box / Mailing Address',
		'w9'          => 'W-9 Tax Form',
		'tax_1099'    => '1099 & Tax Acknowledgments',
		'bank_payout' => 'Connect Bank / Payouts',
		'activation'  => 'Final Review',
	);
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
		'policies'    => '/onboarding/policies/',
		'orientation' => '/onboarding/orientation/',
		'background'  => '/onboarding/background/',
		'insurance'   => '/onboarding/insurance/',
		'identity'    => '/onboarding/identity/',
		'po_box'      => '/onboarding/po-box/',
		'w9'          => '/onboarding/w-9/',
		'tax_1099'    => '/onboarding/tax-1099/',
		'bank_payout' => '/onboarding/bank-payout/',
		'activation'  => '/onboarding/activation/',
	);
	$path = $paths[ $step ] ?? '/onboarding/';
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
		'declined_at'         => '',
		'decline_token'       => '',
		'decline_note'        => '',
		'previous_declined_at'=> '',
		'reinvited_at'        => '',
		'reinvite_count'      => '0',
		'must_change_password'=> '',
		'portal_password_issued_at' => '',
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
	$uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '';
	if ( str_contains( $uri, '/onboarding' ) ) {
		$classes[] = 'wrrapd-wrapstars-onboarding-host';
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

	$step = sanitize_text_field( wp_unslash( $_POST['step'] ?? '' ) );
	$app  = wrrapd_wrapstars_get_application_by_user( get_current_user_id() );
	if ( ! $app || ! wrrapd_wrapstars_can_access_step( $app->ID, $step ) ) {
		return;
	}

	if ( $step === 'welcome' ) {
		wrrapd_wrapstars_mark_step_complete( $app->ID, 'welcome' );
		wp_safe_redirect( wrrapd_wrapstars_onboarding_step_url( wrrapd_wrapstars_next_onboarding_step( 'welcome' ) ) );
		exit;
	}

	// Placeholder acknowledgment steps (documents / vendors TBD).
	$placeholder_steps = array( 'policies', 'background', 'identity', 'tax_1099', 'bank_payout' );
	if ( in_array( $step, $placeholder_steps, true ) ) {
		$ack = isset( $_POST['placeholder_ack'] ) ? (string) wp_unslash( $_POST['placeholder_ack'] ) : '';
		if ( $ack !== '1' ) {
			$GLOBALS['wrrapd_ws_onboarding_error'] = 'Please confirm you understand this step before continuing.';
			return;
		}
		wrrapd_wrapstars_set_meta( $app->ID, $step . '_placeholder_ack', '1' );
		wrrapd_wrapstars_set_meta( $app->ID, $step . '_placeholder_ack_at', gmdate( 'c' ) );
		$notes = sanitize_textarea_field( wp_unslash( $_POST['placeholder_notes'] ?? '' ) );
		if ( $notes !== '' ) {
			wrrapd_wrapstars_set_meta( $app->ID, $step . '_placeholder_notes', $notes );
		}
		wrrapd_wrapstars_mark_step_complete( $app->ID, $step );
		wp_safe_redirect( wrrapd_wrapstars_onboarding_step_url( wrrapd_wrapstars_next_onboarding_step( $step ) ) );
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
		wp_safe_redirect( wrrapd_wrapstars_onboarding_step_url( wrrapd_wrapstars_next_onboarding_step( 'insurance' ) ) );
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
		wp_safe_redirect( wrrapd_wrapstars_onboarding_step_url( wrrapd_wrapstars_next_onboarding_step( 'po_box' ) ) );
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
 * Welcome / re-invite / resend credentials email.
 *
 * @param int    $app_id   Application ID.
 * @param string $password Temporary password.
 * @param string $context  approve|reinvite|resend.
 */
function wrrapd_wrapstars_send_approval_credentials_email( $app_id, $password, $context = 'approve' ) {
	$email = wrrapd_wrapstars_get_meta( $app_id, 'email' );
	$name  = wrrapd_wrapstars_get_meta( $app_id, 'full_name' );
	$login = wrrapd_wrapstars_portal_login_url( wrrapd_wrapstars_pros_url( '/onboarding/' ) );
	$token = (string) wrrapd_wrapstars_get_meta( $app_id, 'decline_token' );
	$decline = $token !== '' ? wrrapd_wrapstars_decline_offer_url( $app_id, $token ) : wrrapd_wrapstars_apply_url( '/decline-offer/' );
	$context = in_array( $context, array( 'approve', 'reinvite', 'resend' ), true ) ? $context : 'approve';

	$body = "Hi {$name},\n\n";
	if ( $context === 'reinvite' ) {
		$subject = 'Welcome back — your WrapStar invitation is open again';
		$body   .= "Good news — your WrapStar invitation is open again.\n\n";
		$body   .= "We've resolved the earlier hold-up and would love to have you join the network. Use the fresh login credentials below (previous ones no longer work).\n\n";
	} elseif ( $context === 'resend' ) {
		$subject = 'WrapStars — your login credentials (resent)';
		$body   .= "Here are fresh WrapStar portal credentials (any older temporary password from a previous email no longer works).\n\n";
	} else {
		$subject = 'Welcome to WrapStars — your login & next steps';
		$body   .= "Congratulations — you've been approved to join the WrapStar network!\n\n";
		$body   .= "We're excited to welcome you. Log in with the credentials below to start onboarding on the WrapStar portal.\n\n";
	}

	$body .= "━━━━━━━━━━━━━━━━━━━━\n";
	$body .= "YOUR LOGIN\n";
	$body .= "━━━━━━━━━━━━━━━━━━━━\n";
	$body .= "Portal login: {$login}\n";
	$body .= "Username (email): {$email}\n";
	$body .= "Temporary password: {$password}\n\n";
	$body .= "Important: the first thing you'll do after logging in is choose a new password. Onboarding unlocks only after that.\n\n";
	$body .= "You'll complete agreements, policies, orientation, insurance, tax forms, bank/payout setup, and more.\n\n";
	$body .= "━━━━━━━━━━━━━━━━━━━━\n";
	$body .= "DECLINE THIS OFFER\n";
	$body .= "━━━━━━━━━━━━━━━━━━━━\n";
	$body .= "If you've decided not to join Wrrapd as a WrapStar, decline here (no login required):\n";
	$body .= "{$decline}\n\n";
	$body .= "Declining closes this invitation and disables the temporary login above.\n\n";
	$body .= "Questions? Reply to this email or write " . wrrapd_wrapstars_from_email_address() . ".\n\n";
	$body .= "— The WrapStars Team\n";

	wrrapd_wrapstars_send_email( $email, $subject, $body );
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
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapstars-onboarding-shell">
		<div class="wrrapd-wrapstars-ob-stage" style="max-width:28rem;margin:2rem auto;padding:0 1rem;">
			<div class="wrrapd-wrapstars-card wrrapd-wrapstars-card--hero">
				<p class="wrrapd-wrapstars-ob-stage__kicker">First login</p>
				<h1 class="wrrapd-wrapstars-ob-stage__title">Choose your password</h1>
				<p class="wrrapd-wrapstars-ob-lead">For security, you must replace the temporary password from your approval email before onboarding starts.</p>
				<?php if ( $error ) : ?>
					<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $error ); ?></div>
				<?php endif; ?>
				<form method="post" class="wrrapd-wrapstars-form wrrapd-wrapstars-ob-actions">
					<?php wp_nonce_field( 'wrrapd_ws_change_password', 'wrrapd_ws_nonce' ); ?>
					<input type="hidden" name="wrrapd_ws_action" value="change_password" />
					<label>Temporary password (from email)
						<input type="password" name="current_password" required autocomplete="current-password" />
					</label>
					<label>New password (min. 10 characters)
						<input type="password" name="new_password" required minlength="10" autocomplete="new-password" />
					</label>
					<label>Confirm new password
						<input type="password" name="confirm_password" required minlength="10" autocomplete="new-password" />
					</label>
					<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Save password &amp; continue</button>
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
			<p class="wrrapd-wrapstars-dasher-lead">Use the email and temporary password from your approval email. After you log in, you'll set a new password before onboarding begins. This page is not for applicants still under review.</p>
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

	$user_id = get_current_user_id();
	if ( wrrapd_wrapstars_user_must_change_password( $user_id ) ) {
		return wrrapd_wrapstars_render_change_password_gate();
	}

	$atts = shortcode_atts( array( 'step' => '' ), $atts, 'wrrapd_wrapstar_onboarding' );
	$step = $atts['step'] !== '' ? $atts['step'] : wrrapd_wrapstars_detect_onboarding_step_from_uri();

	$app = wrrapd_wrapstars_get_application_by_user( $user_id );
	$status = $app ? (string) wrrapd_wrapstars_get_meta( $app->ID, 'status' ) : '';
	if ( $status === 'declined' ) {
		return '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">This WrapStar invitation was declined. Contact ' . esc_html( wrrapd_wrapstars_from_email_address() ) . ' if that was a mistake.</div>';
	}
	if ( ! $app || $status !== 'approved' ) {
		return '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">Onboarding is available after approval. Check your email for login credentials.</div>';
	}

	if ( ! wrrapd_wrapstars_can_access_step( $app->ID, $step ) ) {
		$current = wrrapd_wrapstars_get_meta( $app->ID, 'onboarding_step', 'welcome' );
		return '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">Complete prior steps first. <a href="' . esc_url( wrrapd_wrapstars_onboarding_step_url( $current ) ) . '">Continue onboarding</a></div>';
	}

	$steps       = wrrapd_wrapstars_onboarding_steps();
	$step_keys   = array_keys( $steps );
	$step_total  = count( $step_keys );
	$step_index  = array_search( $step, $step_keys, true );
	if ( $step_index === false ) {
		$step_index = 0;
	}
	$step_num    = $step_index + 1;
	$done_count  = 0;
	foreach ( $step_keys as $key ) {
		if ( $key === 'activation' ) {
			continue;
		}
		if ( wrrapd_wrapstars_step_complete( $app->ID, $key ) ) {
			$done_count++;
		}
	}
	$trackable   = max( 1, $step_total - 1 );
	$progress_pct = (int) min( 100, round( ( $done_count / $trackable ) * 100 ) );
	$first_name  = trim( (string) wrrapd_wrapstars_get_meta( $app->ID, 'first_name' ) );
	$display     = $first_name !== '' ? $first_name : 'WrapStar';
	$current_label = $steps[ $step ] ?? 'Onboarding';

	ob_start();
	echo '<div class="wrrapd-wrapstars wrrapd-wrapstars-onboarding-shell">';

	echo '<header class="wrrapd-wrapstars-ob-topbar" role="banner">';
	echo '<button type="button" class="wrrapd-wrapstars-ob-menu-btn" data-ws-ob-nav-open aria-controls="wrrapd-ws-ob-nav" aria-expanded="false">Steps</button>';
	echo '<div class="wrrapd-wrapstars-ob-topbar__center">';
	echo '<span class="wrrapd-wrapstars-ob-topbar__eyebrow">WrapStar portal</span>';
	echo '<strong class="wrrapd-wrapstars-ob-topbar__step">' . esc_html( $current_label ) . '</strong>';
	echo '</div>';
	echo '<a class="wrrapd-wrapstars-ob-topbar__logout" href="' . esc_url( wp_logout_url( home_url( '/' ) ) ) . '">Log out</a>';
	echo '</header>';

	echo '<button type="button" class="wrrapd-wrapstars-ob-backdrop" data-ws-ob-nav-close aria-label="Close steps menu" hidden></button>';

	echo '<div class="wrrapd-wrapstars-onboarding">';
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
	echo '<p class="wrrapd-wrapstars-ob-progress__hint">Step ' . esc_html( (string) $step_num ) . ' of ' . esc_html( (string) $step_total ) . '</p>';
	echo '</div>';

	echo '<nav class="wrrapd-wrapstars-ob-stepnav">';
	echo '<ul class="wrrapd-wrapstars-steps wrrapd-wrapstars-steps--sidebar">';
	$i = 0;
	foreach ( $steps as $key => $label ) {
		$i++;
		$cls = 'is-locked';
		if ( wrrapd_wrapstars_step_complete( $app->ID, $key ) ) {
			$cls = 'is-done';
		} elseif ( $key === $step ) {
			$cls = 'is-current';
		}
		$can_open = wrrapd_wrapstars_can_access_step( $app->ID, $key );
		$mark     = wrrapd_wrapstars_step_complete( $app->ID, $key ) ? '✓' : (string) $i;
		echo '<li class="' . esc_attr( $cls ) . '">';
		$inner = '<span class="wrrapd-wrapstars-ob-stepmark" aria-hidden="true">' . esc_html( $mark ) . '</span>';
		$inner .= '<span class="wrrapd-wrapstars-ob-steplabel">' . esc_html( $label ) . '</span>';
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
	echo '<a href="' . esc_url( wp_logout_url( home_url( '/' ) ) ) . '">Log out</a>';
	echo '</div>';
	echo '</aside>';

	echo '<div class="wrrapd-wrapstars-onboarding-main">';
	echo '<div class="wrrapd-wrapstars-ob-stage">';
	echo '<header class="wrrapd-wrapstars-ob-stage__header">';
	echo '<p class="wrrapd-wrapstars-ob-stage__kicker">Step ' . esc_html( (string) $step_num ) . ' · ' . esc_html( (string) $step_total ) . ' total</p>';
	echo '<h1 class="wrrapd-wrapstars-ob-stage__title">' . esc_html( $current_label ) . '</h1>';
	echo '</header>';

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
		case 'policies':
		case 'background':
		case 'identity':
		case 'tax_1099':
		case 'bank_payout':
			wrrapd_wrapstars_render_step_placeholder( $app->ID, $step );
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
	echo '</div></div></div></div>';
	return ob_get_clean();
}

function wrrapd_wrapstars_detect_onboarding_step_from_uri() {
	$uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '';
	$map = array(
		'#/onboarding/agreement#'   => 'agreement',
		'#/onboarding/policies#'    => 'policies',
		'#/onboarding/orientation#' => 'orientation',
		'#/onboarding/background#'  => 'background',
		'#/onboarding/insurance#'   => 'insurance',
		'#/onboarding/identity#'    => 'identity',
		'#/onboarding/po-box#'      => 'po_box',
		'#/onboarding/w-9#'         => 'w9',
		'#/onboarding/tax-1099#'    => 'tax_1099',
		'#/onboarding/bank-payout#' => 'bank_payout',
		'#/onboarding/activation#'  => 'activation',
	);
	foreach ( $map as $re => $key ) {
		if ( preg_match( $re, $uri ) ) {
			return $key;
		}
	}
	return 'welcome';
}

function wrrapd_wrapstars_render_step_welcome( $app_id ) {
	$steps = wrrapd_wrapstars_onboarding_steps();
	$n     = 0;
	?>
	<div class="wrrapd-wrapstars-card wrrapd-wrapstars-card--hero">
		<p class="wrrapd-wrapstars-ob-lead">You're joining the WrapStar network of independent gift-wrappers. Work through each step at your pace — the left rail always shows where you are and what is next.</p>
		<div class="wrrapd-wrapstars-ob-callout">
			<strong>Video proof on every order</strong>
			<span>Unboxing → wrapping → outbound carrier handoff. Missing video can pause payouts.</span>
		</div>
		<ul class="wrrapd-wrapstars-welcome-grid">
			<?php foreach ( $steps as $key => $label ) : ?>
				<?php
				if ( $key === 'welcome' ) {
					continue;
				}
				$n++;
				$done = wrrapd_wrapstars_step_complete( $app_id, $key );
				$kind = 'live';
				if ( in_array( $key, array( 'policies', 'background', 'identity', 'tax_1099', 'bank_payout' ), true ) ) {
					$kind = 'placeholder';
				} elseif ( in_array( $key, array( 'agreement', 'w9' ), true ) ) {
					$kind = 'sign';
				}
				?>
				<li class="wrrapd-wrapstars-welcome-tile <?php echo $done ? 'is-done' : ''; ?>">
					<span class="wrrapd-wrapstars-welcome-tile__num" aria-hidden="true"><?php echo $done ? '✓' : esc_html( (string) $n ); ?></span>
					<span class="wrrapd-wrapstars-welcome-tile__label"><?php echo esc_html( $label ); ?></span>
					<?php if ( $kind === 'placeholder' ) : ?>
						<span class="wrrapd-wrapstars-pill wrrapd-wrapstars-pill--placeholder">Placeholder</span>
					<?php elseif ( $kind === 'sign' ) : ?>
						<span class="wrrapd-wrapstars-pill">E-sign</span>
					<?php else : ?>
						<span class="wrrapd-wrapstars-pill wrrapd-wrapstars-pill--live">Live</span>
					<?php endif; ?>
				</li>
			<?php endforeach; ?>
		</ul>
		<form method="post" class="wrrapd-wrapstars-ob-actions">
			<?php wp_nonce_field( 'wrrapd_ws_onboarding', 'wrrapd_ws_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="onboarding_step" />
			<input type="hidden" name="step" value="welcome" />
			<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Begin onboarding</button>
		</form>
	</div>
	<?php
}

/**
 * Config for placeholder onboarding steps — swap copy/docs when you supply finals.
 *
 * @return array{title:string,lead:string,needs:string[],vendor:string,ack:string}|null
 */
function wrrapd_wrapstars_placeholder_step_config( $step ) {
	$all = array(
		'policies'    => array(
			'title'  => 'Policies & handbook',
			'lead'   => 'Acknowledge WrapStar operating policies, safety standards, and the independent-contractor handbook. Final PDFs will be uploaded here when counsel delivers them.',
			'needs'  => array(
				'WrapStar Handbook / Operations Manual (PDF TBD)',
				'Gift-handling & video-proof policy (PDF TBD)',
				'Code of conduct / brand standards (PDF TBD)',
			),
			'vendor' => 'In-app PDF viewer + checkbox acknowledgments (no BoldSign required unless counsel prefers e-sign).',
			'ack'    => 'I understand this step is a placeholder and I will re-acknowledge when final policy documents are published.',
		),
		'background'  => array(
			'title'  => 'Background check',
			'lead'   => 'Authorized at apply time. This step will launch our screening vendor (e.g. Checkr) after approval. Until then, confirm you remain willing to complete a background check.',
			'needs'  => array(
				'Background-check authorization form (if separate from apply)',
				'Vendor invite / disclosure packet (TBD)',
			),
			'vendor' => 'Placeholder for Checkr (or similar) hosted flow + webhook status back to Wrrapd.',
			'ack'    => 'I authorize Wrrapd to run a background check when the vendor integration is enabled, and I understand activation may wait on a clear result.',
		),
		'identity'    => array(
			'title'  => 'Identity verification',
			'lead'   => 'Confirm government ID on file and complete any additional identity checks. A selfie / liveness vendor can plug in here later.',
			'needs'  => array(
				'Government ID re-upload (optional if apply ID already verified)',
				'Selfie / liveness capture (vendor TBD)',
			),
			'vendor' => 'Placeholder for Persona / Stripe Identity / similar.',
			'ack'    => 'I confirm the government ID I submitted at application is accurate, and I will complete any additional identity verification Wrrapd requests.',
		),
		'tax_1099'    => array(
			'title'  => '1099 & tax acknowledgments',
			'lead'   => 'After your W-9, acknowledge independent-contractor tax treatment and 1099 reporting. Final tax packet / counsel language will replace this placeholder.',
			'needs'  => array(
				'1099-NEC acknowledgment / IC tax notice (PDF TBD)',
				'Optional state tax notices (TBD by jurisdiction)',
			),
			'vendor' => 'Checkbox attestation now; optional second BoldSign template later if required.',
			'ack'    => 'I understand I am an independent contractor responsible for my own taxes, and that Wrrapd may issue a Form 1099 when required by law.',
		),
		'bank_payout' => array(
			'title'  => 'Connect bank / payouts',
			'lead'   => 'Connect the account where WrapStar earnings will be paid. Stripe Connect (or Plaid + ACH export) will live here. Until then, confirm you have a US bank account ready.',
			'needs'  => array(
				'Stripe Connect onboarding link (or Plaid Link)',
				'ACH / payout schedule disclosure (PDF TBD)',
				'Voided check / account ownership proof if required (TBD)',
			),
			'vendor' => 'Placeholder for Stripe Connect Express / Custom. Ops ACH CSV already exists in Command Center Finance.',
			'ack'    => 'I confirm I have a US bank account ready for WrapStar payouts and will complete the bank connection when Wrrapd enables it.',
		),
	);
	return $all[ $step ] ?? null;
}

function wrrapd_wrapstars_render_step_placeholder( $app_id, $step ) {
	$cfg = wrrapd_wrapstars_placeholder_step_config( $step );
	if ( ! $cfg ) {
		echo '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err">Unknown onboarding step.</div>';
		return;
	}
	?>
	<div class="wrrapd-wrapstars-card">
		<p class="wrrapd-wrapstars-pill wrrapd-wrapstars-pill--placeholder">Placeholder — final documents / vendor coming soon</p>
		<p class="wrrapd-wrapstars-ob-lead"><?php echo esc_html( $cfg['lead'] ); ?></p>
		<div class="wrrapd-wrapstars-ob-split">
			<div class="wrrapd-wrapstars-ob-panel">
				<h3>What Wrrapd will add</h3>
				<ul class="wrrapd-wrapstars-ob-needs">
					<?php foreach ( $cfg['needs'] as $need ) : ?>
						<li><?php echo esc_html( $need ); ?></li>
					<?php endforeach; ?>
				</ul>
			</div>
			<div class="wrrapd-wrapstars-ob-panel wrrapd-wrapstars-ob-panel--soft">
				<h3>Integration plan</h3>
				<p><?php echo esc_html( $cfg['vendor'] ); ?></p>
				<p class="wrrapd-wrapstars-ob-note">You can continue now. When finals arrive, this screen becomes the real upload / e-sign / connect flow — same step order.</p>
			</div>
		</div>
		<form method="post" class="wrrapd-wrapstars-ob-actions wrrapd-wrapstars-form">
			<?php wp_nonce_field( 'wrrapd_ws_onboarding', 'wrrapd_ws_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="onboarding_step" />
			<input type="hidden" name="step" value="<?php echo esc_attr( $step ); ?>" />
			<label class="ws-check">
				<input type="checkbox" name="placeholder_ack" value="1" required />
				<span><?php echo esc_html( $cfg['ack'] ); ?></span>
			</label>
			<label>Optional notes for Wrrapd ops
				<textarea name="placeholder_notes" rows="2" placeholder="Questions or details for our team…"></textarea>
			</label>
			<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Acknowledge &amp; continue</button>
		</form>
	</div>
	<?php
}

function wrrapd_wrapstars_render_step_insurance( $app_id ) {
	?>
	<div class="wrrapd-wrapstars-card">
		<p class="wrrapd-wrapstars-ob-lead">Upload your Certificate of Insurance (COI) showing <strong>$1M+ general liability</strong> and <strong>inland marine / bailee</strong> coverage. Ops verifies before activation.</p>
		<form method="post" enctype="multipart/form-data" class="wrrapd-wrapstars-form wrrapd-wrapstars-ob-actions">
			<?php wp_nonce_field( 'wrrapd_ws_onboarding', 'wrrapd_ws_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="onboarding_step" />
			<input type="hidden" name="step" value="insurance" />
			<label>Insurance COI (PDF or image) <input type="file" name="insurance_coi" accept=".pdf,.jpg,.jpeg,.png" required /></label>
			<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Upload &amp; continue</button>
		</form>
	</div>
	<?php
}

function wrrapd_wrapstars_render_step_orientation( $app_id ) {
	$quiz_err = $GLOBALS['wrrapd_ws_quiz_error'] ?? '';
	$questions = wrrapd_wrapstars_orientation_questions();
	?>
	<div class="wrrapd-wrapstars-card">
		<p class="wrrapd-wrapstars-ob-lead">Review the standards below, then pass the quiz with <strong>80% or higher</strong>.</p>
		<ul class="wrrapd-wrapstars-ob-standards">
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

function wrrapd_wrapstars_render_step_po_box( $app_id ) {
	?>
	<div class="wrrapd-wrapstars-card">
		<p class="wrrapd-wrapstars-ob-lead">Enter the address where you will receive retailer packages, then upload USPS Form 1583, a PO Box receipt, or similar proof.</p>
		<form method="post" enctype="multipart/form-data" class="wrrapd-wrapstars-form wrrapd-wrapstars-ob-actions">
			<?php wp_nonce_field( 'wrrapd_ws_onboarding', 'wrrapd_ws_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="onboarding_step" />
			<input type="hidden" name="step" value="po_box" />
			<label>PO Box / mailing address <textarea name="po_box_address" rows="3" required></textarea></label>
			<label>Proof (photo or PDF) <input type="file" name="po_box_proof" accept=".pdf,.jpg,.jpeg,.png" required /></label>
			<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Save &amp; continue</button>
		</form>
	</div>
	<?php
}

function wrrapd_wrapstars_render_step_activation( $app_id ) {
	$steps   = wrrapd_wrapstars_onboarding_steps();
	$all_done = true;
	foreach ( array_keys( $steps ) as $key ) {
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
		<p class="wrrapd-wrapstars-ob-lead">Ops reviews this checklist in Command Center before <strong>Activate</strong>. Keep an eye on incomplete items in the left rail.</p>
		<ul class="wrrapd-wrapstars-activation-checklist">
			<?php foreach ( $steps as $key => $label ) : ?>
				<?php if ( $key === 'activation' ) { continue; } ?>
				<li class="<?php echo wrrapd_wrapstars_step_complete( $app_id, $key ) ? 'is-done' : 'is-open'; ?>">
					<span class="wrrapd-wrapstars-activation-checklist__mark" aria-hidden="true"><?php echo wrrapd_wrapstars_step_complete( $app_id, $key ) ? '✓' : '○'; ?></span>
					<span><?php echo esc_html( $label ); ?></span>
					<?php if ( ! wrrapd_wrapstars_step_complete( $app_id, $key ) && wrrapd_wrapstars_can_access_step( $app_id, $key ) ) : ?>
						<a class="wrrapd-wrapstars-activation-checklist__link" href="<?php echo esc_url( wrrapd_wrapstars_onboarding_step_url( $key ) ); ?>">Open</a>
					<?php endif; ?>
				</li>
			<?php endforeach; ?>
		</ul>
		<?php if ( $all_done ) : ?>
			<div class="wrrapd-wrapstars-ob-callout wrrapd-wrapstars-ob-callout--ok">
				<strong>Pending activation</strong>
				<span>All applicant-facing steps are complete. Our team will verify documents, insurance, background, and payout readiness, then activate you. You'll get an email when you're live.</span>
			</div>
		<?php else : ?>
			<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">Finish the open steps above, then return here.</div>
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
				array(
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
