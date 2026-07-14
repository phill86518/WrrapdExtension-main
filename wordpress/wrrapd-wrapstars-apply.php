<?php
/**
 * WrapStars multi-screen application flow + fit scoring.
 *
 * @package WrrapdWrapStars
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @return string */
function wrrapd_wrapstars_apply_required_mark() {
	return ' <span class="ws-required" aria-hidden="true">*</span>';
}

/** @return array<string, string> */
function wrrapd_wrapstars_po_pickup_options() {
	return array(
		''           => 'Select…',
		'daily'      => 'Yes — I can pick up most business days',
		'few_weekly' => 'A few times a week works for me',
		'discuss'    => "I'd like to discuss timing",
		'no'         => 'Not at this time',
	);
}

/** @return array<string, string> */
function wrrapd_wrapstars_wrap_workspace_options() {
	return array(
		''      => 'Select…',
		'yes'   => 'Yes — I have a dedicated space (home is fine)',
		'setup' => 'I could set up a dedicated space',
		'no'    => 'Not at this time',
	);
}

/** @return array<string, string> */
function wrrapd_wrapstars_video_monitoring_options() {
	return array(
		''     => 'Select…',
		'yes'  => "Yes — I'm comfortable with that",
		'learn' => "I'd like to learn more first",
		'no'   => 'Not at this time',
	);
}

/** @return array<string, string> */
function wrrapd_wrapstars_delivery_proof_options() {
	return array(
		''      => 'Select…',
		'yes'   => "Yes — I'm set up or can do this easily",
		'setup' => 'I can set this up with guidance',
		'unsure' => 'Not sure yet',
	);
}

/** @param array<string, string> $options */
function wrrapd_wrapstars_apply_option_label( $options, $value ) {
	return $options[ $value ] ?? (string) $value;
}

/** @return array<string, string> */
function wrrapd_wrapstars_delivery_distance_options() {
	return array(
		''       => 'Select…',
		'upto5'  => 'Up to 5 miles',
		'5-15'   => '5–15 miles',
		'15-30'  => '15–30 miles',
		'30-50'  => '30–50 miles',
		'50plus' => '50+ miles',
	);
}

/** @return array<string, string> */
function wrrapd_wrapstars_printer_size_options() {
	return array(
		''      => 'Select…',
		'under24' => 'Under 24 inches',
		'24'    => '24 inches',
		'36'    => '36 inches',
		'44plus' => '44 inches or larger',
	);
}

/** @return array<string, string> */
function wrrapd_wrapstars_apply_state_options() {
	return array(
		''      => 'Select…',
		'FL'    => 'Florida',
		'GA'    => 'Georgia',
		'OTHER' => 'Other',
	);
}

/** @return array<string, string> */
function wrrapd_wrapstars_driving_record_options() {
	return array(
		''        => 'Select…',
		'yes'     => 'Yes',
		'no'      => 'No',
		'discuss' => 'Prefer to discuss',
	);
}

/** @return array<string, string> */
function wrrapd_wrapstars_business_structure_options() {
	return array(
		''         => 'Select…',
		'individual' => 'Individual',
		'llc'      => 'LLC',
		'other'    => 'Other business entity',
	);
}

/** @return array<string, string> */
function wrrapd_wrapstars_gig_platform_options() {
	return array(
		'uber'       => 'Uber',
		'doordash'   => 'DoorDash',
		'instacart'  => 'Instacart',
		'taskrabbit' => 'TaskRabbit',
		'other'      => 'Other',
		'none'       => 'None',
	);
}

/** @return string */
function wrrapd_wrapstars_build_full_name( $first, $middle, $last ) {
	$parts = array_filter(
		array(
			trim( (string) $first ),
			trim( (string) $middle ),
			trim( (string) $last ),
		)
	);
	return implode( ' ', $parts );
}

/** @return bool */
function wrrapd_wrapstars_apply_rate_limit_ok() {
	$ip  = isset( $_SERVER['REMOTE_ADDR'] ) ? (string) $_SERVER['REMOTE_ADDR'] : 'unknown';
	$key = 'wrrapd_ws_apply_rl_' . md5( $ip );
	$n   = (int) get_transient( $key );
	if ( $n >= 5 ) {
		return false;
	}
	set_transient( $key, $n + 1, HOUR_IN_SECONDS );
	return true;
}

/** @return array{ok:bool,error?:string} */
function wrrapd_wrapstars_apply_bot_checks() {
	if ( ! empty( $_POST['ws_company_website'] ) ) {
		return array( 'ok' => false, 'error' => 'We could not process this submission. Please try again.' );
	}
	$started = (int) ( $_POST['ws_form_started_at'] ?? 0 );
	if ( $started > 0 && ( time() - $started ) < 12 ) {
		return array( 'ok' => false, 'error' => 'Please take a moment to complete each step before submitting.' );
	}
	if ( ! wrrapd_wrapstars_apply_rate_limit_ok() ) {
		return array( 'ok' => false, 'error' => 'Too many applications from this connection. Please try again later.' );
	}
	return array( 'ok' => true );
}

/** @return array{api_key:string,model:string,endpoint:string} */
function wrrapd_wrapstars_grok_config() {
	$api_key = '';
	if ( defined( 'WRRAPD_WRAPSTARS_GROK_API_KEY' ) ) {
		$api_key = (string) WRRAPD_WRAPSTARS_GROK_API_KEY;
	} elseif ( defined( 'WRRAPD_WRAPSTARS_XAI_API_KEY' ) ) {
		$api_key = (string) WRRAPD_WRAPSTARS_XAI_API_KEY;
	}

	$model = defined( 'WRRAPD_WRAPSTARS_GROK_MODEL' )
		? (string) WRRAPD_WRAPSTARS_GROK_MODEL
		: 'grok-3-mini';

	$endpoint = defined( 'WRRAPD_WRAPSTARS_GROK_API_URL' )
		? (string) WRRAPD_WRAPSTARS_GROK_API_URL
		: 'https://api.x.ai/v1/chat/completions';

	return array(
		'api_key'  => trim( $api_key ),
		'model'    => $model !== '' ? $model : 'grok-3-mini',
		'endpoint' => $endpoint !== '' ? $endpoint : 'https://api.x.ai/v1/chat/completions',
	);
}

/**
 * @param string $raw
 * @return array{score?:float,rationale?:string}|null
 */
function wrrapd_wrapstars_parse_ai_score_json( $raw ) {
	$raw = trim( (string) $raw );
	if ( $raw === '' ) {
		return null;
	}

	if ( preg_match( '/```(?:json)?\s*(\{.*?\})\s*```/s', $raw, $matches ) ) {
		$raw = $matches[1];
	} elseif ( preg_match( '/\{.*\}/s', $raw, $matches ) ) {
		$raw = $matches[0];
	}

	$json = json_decode( $raw, true );
	return is_array( $json ) ? $json : null;
}

/**
 * @param string $text
 * @param string $kind experience|commitment
 * @return array{score:float,rationale:string}
 */
