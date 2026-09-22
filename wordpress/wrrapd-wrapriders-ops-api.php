<?php
/**
 * WrapRiders ops API — Command Center reviews WrapRider applications (own CPT, own routes).
 *
 * Auth: same key as WrapStars — X-Wrrapd-Wrapstars-Ops-Key / WRRAPD_WRAPSTARS_OPS_API_KEY
 * (also accepts X-Wrrapd-Wrapriders-Ops-Key / WRRAPD_WRAPRIDERS_OPS_API_KEY if set).
 *
 * Routes (namespace wrrapd/v1):
 *   GET  /wraprider-applications
 *   GET  /wraprider-applications/{id}
 *   POST /wraprider-applications/{id}/action
 *
 * @package WrrapdWrapriders
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function wrrapd_wrapriders_ops_api_permission( $request ) {
	$expected = '';
	if ( defined( 'WRRAPD_WRAPRIDERS_OPS_API_KEY' ) && WRRAPD_WRAPRIDERS_OPS_API_KEY !== '' ) {
		$expected = (string) WRRAPD_WRAPRIDERS_OPS_API_KEY;
	} elseif ( defined( 'WRRAPD_WRAPSTARS_OPS_API_KEY' ) && WRRAPD_WRAPSTARS_OPS_API_KEY !== '' ) {
		$expected = (string) WRRAPD_WRAPSTARS_OPS_API_KEY;
	}
	if ( $expected === '' ) {
		return new WP_Error( 'ops_key_missing', 'Ops API key is not configured on WordPress.', array( 'status' => 503 ) );
	}
	$got = '';
	foreach ( array( 'x_wrrapd_wrapriders_ops_key', 'x_wrrapd_wrapstars_ops_key' ) as $h ) {
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

function wrrapd_wrapriders_run_admin_action( $app_id, $action, $opts = array() ) {
	$app_id = (int) $app_id;
	$app    = get_post( $app_id );
	if ( ! $app || $app->post_type !== WRRAPD_WRAPRIDERS_CPT ) {
		return array( 'ok' => false, 'error' => 'Application not found.' );
	}
	$email  = wrrapd_wrapriders_get_meta( $app_id, 'email' );
	$name   = wrrapd_wrapriders_greeting_name( $app_id );
	$action = sanitize_text_field( (string) $action );
	$notes  = array_key_exists( 'admin_notes', $opts )
		? sanitize_textarea_field( (string) $opts['admin_notes'] )
		: null;
	$reason = isset( $opts['reject_reason'] ) ? sanitize_textarea_field( (string) $opts['reject_reason'] ) : '';

	if ( $action === 'save_notes' ) {
		wrrapd_wrapriders_set_meta( $app_id, 'admin_notes', $notes !== null ? $notes : '' );
		wrrapd_wrapriders_set_meta( $app_id, 'notes_updated_at', gmdate( 'c' ) );
		return array( 'ok' => true, 'status' => wrrapd_wrapriders_get_meta( $app_id, 'status' ) );
	}

	if ( $action === 'interview' ) {
		$current = (string) wrrapd_wrapriders_get_meta( $app_id, 'status' );
		if ( $current !== 'under_review' ) {
			return array( 'ok' => false, 'error' => 'Interview only from under_review.', 'status' => $current );
		}
		wrrapd_wrapriders_set_meta( $app_id, 'status', 'interview' );
		wrrapd_wrapriders_set_meta( $app_id, 'interview_at', gmdate( 'c' ) );
		if ( $notes !== null ) {
			wrrapd_wrapriders_set_meta( $app_id, 'admin_notes', $notes );
			wrrapd_wrapriders_set_meta( $app_id, 'notes_updated_at', gmdate( 'c' ) );
		}
		wrrapd_wrapriders_send_email(
			$email,
			'WrapRider application — next step: interview',
			"Hi {$name},\n\nThank you for applying to wrap and deliver with Wrrapd as a WrapRider. We'd like a brief conversation as the next step. We'll reach out by email or text.\n\n— Team Wrrapd\n"
		);
		return array( 'ok' => true, 'status' => 'interview' );
	}

	if ( $action === 'approve_without_interview' ) {
		$opts['skip_interview'] = '1';
		$action                 = 'approve';
	}

	if ( $action === 'approve' ) {
		$current = (string) wrrapd_wrapriders_get_meta( $app_id, 'status' );
		if ( ! in_array( $current, array( 'under_review', 'interview' ), true ) ) {
			return array( 'ok' => false, 'error' => 'Approve cannot run from status “' . $current . '”.', 'status' => $current );
		}
		$skip_interview = ! empty( $opts['skip_interview'] ) || $current === 'under_review';
		if ( $skip_interview ) {
			wrrapd_wrapriders_set_meta( $app_id, 'interview_skipped', '1' );
			wrrapd_wrapriders_set_meta( $app_id, 'interview_skipped_at', gmdate( 'c' ) );
		} else {
			wrrapd_wrapriders_set_meta( $app_id, 'interview_skipped', '0' );
		}
		wrrapd_wrapriders_set_meta( $app_id, 'status', 'approved' );
		wrrapd_wrapriders_set_meta( $app_id, 'approved_at', gmdate( 'c' ) );
		wrrapd_wrapriders_set_meta( $app_id, 'onboarding_step', 'welcome' );
		if ( $notes !== null ) {
			wrrapd_wrapriders_set_meta( $app_id, 'admin_notes', $notes );
			wrrapd_wrapriders_set_meta( $app_id, 'notes_updated_at', gmdate( 'c' ) );
		}
		$provision = wrrapd_wrapriders_provision_approved_user( $app_id );
		if ( is_wp_error( $provision ) ) {
			return array( 'ok' => false, 'error' => $provision->get_error_message(), 'status' => 'approved' );
		}
		wrrapd_wrapriders_send_approval_credentials_email( $app_id, $provision['password'] );
		return array( 'ok' => true, 'status' => 'approved', 'passwordIssued' => true );
	}

	if ( $action === 'reject' ) {
		wrrapd_wrapriders_set_meta( $app_id, 'status', 'rejected' );
		wrrapd_wrapriders_set_meta( $app_id, 'rejected_at', gmdate( 'c' ) );
		wrrapd_wrapriders_set_meta( $app_id, 'reject_reason', $reason );
		if ( $notes !== null ) {
			wrrapd_wrapriders_set_meta( $app_id, 'admin_notes', $notes );
			wrrapd_wrapriders_set_meta( $app_id, 'notes_updated_at', gmdate( 'c' ) );
		}
		$body_reason = $reason !== '' ? $reason : 'We are unable to move forward with your application at this time.';
		wrrapd_wrapriders_send_email( $email, 'Update on your WrapRider application', "Hi {$name},\n\n{$body_reason}\n" );
		return array( 'ok' => true, 'status' => 'rejected' );
	}

	if ( $action === 'activate' ) {
		$current = (string) wrrapd_wrapriders_get_meta( $app_id, 'status' );
		if ( $current !== 'approved' ) {
			return array( 'ok' => false, 'error' => 'Activate requires approved status.', 'status' => $current );
		}
		wrrapd_wrapriders_set_meta( $app_id, 'status', 'active' );
		wrrapd_wrapriders_set_meta( $app_id, 'activated_at', gmdate( 'c' ) );
		wrrapd_wrapriders_mark_step_complete( $app_id, 'activation' );
		$user_id = (int) wrrapd_wrapriders_get_meta( $app_id, 'user_id' );
		if ( $user_id ) {
			wrrapd_wrapriders_set_user_role( $user_id, 'wraprider_active' );
			// Onboarding portal is now closed for them: end any open onboarding sessions.
			if ( function_exists( 'wrrapd_wrapriders_destroy_user_sessions' ) ) {
				wrrapd_wrapriders_destroy_user_sessions( $user_id );
			}
		}
		wrrapd_wrapriders_set_meta( $app_id, 'onboarding_reopened', '' );
		wrrapd_wrapriders_set_meta( $app_id, 'onboarding_closed_at', gmdate( 'c' ) );
		if ( $notes !== null ) {
			wrrapd_wrapriders_set_meta( $app_id, 'admin_notes', $notes );
			wrrapd_wrapriders_set_meta( $app_id, 'notes_updated_at', gmdate( 'c' ) );
		}
		$app_url = wrrapd_wrapriders_app_url();
		wrrapd_wrapriders_send_email(
			$email,
			"You're live as a WrapRider",
			"Hi {$name},\n\nYour WrapRider account is activated. Sign in to the WrapRider app with the same email and password you used for onboarding:\n\n{$app_url}\n\n— Team Wrrapd\n"
		);
		return array( 'ok' => true, 'status' => 'active' );
	}

	if ( $action === 'suspend' ) {
		wrrapd_wrapriders_set_meta( $app_id, 'suspended', '1' );
		wrrapd_wrapriders_set_meta( $app_id, 'suspended_at', gmdate( 'c' ) );
		if ( $notes !== null ) {
			wrrapd_wrapriders_set_meta( $app_id, 'admin_notes', $notes );
			wrrapd_wrapriders_set_meta( $app_id, 'notes_updated_at', gmdate( 'c' ) );
		}
		return array( 'ok' => true, 'status' => wrrapd_wrapriders_get_meta( $app_id, 'status' ) );
	}
	if ( $action === 'unsuspend' ) {
		wrrapd_wrapriders_set_meta( $app_id, 'suspended', '' );
		wrrapd_wrapriders_set_meta( $app_id, 'unsuspended_at', gmdate( 'c' ) );
		return array( 'ok' => true, 'status' => wrrapd_wrapriders_get_meta( $app_id, 'status' ) );
	}

	// Rare: let an active WrapRider back into the onboarding portal (re-sign / re-upload).
	if ( $action === 'reopen_onboarding' ) {
		$current = (string) wrrapd_wrapriders_get_meta( $app_id, 'status' );
		if ( $current !== 'active' ) {
			return array( 'ok' => false, 'error' => 'Only an active WrapRider can have onboarding reopened.', 'status' => $current );
		}
		wrrapd_wrapriders_set_meta( $app_id, 'onboarding_reopened', '1' );
		wrrapd_wrapriders_set_meta( $app_id, 'onboarding_reopened_at', gmdate( 'c' ) );
		if ( $notes !== null ) {
			wrrapd_wrapriders_set_meta( $app_id, 'admin_notes', $notes );
			wrrapd_wrapriders_set_meta( $app_id, 'notes_updated_at', gmdate( 'c' ) );
		}
		$onboarding_url = wrrapd_wrapriders_pros_url( '/wraprider-onboarding/' );
		wrrapd_wrapriders_send_email(
			$email,
			'Your Wrrapd onboarding page is open again',
			"Hi {$name},\n\nWe reopened your onboarding page so you can update a document:\n{$onboarding_url}\n\nSign in with your usual email and password. We'll close it again once you're done.\n"
		);
		return array( 'ok' => true, 'status' => 'active', 'onboardingReopened' => true );
	}

	if ( $action === 'close_onboarding' ) {
		wrrapd_wrapriders_set_meta( $app_id, 'onboarding_reopened', '' );
		wrrapd_wrapriders_set_meta( $app_id, 'onboarding_closed_at', gmdate( 'c' ) );
		$user_id = (int) wrrapd_wrapriders_get_meta( $app_id, 'user_id' );
		if ( $user_id && function_exists( 'wrrapd_wrapriders_destroy_user_sessions' ) ) {
			wrrapd_wrapriders_destroy_user_sessions( $user_id );
		}
		if ( $notes !== null ) {
			wrrapd_wrapriders_set_meta( $app_id, 'admin_notes', $notes );
			wrrapd_wrapriders_set_meta( $app_id, 'notes_updated_at', gmdate( 'c' ) );
		}
		return array( 'ok' => true, 'status' => wrrapd_wrapriders_get_meta( $app_id, 'status' ), 'onboardingReopened' => false );
	}
	if ( $action === 'mark_declined' ) {
		$note = $reason !== '' ? $reason : ( $notes !== null ? $notes : '' );
		$result = wrrapd_wrapriders_mark_offer_declined( $app_id, $note );
		if ( empty( $result['ok'] ) ) {
			return array( 'ok' => false, 'error' => $result['error'] ?? 'Could not mark declined.' );
		}
		return array( 'ok' => true, 'status' => 'declined' );
	}
	if ( $action === 'reinvite' ) {
		$result = wrrapd_wrapriders_reinvite_declined_offer( $app_id, $notes !== null ? $notes : '' );
		if ( empty( $result['ok'] ) ) {
			return array( 'ok' => false, 'error' => $result['error'] ?? 'Could not re-invite.' );
		}
		return array( 'ok' => true, 'status' => 'approved', 'passwordIssued' => true, 'reinvited' => true );
	}
	if ( $action === 'resend_invite' ) {
		$result = wrrapd_wrapriders_resend_approval_invite( $app_id );
		if ( empty( $result['ok'] ) ) {
			return array( 'ok' => false, 'error' => $result['error'] ?? 'Could not resend.' );
		}
		return array( 'ok' => true, 'status' => 'approved', 'passwordIssued' => true, 'resent' => true );
	}
	if ( $action === 'reset_to_review' ) {
		$result = wrrapd_wrapriders_reset_application_to_under_review( $app_id );
		if ( empty( $result['ok'] ) ) {
			return array( 'ok' => false, 'error' => $result['error'] ?? 'Could not reset.' );
		}
		return array( 'ok' => true, 'status' => 'under_review' );
	}

	// Reclassify a WrapRider applicant into WrapStar or JoyRider after review/interview.
	if ( $action === 'move_to_wrapstar' || $action === 'move_to_joyrider' ) {
		$target = $action === 'move_to_wrapstar' ? 'wrapstar' : 'joyrider';
		$result = wrrapd_wrapriders_move_application_to_stream( $app_id, $target, $notes );
		if ( empty( $result['ok'] ) ) {
			return array(
				'ok'     => false,
				'error'  => $result['error'] ?? 'Could not move application.',
				'status' => wrrapd_wrapriders_get_meta( $app_id, 'status' ),
			);
		}
		return $result;
	}

	return array( 'ok' => false, 'error' => 'Unknown action.' );
}

/**
 * Copy relevant WrapRider fields into a new WrapStar or JoyRider application, archive unused
 * fields on the source, and mark the source “[Switched to …]”.
 *
 * @param int         $app_id WrapRider application ID.
 * @param string      $target 'wrapstar' | 'joyrider'
 * @param string|null $notes  Optional reviewer notes to append.
 * @return array{ok:bool,error?:string,status?:string,newApplicationId?:int,targetRole?:string,targetLabel?:string}
 */
