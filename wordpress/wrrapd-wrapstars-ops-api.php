<?php
/**
 * WrapStars ops API — Command Center (tracking Admin) reviews applications here.
 *
 * Auth: header X-Wrrapd-Wrapstars-Ops-Key (or Authorization: Bearer …)
 * must match WRRAPD_WRAPSTARS_OPS_API_KEY in wp-config.php.
 *
 * Routes (namespace wrrapd/v1):
 *   GET  /applications
 *   GET  /applications/{id}
 *   POST /applications/{id}/action  { action, adminNotes?, rejectReason? }
 *
 * @package WrrapdWrapStars
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @param WP_REST_Request $request Request.
 * @return true|WP_Error
 */
function wrrapd_wrapstars_ops_api_permission( $request ) {
	$expected = '';
	if ( defined( 'WRRAPD_WRAPSTARS_OPS_API_KEY' ) && WRRAPD_WRAPSTARS_OPS_API_KEY !== '' ) {
		$expected = (string) WRRAPD_WRAPSTARS_OPS_API_KEY;
	}
	if ( $expected === '' ) {
		return new WP_Error( 'ops_key_missing', 'WRRAPD_WRAPSTARS_OPS_API_KEY is not configured on WordPress.', array( 'status' => 503 ) );
	}

	$got = '';
	$header = $request->get_header( 'x_wrrapd_wrapstars_ops_key' );
	if ( is_string( $header ) && $header !== '' ) {
		$got = $header;
	}
	if ( $got === '' ) {
		$auth = $request->get_header( 'authorization' );
		if ( is_string( $auth ) && preg_match( '/^Bearer\s+(.+)$/i', $auth, $m ) ) {
			$got = trim( $m[1] );
		}
	}
	if ( $got === '' || ! hash_equals( $expected, $got ) ) {
		return new WP_Error( 'forbidden', 'Invalid ops API key.', array( 'status' => 401 ) );
	}
	return true;
}

/**
 * Run interview / approve / reject / activate / suspend / unsuspend /
 * mark_declined / reinvite / resend_invite / save_notes.
 *
 * @param int                  $app_id Application post ID.
 * @param string               $action Action slug.
 * @param array<string,string> $opts   admin_notes, reject_reason.
 * @return array{ok:bool,error?:string,status?:string,passwordIssued?:bool}
 */