function wrrapd_wrapstars_ai_score_text( $text, $kind ) {
	$text = trim( (string) $text );
	if ( $text === '' ) {
		return array( 'score' => 0, 'rationale' => 'No response provided.' );
	}

	$grok    = wrrapd_wrapstars_grok_config();
	$api_key = $grok['api_key'];
	if ( $api_key !== '' ) {
		$max_pts = $kind === 'experience' ? 20 : 15;
		$prompt  = $kind === 'experience'
			? "Score this gift-wrapping experience answer from 0 to {$max_pts}. Reply with JSON only, no markdown: {\"score\":number,\"rationale\":\"one short sentence\"}. Criteria: none=0-5, some=6-12, extensive/specific=13-{$max_pts}.\n\nAnswer:\n{$text}"
			: "Score this motivation/commitment answer from 0 to {$max_pts}. Reply with JSON only, no markdown: {\"score\":number,\"rationale\":\"one short sentence\"}. Reward concrete local plans and specificity over generic enthusiasm.\n\nAnswer:\n{$text}";

		$response = wp_remote_post(
			$grok['endpoint'],
			array(
				'timeout' => 25,
				'headers' => array(
					'Authorization' => 'Bearer ' . $api_key,
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode(
					array(
						'model'       => $grok['model'],
						'temperature' => 0.2,
						'messages'    => array(
							array(
								'role'    => 'system',
								'content' => 'You score WrapStar job applications. Return valid JSON only.',
							),
							array( 'role' => 'user', 'content' => $prompt ),
						),
					)
				),
			)
		);

		if ( ! is_wp_error( $response ) ) {
			$body = json_decode( wp_remote_retrieve_body( $response ), true );
			$raw  = $body['choices'][0]['message']['content'] ?? '';
			$json = wrrapd_wrapstars_parse_ai_score_json( $raw );
			if ( is_array( $json ) && isset( $json['score'] ) ) {
				$score = max( 0, min( $max_pts, (float) $json['score'] ) );
				return array(
					'score'     => $score,
					'rationale' => sanitize_text_field( (string) ( $json['rationale'] ?? 'Grok scored response.' ) ),
				);
			}
		}
	}

	return wrrapd_wrapstars_heuristic_text_score( $text, $kind );
}

/**
 * @param string $text
 * @param string $kind
 * @return array{score:float,rationale:string}
 */
function wrrapd_wrapstars_heuristic_text_score( $text, $kind ) {
	$words = str_word_count( $text );
	$lower = strtolower( $text );

	if ( $kind === 'experience' ) {
		$score = 4;
		if ( $words >= 25 ) {
			$score += 6;
		} elseif ( $words >= 12 ) {
			$score += 3;
		}
		foreach ( array( 'wrap', 'ribbon', 'retail', 'season', 'holiday', 'bow', 'paper', 'client', 'store' ) as $kw ) {
			if ( str_contains( $lower, $kw ) ) {
				$score += 1.5;
			}
		}
		$score = min( 20, $score );
		$rationale = $score >= 14 ? 'Detailed, specific wrapping experience.' : ( $score >= 8 ? 'Some relevant experience described.' : 'Limited or generic experience noted.' );
		return array( 'score' => $score, 'rationale' => $rationale );
	}

	$score = 3;
	if ( $words >= 40 ) {
		$score += 5;
	} elseif ( $words >= 20 ) {
		$score += 3;
	}
	foreach ( array( 'area', 'neighborhood', 'community', 'local', 'plan', 'reliable', 'commit', 'florida', 'georgia' ) as $kw ) {
		if ( str_contains( $lower, $kw ) ) {
			$score += 1.2;
		}
	}
	$score = min( 15, $score );
	$rationale = $score >= 11 ? 'Shows concrete local commitment.' : ( $score >= 7 ? 'Moderately specific motivation.' : 'Generic or brief motivation.' );
	return array( 'score' => $score, 'rationale' => $rationale );
}

/**
 * @param array<string, mixed> $app
 * @return array{total:int,breakdown:array<string,float>,rationales:array<string,string>}
 */
function wrrapd_wrapstars_compute_fit_score( $app ) {
	$exp_ai = wrrapd_wrapstars_ai_score_text( (string) ( $app['gift_wrapping_experience'] ?? '' ), 'experience' );
	$com_ai = wrrapd_wrapstars_ai_score_text( (string) ( $app['why_wrapstar'] ?? '' ), 'commitment' );

	$printer_pts = 0;
	if ( ( $app['has_large_format_printer'] ?? '' ) === 'yes' ) {
		$printer_pts = 12;
		$size        = (string) ( $app['printer_size'] ?? '' );
		if ( $size === 'under24' ) {
			$printer_pts = 8;
		} elseif ( $size === '24' ) {
			$printer_pts = 10;
		}
	}

	$delivery_pts = 2;
	if ( ( $app['can_deliver'] ?? '' ) === 'yes' ) {
		$map = array( 'upto5' => 4, '5-15' => 6, '15-30' => 8, '30-50' => 9, '50plus' => 10 );
		$delivery_pts = $map[ (string) ( $app['delivery_max_distance'] ?? '' ) ] ?? 5;
	}

	$driving_pts = 5; // Neutral when delivery branch not applicable.
	if ( ( $app['can_deliver'] ?? '' ) === 'yes' ) {
		$driving_map = array( 'yes' => 10, 'discuss' => 6, 'no' => 2 );
		$driving_pts = $driving_map[ (string) ( $app['clean_driving_record'] ?? '' ) ] ?? 0;
	}

	$gig_pts = 5;
	$platforms = $app['gig_platforms'] ?? array();
	if ( is_string( $platforms ) ) {
		$platforms = array_filter( explode( ',', $platforms ) );
	}
	if ( is_array( $platforms ) && $platforms !== array() && ! in_array( 'none', $platforms, true ) ) {
		$gig_pts = 10;
	}

	$structure_pts = 4;
	$structure     = (string) ( $app['business_structure'] ?? '' );
	if ( in_array( $structure, array( 'individual', 'llc' ), true ) ) {
		$structure_pts = 8;
	} elseif ( $structure === 'other' ) {
		$structure_pts = 5;
	}

	$state = strtoupper( (string) ( $app['state'] ?? '' ) );
	$loc_pts = in_array( $state, array( 'FL', 'GA' ), true ) ? 10 : 6;

	$bank_pts = ( ( $app['bank_account_ready'] ?? '' ) === 'yes' ) ? 5 : 2;

	$breakdown = array(
		'experience'        => round( $exp_ai['score'], 1 ),
		'printer'           => (float) $printer_pts,
		'delivery'          => (float) $delivery_pts,
		'driving'           => (float) $driving_pts,
		'gig_experience'    => (float) $gig_pts,
		'business_structure' => (float) $structure_pts,
		'location'          => (float) $loc_pts,
		'commitment'        => round( $com_ai['score'], 1 ),
		'bank_ready'        => (float) $bank_pts,
	);

	$total = (int) round( array_sum( $breakdown ) );

	return array(
		'total'       => min( 100, $total ),
		'breakdown'   => $breakdown,
		'rationales'  => array(
			'experience' => $exp_ai['rationale'],
			'commitment' => $com_ai['rationale'],
		),
	);
}

function wrrapd_wrapstars_process_application() {
	if ( ! wrrapd_wrapstars_is_apply_host() ) {
		return;
	}
	if ( ! isset( $_POST['wrrapd_ws_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_ws_nonce'] ) ), 'wrrapd_ws_apply' ) ) {
		return;
	}

	$bot = wrrapd_wrapstars_apply_bot_checks();
	if ( ! $bot['ok'] ) {
		$GLOBALS['wrrapd_ws_form_errors'] = array( $bot['error'] );
		return;
	}

	$first_name   = sanitize_text_field( wp_unslash( $_POST['first_name'] ?? '' ) );
	$middle_name  = sanitize_text_field( wp_unslash( $_POST['middle_name'] ?? '' ) );
	$last_name    = sanitize_text_field( wp_unslash( $_POST['last_name'] ?? '' ) );
	$full_name    = wrrapd_wrapstars_build_full_name( $first_name, $middle_name, $last_name );
	$email        = sanitize_email( wp_unslash( $_POST['email'] ?? '' ) );
	$phone_mobile = sanitize_text_field( wp_unslash( $_POST['phone_mobile'] ?? '' ) );
	$phone_work   = sanitize_text_field( wp_unslash( $_POST['phone_work'] ?? '' ) );
	$address      = sanitize_text_field( wp_unslash( $_POST['address_line1'] ?? '' ) );
	$address2     = sanitize_text_field( wp_unslash( $_POST['address_line2'] ?? '' ) );
	$city         = sanitize_text_field( wp_unslash( $_POST['city'] ?? '' ) );
	$state        = strtoupper( sanitize_text_field( wp_unslash( $_POST['state'] ?? '' ) ) );
	$zip          = sanitize_text_field( wp_unslash( $_POST['postal_code'] ?? '' ) );
	$has_vehicle  = sanitize_text_field( wp_unslash( $_POST['has_vehicle'] ?? '' ) );
	$can_deliver  = sanitize_text_field( wp_unslash( $_POST['can_deliver'] ?? '' ) );
	$delivery_max_distance = sanitize_text_field( wp_unslash( $_POST['delivery_max_distance'] ?? '' ) );
	$clean_driving_record  = sanitize_text_field( wp_unslash( $_POST['clean_driving_record'] ?? '' ) );
	$has_large_format_printer = sanitize_text_field( wp_unslash( $_POST['has_large_format_printer'] ?? '' ) );
	$printer_size = sanitize_text_field( wp_unslash( $_POST['printer_size'] ?? '' ) );
	$gift_wrapping_experience = sanitize_textarea_field( wp_unslash( $_POST['gift_wrapping_experience'] ?? '' ) );
	$why_wrapstar = sanitize_textarea_field( wp_unslash( $_POST['why_wrapstar'] ?? '' ) );
	$business_structure = sanitize_text_field( wp_unslash( $_POST['business_structure'] ?? '' ) );
	$business_structure_note = sanitize_text_field( wp_unslash( $_POST['business_structure_note'] ?? '' ) );
	$bank_account_ready = sanitize_text_field( wp_unslash( $_POST['bank_account_ready'] ?? '' ) );
	$gig_other = sanitize_text_field( wp_unslash( $_POST['gig_platforms_other'] ?? '' ) );

	$gig_platforms = array();
	if ( ! empty( $_POST['gig_platforms'] ) && is_array( $_POST['gig_platforms'] ) ) {
		$allowed_gig = array_keys( wrrapd_wrapstars_gig_platform_options() );
		foreach ( $_POST['gig_platforms'] as $g ) {
			$g = sanitize_text_field( wp_unslash( $g ) );
			if ( in_array( $g, $allowed_gig, true ) ) {
				$gig_platforms[] = $g;
			}
		}
	}
	$gig_platforms = array_values( array_unique( $gig_platforms ) );

	$distance_options = wrrapd_wrapstars_delivery_distance_options();
	$printer_options  = wrrapd_wrapstars_printer_size_options();
	$state_options    = wrrapd_wrapstars_apply_state_options();

	$errors = array();
	if ( $first_name === '' || $last_name === '' ) {
		$errors[] = 'First and last name are required.';
	}
	if ( ! is_email( $email ) ) {
		$errors[] = 'Valid email is required.';
	}
	if ( $phone_mobile === '' ) {
		$errors[] = 'Mobile phone number is required.';
	}
	if ( $address === '' || $city === '' || $zip === '' ) {
		$errors[] = 'Complete address is required.';
	}
	if ( $state === '' || ! isset( $state_options[ $state ] ) ) {
		$errors[] = 'Please select your state.';
	}
	if ( ! in_array( $can_deliver, array( 'yes', 'no' ), true ) ) {
		$errors[] = 'Please indicate whether you are able to deliver wrapped gifts.';
	}
	if ( $can_deliver === 'yes' ) {
		if ( ! in_array( $has_vehicle, array( 'yes', 'no' ), true ) ) {
			$errors[] = 'Please indicate whether you have a vehicle.';
		}
		if ( ! in_array( $clean_driving_record, array( 'yes', 'no', 'discuss' ), true ) ) {
			$errors[] = 'Please answer the driving record question.';
		}
		if ( $delivery_max_distance === '' || ! isset( $distance_options[ $delivery_max_distance ] ) ) {
			$errors[] = 'Please select your maximum delivery distance.';
		}
	} else {
		$has_vehicle           = '';
		$clean_driving_record  = '';
		$delivery_max_distance = '';
	}
	if ( ! in_array( $has_large_format_printer, array( 'yes', 'no' ), true ) ) {
		$errors[] = 'Please indicate whether you are able to print wrapping paper for custom designs.';
	}
	if ( $has_large_format_printer === 'yes' && ( $printer_size === '' || ! isset( $printer_options[ $printer_size ] ) ) ) {
		$errors[] = 'Please select your printer size.';
	}
	if ( $has_large_format_printer === 'no' ) {
		$printer_size = '';
	}
	if ( $gift_wrapping_experience === '' ) {
		$errors[] = 'Please describe your gift-wrapping experience.';
	}
	if ( ! in_array( $business_structure, array( 'individual', 'llc', 'other' ), true ) ) {
		$errors[] = 'Please select how you are applying.';
	}
	if ( $business_structure === 'other' && $business_structure_note === '' ) {
		$errors[] = 'Please briefly describe your business entity.';
	}
	if ( ! in_array( $bank_account_ready, array( 'yes', 'no' ), true ) ) {
		$errors[] = 'Please indicate bank account readiness.';
	}
	$comfortable_reship = sanitize_text_field( wp_unslash( $_POST['comfortable_reship'] ?? '' ) );
	$has_mailing_address = sanitize_text_field( wp_unslash( $_POST['has_mailing_address'] ?? '' ) );
	$wrrapd_po_daily_pickup = sanitize_text_field( wp_unslash( $_POST['wrrapd_po_daily_pickup'] ?? '' ) );
	$dedicated_wrap_workspace = sanitize_text_field( wp_unslash( $_POST['dedicated_wrap_workspace'] ?? '' ) );
	$comfortable_video_monitoring = sanitize_text_field( wp_unslash( $_POST['comfortable_video_monitoring'] ?? '' ) );
	$delivery_proof_ready = sanitize_text_field( wp_unslash( $_POST['delivery_proof_ready'] ?? '' ) );

	$po_pickup_options = wrrapd_wrapstars_po_pickup_options();
	$workspace_options = wrrapd_wrapstars_wrap_workspace_options();
	$video_options     = wrrapd_wrapstars_video_monitoring_options();
	$proof_options     = wrrapd_wrapstars_delivery_proof_options();

	if ( $has_vehicle === 'yes' ) {
		if ( ! isset( $po_pickup_options[ $wrrapd_po_daily_pickup ] ) || $wrrapd_po_daily_pickup === '' ) {
			$errors[] = 'Please answer the Wrrapd PO pickup question.';
		}
	} else {
		$wrrapd_po_daily_pickup = '';
	}
	if ( ! isset( $workspace_options[ $dedicated_wrap_workspace ] ) || $dedicated_wrap_workspace === '' ) {
		$errors[] = 'Please answer the dedicated workspace question.';
	}
	if ( ! isset( $video_options[ $comfortable_video_monitoring ] ) || $comfortable_video_monitoring === '' ) {
		$errors[] = 'Please answer the video monitoring question.';
	}
	if ( ! isset( $proof_options[ $delivery_proof_ready ] ) || $delivery_proof_ready === '' ) {
		$errors[] = 'Please answer the proof-of-delivery upload question.';
	}
	if ( empty( $_POST['ack_background_check'] ) ) {
		$errors[] = 'Background check authorization is required.';
	}
	if ( empty( $_POST['ack_video'] ) ) {
		$errors[] = 'You must agree to Wrrapd video standards.';
	}
	if ( empty( $_POST['ack_contact'] ) || empty( $_POST['ack_zoom_interview'] ) ) {
		$errors[] = 'You must agree to application contact and Zoom interview terms.';
	}
	if ( $why_wrapstar === '' ) {
		$errors[] = 'Please tell us why you want to become a WrapStar.';
	}

	if ( $errors ) {
		$GLOBALS['wrrapd_ws_form_errors'] = $errors;
		return;
	}

	$existing = wrrapd_wrapstars_get_application_by_email( $email );
	if ( $existing && wrrapd_wrapstars_get_meta( $existing->ID, 'status' ) !== 'rejected' ) {
		$st = (string) wrrapd_wrapstars_get_meta( $existing->ID, 'status', 'under_review' );
		$GLOBALS['wrrapd_ws_form_errors'] = array(
			'An application already exists for this email (status: ' . $st . '). Our team reviews it in Command Center → Applications. Email ' . wrrapd_wrapstars_from_email_address() . ' if you need an update — do not submit a second application.',
		);
		return;
	}

	$post_id = wp_insert_post(
		array(
			'post_type'   => WRRAPD_WRAPSTARS_CPT,
			'post_title'  => $full_name . ' — ' . $email,
			'post_status' => 'publish',
		)
	);

	if ( ! $post_id || is_wp_error( $post_id ) ) {
		$GLOBALS['wrrapd_ws_form_errors'] = array( 'Could not save application.' );
		return;
	}

	$app_row = array(
		'gift_wrapping_experience' => $gift_wrapping_experience,
		'why_wrapstar'             => $why_wrapstar,
		'has_large_format_printer' => $has_large_format_printer,
		'printer_size'             => $printer_size,
		'can_deliver'              => $can_deliver,
		'delivery_max_distance'    => $delivery_max_distance,
		'clean_driving_record'     => $clean_driving_record,
		'gig_platforms'            => $gig_platforms,
		'business_structure'       => $business_structure,
		'state'                    => $state,
		'bank_account_ready'       => $bank_account_ready,
	);
	$fit = wrrapd_wrapstars_compute_fit_score( $app_row );

	wrrapd_wrapstars_set_meta( $post_id, 'status', 'under_review' );
	wrrapd_wrapstars_set_meta( $post_id, 'user_id', 0 );
	wrrapd_wrapstars_set_meta( $post_id, 'full_name', $full_name );
	wrrapd_wrapstars_set_meta( $post_id, 'first_name', $first_name );
	wrrapd_wrapstars_set_meta( $post_id, 'middle_name', $middle_name );
	wrrapd_wrapstars_set_meta( $post_id, 'last_name', $last_name );
	wrrapd_wrapstars_set_meta( $post_id, 'email', strtolower( $email ) );
	wrrapd_wrapstars_set_meta( $post_id, 'phone', $phone_mobile );
	wrrapd_wrapstars_set_meta( $post_id, 'phone_mobile', $phone_mobile );
	wrrapd_wrapstars_set_meta( $post_id, 'phone_work', $phone_work );
	wrrapd_wrapstars_set_meta( $post_id, 'address_line1', $address );
	wrrapd_wrapstars_set_meta( $post_id, 'address_line2', $address2 );
	wrrapd_wrapstars_set_meta( $post_id, 'city', $city );
	wrrapd_wrapstars_set_meta( $post_id, 'state', $state );
	wrrapd_wrapstars_set_meta( $post_id, 'postal_code', $zip );
	wrrapd_wrapstars_set_meta( $post_id, 'has_vehicle', $has_vehicle );
	wrrapd_wrapstars_set_meta( $post_id, 'can_deliver', $can_deliver );
	wrrapd_wrapstars_set_meta( $post_id, 'delivery_max_distance', $delivery_max_distance );
	wrrapd_wrapstars_set_meta( $post_id, 'clean_driving_record', $clean_driving_record );
	wrrapd_wrapstars_set_meta( $post_id, 'has_large_format_printer', $has_large_format_printer );
	wrrapd_wrapstars_set_meta( $post_id, 'printer_size', $printer_size );
	wrrapd_wrapstars_set_meta( $post_id, 'gift_wrapping_experience', $gift_wrapping_experience );
	wrrapd_wrapstars_set_meta( $post_id, 'gig_platforms', implode( ',', $gig_platforms ) );
	wrrapd_wrapstars_set_meta( $post_id, 'gig_platforms_other', $gig_other );
	wrrapd_wrapstars_set_meta( $post_id, 'business_structure', $business_structure );
	wrrapd_wrapstars_set_meta( $post_id, 'business_structure_note', $business_structure_note );
	wrrapd_wrapstars_set_meta( $post_id, 'bank_account_ready', $bank_account_ready );
	wrrapd_wrapstars_set_meta( $post_id, 'wrrapd_po_daily_pickup', $wrrapd_po_daily_pickup );
	wrrapd_wrapstars_set_meta( $post_id, 'dedicated_wrap_workspace', $dedicated_wrap_workspace );
	wrrapd_wrapstars_set_meta( $post_id, 'comfortable_video_monitoring', $comfortable_video_monitoring );
	wrrapd_wrapstars_set_meta( $post_id, 'delivery_proof_ready', $delivery_proof_ready );
	wrrapd_wrapstars_set_meta( $post_id, 'why_wrapstar', $why_wrapstar );
	wrrapd_wrapstars_set_meta( $post_id, 'ack_background_check', '1' );
	wrrapd_wrapstars_set_meta( $post_id, 'ack_video', '1' );
	wrrapd_wrapstars_set_meta( $post_id, 'ack_contact', '1' );
	wrrapd_wrapstars_set_meta( $post_id, 'ack_zoom_interview', '1' );
	wrrapd_wrapstars_set_meta( $post_id, 'fit_score', (string) $fit['total'] );
	wrrapd_wrapstars_set_meta( $post_id, 'fit_score_breakdown', wp_json_encode( $fit['breakdown'] ) );
	wrrapd_wrapstars_set_meta( $post_id, 'experience_score_rationale', $fit['rationales']['experience'] );
	wrrapd_wrapstars_set_meta( $post_id, 'commitment_score_rationale', $fit['rationales']['commitment'] );
	wrrapd_wrapstars_set_meta( $post_id, 'submitted_at', gmdate( 'c' ) );
	wrrapd_wrapstars_set_meta( $post_id, 'tier', 'new' );

	$upload = wrrapd_wrapstars_handle_upload( $post_id, 'gov_id' );
	if ( ! $upload['ok'] ) {
		wp_delete_post( $post_id, true );
		$GLOBALS['wrrapd_ws_form_errors'] = array( $upload['error'] );
		return;
	}
	wrrapd_wrapstars_set_meta( $post_id, 'id_file', $upload['path'] );

	$candidate_body  = "Hi {$full_name},\n\n";
	$candidate_body .= "Thank you for applying to become a WrapStar!\n\n";
	$candidate_body .= "Your application is under review. We'll be in touch within about 7 days. ";
	$candidate_body .= "If your application advances, we may contact you by email or text to schedule a brief recorded Zoom interview.\n\n";
	$candidate_body .= "If approved, you will receive login credentials from " . wrrapd_wrapstars_from_email_address() . ".\n\n";
	$candidate_body .= "— WrapStars Team\n";
	wrrapd_wrapstars_send_email( $email, 'Thank you — your WrapStar application is under review', $candidate_body );

	$admin_body  = "New WrapStar application (fit score {$fit['total']}/100).\n\n";
	$admin_body .= "Name: {$full_name}\nEmail: {$email}\nMobile: {$phone_mobile}\n";
	$admin_body .= "Location: {$address}" . ( $address2 !== '' ? ', ' . $address2 : '' ) . ", {$city}, {$state} {$zip}\n";
	$admin_body .= 'Interim queue: ' . admin_url( 'admin.php?page=wrrapd-wrapstars' ) . "\n";
	wrrapd_wrapstars_send_email(
		wrrapd_wrapstars_admin_notify_email(),
		'New WrapStar application: ' . $full_name . ' (' . $fit['total'] . '/100)',
		$admin_body
	);

	wp_safe_redirect( wrrapd_wrapstars_apply_url( '/thank-you/' ) );
	exit;
}