function wrrapd_wrapriders_move_application_to_stream( $app_id, $target, $notes = null ) {
	$app_id = (int) $app_id;
	$app    = get_post( $app_id );
	if ( ! $app || $app->post_type !== WRRAPD_WRAPRIDERS_CPT ) {
		return array( 'ok' => false, 'error' => 'Application not found.' );
	}

	$current = (string) wrrapd_wrapriders_get_meta( $app_id, 'status' );
	if ( $current === 'switched' || strpos( $current, 'switched' ) === 0 ) {
		return array( 'ok' => false, 'error' => 'This application was already switched.', 'status' => $current );
	}
	if ( ! in_array( $current, array( 'under_review', 'interview' ), true ) ) {
		return array(
			'ok'     => false,
			'error'  => 'Move only from under_review or interview (current: “' . $current . '”).',
			'status' => $current,
		);
	}

	$target = $target === 'joyrider' ? 'joyrider' : 'wrapstar';
	$label  = $target === 'joyrider' ? 'JoyRider' : 'WrapStar';

	if ( $target === 'wrapstar' && ! function_exists( 'wrrapd_wrapstars_set_meta' ) ) {
		return array( 'ok' => false, 'error' => 'WrapStar plugins are not loaded on this WordPress install.' );
	}
	if ( $target === 'joyrider' && ! function_exists( 'wrrapd_drivers_set_meta' ) ) {
		return array( 'ok' => false, 'error' => 'JoyRider plugins are not loaded on this WordPress install.' );
	}

	$email = strtolower( trim( (string) wrrapd_wrapriders_get_meta( $app_id, 'email' ) ) );
	if ( $email === '' || ! is_email( $email ) ) {
		return array( 'ok' => false, 'error' => 'Source application is missing a valid email.' );
	}

	// Block duplicate open apps in the destination stream.
	if ( $target === 'wrapstar' && function_exists( 'wrrapd_wrapstars_get_application_by_email' ) ) {
		$existing = wrrapd_wrapstars_get_application_by_email( $email );
		if ( $existing ) {
			$ex_status = (string) wrrapd_wrapstars_get_meta( $existing->ID, 'status' );
			if ( ! in_array( $ex_status, array( 'rejected', 'declined' ), true ) ) {
				return array(
					'ok'    => false,
					'error' => 'A WrapStar application already exists for this email (#' . (int) $existing->ID . ', ' . $ex_status . ').',
				);
			}
		}
	}
	if ( $target === 'joyrider' && function_exists( 'wrrapd_drivers_get_application_by_email' ) ) {
		$existing = wrrapd_drivers_get_application_by_email( $email );
		if ( $existing ) {
			$ex_status = (string) wrrapd_drivers_get_meta( $existing->ID, 'status' );
			if ( ! in_array( $ex_status, array( 'rejected', 'declined' ), true ) ) {
				return array(
					'ok'    => false,
					'error' => 'A JoyRider application already exists for this email (#' . (int) $existing->ID . ', ' . $ex_status . ').',
				);
			}
		}
	}

	$g = function ( $key, $default = '' ) use ( $app_id ) {
		return wrrapd_wrapriders_get_meta( $app_id, $key, $default );
	};

	$shared = array(
		'full_name'              => $g( 'full_name' ),
		'first_name'             => $g( 'first_name' ),
		'nickname'               => $g( 'nickname' ),
		'middle_name'            => $g( 'middle_name' ),
		'last_name'              => $g( 'last_name' ),
		'email'                  => $email,
		'phone'                  => $g( 'phone_mobile', $g( 'phone' ) ),
		'phone_mobile'           => $g( 'phone_mobile', $g( 'phone' ) ),
		'address_line1'          => $g( 'address_line1' ),
		'address_line2'          => $g( 'address_line2' ),
		'city'                   => $g( 'city' ),
		'state'                  => $g( 'state' ),
		'postal_code'            => $g( 'postal_code' ),
		'bank_account_ready'     => $g( 'bank_account_ready' ),
		'ack_background_check'   => $g( 'ack_background_check', '1' ),
		'ack_contact'            => $g( 'ack_contact', '1' ),
		'id_file'                => $g( 'id_file' ),
		'driving_abstract_file'  => $g( 'driving_abstract_file' ),
		'age_21'                 => $g( 'age_21' ),
		'has_valid_license'      => $g( 'has_valid_license' ),
		'has_smartphone'         => $g( 'has_smartphone' ),
	);

	$wrap_fields = array(
		'gift_wrapping_experience'     => $g( 'gift_wrapping_experience' ),
		'dedicated_wrap_workspace'     => $g( 'dedicated_wrap_workspace' ),
		'has_large_format_printer'     => $g( 'has_large_format_printer' ),
		'printer_size'                 => $g( 'printer_size' ),
		'comfortable_video_monitoring' => $g( 'comfortable_video_monitoring' ),
		'why_wrapstar'                 => $g( 'why_wraprider' ),
		'ack_video'                    => '1',
		'ack_zoom_interview'           => '1',
	);

	$delivery_fields = array(
		'has_vehicle'           => $g( 'has_vehicle' ),
		'vehicle_type'          => $g( 'vehicle_type' ),
		'clean_driving_record'  => $g( 'clean_driving_record' ),
		'delivery_max_distance' => $g( 'delivery_max_distance' ),
		'availability'          => $g( 'availability' ),
		'why_drive'             => $g( 'why_wraprider' ),
		'delivery_experience'   => $g( 'delivery_experience' ),
		'ack_age_vehicle'       => $g( 'ack_age_vehicle', '1' ),
	);

	// Snapshot every WrapRider meta key for archival (unused + used).
	$all_meta     = get_post_meta( $app_id );
	$archive_raw  = array();
	foreach ( $all_meta as $mk => $vals ) {
		if ( strpos( (string) $mk, '_wrrapd_wr_' ) !== 0 ) {
			continue;
		}
		$short               = substr( (string) $mk, strlen( '_wrrapd_wr_' ) );
		$archive_raw[ $short ] = is_array( $vals ) ? ( $vals[0] ?? '' ) : $vals;
	}

	$mapped_keys = array_keys( $shared );
	if ( $target === 'wrapstar' ) {
		$mapped_keys = array_merge( $mapped_keys, array_keys( $wrap_fields ) );
		// Keep a few delivery answers only as archive on WrapStar (not primary fields).
	} else {
		$mapped_keys = array_merge( $mapped_keys, array_keys( $delivery_fields ) );
	}
	$mapped_keys = array_unique( $mapped_keys );
	$unused      = array();
	foreach ( $archive_raw as $k => $v ) {
		if ( in_array( $k, $mapped_keys, true ) ) {
			continue;
		}
		if ( $v === '' || $v === null ) {
			continue;
		}
		$unused[ $k ] = $v;
	}
	// For WrapStar move, delivery-only answers are unused; for JoyRider, wrap-only answers are unused.
	if ( $target === 'wrapstar' ) {
		foreach ( $delivery_fields as $k => $v ) {
			if ( $v !== '' && $v !== null ) {
				$unused[ $k ] = $v;
			}
		}
	} else {
		foreach ( $wrap_fields as $k => $v ) {
			if ( $k === 'ack_video' || $k === 'ack_zoom_interview' ) {
				continue;
			}
			if ( $v !== '' && $v !== null ) {
				$unused[ $k ] = $v;
			}
		}
	}

	$full_name = (string) $shared['full_name'];
	if ( $full_name === '' ) {
		$full_name = trim( $shared['first_name'] . ' ' . $shared['last_name'] );
	}
	$post_title = $full_name . ' — ' . $email;

	if ( $target === 'wrapstar' ) {
		$new_id = wp_insert_post(
			array(
				'post_type'   => WRRAPD_WRAPSTARS_CPT,
				'post_status' => 'publish',
				'post_title'  => $post_title,
			),
			true
		);
		if ( is_wp_error( $new_id ) || ! $new_id ) {
			return array( 'ok' => false, 'error' => 'Could not create WrapStar application.' );
		}
		$new_id = (int) $new_id;
		$set    = 'wrrapd_wrapstars_set_meta';
		foreach ( $shared as $k => $v ) {
			call_user_func( $set, $new_id, $k, $v );
		}
		foreach ( $wrap_fields as $k => $v ) {
			call_user_func( $set, $new_id, $k, $v );
		}
		call_user_func( $set, $new_id, 'status', 'under_review' );
		call_user_func( $set, $new_id, 'user_id', 0 );
		call_user_func( $set, $new_id, 'tier', 'new' );
		call_user_func( $set, $new_id, 'submitted_at', gmdate( 'c' ) );
		call_user_func( $set, $new_id, 'application_type', 'wrapstar' );
		call_user_func( $set, $new_id, 'switched_from_wraprider_id', (string) $app_id );
		call_user_func( $set, $new_id, 'switched_from_at', gmdate( 'c' ) );
		call_user_func( $set, $new_id, 'imported_unused_fields', wp_json_encode( $unused ) );
		$note_line = 'Moved from WrapRider application #' . $app_id . ' on ' . gmdate( 'Y-m-d' ) . ' UTC.';
		$prev      = trim( (string) ( $notes !== null ? $notes : $g( 'admin_notes' ) ) );
		call_user_func( $set, $new_id, 'admin_notes', $prev !== '' ? $prev . "\n" . $note_line : $note_line );
		call_user_func( $set, $new_id, 'notes_updated_at', gmdate( 'c' ) );
	} else {
		$new_id = wp_insert_post(
			array(
				'post_type'   => WRRAPD_DRIVERS_CPT,
				'post_status' => 'publish',
				'post_title'  => $post_title,
			),
			true
		);
		if ( is_wp_error( $new_id ) || ! $new_id ) {
			return array( 'ok' => false, 'error' => 'Could not create JoyRider application.' );
		}
		$new_id = (int) $new_id;
		$set    = 'wrrapd_drivers_set_meta';
		foreach ( $shared as $k => $v ) {
			call_user_func( $set, $new_id, $k, $v );
		}
		foreach ( $delivery_fields as $k => $v ) {
			call_user_func( $set, $new_id, $k, $v );
		}
		call_user_func( $set, $new_id, 'status', 'under_review' );
		call_user_func( $set, $new_id, 'user_id', 0 );
		call_user_func( $set, $new_id, 'submitted_at', gmdate( 'c' ) );
		call_user_func( $set, $new_id, 'application_type', 'driver' );
		call_user_func( $set, $new_id, 'switched_from_wraprider_id', (string) $app_id );
		call_user_func( $set, $new_id, 'switched_from_at', gmdate( 'c' ) );
		call_user_func( $set, $new_id, 'imported_unused_fields', wp_json_encode( $unused ) );
		$note_line = 'Moved from WrapRider application #' . $app_id . ' on ' . gmdate( 'Y-m-d' ) . ' UTC.';
		$prev      = trim( (string) ( $notes !== null ? $notes : $g( 'admin_notes' ) ) );
		call_user_func( $set, $new_id, 'admin_notes', $prev !== '' ? $prev . "\n" . $note_line : $note_line );
		call_user_func( $set, $new_id, 'notes_updated_at', gmdate( 'c' ) );
	}

	// Mark source WrapRider as switched — keep full archive, stop hire progress.
	$switch_code = '[Switched to ' . $label . ']';
	$new_title   = $switch_code . ' ' . $app->post_title;
	wp_update_post(
		array(
			'ID'         => $app_id,
			'post_title' => $new_title,
		)
	);
	wrrapd_wrapriders_set_meta( $app_id, 'status', 'switched_to_' . ( $target === 'joyrider' ? 'joyrider' : 'wrapstar' ) );
	wrrapd_wrapriders_set_meta( $app_id, 'switched_to', $target );
	wrrapd_wrapriders_set_meta( $app_id, 'switched_to_label', $label );
	wrrapd_wrapriders_set_meta( $app_id, 'switched_to_app_id', (string) $new_id );
	wrrapd_wrapriders_set_meta( $app_id, 'switched_at', gmdate( 'c' ) );
	wrrapd_wrapriders_set_meta( $app_id, 'switched_unused_fields', wp_json_encode( $unused ) );
	wrrapd_wrapriders_set_meta( $app_id, 'switched_archive', wp_json_encode( $archive_raw ) );
	if ( $notes !== null ) {
		wrrapd_wrapriders_set_meta( $app_id, 'admin_notes', $notes );
		wrrapd_wrapriders_set_meta( $app_id, 'notes_updated_at', gmdate( 'c' ) );
	}

	return array(
		'ok'               => true,
		'status'           => wrrapd_wrapriders_get_meta( $app_id, 'status' ),
		'newApplicationId' => $new_id,
		'targetRole'       => $target === 'joyrider' ? 'driver' : 'wrapstar',
		'targetLabel'      => $label,
		'switchCode'       => $switch_code,
	);
}