function wrrapd_wrapstars_run_admin_action( $app_id, $action, $opts = array() ) {
	$app_id = (int) $app_id;
	$app    = get_post( $app_id );
	if ( ! $app || $app->post_type !== WRRAPD_WRAPSTARS_CPT ) {
		return array( 'ok' => false, 'error' => 'Application not found.' );
	}

	$user_id = (int) wrrapd_wrapstars_get_meta( $app_id, 'user_id' );
	$email   = wrrapd_wrapstars_get_meta( $app_id, 'email' );
	$name    = wrrapd_wrapstars_get_meta( $app_id, 'full_name' );
	$action  = sanitize_text_field( (string) $action );
	$notes   = array_key_exists( 'admin_notes', $opts )
		? sanitize_textarea_field( (string) $opts['admin_notes'] )
		: null;
	$reason  = isset( $opts['reject_reason'] ) ? sanitize_textarea_field( (string) $opts['reject_reason'] ) : '';

	if ( $action === 'save_notes' ) {
		wrrapd_wrapstars_set_meta( $app_id, 'admin_notes', $notes !== null ? $notes : '' );
		return array( 'ok' => true, 'status' => wrrapd_wrapstars_get_meta( $app_id, 'status' ) );
	}

	if ( $action === 'interview' ) {
		wrrapd_wrapstars_set_meta( $app_id, 'status', 'interview' );
		wrrapd_wrapstars_set_meta( $app_id, 'interview_at', gmdate( 'c' ) );
		if ( $notes !== null ) {
			wrrapd_wrapstars_set_meta( $app_id, 'admin_notes', $notes );
		}
		$body  = "Hi {$name},\n\n";
		$body .= "Thank you for applying to become a WrapStar!\n\n";
		$body .= "We'd like to schedule a brief Zoom conversation as the next step in your application. ";
		$body .= "The session may be recorded for our records. We will reach out by email and/or text message to find a time that works for you.\n\n";
		$body .= "— WrapStars Team\n";
		wrrapd_wrapstars_send_email( $email, 'WrapStar application — next step: Zoom interview', $body );
		return array( 'ok' => true, 'status' => 'interview' );
	}

	if ( $action === 'approve' ) {
		wrrapd_wrapstars_set_meta( $app_id, 'status', 'approved' );
		wrrapd_wrapstars_set_meta( $app_id, 'approved_at', gmdate( 'c' ) );
		wrrapd_wrapstars_set_meta( $app_id, 'onboarding_step', 'welcome' );
		if ( $notes !== null ) {
			wrrapd_wrapstars_set_meta( $app_id, 'admin_notes', $notes );
		}
		$provision = wrrapd_wrapstars_provision_approved_user( $app_id );
		$password_issued = false;
		if ( is_wp_error( $provision ) ) {
			return array(
				'ok'    => false,
				'error' => $provision->get_error_message(),
				'status'=> 'approved',
			);
		}
		wrrapd_wrapstars_send_approval_credentials_email( $app_id, $provision['password'] );
		wrrapd_wrapstars_sync_profile_to_gcs( $app_id );
		$password_issued = true;
		return array( 'ok' => true, 'status' => 'approved', 'passwordIssued' => $password_issued );
	}

	if ( $action === 'reject' ) {
		wrrapd_wrapstars_set_meta( $app_id, 'status', 'rejected' );
		wrrapd_wrapstars_set_meta( $app_id, 'rejected_at', gmdate( 'c' ) );
		wrrapd_wrapstars_set_meta( $app_id, 'reject_reason', $reason );
		if ( $notes !== null ) {
			wrrapd_wrapstars_set_meta( $app_id, 'admin_notes', $notes );
		}
		$body_reason = $reason !== '' ? $reason : 'We are unable to move forward with your application at this time.';
		wrrapd_wrapstars_send_email( $email, 'Update on your WrapStar application', "Hi {$name},\n\n{$body_reason}\n" );
		return array( 'ok' => true, 'status' => 'rejected' );
	}

	if ( $action === 'activate' ) {
		wrrapd_wrapstars_set_meta( $app_id, 'status', 'active' );
		wrrapd_wrapstars_set_meta( $app_id, 'activated_at', gmdate( 'c' ) );
		wrrapd_wrapstars_mark_step_complete( $app_id, 'activation' );
		$user_id = (int) wrrapd_wrapstars_get_meta( $app_id, 'user_id' );
		if ( $user_id ) {
			wrrapd_wrapstars_set_user_role( $user_id, 'wrapstar_active' );
		}
		if ( $notes !== null ) {
			wrrapd_wrapstars_set_meta( $app_id, 'admin_notes', $notes );
		}
		wrrapd_wrapstars_send_email(
			$email,
			"You're live as a WrapStar",
			"Hi {$name},\n\nYour account is activated. You'll start with lower-value orders. Remember: video proof on every order.\n"
		);
		wrrapd_wrapstars_sync_profile_to_gcs( $app_id );
		return array( 'ok' => true, 'status' => 'active' );
	}

	if ( $action === 'suspend' ) {
		wrrapd_wrapstars_set_meta( $app_id, 'suspended', '1' );
		if ( $notes !== null ) {
			wrrapd_wrapstars_set_meta( $app_id, 'admin_notes', $notes );
		}
		return array( 'ok' => true, 'status' => wrrapd_wrapstars_get_meta( $app_id, 'status' ) );
	}

	if ( $action === 'unsuspend' ) {
		wrrapd_wrapstars_set_meta( $app_id, 'suspended', '' );
		return array( 'ok' => true, 'status' => wrrapd_wrapstars_get_meta( $app_id, 'status' ) );
	}

	if ( $action === 'mark_declined' ) {
		$note = $reason !== '' ? $reason : ( $notes !== null ? $notes : '' );
		$result = wrrapd_wrapstars_mark_offer_declined( $app_id, $note );
		if ( empty( $result['ok'] ) ) {
			return array( 'ok' => false, 'error' => $result['error'] ?? 'Could not mark declined.' );
		}
		if ( $notes !== null ) {
			wrrapd_wrapstars_set_meta( $app_id, 'admin_notes', $notes );
		}
		return array( 'ok' => true, 'status' => 'declined' );
	}

	if ( $action === 'reinvite' ) {
		$note = $notes !== null ? $notes : '';
		$result = wrrapd_wrapstars_reinvite_declined_offer( $app_id, $note );
		if ( empty( $result['ok'] ) ) {
			return array( 'ok' => false, 'error' => $result['error'] ?? 'Could not re-invite.' );
		}
		return array( 'ok' => true, 'status' => 'approved', 'passwordIssued' => true, 'reinvited' => true );
	}

	if ( $action === 'resend_invite' ) {
		$result = wrrapd_wrapstars_resend_approval_invite( $app_id );
		if ( empty( $result['ok'] ) ) {
			return array( 'ok' => false, 'error' => $result['error'] ?? 'Could not resend invite.' );
		}
		if ( $notes !== null ) {
			wrrapd_wrapstars_set_meta( $app_id, 'admin_notes', $notes );
		}
		return array( 'ok' => true, 'status' => 'approved', 'passwordIssued' => true, 'resent' => true );
	}

	return array( 'ok' => false, 'error' => 'Unknown action.' );
}

