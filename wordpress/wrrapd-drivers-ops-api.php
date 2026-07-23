<?php
/**
 * Drivers ops API — Command Center reviews Driver applications.
 *
 * Auth: same key as WrapStars — X-Wrrapd-Wrapstars-Ops-Key / WRRAPD_WRAPSTARS_OPS_API_KEY
 * (also accepts X-Wrrapd-Drivers-Ops-Key / WRRAPD_DRIVERS_OPS_API_KEY if set).
 *
 * Routes (namespace wrrapd/v1):
 *   GET  /driver-applications
 *   GET  /driver-applications/{id}
 *   POST /driver-applications/{id}/action
 *
 * @package WrrapdDrivers
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function wrrapd_drivers_ops_api_permission( $request ) {
	$expected = '';
	if ( defined( 'WRRAPD_DRIVERS_OPS_API_KEY' ) && WRRAPD_DRIVERS_OPS_API_KEY !== '' ) {
		$expected = (string) WRRAPD_DRIVERS_OPS_API_KEY;
	} elseif ( defined( 'WRRAPD_WRAPSTARS_OPS_API_KEY' ) && WRRAPD_WRAPSTARS_OPS_API_KEY !== '' ) {
		$expected = (string) WRRAPD_WRAPSTARS_OPS_API_KEY;
	}
	if ( $expected === '' ) {
		return new WP_Error( 'ops_key_missing', 'Ops API key is not configured on WordPress.', array( 'status' => 503 ) );
	}
	$got = '';
	foreach ( array( 'x_wrrapd_drivers_ops_key', 'x_wrrapd_wrapstars_ops_key' ) as $h ) {
		$header = $request->get_header( $h );
		if ( is_string( $header ) && $header !== '' ) {
			$got = $header;
			break;
		}
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

function wrrapd_drivers_run_admin_action( $app_id, $action, $opts = array() ) {
	$app_id = (int) $app_id;
	$app    = get_post( $app_id );
	if ( ! $app || $app->post_type !== WRRAPD_DRIVERS_CPT ) {
		return array( 'ok' => false, 'error' => 'Application not found.' );
	}
	$email  = wrrapd_drivers_get_meta( $app_id, 'email' );
	$name   = wrrapd_drivers_greeting_name( $app_id );
	$action = sanitize_text_field( (string) $action );
	$notes  = array_key_exists( 'admin_notes', $opts )
		? sanitize_textarea_field( (string) $opts['admin_notes'] )
		: null;
	$reason = isset( $opts['reject_reason'] ) ? sanitize_textarea_field( (string) $opts['reject_reason'] ) : '';

	if ( $action === 'save_notes' ) {
		wrrapd_drivers_set_meta( $app_id, 'admin_notes', $notes !== null ? $notes : '' );
		return array( 'ok' => true, 'status' => wrrapd_drivers_get_meta( $app_id, 'status' ) );
	}

	if ( $action === 'interview' ) {
		$current = (string) wrrapd_drivers_get_meta( $app_id, 'status' );
		if ( $current !== 'under_review' ) {
			return array( 'ok' => false, 'error' => 'Interview only from under_review.', 'status' => $current );
		}
		wrrapd_drivers_set_meta( $app_id, 'status', 'interview' );
		wrrapd_drivers_set_meta( $app_id, 'interview_at', gmdate( 'c' ) );
		if ( $notes !== null ) {
			wrrapd_drivers_set_meta( $app_id, 'admin_notes', $notes );
		}
		wrrapd_drivers_send_email(
			$email,
			'Driver application — next step: interview',
			"Hi {$name},\n\nThank you for applying to drive with Wrrapd. We'd like a brief conversation as the next step. We'll reach out by email or text.\n\n— Drivers Team\n"
		);
		return array( 'ok' => true, 'status' => 'interview' );
	}

	if ( $action === 'approve' ) {
		$current = (string) wrrapd_drivers_get_meta( $app_id, 'status' );
		if ( ! in_array( $current, array( 'under_review', 'interview' ), true ) ) {
			return array( 'ok' => false, 'error' => 'Approve cannot run from status “' . $current . '”.', 'status' => $current );
		}
		wrrapd_drivers_set_meta( $app_id, 'status', 'approved' );
		wrrapd_drivers_set_meta( $app_id, 'approved_at', gmdate( 'c' ) );
		wrrapd_drivers_set_meta( $app_id, 'onboarding_step', 'welcome' );
		if ( $notes !== null ) {
			wrrapd_drivers_set_meta( $app_id, 'admin_notes', $notes );
		}
		$provision = wrrapd_drivers_provision_approved_user( $app_id );
		if ( is_wp_error( $provision ) ) {
			return array( 'ok' => false, 'error' => $provision->get_error_message(), 'status' => 'approved' );
		}
		wrrapd_drivers_send_approval_credentials_email( $app_id, $provision['password'] );
		return array( 'ok' => true, 'status' => 'approved', 'passwordIssued' => true );
	}

	if ( $action === 'reject' ) {
		wrrapd_drivers_set_meta( $app_id, 'status', 'rejected' );
		wrrapd_drivers_set_meta( $app_id, 'rejected_at', gmdate( 'c' ) );
		wrrapd_drivers_set_meta( $app_id, 'reject_reason', $reason );
		if ( $notes !== null ) {
			wrrapd_drivers_set_meta( $app_id, 'admin_notes', $notes );
		}
		$body_reason = $reason !== '' ? $reason : 'We are unable to move forward with your application at this time.';
		wrrapd_drivers_send_email( $email, 'Update on your Driver application', "Hi {$name},\n\n{$body_reason}\n" );
		return array( 'ok' => true, 'status' => 'rejected' );
	}

	if ( $action === 'activate' ) {
		$current = (string) wrrapd_drivers_get_meta( $app_id, 'status' );
		if ( $current !== 'approved' ) {
			return array( 'ok' => false, 'error' => 'Activate requires approved status.', 'status' => $current );
		}
		wrrapd_drivers_set_meta( $app_id, 'status', 'active' );
		wrrapd_drivers_set_meta( $app_id, 'activated_at', gmdate( 'c' ) );
		wrrapd_drivers_mark_step_complete( $app_id, 'activation' );
		$user_id = (int) wrrapd_drivers_get_meta( $app_id, 'user_id' );
		if ( $user_id ) {
			wrrapd_drivers_set_user_role( $user_id, 'driver_active' );
		}
		if ( $notes !== null ) {
			wrrapd_drivers_set_meta( $app_id, 'admin_notes', $notes );
		}
		$app_url = wrrapd_drivers_courier_app_url();
		wrrapd_drivers_send_email(
			$email,
			"You're live as a Wrrapd Driver",
			"Hi {$name},\n\nYour Driver account is activated. Open the Driver app to accept delivery offers:\n{$app_url}\n\nSign in with your name or Driver ID and the contractor passcode from Wrrapd.\n"
		);
		return array( 'ok' => true, 'status' => 'active' );
	}

	if ( $action === 'suspend' ) {
		wrrapd_drivers_set_meta( $app_id, 'suspended', '1' );
		if ( $notes !== null ) {
			wrrapd_drivers_set_meta( $app_id, 'admin_notes', $notes );
		}
		return array( 'ok' => true, 'status' => wrrapd_drivers_get_meta( $app_id, 'status' ) );
	}
	if ( $action === 'unsuspend' ) {
		wrrapd_drivers_set_meta( $app_id, 'suspended', '' );
		return array( 'ok' => true, 'status' => wrrapd_drivers_get_meta( $app_id, 'status' ) );
	}
	if ( $action === 'mark_declined' ) {
		$note = $reason !== '' ? $reason : ( $notes !== null ? $notes : '' );
		$result = wrrapd_drivers_mark_offer_declined( $app_id, $note );
		if ( empty( $result['ok'] ) ) {
			return array( 'ok' => false, 'error' => $result['error'] ?? 'Could not mark declined.' );
		}
		return array( 'ok' => true, 'status' => 'declined' );
	}
	if ( $action === 'reinvite' ) {
		$result = wrrapd_drivers_reinvite_declined_offer( $app_id, $notes !== null ? $notes : '' );
		if ( empty( $result['ok'] ) ) {
			return array( 'ok' => false, 'error' => $result['error'] ?? 'Could not re-invite.' );
		}
		return array( 'ok' => true, 'status' => 'approved', 'passwordIssued' => true, 'reinvited' => true );
	}
	if ( $action === 'resend_invite' ) {
		$result = wrrapd_drivers_resend_approval_invite( $app_id );
		if ( empty( $result['ok'] ) ) {
			return array( 'ok' => false, 'error' => $result['error'] ?? 'Could not resend.' );
		}
		return array( 'ok' => true, 'status' => 'approved', 'passwordIssued' => true, 'resent' => true );
	}
	if ( $action === 'reset_to_review' ) {
		$result = wrrapd_drivers_reset_application_to_under_review( $app_id );
		if ( empty( $result['ok'] ) ) {
			return array( 'ok' => false, 'error' => $result['error'] ?? 'Could not reset.' );
		}
		return array( 'ok' => true, 'status' => 'under_review' );
	}
	return array( 'ok' => false, 'error' => 'Unknown action.' );
}

function wrrapd_drivers_ops_serialize_application( $id ) {
	$id  = (int) $id;
	$app = get_post( $id );
	if ( ! $app || $app->post_type !== WRRAPD_DRIVERS_CPT ) {
		return null;
	}
	$steps = array_keys( wrrapd_drivers_onboarding_steps() );
	$steps_done = array();
	foreach ( $steps as $step ) {
		$steps_done[ $step ] = (bool) wrrapd_drivers_step_complete( $id, $step );
	}
	return array(
		'id'                      => $id,
		'applicationType'         => 'driver',
		'status'                  => wrrapd_drivers_get_meta( $id, 'status' ),
		'suspended'               => wrrapd_drivers_get_meta( $id, 'suspended' ) === '1',
		'fullName'                => wrrapd_drivers_get_meta( $id, 'full_name' ),
		'firstName'               => wrrapd_drivers_get_meta( $id, 'first_name' ),
		'nickname'                => wrrapd_drivers_get_meta( $id, 'nickname' ),
		'lastName'                => wrrapd_drivers_get_meta( $id, 'last_name' ),
		'greetingName'            => wrrapd_drivers_greeting_name( $id ),
		'email'                   => wrrapd_drivers_get_meta( $id, 'email' ),
		'phoneMobile'             => wrrapd_drivers_get_meta( $id, 'phone_mobile', wrrapd_drivers_get_meta( $id, 'phone' ) ),
		'addressLine1'            => wrrapd_drivers_get_meta( $id, 'address_line1' ),
		'addressLine2'            => wrrapd_drivers_get_meta( $id, 'address_line2' ),
		'city'                    => wrrapd_drivers_get_meta( $id, 'city' ),
		'state'                   => wrrapd_drivers_get_meta( $id, 'state' ),
		'postalCode'              => wrrapd_drivers_get_meta( $id, 'postal_code' ),
		'age21'                   => wrrapd_drivers_get_meta( $id, 'age_21' ),
		'hasValidLicense'         => wrrapd_drivers_get_meta( $id, 'has_valid_license' ),
		'hasVehicle'              => wrrapd_drivers_get_meta( $id, 'has_vehicle' ),
		'vehicleType'             => wrrapd_drivers_get_meta( $id, 'vehicle_type' ),
		'hasSmartphone'           => wrrapd_drivers_get_meta( $id, 'has_smartphone' ),
		'cleanDrivingRecord'      => wrrapd_drivers_get_meta( $id, 'clean_driving_record' ),
		'availability'            => wrrapd_drivers_get_meta( $id, 'availability' ),
		'whyDrive'                => wrrapd_drivers_get_meta( $id, 'why_drive' ),
		'deliveryExperience'      => wrrapd_drivers_get_meta( $id, 'delivery_experience' ),
		'bankAccountReady'        => wrrapd_drivers_get_meta( $id, 'bank_account_ready' ),
		'adminNotes'              => wrrapd_drivers_get_meta( $id, 'admin_notes' ),
		'rejectReason'            => wrrapd_drivers_get_meta( $id, 'reject_reason' ),
		'declineNote'             => wrrapd_drivers_get_meta( $id, 'decline_note' ),
		'declinedAt'              => wrrapd_drivers_get_meta( $id, 'declined_at' ),
		'previousDeclinedAt'      => wrrapd_drivers_get_meta( $id, 'previous_declined_at' ),
		'reinvitedAt'             => wrrapd_drivers_get_meta( $id, 'reinvited_at' ),
		'reinviteCount'           => (int) wrrapd_drivers_get_meta( $id, 'reinvite_count', '0' ),
		'mustChangePassword'      => wrrapd_drivers_get_meta( $id, 'must_change_password' ) === '1',
		'onboardingStep'          => wrrapd_drivers_get_meta( $id, 'onboarding_step' ),
		'onboardingStepsComplete' => $steps_done,
		'hasIdFile'               => (bool) wrrapd_drivers_get_meta( $id, 'id_file' ),
		'submittedAt'             => wrrapd_drivers_get_meta( $id, 'submitted_at' ),
		'approvedAt'              => wrrapd_drivers_get_meta( $id, 'approved_at' ),
		'inviteExpiresAt'         => wrrapd_drivers_get_invite_expires_at( $id ),
		'inviteExpiredAt'         => wrrapd_drivers_get_meta( $id, 'invite_expired_at' ),
		'activatedAt'             => wrrapd_drivers_get_meta( $id, 'activated_at' ),
		'interviewAt'             => wrrapd_drivers_get_meta( $id, 'interview_at' ),
		'userId'                  => (int) wrrapd_drivers_get_meta( $id, 'user_id' ),
		'createdAt'               => get_post_time( 'c', true, $app ),
		// Compat fields for shared Admin UI.
		'canDeliver'              => 'yes',
		'fitScore'                => 0,
		'fitScoreBreakdown'       => array(),
		'whyWrapstar'             => wrrapd_drivers_get_meta( $id, 'why_drive' ),
	);
}

function wrrapd_drivers_ops_register_rest_routes() {
	if ( ! defined( 'WRRAPD_DRIVERS_CPT' ) ) {
		return;
	}
	register_rest_route(
		'wrrapd/v1',
		'/driver-applications',
		array(
			'methods'             => 'GET',
			'callback'            => 'wrrapd_drivers_ops_list_applications',
			'permission_callback' => 'wrrapd_drivers_ops_api_permission',
		)
	);
	register_rest_route(
		'wrrapd/v1',
		'/driver-applications/(?P<id>\d+)',
		array(
			'methods'             => 'GET',
			'callback'            => 'wrrapd_drivers_ops_get_application',
			'permission_callback' => 'wrrapd_drivers_ops_api_permission',
		)
	);
	register_rest_route(
		'wrrapd/v1',
		'/driver-applications/(?P<id>\d+)/action',
		array(
			'methods'             => 'POST',
			'callback'            => 'wrrapd_drivers_ops_application_action',
			'permission_callback' => 'wrrapd_drivers_ops_api_permission',
		)
	);
}
add_action( 'rest_api_init', 'wrrapd_drivers_ops_register_rest_routes' );

function wrrapd_drivers_ops_list_applications( $request ) {
	$status = sanitize_text_field( (string) $request->get_param( 'status' ) );
	$q      = strtolower( trim( sanitize_text_field( (string) $request->get_param( 'q' ) ) ) );
	$meta_query = array();
	if ( $status !== '' && $status !== 'all' ) {
		$meta_query[] = array(
			'key'   => '_wrrapd_drv_status',
			'value' => $status,
		);
	}
	$posts = get_posts(
		array(
			'post_type'      => WRRAPD_DRIVERS_CPT,
			'posts_per_page' => 200,
			'post_status'    => 'publish',
			'meta_query'     => $meta_query,
			'orderby'        => 'date',
			'order'          => 'DESC',
		)
	);
	$apps = array();
	foreach ( $posts as $p ) {
		$row = wrrapd_drivers_ops_serialize_application( $p->ID );
		if ( ! $row ) {
			continue;
		}
		if ( $q !== '' ) {
			$hay = strtolower(
				(string) ( $row['fullName'] ?? '' ) . ' ' .
				(string) ( $row['email'] ?? '' ) . ' ' .
				(string) ( $row['phoneMobile'] ?? '' ) . ' ' .
				(string) ( $row['city'] ?? '' )
			);
			if ( strpos( $hay, $q ) === false ) {
				continue;
			}
		}
		$apps[] = $row;
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

function wrrapd_drivers_ops_get_application( $request ) {
	$row = wrrapd_drivers_ops_serialize_application( (int) $request['id'] );
	if ( ! $row ) {
		return new WP_Error( 'not_found', 'Application not found.', array( 'status' => 404 ) );
	}
	return new WP_REST_Response( array( 'ok' => true, 'application' => $row ), 200 );
}

function wrrapd_drivers_ops_application_action( $request ) {
	$id   = (int) $request['id'];
	$body = $request->get_json_params();
	if ( ! is_array( $body ) ) {
		$body = array();
	}
	$action = sanitize_text_field( (string) ( $body['action'] ?? '' ) );
	$result = wrrapd_drivers_run_admin_action(
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
	return new WP_REST_Response(
		array(
			'ok'          => true,
			'result'      => $result,
			'application' => wrrapd_drivers_ops_serialize_application( $id ),
		),
		200
	);
}