function wrrapd_wrapriders_ops_serialize_application( $id ) {
	$id  = (int) $id;
	$app = get_post( $id );
	if ( ! $app || $app->post_type !== WRRAPD_WRAPRIDERS_CPT ) {
		return null;
	}
	$steps = array_keys( wrrapd_wrapriders_onboarding_steps() );
	$steps_done = array();
	foreach ( $steps as $step ) {
		$steps_done[ $step ] = (bool) wrrapd_wrapriders_step_complete( $id, $step );
	}
	return array(
		'id'                      => $id,
		'applicationType'         => 'wraprider',
		'status'                  => wrrapd_wrapriders_get_meta( $id, 'status' ),
		'suspended'               => wrrapd_wrapriders_get_meta( $id, 'suspended' ) === '1',
		'fullName'                => wrrapd_wrapriders_get_meta( $id, 'full_name' ),
		'firstName'               => wrrapd_wrapriders_get_meta( $id, 'first_name' ),
		'nickname'                => wrrapd_wrapriders_get_meta( $id, 'nickname' ),
		'lastName'                => wrrapd_wrapriders_get_meta( $id, 'last_name' ),
		'greetingName'            => wrrapd_wrapriders_greeting_name( $id ),
		'email'                   => wrrapd_wrapriders_get_meta( $id, 'email' ),
		'phoneMobile'             => wrrapd_wrapriders_get_meta( $id, 'phone_mobile', wrrapd_wrapriders_get_meta( $id, 'phone' ) ),
		'addressLine1'            => wrrapd_wrapriders_get_meta( $id, 'address_line1' ),
		'addressLine2'            => wrrapd_wrapriders_get_meta( $id, 'address_line2' ),
		'city'                    => wrrapd_wrapriders_get_meta( $id, 'city' ),
		'state'                   => wrrapd_wrapriders_get_meta( $id, 'state' ),
		'postalCode'              => wrrapd_wrapriders_get_meta( $id, 'postal_code' ),
		'age21'                   => wrrapd_wrapriders_get_meta( $id, 'age_21' ),
		'hasValidLicense'         => wrrapd_wrapriders_get_meta( $id, 'has_valid_license' ),
		'hasVehicle'              => wrrapd_wrapriders_get_meta( $id, 'has_vehicle' ),
		'vehicleType'             => wrrapd_wrapriders_get_meta( $id, 'vehicle_type' ),
		'hasSmartphone'           => wrrapd_wrapriders_get_meta( $id, 'has_smartphone' ),
		'cleanDrivingRecord'      => wrrapd_wrapriders_get_meta( $id, 'clean_driving_record' ),
		'deliveryMaxDistance'     => wrrapd_wrapriders_get_meta( $id, 'delivery_max_distance' ),
		'availability'            => wrrapd_wrapriders_get_meta( $id, 'availability' ),
		'whyWraprider'            => wrrapd_wrapriders_get_meta( $id, 'why_wraprider' ),
		'deliveryExperience'      => wrrapd_wrapriders_get_meta( $id, 'delivery_experience' ),
		// Wrapping half of the hybrid role.
		'giftWrappingExperience'  => wrrapd_wrapriders_get_meta( $id, 'gift_wrapping_experience' ),
		'dedicatedWrapWorkspace'  => wrrapd_wrapriders_get_meta( $id, 'dedicated_wrap_workspace' ),
		'hasLargeFormatPrinter'   => wrrapd_wrapriders_get_meta( $id, 'has_large_format_printer' ),
		'printerSize'             => wrrapd_wrapriders_get_meta( $id, 'printer_size' ),
		'comfortableVideoMonitoring' => wrrapd_wrapriders_get_meta( $id, 'comfortable_video_monitoring' ),
		'workspaceAddress'        => wrrapd_wrapriders_get_meta( $id, 'workspace_address' ),
		'workspaceWindows'        => array_values( array_filter( explode( ',', (string) wrrapd_wrapriders_get_meta( $id, 'workspace_windows' ) ) ) ),
		'workspaceNotes'          => wrrapd_wrapriders_get_meta( $id, 'workspace_notes' ),
		'workspaceConfirmedAt'    => wrrapd_wrapriders_get_meta( $id, 'workspace_confirmed_at' ),
		'orientationScore'        => wrrapd_wrapriders_get_meta( $id, 'orientation_score' ),
		'hasInsuranceFile'        => (bool) wrrapd_wrapriders_get_meta( $id, 'insurance_file' ),
		'bankAccountReady'        => wrrapd_wrapriders_get_meta( $id, 'bank_account_ready' ),
		'adminNotes'              => wrrapd_wrapriders_get_meta( $id, 'admin_notes' ),
		'rejectReason'            => wrrapd_wrapriders_get_meta( $id, 'reject_reason' ),
		'declineNote'             => wrrapd_wrapriders_get_meta( $id, 'decline_note' ),
		'declinedAt'              => wrrapd_wrapriders_get_meta( $id, 'declined_at' ),
		'previousDeclinedAt'      => wrrapd_wrapriders_get_meta( $id, 'previous_declined_at' ),
		'reinvitedAt'             => wrrapd_wrapriders_get_meta( $id, 'reinvited_at' ),
		'reinviteCount'           => (int) wrrapd_wrapriders_get_meta( $id, 'reinvite_count', '0' ),
		'mustChangePassword'      => wrrapd_wrapriders_get_meta( $id, 'must_change_password' ) === '1',
		'onboardingStep'          => wrrapd_wrapriders_get_meta( $id, 'onboarding_step' ),
		'onboardingStepsComplete' => $steps_done,
		'esignSuite'              => wrrapd_wrapriders_get_meta( $id, 'esign_suite' ),
		'esignVersion'            => wrrapd_wrapriders_get_meta( $id, 'esign_version' ),
		'esignAcceptedAt'         => wrrapd_wrapriders_get_meta( $id, 'esign_accepted_at' ),
		'esignTypedName'          => wrrapd_wrapriders_get_meta( $id, 'esign_typed_name' ),
		'esignIp'                 => wrrapd_wrapriders_get_meta( $id, 'esign_ip' ),
		'esignUa'                 => wrrapd_wrapriders_get_meta( $id, 'esign_ua' ),
		'esignDocs'               => wrrapd_wrapriders_get_meta( $id, 'esign_docs' ),
		'esignMethod'             => wrrapd_wrapriders_get_meta( $id, 'esign_method' ),
		'icSignedAt'              => wrrapd_wrapriders_get_meta( $id, 'ic_signed_at' ),
		'hasIdFile'               => (bool) wrrapd_wrapriders_get_meta( $id, 'id_file' ),
		'hasDrivingAbstractFile'  => (bool) wrrapd_wrapriders_get_meta( $id, 'driving_abstract_file' ),
		'submittedAt'             => wrrapd_wrapriders_get_meta( $id, 'submitted_at' ),
		'approvedAt'              => wrrapd_wrapriders_get_meta( $id, 'approved_at' ),
		'inviteSentAt'            => wrrapd_wrapriders_get_meta( $id, 'portal_password_issued_at' ),
		'inviteExpiresAt'         => wrrapd_wrapriders_get_invite_expires_at( $id ),
		'inviteExpiredAt'         => wrrapd_wrapriders_get_meta( $id, 'invite_expired_at' ),
		'activatedAt'             => wrrapd_wrapriders_get_meta( $id, 'activated_at' ),
		'interviewAt'             => wrrapd_wrapriders_get_meta( $id, 'interview_at' ),
		'interviewSkipped'        => wrrapd_wrapriders_get_meta( $id, 'interview_skipped' ) === '1',
		'interviewSkippedAt'      => wrrapd_wrapriders_get_meta( $id, 'interview_skipped_at' ),
		'rejectedAt'              => wrrapd_wrapriders_get_meta( $id, 'rejected_at' ),
		'suspendedAt'             => wrrapd_wrapriders_get_meta( $id, 'suspended_at' ),
		'unsuspendedAt'           => wrrapd_wrapriders_get_meta( $id, 'unsuspended_at' ),
		'notesUpdatedAt'          => wrrapd_wrapriders_get_meta( $id, 'notes_updated_at' ),
		'resetAt'                 => wrrapd_wrapriders_get_meta( $id, 'reset_at' ),
		'passwordChangedAt'       => wrrapd_wrapriders_get_meta( $id, 'password_changed_at' ),
		'portalLastLoginAt'       => wrrapd_wrapriders_get_meta( $id, 'portal_last_login_at' ),
		'portalLoginCount'        => (int) wrrapd_wrapriders_get_meta( $id, 'portal_login_count', '0' ),
		'onboardingReopened'      => wrrapd_wrapriders_get_meta( $id, 'onboarding_reopened' ) === '1',
		'onboardingReopenedAt'    => wrrapd_wrapriders_get_meta( $id, 'onboarding_reopened_at' ),
		'onboardingClosedAt'      => wrrapd_wrapriders_get_meta( $id, 'onboarding_closed_at' ),
		'userId'                  => (int) wrrapd_wrapriders_get_meta( $id, 'user_id' ),
		'createdAt'               => get_post_time( 'c', true, $app ),
		'switchedTo'              => wrrapd_wrapriders_get_meta( $id, 'switched_to' ),
		'switchedToLabel'         => wrrapd_wrapriders_get_meta( $id, 'switched_to_label' ),
		'switchedToAppId'         => (int) wrrapd_wrapriders_get_meta( $id, 'switched_to_app_id', '0' ),
		'switchedAt'              => wrrapd_wrapriders_get_meta( $id, 'switched_at' ),
		// Compat fields for shared Admin UI.
		'canDeliver'              => 'yes',
		'fitScore'                => 0,
		'fitScoreBreakdown'       => array(),
		'whyWrapstar'             => wrrapd_wrapriders_get_meta( $id, 'why_wraprider' ),
		'whyDrive'                => wrrapd_wrapriders_get_meta( $id, 'why_wraprider' ),
	);
}