/**
 * Serialize application for Command Center.
 *
 * @param int $id Post ID.
 * @return array<string,mixed>|null
 */
function wrrapd_wrapstars_ops_serialize_application( $id ) {
	$id  = (int) $id;
	$app = get_post( $id );
	if ( ! $app || $app->post_type !== WRRAPD_WRAPSTARS_CPT ) {
		return null;
	}

	$steps = array_keys( wrrapd_wrapstars_onboarding_steps() );
	$steps_done = array();
	foreach ( $steps as $step ) {
		$steps_done[ $step ] = (bool) wrrapd_wrapstars_step_complete( $id, $step );
	}

	$break = json_decode( (string) wrrapd_wrapstars_get_meta( $id, 'fit_score_breakdown' ), true );
	if ( ! is_array( $break ) ) {
		$break = array();
	}

	return array(
		'id'                         => $id,
		'status'                     => wrrapd_wrapstars_get_meta( $id, 'status' ),
		'suspended'                  => wrrapd_wrapstars_get_meta( $id, 'suspended' ) === '1',
		'fullName'                   => wrrapd_wrapstars_get_meta( $id, 'full_name' ),
		'firstName'                  => wrrapd_wrapstars_get_meta( $id, 'first_name' ),
		'lastName'                   => wrrapd_wrapstars_get_meta( $id, 'last_name' ),
		'email'                      => wrrapd_wrapstars_get_meta( $id, 'email' ),
		'phoneMobile'                => wrrapd_wrapstars_get_meta( $id, 'phone_mobile', wrrapd_wrapstars_get_meta( $id, 'phone' ) ),
		'phoneWork'                  => wrrapd_wrapstars_get_meta( $id, 'phone_work' ),
		'addressLine1'               => wrrapd_wrapstars_get_meta( $id, 'address_line1' ),
		'addressLine2'               => wrrapd_wrapstars_get_meta( $id, 'address_line2' ),
		'city'                       => wrrapd_wrapstars_get_meta( $id, 'city' ),
		'state'                      => wrrapd_wrapstars_get_meta( $id, 'state' ),
		'postalCode'                 => wrrapd_wrapstars_get_meta( $id, 'postal_code' ),
		'canDeliver'                 => wrrapd_wrapstars_get_meta( $id, 'can_deliver' ),
		'hasVehicle'                 => wrrapd_wrapstars_get_meta( $id, 'has_vehicle' ),
		'deliveryMaxDistance'        => wrrapd_wrapstars_get_meta( $id, 'delivery_max_distance' ),
		'cleanDrivingRecord'         => wrrapd_wrapstars_get_meta( $id, 'clean_driving_record' ),
		'hasLargeFormatPrinter'      => wrrapd_wrapstars_get_meta( $id, 'has_large_format_printer' ),
		'printerSize'                => wrrapd_wrapstars_get_meta( $id, 'printer_size' ),
		'giftWrappingExperience'     => wrrapd_wrapstars_get_meta( $id, 'gift_wrapping_experience' ),
		'whyWrapstar'                => wrrapd_wrapstars_get_meta( $id, 'why_wrapstar' ),
		'gigPlatforms'               => wrrapd_wrapstars_get_meta( $id, 'gig_platforms' ),
		'businessStructure'          => wrrapd_wrapstars_get_meta( $id, 'business_structure' ),
		'bankAccountReady'           => wrrapd_wrapstars_get_meta( $id, 'bank_account_ready' ),
		'wrrapdPoDailyPickup'        => wrrapd_wrapstars_get_meta( $id, 'wrrapd_po_daily_pickup' ),
		'dedicatedWrapWorkspace'     => wrrapd_wrapstars_get_meta( $id, 'dedicated_wrap_workspace' ),
		'comfortableVideoMonitoring' => wrrapd_wrapstars_get_meta( $id, 'comfortable_video_monitoring' ),
		'deliveryProofReady'         => wrrapd_wrapstars_get_meta( $id, 'delivery_proof_ready' ),
		'fitScore'                   => (int) wrrapd_wrapstars_get_meta( $id, 'fit_score' ),
		'fitScoreBreakdown'          => $break,
		'experienceRationale'        => wrrapd_wrapstars_get_meta( $id, 'experience_score_rationale' ),
		'commitmentRationale'        => wrrapd_wrapstars_get_meta( $id, 'commitment_score_rationale' ),
		'adminNotes'                 => wrrapd_wrapstars_get_meta( $id, 'admin_notes' ),
		'rejectReason'               => wrrapd_wrapstars_get_meta( $id, 'reject_reason' ),
		'declineNote'                => wrrapd_wrapstars_get_meta( $id, 'decline_note' ),
		'declinedAt'                 => wrrapd_wrapstars_get_meta( $id, 'declined_at' ),
		'previousDeclinedAt'         => wrrapd_wrapstars_get_meta( $id, 'previous_declined_at' ),
		'reinvitedAt'                => wrrapd_wrapstars_get_meta( $id, 'reinvited_at' ),
		'reinviteCount'              => (int) wrrapd_wrapstars_get_meta( $id, 'reinvite_count', '0' ),
		'mustChangePassword'         => wrrapd_wrapstars_get_meta( $id, 'must_change_password' ) === '1',
		'onboardingStep'             => wrrapd_wrapstars_get_meta( $id, 'onboarding_step' ),
		'onboardingStepsComplete'    => $steps_done,
		'hasIdFile'                  => (bool) wrrapd_wrapstars_get_meta( $id, 'id_file' ),
		'submittedAt'                => wrrapd_wrapstars_get_meta( $id, 'submitted_at' ),
		'approvedAt'                 => wrrapd_wrapstars_get_meta( $id, 'approved_at' ),
		'activatedAt'                => wrrapd_wrapstars_get_meta( $id, 'activated_at' ),
		'interviewAt'                => wrrapd_wrapstars_get_meta( $id, 'interview_at' ),
		'userId'                     => (int) wrrapd_wrapstars_get_meta( $id, 'user_id' ),
		'createdAt'                  => get_post_time( 'c', true, $app ),
	);
}