function wrrapd_wrapstars_shortcode_apply() {
	if ( ! wrrapd_wrapstars_is_apply_host() ) {
		return '<p class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">Apply at <a href="' . esc_url( wrrapd_wrapstars_apply_url( '/apply/' ) ) . '">apply.wrrapd.com</a>.</p>';
	}

	$errors = $GLOBALS['wrrapd_ws_form_errors'] ?? array();
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapstars-dasher wrrapd-apply-wizard-root">
		<?php foreach ( $errors as $err ) : ?>
			<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $err ); ?></div>
		<?php endforeach; ?>

		<form class="wrrapd-apply-wizard wrrapd-wrapstars-form" id="wrrapd-wrapstar-apply-form" method="post" enctype="multipart/form-data" novalidate>
			<?php wp_nonce_field( 'wrrapd_ws_apply', 'wrrapd_ws_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="apply" />
			<input type="hidden" name="ws_form_started_at" id="ws_form_started_at" value="" />
			<label class="wrrapd-apply-honeypot" aria-hidden="true" tabindex="-1">Company website <input type="text" name="ws_company_website" autocomplete="off" tabindex="-1" /></label>

			<div class="wrrapd-apply-wizard__progress" aria-live="polite" hidden>
				<div class="wrrapd-apply-wizard__progress-track"><div class="wrrapd-apply-wizard__progress-fill" id="wrrapd-apply-progress-fill"></div></div>
				<p class="wrrapd-apply-wizard__progress-label" id="wrrapd-apply-progress-label"></p>
			</div>

			<div class="wrrapd-apply-wizard__layout">
				<div class="wrrapd-apply-wizard__main">
					<section class="wrrapd-apply-screen is-active" data-screen="0" data-step-label="" data-screen-type="basics">
						<h1 class="wrrapd-apply-hero-title">Let's become a WrapStar!</h1>

						<div class="wrrapd-apply-basics-fields">
						<div class="ws-field-row ws-field-row--3">
							<div class="ws-field">
								<label for="ws-first-name">First name<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
								<input type="text" id="ws-first-name" name="first_name" autocomplete="given-name" required />
							</div>
							<div class="ws-field">
								<label for="ws-middle-name">Middle name</label>
								<input type="text" id="ws-middle-name" name="middle_name" autocomplete="additional-name" />
							</div>
							<div class="ws-field">
								<label for="ws-last-name">Last name<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
								<input type="text" id="ws-last-name" name="last_name" autocomplete="family-name" required />
							</div>
						</div>

						<div class="ws-field">
							<label for="ws-email">Email address<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
							<input type="email" id="ws-email" name="email" autocomplete="email" required />
						</div>

						<div class="ws-field-row">
							<div class="ws-field">
								<label for="ws-phone-mobile">Mobile phone<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
								<input type="tel" id="ws-phone-mobile" name="phone_mobile" autocomplete="tel" inputmode="tel" maxlength="14" placeholder="(555) 555-5555" required />
							</div>
							<div class="ws-field">
								<label for="ws-phone-work">Work phone</label>
								<input type="tel" id="ws-phone-work" name="phone_work" autocomplete="tel" inputmode="tel" maxlength="14" placeholder="(555) 555-5555" />
							</div>
						</div>

						<div class="ws-field wrrapd-address-lines">
							<label for="ws-address-line1">Street address<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
							<div class="wrrapd-address-autocomplete-wrap">
								<input type="text" id="ws-address-line1" name="address_line1" autocomplete="off" spellcheck="false" data-lpignore="true" data-1p-ignore placeholder="Street address" required />
								<ul class="wrrapd-address-suggestions" id="ws-address-suggestions" role="listbox" hidden></ul>
							</div>
							<input type="text" id="ws-address-line2" name="address_line2" class="wrrapd-address-line2" autocomplete="address-line2" placeholder="Apt, suite, unit, etc. (optional)" />
						</div>

						<div class="ws-field-row ws-field-row--3">
							<div class="ws-field">
								<label for="ws-city">City<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
								<input type="text" id="ws-city" name="city" autocomplete="address-level2" required />
							</div>
							<div class="ws-field">
								<label for="wrrapd-ws-state">State<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
								<select name="state" id="wrrapd-ws-state" required>
									<?php foreach ( wrrapd_wrapstars_apply_state_options() as $value => $label ) : ?>
										<option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $label ); ?></option>
									<?php endforeach; ?>
								</select>
							</div>
							<div class="ws-field">
								<label for="ws-postal-code">ZIP code<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
								<input type="text" id="ws-postal-code" name="postal_code" autocomplete="postal-code" inputmode="numeric" maxlength="10" required pattern="[0-9]{5}(-[0-9]{4})?" />
							</div>
						</div>
						<p class="wrrapd-apply-note" id="wrrapd-ws-state-note" hidden>We're launching in Florida and Georgia first — applicants in other states are welcome; service may be limited initially.</p>
						<div class="wrrapd-address-suggest-panel" id="wrrapd-address-suggest-panel" hidden>
							<p class="wrrapd-address-suggest-panel__label">Did you mean this address?</p>
							<p class="wrrapd-address-suggest-panel__text" id="wrrapd-address-suggest-text"></p>
							<div class="wrrapd-address-suggest-panel__actions">
								<button type="button" class="wrrapd-wrapstars-btn" id="wrrapd-address-suggest-use">Use suggested address</button>
								<button type="button" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--ghost" id="wrrapd-address-suggest-keep">Keep what I entered</button>
							</div>
						</div>
						</div>
						<div class="wrrapd-apply-basics-nav">
							<button type="button" class="wrrapd-wrapstars-btn wrrapd-apply-basics-next" id="wrrapd-apply-basics-next" disabled>Next</button>
						</div>
					</section>

					<section class="wrrapd-apply-screen" data-screen="1" data-step-label="Step 1 of 5">
						<h2>Your setup</h2>
						<div class="ws-field">
							<label for="wrrapd-ws-can-deliver">Are you able to deliver wrapped gifts?<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
							<select name="can_deliver" id="wrrapd-ws-can-deliver" required><option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option></select>
						</div>
						<div class="wrrapd-wrapstars-conditional" id="wrrapd-ws-deliver-branch" hidden>
							<div class="ws-field">
								<label for="ws-has-vehicle">Do you have a vehicle?<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
								<select name="has_vehicle" id="ws-has-vehicle"><option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option></select>
							</div>
							<div class="ws-field">
								<label for="ws-driving-record">Do you have a clean driving record?<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
								<select name="clean_driving_record" id="ws-driving-record">
									<?php foreach ( wrrapd_wrapstars_driving_record_options() as $value => $label ) : ?>
										<option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $label ); ?></option>
									<?php endforeach; ?>
								</select>
							</div>
							<div class="ws-field">
								<label for="wrrapd-ws-delivery-distance">Maximum delivery distance<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
								<select name="delivery_max_distance" id="wrrapd-ws-delivery-distance">
									<?php foreach ( wrrapd_wrapstars_delivery_distance_options() as $value => $label ) : ?>
										<option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $label ); ?></option>
									<?php endforeach; ?>
								</select>
							</div>
						</div>
						<div class="ws-field">
							<label for="wrrapd-ws-has-printer">Are you able to print wrapping paper for custom designs?<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
							<select name="has_large_format_printer" id="wrrapd-ws-has-printer" required><option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option></select>
						</div>
						<div class="ws-field wrrapd-wrapstars-conditional" id="wrrapd-ws-printer-size-wrap" hidden>
							<label for="wrrapd-ws-printer-size">Printer size</label>
							<select name="printer_size" id="wrrapd-ws-printer-size">
								<?php foreach ( wrrapd_wrapstars_printer_size_options() as $value => $label ) : ?>
									<option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $label ); ?></option>
								<?php endforeach; ?>
							</select>
						</div>
					</section>

					<section class="wrrapd-apply-screen" data-screen="2" data-step-label="Step 2 of 5">
						<h2>Your experience</h2>
						<div class="ws-field">
							<label for="ws-gift-experience">Prior experience in gift-wrapping</label>
							<textarea name="gift_wrapping_experience" id="ws-gift-experience" rows="4" required placeholder="Tell us about a time you wrapped something you were proud of."></textarea>
						</div>
						<fieldset class="wrrapd-apply-fieldset">
							<legend>Have you worked on gig-economy platforms before?</legend>
							<?php foreach ( wrrapd_wrapstars_gig_platform_options() as $value => $label ) : ?>
								<label class="ws-check ws-check--inline"><input type="checkbox" name="gig_platforms[]" value="<?php echo esc_attr( $value ); ?>" /> <span><?php echo esc_html( $label ); ?></span></label>
							<?php endforeach; ?>
						</fieldset>
						<div class="ws-field">
							<label for="ws-gig-other">Other gig platforms (optional)</label>
							<input type="text" id="ws-gig-other" name="gig_platforms_other" />
						</div>
						<div class="ws-field">
							<label for="wrrapd-ws-business-structure">Are you applying as an individual or a registered business?</label>
							<select name="business_structure" id="wrrapd-ws-business-structure" required>
								<?php foreach ( wrrapd_wrapstars_business_structure_options() as $value => $label ) : ?>
									<option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $label ); ?></option>
								<?php endforeach; ?>
							</select>
						</div>
						<div class="ws-field wrrapd-wrapstars-conditional" id="wrrapd-ws-business-note-wrap" hidden>
							<label for="wrrapd-ws-business-note">Describe your business entity</label>
							<input type="text" name="business_structure_note" id="wrrapd-ws-business-note" />
						</div>
					</section>

					<section class="wrrapd-apply-screen" data-screen="3" data-step-label="Step 3 of 5">
						<h2>Getting paid &amp; authorization</h2>
						<div class="ws-field">
							<label for="ws-bank-ready">Do you have a bank account you could receive payments into?<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
							<select name="bank_account_ready" id="ws-bank-ready" required><option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option></select>
						</div>
						<div class="wrrapd-apply-disclosure">
							<h3>Background check authorization</h3>
							<p>If you are approved, Wrrapd may obtain consumer reports about you (such as motor vehicle records and criminal background information) through a third-party screening provider, consistent with applicable law. This authorization is separate from other agreements below.</p>
							<label class="ws-check"><input type="checkbox" name="ack_background_check" value="1" id="ack_bg" required /> <span><label for="ack_bg">I authorize Wrrapd to obtain consumer reports for eligibility screening if my application advances.</label></span></label>
						</div>
						<div class="wrrapd-apply-standards-block">
							<h3>Your workspace &amp; WrapStar standards</h3>
							<p class="wrrapd-apply-standards-intro">WrapStars take pride in their craft. Every order is someone's special occasion — we ask that you uphold our wrapping standards and treat each gift with care, so the unwrapping moment feels truly memorable.</p>
							<p class="wrrapd-apply-standards-note">Approved WrapStars with a vehicle may serve as a <strong>designee</strong> for a local <strong>Wrrapd PO box</strong> in their area. We also maintain chain of custody for items being gift-wrapped through thoughtful video monitoring — a simple way to protect you and the customer, not to catch anyone off guard.</p>
							<div class="ws-field wrrapd-wrapstars-conditional" id="wrrapd-ws-po-pickup-wrap" hidden>
								<label for="ws-po-pickup">If assigned as a designee, could you retrieve gift-wrap items from your local Wrrapd PO box on a regular basis?<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
								<select name="wrrapd_po_daily_pickup" id="ws-po-pickup">
									<?php foreach ( wrrapd_wrapstars_po_pickup_options() as $value => $label ) : ?>
										<option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $label ); ?></option>
									<?php endforeach; ?>
								</select>
							</div>
							<div class="ws-field">
								<label for="ws-wrap-workspace">Do you have a dedicated work area for gift-wrapping? (Inside your home is perfectly fine.)<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
								<select name="dedicated_wrap_workspace" id="ws-wrap-workspace" required>
									<?php foreach ( wrrapd_wrapstars_wrap_workspace_options() as $value => $label ) : ?>
										<option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $label ); ?></option>
									<?php endforeach; ?>
								</select>
							</div>
							<div class="ws-field">
								<label for="ws-video-monitoring">Are you comfortable with video monitoring in your wrap area through completion of each gift-wrap order?<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
								<select name="comfortable_video_monitoring" id="ws-video-monitoring" required>
									<?php foreach ( wrrapd_wrapstars_video_monitoring_options() as $value => $label ) : ?>
										<option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $label ); ?></option>
									<?php endforeach; ?>
								</select>
							</div>
							<div class="ws-field">
								<label for="ws-delivery-proof">Are you set up (or willing to set up) to upload proof-of-delivery photos when an order is complete?<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
								<select name="delivery_proof_ready" id="ws-delivery-proof" required>
									<?php foreach ( wrrapd_wrapstars_delivery_proof_options() as $value => $label ) : ?>
										<option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $label ); ?></option>
									<?php endforeach; ?>
								</select>
							</div>
						</div>
						<div class="ws-field">
							<label for="ws-gov-id">Government ID (driver license or passport)<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
							<input type="file" id="ws-gov-id" name="gov_id" accept=".jpg,.jpeg,.png,.pdf" required />
						</div>
						<div class="ws-check"><input type="checkbox" name="ack_video" value="1" required id="ack_vid" /><span><label for="ack_vid">I agree to follow Wrrapd's video standards — recording unboxing, wrapping, and outbound handoff on every order — to help maintain chain of custody and our quality bar.</label></span></div>
						<div class="wrrapd-apply-disclosure">
							<h3>Next steps</h3>
							<p>If your application advances, we may contact you by <strong>email and text message</strong> to schedule a brief <strong>recorded Zoom interview</strong> as part of becoming a WrapStar.</p>
							<label class="ws-check"><input type="checkbox" name="ack_contact" value="1" id="ack_contact" required /> <span><label for="ack_contact">I agree to receive emails and text messages from Wrrapd about my application and next steps.</label></span></label>
							<label class="ws-check"><input type="checkbox" name="ack_zoom_interview" value="1" id="ack_zoom" required /> <span><label for="ack_zoom">I understand that a recorded Zoom interview may be required if my application advances.</label></span></label>
						</div>
					</section>

					<section class="wrrapd-apply-screen" data-screen="4" data-step-label="Step 4 of 5">
						<h2>Why you</h2>
						<div class="ws-field">
							<label for="ws-why-wrapstar">Why do you want to become a WrapStar, and what makes you confident you'll make this work in your area?</label>
							<textarea name="why_wrapstar" id="ws-why-wrapstar" rows="5" required placeholder="Share your motivation and what you know about your local market."></textarea>
						</div>
					</section>

					<section class="wrrapd-apply-screen" data-screen="5" data-step-label="Step 5 of 5">
						<h2>Review &amp; submit</h2>
						<div id="wrrapd-apply-review" class="wrrapd-apply-review"></div>
						<button type="submit" class="wrrapd-wrapstars-btn wrrapd-apply-submit">Submit application</button>
					</section>

					<div class="wrrapd-apply-wizard__nav" hidden>
						<button type="button" class="wrrapd-apply-back wrrapd-wrapstars-btn wrrapd-wrapstars-btn--ghost">Back</button>
						<button type="button" class="wrrapd-apply-next wrrapd-wrapstars-btn">Next</button>
					</div>
				</div>

				<aside class="wrrapd-apply-wizard__tidbit" id="wrrapd-apply-tidbit" aria-live="polite" hidden></aside>
			</div>
		</form>
	</div>
	<?php
	return ob_get_clean();
}