function wrrapd_wrapriders_ops_register_rest_routes() {
	if ( ! defined( 'WRRAPD_WRAPRIDERS_CPT' ) ) {
		return;
	}
	register_rest_route(
		'wrrapd/v1',
		'/wraprider-applications',
		array(
			'methods'             => 'GET',
			'callback'            => 'wrrapd_wrapriders_ops_list_applications',
			'permission_callback' => 'wrrapd_wrapriders_ops_api_permission',
		)
	);
	register_rest_route(
		'wrrapd/v1',
		'/wraprider-applications/(?P<id>\d+)',
		array(
			'methods'             => 'GET',
			'callback'            => 'wrrapd_wrapriders_ops_get_application',
			'permission_callback' => 'wrrapd_wrapriders_ops_api_permission',
		)
	);
	register_rest_route(
		'wrrapd/v1',
		'/wraprider-applications/(?P<id>\d+)/action',
		array(
			'methods'             => 'POST',
			'callback'            => 'wrrapd_wrapriders_ops_application_action',
			'permission_callback' => 'wrrapd_wrapriders_ops_api_permission',
		)
	);
}
add_action( 'rest_api_init', 'wrrapd_wrapriders_ops_register_rest_routes' );

function wrrapd_wrapriders_ops_list_applications( $request ) {
	$status = sanitize_text_field( (string) $request->get_param( 'status' ) );
	$q      = strtolower( trim( sanitize_text_field( (string) $request->get_param( 'q' ) ) ) );
	$meta_query = array();
	if ( $status !== '' && $status !== 'all' ) {
		$meta_query[] = array(
			'key'   => '_wrrapd_wr_status',
			'value' => $status,
		);
	}
	$posts = get_posts(
		array(
			'post_type'      => WRRAPD_WRAPRIDERS_CPT,
			'posts_per_page' => 200,
			'post_status'    => 'publish',
			'meta_query'     => $meta_query,
			'orderby'        => 'date',
			'order'          => 'DESC',
		)
	);
	$apps = array();
	foreach ( $posts as $p ) {
		$row = wrrapd_wrapriders_ops_serialize_application( $p->ID );
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

function wrrapd_wrapriders_ops_get_application( $request ) {
	$row = wrrapd_wrapriders_ops_serialize_application( (int) $request['id'] );
	if ( ! $row ) {
		return new WP_Error( 'not_found', 'Application not found.', array( 'status' => 404 ) );
	}
	return new WP_REST_Response( array( 'ok' => true, 'application' => $row ), 200 );
}

function wrrapd_wrapriders_ops_application_action( $request ) {
	$id   = (int) $request['id'];
	$body = $request->get_json_params();
	if ( ! is_array( $body ) ) {
		$body = array();
	}
	$action = sanitize_text_field( (string) ( $body['action'] ?? '' ) );
	$result = wrrapd_wrapriders_run_admin_action(
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
			'application' => wrrapd_wrapriders_ops_serialize_application( $id ),
		),
		200
	);
}