function wrrapd_wrapstars_ops_register_rest_routes() {
	register_rest_route(
		'wrrapd/v1',
		'/applications',
		array(
			'methods'             => 'GET',
			'callback'            => 'wrrapd_wrapstars_ops_list_applications',
			'permission_callback' => 'wrrapd_wrapstars_ops_api_permission',
		)
	);
	register_rest_route(
		'wrrapd/v1',
		'/applications/(?P<id>\d+)',
		array(
			'methods'             => 'GET',
			'callback'            => 'wrrapd_wrapstars_ops_get_application',
			'permission_callback' => 'wrrapd_wrapstars_ops_api_permission',
		)
	);
	register_rest_route(
		'wrrapd/v1',
		'/applications/(?P<id>\d+)/action',
		array(
			'methods'             => 'POST',
			'callback'            => 'wrrapd_wrapstars_ops_application_action',
			'permission_callback' => 'wrrapd_wrapstars_ops_api_permission',
		)
	);
}
add_action( 'rest_api_init', 'wrrapd_wrapstars_ops_register_rest_routes' );

/**
 * @param WP_REST_Request $request Request.
 * @return WP_REST_Response
 */
function wrrapd_wrapstars_ops_list_applications( $request ) {
	$status = sanitize_text_field( (string) $request->get_param( 'status' ) );
	$meta_query = array();
	if ( $status !== '' && $status !== 'all' ) {
		$meta_query[] = array(
			'key'   => '_wrrapd_ws_status',
			'value' => $status,
		);
	}

	$posts = get_posts(
		array(
			'post_type'      => WRRAPD_WRAPSTARS_CPT,
			'posts_per_page' => 200,
			'post_status'    => 'publish',
			'meta_query'     => $meta_query,
			'orderby'        => 'date',
			'order'          => 'DESC',
		)
	);

	$apps = array();
	foreach ( $posts as $p ) {
		$row = wrrapd_wrapstars_ops_serialize_application( $p->ID );
		if ( $row ) {
			$apps[] = $row;
		}
	}

	return new WP_REST_Response(
		array(
			'ok'           => true,
			'applications' => $apps,
			'count'        => count( $apps ),
		),
		200
	);
}