function wrrapd_wrapstars_render_admin_application_card( $id ) {
	$status = wrrapd_wrapstars_get_meta( $id, 'status' );
	$fit    = (int) wrrapd_wrapstars_get_meta( $id, 'fit_score' );
	$break  = json_decode( (string) wrrapd_wrapstars_get_meta( $id, 'fit_score_breakdown' ), true );
	if ( ! is_array( $break ) ) {
		$break = array();
	}
	$distance_labels = wrrapd_wrapstars_delivery_distance_options();
	$printer_labels  = wrrapd_wrapstars_printer_size_options();
	$state_labels    = wrrapd_wrapstars_apply_state_options();

	echo '<div class="wrrapd-admin-app-card" style="background:#fff;border:1px solid #ccc;padding:16px;margin:12px 0;max-width:960px;">';
	echo '<h2>' . esc_html( wrrapd_wrapstars_get_meta( $id, 'full_name' ) ) . ' <small>(' . esc_html( $status ) . ')</small>';
	if ( $fit > 0 ) {
		echo ' · <strong style="color:#1a087f;">Fit score: ' . (int) $fit . '/100</strong>';
	}
	echo '</h2>';

	if ( $fit > 0 ) {
		echo '<table class="widefat" style="max-width:520px;margin:8px 0;"><tbody>';
		foreach ( $break as $key => $pts ) {
			echo '<tr><td>' . esc_html( ucwords( str_replace( '_', ' ', $key ) ) ) . '</td><td><strong>' . esc_html( (string) $pts ) . '</strong></td></tr>';
		}
		echo '</tbody></table>';
		echo '<p><em>Experience:</em> ' . esc_html( wrrapd_wrapstars_get_meta( $id, 'experience_score_rationale' ) ) . '</p>';
		echo '<p><em>Commitment:</em> ' . esc_html( wrrapd_wrapstars_get_meta( $id, 'commitment_score_rationale' ) ) . '</p>';
	}

	echo '<h3>About you</h3><p>';
	echo esc_html( wrrapd_wrapstars_get_meta( $id, 'email' ) ) . ' · Mobile: ' . esc_html( wrrapd_wrapstars_get_meta( $id, 'phone_mobile', wrrapd_wrapstars_get_meta( $id, 'phone' ) ) );
	$work = wrrapd_wrapstars_get_meta( $id, 'phone_work' );
	if ( $work !== '' ) {
		echo ' · Work: ' . esc_html( $work );
	}
	echo '</p>';

	echo '<h3>Location</h3><p>' . esc_html( wrrapd_wrapstars_get_meta( $id, 'address_line1' ) );
	$addr2 = wrrapd_wrapstars_get_meta( $id, 'address_line2' );
	if ( $addr2 !== '' ) {
		echo ', ' . esc_html( $addr2 );
	}
	echo ', ' . esc_html( wrrapd_wrapstars_get_meta( $id, 'city' ) ) . ', ';
	$st = wrrapd_wrapstars_get_meta( $id, 'state' );
	echo esc_html( $state_labels[ $st ] ?? $st ) . ' ' . esc_html( wrrapd_wrapstars_get_meta( $id, 'postal_code' ) ) . '</p>';

	echo '<h3>Setup</h3><p>Deliver: ' . esc_html( wrrapd_wrapstars_get_meta( $id, 'can_deliver' ) ?: '—' );
	$veh = wrrapd_wrapstars_get_meta( $id, 'has_vehicle' );
	echo ' · Vehicle: ' . esc_html( $veh !== '' ? $veh : 'n/a' );
	$dist = wrrapd_wrapstars_get_meta( $id, 'delivery_max_distance' );
	if ( $dist !== '' ) {
		echo ' · Max distance: ' . esc_html( $distance_labels[ $dist ] ?? $dist );
	}
	$drv = wrrapd_wrapstars_get_meta( $id, 'clean_driving_record' );
	echo ' · Driving record: ' . esc_html( $drv !== '' ? $drv : 'n/a' );
	echo ' · Custom print: ' . esc_html( wrrapd_wrapstars_get_meta( $id, 'has_large_format_printer' ) );
	$psz = wrrapd_wrapstars_get_meta( $id, 'printer_size' );
	if ( $psz !== '' ) {
		echo ' (' . esc_html( $printer_labels[ $psz ] ?? $psz ) . ')';
	}
	echo '</p>';

	echo '<h3>Experience</h3><p>' . esc_html( wrrapd_wrapstars_get_meta( $id, 'gift_wrapping_experience' ) ) . '</p>';
	echo '<p>Gig platforms: ' . esc_html( wrrapd_wrapstars_get_meta( $id, 'gig_platforms' ) );
	$gig_other = wrrapd_wrapstars_get_meta( $id, 'gig_platforms_other' );
	if ( $gig_other !== '' ) {
		echo ' · Other: ' . esc_html( $gig_other );
	}
	echo '</p>';
	echo '<p>Business: ' . esc_html( wrrapd_wrapstars_get_meta( $id, 'business_structure' ) );
	$bsn = wrrapd_wrapstars_get_meta( $id, 'business_structure_note' );
	if ( $bsn !== '' ) {
		echo ' — ' . esc_html( $bsn );
	}
	echo '</p>';

	echo '<h3>Workspace &amp; standards</h3><p>';
	$po_meta = wrrapd_wrapstars_get_meta( $id, 'wrrapd_po_daily_pickup' );
	echo 'Wrrapd PO pickup: ' . esc_html( $po_meta !== '' ? wrrapd_wrapstars_apply_option_label( wrrapd_wrapstars_po_pickup_options(), $po_meta ) : 'n/a (no vehicle)' );
	echo '<br/>Workspace: ' . esc_html( wrrapd_wrapstars_apply_option_label( wrrapd_wrapstars_wrap_workspace_options(), wrrapd_wrapstars_get_meta( $id, 'dedicated_wrap_workspace' ) ) );
	echo '<br/>Video monitoring: ' . esc_html( wrrapd_wrapstars_apply_option_label( wrrapd_wrapstars_video_monitoring_options(), wrrapd_wrapstars_get_meta( $id, 'comfortable_video_monitoring' ) ) );
	echo '<br/>Proof of delivery: ' . esc_html( wrrapd_wrapstars_apply_option_label( wrrapd_wrapstars_delivery_proof_options(), wrrapd_wrapstars_get_meta( $id, 'delivery_proof_ready' ) ) );
	echo '</p>';

	echo '<h3>Authorization &amp; logistics</h3><p>Bank ready: ' . esc_html( wrrapd_wrapstars_get_meta( $id, 'bank_account_ready' ) ) . '</p>';
	echo '<p>Background check auth: ' . ( wrrapd_wrapstars_get_meta( $id, 'ack_background_check' ) ? 'Yes' : 'No' );
	echo ' · Video standards: ' . ( wrrapd_wrapstars_get_meta( $id, 'ack_video' ) ? 'Yes' : 'No' );
	echo ' · Email/text contact: ' . ( wrrapd_wrapstars_get_meta( $id, 'ack_contact' ) ? 'Yes' : 'No' );
	echo ' · Recorded Zoom interview: ' . ( wrrapd_wrapstars_get_meta( $id, 'ack_zoom_interview' ) ? 'Yes' : 'No' );
	echo '</p>';
	echo '<p><strong>Why:</strong> ' . esc_html( wrrapd_wrapstars_get_meta( $id, 'why_wrapstar' ) ) . '</p>';

	$id_file = wrrapd_wrapstars_get_meta( $id, 'id_file' );
	if ( $id_file && file_exists( $id_file ) ) {
		echo '<p><a href="' . esc_url( wrrapd_wrapstars_admin_file_url( $id, 'id_file' ) ) . '">Download ID</a></p>';
	}

	$notes = wrrapd_wrapstars_get_meta( $id, 'admin_notes' );
	echo '<form method="post" style="margin-top:12px;">';
	wp_nonce_field( 'wrrapd_ws_admin' );
	echo '<input type="hidden" name="app_id" value="' . (int) $id . '" />';
	echo '<label>Reviewer notes<br/><textarea name="admin_notes" rows="3" style="width:100%;">' . esc_textarea( $notes ) . '</textarea></label><br/>';
	if ( $status === 'under_review' ) {
		echo '<button type="submit" name="wrrapd_ws_admin_action" value="save_notes" class="button">Save notes</button> ';
		echo '<button type="submit" name="wrrapd_ws_admin_action" value="interview" class="button button-primary">Mark for Zoom interview</button> ';
		echo '<textarea name="reject_reason" placeholder="Rejection reason" rows="2" style="width:100%;margin:8px 0;"></textarea>';
		echo '<button type="submit" name="wrrapd_ws_admin_action" value="reject" class="button">Reject</button>';
	}
	if ( $status === 'interview' ) {
		echo '<button type="submit" name="wrrapd_ws_admin_action" value="save_notes" class="button">Save notes</button> ';
		echo '<button type="submit" name="wrrapd_ws_admin_action" value="approve" class="button button-primary">Passed interview — approve for onboarding</button> ';
		echo '<textarea name="reject_reason" placeholder="Rejection reason" rows="2" style="width:100%;margin:8px 0;"></textarea>';
		echo '<button type="submit" name="wrrapd_ws_admin_action" value="reject" class="button">Reject</button>';
	}
	if ( $status === 'approved' && wrrapd_wrapstars_step_complete( $id, 'w9' ) ) {
		echo '<button type="submit" name="wrrapd_ws_admin_action" value="activate" class="button button-primary">Activate WrapStar</button>';
	}
	if ( $status === 'active' ) {
		echo '<button type="submit" name="wrrapd_ws_admin_action" value="suspend" class="button">Suspend</button>';
	}
	echo '</form></div>';
}