/**
 * @param WP_REST_Request $request Request.
 * @return WP_REST_Response|WP_Error
 */
function wrrapd_wrapstars_ops_get_application( $request ) {
	$id  = (int) $request['id'];
	$row = wrrapd_wrapstars_ops_serialize_application( $id );
	if ( ! $row ) {
		return new WP_Error( 'not_found', 'Application not found.', array( 'status' => 404 ) );
	}
	return new WP_REST_Response( array( 'ok' => true, 'application' => $row ), 200 );
}

/**
 * @param WP_REST_Request $request Request.
 * @return WP_REST_Response|WP_Error
 */
function wrrapd_wrapstars_ops_application_action( $request ) {
	$id   = (int) $request['id'];
	$body = $request->get_json_params();
	if ( ! is_array( $body ) ) {
		$body = array();
	}
	$action = sanitize_text_field( (string) ( $body['action'] ?? '' ) );
	$result = wrrapd_wrapstars_run_admin_action(
		$id,
		$action,
		array_filter(
			array(
				'admin_notes'   => array_key_exists( 'adminNotes', $body ) || array_key_exists( 'admin_notes', $body )
					? (string) ( $body['adminNotes'] ?? $body['admin_notes'] ?? '' )
					: null,
				'reject_reason' => (string) ( $body['rejectReason'] ?? $body['reject_reason'] ?? '' ),
			),
			static function ( $v ) {
				return $v !== null;
			}
		)
	);
	if ( empty( $result['ok'] ) ) {
		return new WP_Error( 'action_failed', $result['error'] ?? 'Action failed.', array( 'status' => 400 ) );
	}
	$row = wrrapd_wrapstars_ops_serialize_application( $id );
	return new WP_REST_Response(
		array(
			'ok'          => true,
			'result'      => $result,
			'application' => $row,
		),
		200
	);
}
