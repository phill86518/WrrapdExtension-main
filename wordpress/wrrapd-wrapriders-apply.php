<?php
/**
 * WrapRider application form + processing (loaded by wrrapd-wrapriders.php).
 *
 * Hybrid wrap + deliver hire track. Stores on the WrapRider CPT (wrrapd_wraprider_app) only —
 * never on the WrapStar or JoyRider CPTs.
 *
 * @package WrrapdWrapriders
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function wrrapd_wrapriders_apply_state_options() {
	return array(
		'FL'    => 'Florida',
		'GA'    => 'Georgia',
		'AL'    => 'Alabama',
		'SC'    => 'South Carolina',
		'NC'    => 'North Carolina',
		'TN'    => 'Tennessee',
		'OTHER' => 'Other',
	);
}

function wrrapd_wrapriders_vehicle_type_options() {
	return array(
		'sedan' => 'Sedan / coupe',
		'suv'   => 'SUV / crossover',
		'truck' => 'Pickup truck',
		'van'   => 'Van',
		'other' => 'Other eligible vehicle',
	);
}

/** @return array<string, string> */
function wrrapd_wrapriders_delivery_gig_platform_options() {
	return array(
		'doordash'    => 'DoorDash',
		'uber_eats'   => 'Uber Eats',
		'spark'       => 'Spark',
		'shipt'       => 'Shipt',
		'instacart'   => 'Instacart',
		'amazon_flex' => 'Amazon Flex',
		'other'       => 'Other',
	);
}

/**
 * WrapRider delivery-gig bonus is lighter than JoyRider (+8 vs +15).
 *
 * @param array<int, string> $platforms
 * @return array{total:int,breakdown:array<string,float>,rationales:array<string,string>}
 */
function wrrapd_wrapriders_compute_fit_score( $why, $availability, $gig_active, $platforms, $state, $bank_ready ) {
	$why = trim( (string) $why );
	$commitment = array( 'score' => 0.0, 'rationale' => 'No motivation provided.' );
	if ( $why !== '' && function_exists( 'wrrapd_wrapstars_ai_score_text' ) ) {
		$commitment = wrrapd_wrapstars_ai_score_text( $why, 'commitment' );
	}
	$avail_words = str_word_count( (string) $availability );
	$avail_pts   = $avail_words >= 12 ? 10 : ( $avail_words >= 4 ? 6 : 2 );
	$gig_pts     = ( $gig_active === 'yes' ) ? 8 : 0;
	$major       = array( 'doordash', 'uber_eats', 'spark', 'shipt' );
	$platform_pts = 0;
	if ( $gig_active === 'yes' ) {
		foreach ( (array) $platforms as $p ) {
			if ( in_array( $p, $major, true ) ) {
				$platform_pts = 5;
				break;
			}
		}
	}
	$loc_pts  = in_array( strtoupper( (string) $state ), array( 'FL', 'GA' ), true ) ? 10 : 4;
	$bank_pts = ( $bank_ready === 'yes' ) ? 8 : 3;
	$breakdown = array(
		'commitment'     => round( (float) $commitment['score'], 1 ),
		'availability'   => (float) $avail_pts,
		'delivery_gig'   => (float) $gig_pts,
		'major_platform' => (float) $platform_pts,
		'location'       => (float) $loc_pts,
		'bank_ready'     => (float) $bank_pts,
	);
	return array(
		'total'      => (int) min( 100, round( array_sum( $breakdown ) ) ),
		'breakdown'  => $breakdown,
		'rationales' => array( 'commitment' => (string) ( $commitment['rationale'] ?? '' ) ),
	);
}

/** Max one-way delivery distance the WrapRider is comfortable with. */
function wrrapd_wrapriders_delivery_distance_options() {
	return array(
		'upto5'  => 'Up to 5 miles',
		'5-15'   => '5–15 miles',
		'15-30'  => '15–30 miles',
		'30-50'  => '30–50 miles',
		'50plus' => '50+ miles',
	);
}

/** Large-format printer width for custom wrapping paper. */
function wrrapd_wrapriders_printer_size_options() {
	return array(
		'under24' => 'Under 24 inches',
		'24'      => '24 inches',
		'36'      => '36 inches',
		'44plus'  => '44 inches or larger',
	);
}

function wrrapd_wrapriders_apply_bot_checks() {
	$honeypot = sanitize_text_field( wp_unslash( $_POST['company_website'] ?? '' ) );
	if ( $honeypot !== '' ) {
		return array( 'ok' => false, 'error' => 'Unable to submit application.' );
	}
	$started = (int) ( $_POST['form_started_at'] ?? 0 );
	if ( $started > 0 && ( time() - $started ) < 3 ) {
		return array( 'ok' => false, 'error' => 'Please take a moment to complete the form.' );
	}
	return array( 'ok' => true );
}

function wrrapd_wrapriders_build_full_name( $first, $middle, $last ) {
	$parts = array_filter( array( trim( $first ), trim( $middle ), trim( $last ) ) );
	return implode( ' ', $parts );
}

function wrrapd_wrapriders_process_application() {
	if ( ! wrrapd_wrapriders_is_apply_host() ) {
		return;
	}
	if ( ! isset( $_POST['wrrapd_wr_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_wr_nonce'] ) ), 'wrrapd_wr_apply' ) ) {
		return;
	}
	$bot = wrrapd_wrapriders_apply_bot_checks();
	if ( ! $bot['ok'] ) {
		$GLOBALS['wrrapd_wr_form_errors'] = array( $bot['error'] );
		return;
	}

	// Contact.
	$first_name   = sanitize_text_field( wp_unslash( $_POST['first_name'] ?? '' ) );
	$nickname     = sanitize_text_field( wp_unslash( $_POST['nickname'] ?? '' ) );
	$middle_name  = sanitize_text_field( wp_unslash( $_POST['middle_name'] ?? '' ) );
	$last_name    = sanitize_text_field( wp_unslash( $_POST['last_name'] ?? '' ) );
	$full_name    = wrrapd_wrapriders_build_full_name( $first_name, $middle_name, $last_name );
	$email        = sanitize_email( wp_unslash( $_POST['email'] ?? '' ) );
	$phone_mobile = sanitize_text_field( wp_unslash( $_POST['phone_mobile'] ?? '' ) );
	$address      = sanitize_text_field( wp_unslash( $_POST['address_line1'] ?? '' ) );
	$address2     = sanitize_text_field( wp_unslash( $_POST['address_line2'] ?? '' ) );
	$city         = sanitize_text_field( wp_unslash( $_POST['city'] ?? '' ) );
	$state        = strtoupper( sanitize_text_field( wp_unslash( $_POST['state'] ?? '' ) ) );
	$zip          = sanitize_text_field( wp_unslash( $_POST['postal_code'] ?? '' ) );

	// On the road.
	$age_21       = sanitize_text_field( wp_unslash( $_POST['age_21'] ?? '' ) );
	$has_license  = sanitize_text_field( wp_unslash( $_POST['has_valid_license'] ?? '' ) );
	$has_vehicle  = sanitize_text_field( wp_unslash( $_POST['has_vehicle'] ?? '' ) );
	$vehicle_type = sanitize_text_field( wp_unslash( $_POST['vehicle_type'] ?? '' ) );
	$has_phone    = sanitize_text_field( wp_unslash( $_POST['has_smartphone'] ?? '' ) );
	$clean_record = sanitize_text_field( wp_unslash( $_POST['clean_driving_record'] ?? '' ) );
	$max_distance = sanitize_text_field( wp_unslash( $_POST['delivery_max_distance'] ?? '' ) );

	// At the wrapping table.
	$dedicated_ws = sanitize_text_field( wp_unslash( $_POST['dedicated_wrap_workspace'] ?? '' ) );
	$has_printer  = sanitize_text_field( wp_unslash( $_POST['has_large_format_printer'] ?? '' ) );
	$printer_size = sanitize_text_field( wp_unslash( $_POST['printer_size'] ?? '' ) );
	$video_ok     = sanitize_text_field( wp_unslash( $_POST['comfortable_video_monitoring'] ?? '' ) );
	$wrap_exp     = sanitize_textarea_field( wp_unslash( $_POST['gift_wrapping_experience'] ?? '' ) );

	// About you.
	$availability = sanitize_textarea_field( wp_unslash( $_POST['availability'] ?? '' ) );
	$why          = sanitize_textarea_field( wp_unslash( $_POST['why_wraprider'] ?? '' ) );
	$gig_exp      = sanitize_textarea_field( wp_unslash( $_POST['delivery_experience'] ?? '' ) );
	$gig_active   = sanitize_text_field( wp_unslash( $_POST['delivery_gig_active'] ?? '' ) );
	$gig_platforms = array();
	if ( ! empty( $_POST['delivery_gig_platforms'] ) && is_array( $_POST['delivery_gig_platforms'] ) ) {
		$allowed_gig = array_keys( wrrapd_wrapriders_delivery_gig_platform_options() );
		foreach ( $_POST['delivery_gig_platforms'] as $g ) {
			$g = sanitize_text_field( wp_unslash( $g ) );
			if ( in_array( $g, $allowed_gig, true ) ) {
				$gig_platforms[] = $g;
			}
		}
	}
	$gig_platforms = array_values( array_unique( $gig_platforms ) );
	$bank_ready   = sanitize_text_field( wp_unslash( $_POST['bank_account_ready'] ?? '' ) );

	$states    = wrrapd_wrapriders_apply_state_options();
	$vtypes    = wrrapd_wrapriders_vehicle_type_options();
	$distances = wrrapd_wrapriders_delivery_distance_options();
	$printers  = wrrapd_wrapriders_printer_size_options();
	$errors    = array();

	if ( $first_name === '' || $last_name === '' ) {
		$errors[] = 'First and last name are required.';
	}
	if ( ! is_email( $email ) ) {
		$errors[] = 'Valid email is required.';
	}
	if ( $phone_mobile === '' ) {
		$errors[] = 'Mobile phone is required.';
	}
	if ( $address === '' || $city === '' || $zip === '' ) {
		$errors[] = 'Complete address is required.';
	}
	if ( $state === '' || ! isset( $states[ $state ] ) ) {
		$errors[] = 'Please select your state.';
	}
	if ( $age_21 !== 'yes' ) {
		$errors[] = 'WrapRiders must be 21 or older.';
	}
	if ( $has_license !== 'yes' ) {
		$errors[] = 'A valid driver license is required.';
	}
	if ( $has_vehicle !== 'yes' ) {
		$errors[] = 'An eligible vehicle is required.';
	}
	if ( $vehicle_type === '' || ! isset( $vtypes[ $vehicle_type ] ) ) {
		$errors[] = 'Please select your vehicle type.';
	}
	if ( $has_phone !== 'yes' ) {
		$errors[] = 'A smartphone is required for the apps.';
	}
	if ( ! in_array( $clean_record, array( 'yes', 'no', 'discuss' ), true ) ) {
		$errors[] = 'Please answer the driving record question.';
	}
	if ( $max_distance === '' || ! isset( $distances[ $max_distance ] ) ) {
		$errors[] = 'Please select how far you are comfortable delivering.';
	}
	if ( $dedicated_ws !== 'yes' ) {
		$errors[] = 'A clean, dedicated wrapping space is required.';
	}
	if ( ! in_array( $has_printer, array( 'yes', 'no' ), true ) ) {
		$errors[] = 'Please indicate whether you can print custom wrapping paper.';
	}
	if ( $has_printer === 'yes' && ( $printer_size === '' || ! isset( $printers[ $printer_size ] ) ) ) {
		$errors[] = 'Please select your printer width.';
	}
	if ( $has_printer !== 'yes' ) {
		$printer_size = '';
	}
	if ( $video_ok !== 'yes' ) {
		$errors[] = 'Please confirm you are comfortable with workspace video monitoring.';
	}
	if ( ! in_array( $bank_ready, array( 'yes', 'no' ), true ) ) {
		$errors[] = 'Please indicate bank account readiness.';
	}
	if ( ! in_array( $gig_active, array( 'yes', 'no' ), true ) ) {
		$errors[] = 'Please answer whether you currently do delivery gig work.';
	}
	if ( $gig_active === 'yes' && $gig_platforms === array() ) {
		$errors[] = 'Select at least one delivery platform. Live proof is required at interview.';
	}
	if ( $gig_active !== 'yes' ) {
		$gig_platforms = array();
	}
	if ( $availability === '' ) {
		$errors[] = 'Please describe your availability.';
	}
	if ( $why === '' ) {
		$errors[] = 'Please tell us why you want to become a WrapRider.';
	}
	if ( empty( $_POST['ack_background_check'] ) ) {
		$errors[] = 'Background check authorization is required.';
	}
	if ( empty( $_POST['ack_contact'] ) || empty( $_POST['ack_age_vehicle'] ) || empty( $_POST['ack_both_roles'] ) ) {
		$errors[] = 'Please accept the required acknowledgments.';
	}

	if ( $errors ) {
		$GLOBALS['wrrapd_wr_form_errors'] = $errors;
		return;
	}

	$existing = wrrapd_wrapriders_get_application_by_email( $email );
	if ( $existing && wrrapd_wrapriders_get_meta( $existing->ID, 'status' ) !== 'rejected' ) {
		$st = (string) wrrapd_wrapriders_get_meta( $existing->ID, 'status', 'under_review' );
		$GLOBALS['wrrapd_wr_form_errors'] = array(
			'A WrapRider application already exists for this email (status: ' . $st . '). Email ' . wrrapd_wrapriders_from_email_address() . ' if you need an update.',
		);
		return;
	}

	$post_id = wp_insert_post(
		array(
			'post_type'   => WRRAPD_WRAPRIDERS_CPT,
			'post_title'  => $full_name . ' — ' . $email,
			'post_status' => 'publish',
		)
	);
	if ( ! $post_id || is_wp_error( $post_id ) ) {
		$GLOBALS['wrrapd_wr_form_errors'] = array( 'Could not save application.' );
		return;
	}

	wrrapd_wrapriders_set_meta( $post_id, 'status', 'under_review' );
	wrrapd_wrapriders_set_meta( $post_id, 'user_id', 0 );
	wrrapd_wrapriders_set_meta( $post_id, 'full_name', $full_name );
	wrrapd_wrapriders_set_meta( $post_id, 'first_name', $first_name );
	wrrapd_wrapriders_set_meta( $post_id, 'nickname', $nickname );
	wrrapd_wrapriders_set_meta( $post_id, 'middle_name', $middle_name );
	wrrapd_wrapriders_set_meta( $post_id, 'last_name', $last_name );
	wrrapd_wrapriders_set_meta( $post_id, 'email', strtolower( $email ) );
	wrrapd_wrapriders_set_meta( $post_id, 'phone', $phone_mobile );
	wrrapd_wrapriders_set_meta( $post_id, 'phone_mobile', $phone_mobile );
	wrrapd_wrapriders_set_meta( $post_id, 'address_line1', $address );
	wrrapd_wrapriders_set_meta( $post_id, 'address_line2', $address2 );
	wrrapd_wrapriders_set_meta( $post_id, 'city', $city );
	wrrapd_wrapriders_set_meta( $post_id, 'state', $state );
	wrrapd_wrapriders_set_meta( $post_id, 'postal_code', $zip );
	wrrapd_wrapriders_set_meta( $post_id, 'age_21', $age_21 );
	wrrapd_wrapriders_set_meta( $post_id, 'has_valid_license', $has_license );
	wrrapd_wrapriders_set_meta( $post_id, 'has_vehicle', $has_vehicle );
	wrrapd_wrapriders_set_meta( $post_id, 'vehicle_type', $vehicle_type );
	wrrapd_wrapriders_set_meta( $post_id, 'has_smartphone', $has_phone );
	wrrapd_wrapriders_set_meta( $post_id, 'clean_driving_record', $clean_record );
	wrrapd_wrapriders_set_meta( $post_id, 'delivery_max_distance', $max_distance );
	wrrapd_wrapriders_set_meta( $post_id, 'dedicated_wrap_workspace', $dedicated_ws );
	wrrapd_wrapriders_set_meta( $post_id, 'has_large_format_printer', $has_printer );
	wrrapd_wrapriders_set_meta( $post_id, 'printer_size', $printer_size );
	wrrapd_wrapriders_set_meta( $post_id, 'comfortable_video_monitoring', $video_ok );
	wrrapd_wrapriders_set_meta( $post_id, 'gift_wrapping_experience', $wrap_exp );
	wrrapd_wrapriders_set_meta( $post_id, 'availability', $availability );
	wrrapd_wrapriders_set_meta( $post_id, 'why_wraprider', $why );
	wrrapd_wrapriders_set_meta( $post_id, 'delivery_experience', $gig_exp );
	wrrapd_wrapriders_set_meta( $post_id, 'delivery_gig_active', $gig_active );
	wrrapd_wrapriders_set_meta( $post_id, 'delivery_gig_platforms', implode( ',', $gig_platforms ) );
	wrrapd_wrapriders_set_meta( $post_id, 'bank_account_ready', $bank_ready );
	$fit = wrrapd_wrapriders_compute_fit_score( $why, $availability, $gig_active, $gig_platforms, $state, $bank_ready );
	wrrapd_wrapriders_set_meta( $post_id, 'fit_score', (string) $fit['total'] );
	wrrapd_wrapriders_set_meta( $post_id, 'fit_breakdown', wp_json_encode( $fit['breakdown'] ) );
	wrrapd_wrapriders_set_meta( $post_id, 'fit_rationales', wp_json_encode( $fit['rationales'] ) );
	wrrapd_wrapriders_set_meta( $post_id, 'ack_background_check', '1' );
	wrrapd_wrapriders_set_meta( $post_id, 'ack_contact', '1' );
	wrrapd_wrapriders_set_meta( $post_id, 'ack_age_vehicle', '1' );
	wrrapd_wrapriders_set_meta( $post_id, 'ack_both_roles', '1' );
	wrrapd_wrapriders_set_meta( $post_id, 'submitted_at', gmdate( 'c' ) );
	wrrapd_wrapriders_set_meta( $post_id, 'application_type', 'wraprider' );

	$upload = wrrapd_wrapriders_handle_upload( $post_id, 'gov_id' );
	if ( ! $upload['ok'] ) {
		wp_delete_post( $post_id, true );
		$GLOBALS['wrrapd_wr_form_errors'] = array( $upload['error'] );
		return;
	}
	wrrapd_wrapriders_set_meta( $post_id, 'id_file', $upload['path'] );

	$greet = $nickname !== '' ? $nickname : $first_name;
	if ( $greet === '' ) {
		$greet = 'there';
	}
	$candidate  = "Hi {$greet},\n\nThank you for applying to become a Wrrapd WrapRider!\n\n";
	$candidate .= "Your application is under review. We'll be in touch within about 7 days.\n\n";
	$candidate .= "If approved, you will receive login credentials from " . wrrapd_wrapriders_from_email_address() . ".\n\nTeam Wrrapd\n";
	wrrapd_wrapriders_send_email( $email, 'Thank you — your WrapRider application is under review', $candidate );

	$admin  = "New WrapRider application (wrap + deliver).\n\nName: {$full_name}\nEmail: {$email}\nMobile: {$phone_mobile}\n";
	$admin .= "Location: {$address}" . ( $address2 !== '' ? ', ' . $address2 : '' ) . ", {$city}, {$state} {$zip}\n";
	$admin .= "Vehicle: {$vehicle_type} · Max distance: {$max_distance}\n";
	$admin .= "Custom-print wrap: {$has_printer}" . ( $printer_size !== '' ? " ({$printer_size})" : '' ) . "\n";
	$admin .= 'Command Center → Applications (WrapRider filter)' . "\n";
	wrrapd_wrapriders_send_email( wrrapd_wrapriders_admin_notify_email(), 'New WrapRider application: ' . $full_name, $admin );

	wp_safe_redirect( wrrapd_wrapriders_apply_url( '/wraprider/thank-you/' ) );
	exit;
}

/**
 * Red required asterisk (reuse WrapStars helper when present).
 *
 * @return string
 */
function wrrapd_wrapriders_apply_required_mark() {
	if ( function_exists( 'wrrapd_wrapstars_apply_required_mark' ) ) {
		return wrrapd_wrapstars_apply_required_mark();
	}
	return '<span class="ws-required" aria-hidden="true">*</span>';
}

function wrrapd_wrapriders_shortcode_apply() {
	if ( ! wrrapd_wrapriders_is_apply_host() ) {
		return '<p class="wrrapd-wrapstars-alert">Apply at <a href="' . esc_url( wrrapd_wrapriders_apply_url( '/wraprider/apply/' ) ) . '">apply.wrrapd.com/wraprider/apply/</a>.</p>';
	}
	$errors    = $GLOBALS['wrrapd_wr_form_errors'] ?? array();
	$states    = wrrapd_wrapriders_apply_state_options();
	$vtypes    = wrrapd_wrapriders_vehicle_type_options();
	$distances = wrrapd_wrapriders_delivery_distance_options();
	$printers  = wrrapd_wrapriders_printer_size_options();
	$req       = wrrapd_wrapriders_apply_required_mark();
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapstars-dasher wrrapd-wrapriders wrrapd-apply-wizard-root wrrapd-wrapriders-apply-root">
		<?php if ( $errors ) : ?>
			<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err">
				<ul><?php foreach ( $errors as $e ) : ?><li><?php echo esc_html( $e ); ?></li><?php endforeach; ?></ul>
			</div>
		<?php endif; ?>

		<form class="wrrapd-apply-wizard wrrapd-wrapstars-form" id="wrrapd-wraprider-apply-form" method="post" enctype="multipart/form-data" autocomplete="on" novalidate>
			<?php wp_nonce_field( 'wrrapd_wr_apply', 'wrrapd_wr_nonce' ); ?>
			<input type="hidden" name="wrrapd_wr_action" value="apply" />
			<input type="hidden" name="form_started_at" id="wr_form_started_at" value="" />
			<label class="wrrapd-apply-honeypot" aria-hidden="true" tabindex="-1">Company website <input type="text" name="company_website" autocomplete="off" tabindex="-1" /></label>

			<div class="wrrapd-apply-wizard__progress" aria-live="polite" hidden>
				<div class="wrrapd-apply-wizard__progress-track"><div class="wrrapd-apply-wizard__progress-fill" id="wrrapd-wr-progress-fill"></div></div>
				<p class="wrrapd-apply-wizard__progress-label" id="wrrapd-wr-progress-label"></p>
			</div>

			<div class="wrrapd-apply-wizard__layout">
				<div class="wrrapd-apply-wizard__main">

					<section class="wrrapd-apply-screen is-active" data-screen="0" data-step-label="" data-screen-type="basics">
						<p class="wrrapd-wrapriders-apply-kicker">WrapRider application · wrap + deliver · ~6 minutes</p>
						<h1 class="wrrapd-apply-hero-title">Let's wrap and ride with Wrrapd!</h1>
						<p class="wrrapd-apply-standards-intro">Have your driver license ready to upload. We'll start with your contact info.</p>

						<div class="wrrapd-apply-basics-fields">
							<div class="ws-field-row ws-field-row--3">
								<div class="ws-field">
									<label for="wr-first-name">First name<?php echo $req; ?></label>
									<input type="text" id="wr-first-name" name="first_name" autocomplete="given-name" required />
								</div>
								<div class="ws-field">
									<label for="wr-middle-name">Middle name</label>
									<input type="text" id="wr-middle-name" name="middle_name" autocomplete="additional-name" />
								</div>
								<div class="ws-field">
									<label for="wr-last-name">Last name<?php echo $req; ?></label>
									<input type="text" id="wr-last-name" name="last_name" autocomplete="family-name" required />
								</div>
							</div>

							<div class="ws-field">
								<label for="wr-nickname">Nickname <span class="ws-optional">(optional — how we should greet you)</span></label>
								<input type="text" id="wr-nickname" name="nickname" autocomplete="nickname" maxlength="60" placeholder="e.g. Sam" />
							</div>

							<div class="ws-field-row">
								<div class="ws-field">
									<label for="wr-email">Email address<?php echo $req; ?></label>
									<input type="email" id="wr-email" name="email" autocomplete="email" required />
								</div>
								<div class="ws-field">
									<label for="wr-phone">Mobile phone<?php echo $req; ?></label>
									<input type="tel" id="wr-phone" name="phone_mobile" autocomplete="tel" inputmode="tel" maxlength="14" placeholder="(555) 555-5555" required />
								</div>
							</div>

							<div class="ws-field">
								<label for="wr-address-line1">Street address<?php echo $req; ?></label>
								<input type="text" id="wr-address-line1" name="address_line1" autocomplete="address-line1" required />
								<input type="text" id="wr-address-line2" name="address_line2" class="wrrapd-address-line2" autocomplete="address-line2" placeholder="Apt, suite, unit, etc. (optional)" />
							</div>

							<div class="ws-field-row ws-field-row--3">
								<div class="ws-field">
									<label for="wr-city">City<?php echo $req; ?></label>
									<input type="text" id="wr-city" name="city" autocomplete="address-level2" required />
								</div>
								<div class="ws-field">
									<label for="wr-state">State<?php echo $req; ?></label>
									<select name="state" id="wr-state" required>
										<option value="">Select…</option>
										<?php foreach ( $states as $code => $label ) : ?>
											<option value="<?php echo esc_attr( $code ); ?>"><?php echo esc_html( $label ); ?></option>
										<?php endforeach; ?>
									</select>
								</div>
								<div class="ws-field">
									<label for="wr-postal">ZIP code<?php echo $req; ?></label>
									<input type="text" id="wr-postal" name="postal_code" autocomplete="postal-code" inputmode="numeric" maxlength="10" required pattern="[0-9]{5}(-[0-9]{4})?" />
								</div>
							</div>
							<p class="wrrapd-apply-note">Launching in Florida &amp; Georgia first — other states welcome; service may be limited initially.</p>
						</div>

						<div class="wrrapd-apply-basics-nav">
							<a class="wrrapd-wrapriders-apply-backlink" href="<?php echo esc_url( wrrapd_wrapriders_apply_url( '/wraprider/' ) ); ?>">← WrapRiders</a>
							<button type="button" class="wrrapd-wrapstars-btn wrrapd-apply-basics-next" id="wrrapd-wr-basics-next" disabled>Next</button>
						</div>
					</section>

					<section class="wrrapd-apply-screen" data-screen="1" data-step-label="Step 1 of 4">
						<h2>On the road</h2>
						<p class="wrrapd-apply-standards-intro">The delivery half — age, license, vehicle, phone, and how far you'll go.</p>
						<div class="ws-field-row">
							<div class="ws-field">
								<label for="wr-age-21">Are you 21 or older?<?php echo $req; ?></label>
								<select name="age_21" id="wr-age-21" required>
									<option value="">Select…</option>
									<option value="yes">Yes</option>
									<option value="no">No</option>
								</select>
							</div>
							<div class="ws-field">
								<label for="wr-license">Valid driver license?<?php echo $req; ?></label>
								<select name="has_valid_license" id="wr-license" required>
									<option value="">Select…</option>
									<option value="yes">Yes</option>
									<option value="no">No</option>
								</select>
							</div>
						</div>
						<div class="ws-field-row">
							<div class="ws-field">
								<label for="wr-has-vehicle">Eligible vehicle?<?php echo $req; ?></label>
								<select name="has_vehicle" id="wr-has-vehicle" required>
									<option value="">Select…</option>
									<option value="yes">Yes</option>
									<option value="no">No</option>
								</select>
							</div>
							<div class="ws-field">
								<label for="wr-vehicle-type">Vehicle type<?php echo $req; ?></label>
								<select name="vehicle_type" id="wr-vehicle-type" required>
									<option value="">Select…</option>
									<?php foreach ( $vtypes as $code => $label ) : ?>
										<option value="<?php echo esc_attr( $code ); ?>"><?php echo esc_html( $label ); ?></option>
									<?php endforeach; ?>
								</select>
							</div>
						</div>
						<div class="ws-field-row">
							<div class="ws-field">
								<label for="wr-smartphone">Smartphone for the apps?<?php echo $req; ?></label>
								<select name="has_smartphone" id="wr-smartphone" required>
									<option value="">Select…</option>
									<option value="yes">Yes</option>
									<option value="no">No</option>
								</select>
							</div>
							<div class="ws-field">
								<label for="wr-clean-record">Clean driving record?<?php echo $req; ?></label>
								<select name="clean_driving_record" id="wr-clean-record" required>
									<option value="">Select…</option>
									<option value="yes">Yes</option>
									<option value="no">No</option>
									<option value="discuss">Prefer to discuss</option>
								</select>
							</div>
						</div>
						<div class="ws-field">
							<label for="wr-distance">How far are you comfortable delivering?<?php echo $req; ?></label>
							<select name="delivery_max_distance" id="wr-distance" required>
								<option value="">Select…</option>
								<?php foreach ( $distances as $code => $label ) : ?>
									<option value="<?php echo esc_attr( $code ); ?>"><?php echo esc_html( $label ); ?></option>
								<?php endforeach; ?>
							</select>
						</div>
					</section>

					<section class="wrrapd-apply-screen" data-screen="2" data-step-label="Step 2 of 4">
						<h2>At the wrapping table</h2>
						<p class="wrrapd-apply-standards-intro">The wrapping half — your space, your tools, and your experience.</p>
						<div class="ws-field-row">
							<div class="ws-field">
								<label for="wr-workspace">Do you have a clean, dedicated space to wrap and store gifts?<?php echo $req; ?></label>
								<select name="dedicated_wrap_workspace" id="wr-workspace" required>
									<option value="">Select…</option>
									<option value="yes">Yes</option>
									<option value="no">No</option>
								</select>
							</div>
							<div class="ws-field">
								<label for="wr-video">Comfortable with video monitoring while you wrap?<?php echo $req; ?></label>
								<select name="comfortable_video_monitoring" id="wr-video" required>
									<option value="">Select…</option>
									<option value="yes">Yes</option>
									<option value="no">No</option>
								</select>
							</div>
						</div>
						<div class="ws-field-row">
							<div class="ws-field">
								<label for="wr-printer">Can you print custom wrapping paper (large-format printer)?<?php echo $req; ?></label>
								<select name="has_large_format_printer" id="wr-printer" required>
									<option value="">Select…</option>
									<option value="yes">Yes</option>
									<option value="no">No</option>
								</select>
							</div>
							<div class="ws-field" id="wr-printer-size-field" hidden>
								<label for="wr-printer-size">Printer width</label>
								<select name="printer_size" id="wr-printer-size">
									<option value="">Select…</option>
									<?php foreach ( $printers as $code => $label ) : ?>
										<option value="<?php echo esc_attr( $code ); ?>"><?php echo esc_html( $label ); ?></option>
									<?php endforeach; ?>
								</select>
							</div>
						</div>
						<div class="ws-field">
							<label for="wr-wrap-exp">Prior gift-wrapping experience <span class="ws-optional">(optional)</span></label>
							<textarea name="gift_wrapping_experience" id="wr-wrap-exp" rows="3" placeholder="Retail wrap counters, events, hobby, small business…"></textarea>
						</div>
					</section>

					<section class="wrrapd-apply-screen" data-screen="3" data-step-label="Step 3 of 4">
						<h2>About you</h2>
						<p class="wrrapd-apply-standards-intro">Tell us when you can work — and upload a photo of your ID.</p>
						<div class="ws-field">
							<label for="wr-availability">Typical availability<?php echo $req; ?></label>
							<textarea name="availability" id="wr-availability" rows="3" required placeholder="Evenings, weekends, weekdays…"></textarea>
						</div>
						<div class="ws-field">
							<label for="wr-gig-active">Do you currently do delivery gig work? <span class="ws-optional">(requires live proof)</span><?php echo $req; ?></label>
							<select name="delivery_gig_active" id="wr-gig-active" required>
								<option value="">Select…</option>
								<option value="yes">Yes</option>
								<option value="no">No</option>
							</select>
							<p class="wrrapd-apply-field-hint">If yes, live proof happens at interview: you open your courier profile and the name and photo must match your ID. We do not collect passwords, customer screens, or another company’s background report.</p>
						</div>
						<fieldset class="wrrapd-apply-fieldset" id="wr-gig-platforms" hidden>
							<legend>Which delivery apps?<?php echo $req; ?></legend>
							<?php foreach ( wrrapd_wrapriders_delivery_gig_platform_options() as $value => $label ) : ?>
								<label class="ws-check ws-check--inline"><input type="checkbox" name="delivery_gig_platforms[]" value="<?php echo esc_attr( $value ); ?>" /> <span><?php echo esc_html( $label ); ?></span></label>
							<?php endforeach; ?>
						</fieldset>
						<div class="ws-field">
							<label for="wr-experience">Notes <span class="ws-optional">(optional — markets, how long)</span></label>
							<textarea name="delivery_experience" id="wr-experience" rows="3" placeholder="Which cities, and how long you have been delivering."></textarea>
						</div>
						<div class="ws-field">
							<label for="wr-why">Why do you want to become a WrapRider?<?php echo $req; ?></label>
							<textarea name="why_wraprider" id="wr-why" rows="4" required placeholder="Share your motivation for wrapping and delivering in your area."></textarea>
						</div>
						<div class="ws-field">
							<label for="wr-bank-ready">Do you have a US bank account?<?php echo $req; ?></label>
							<select name="bank_account_ready" id="wr-bank-ready" required>
								<option value="">Select…</option>
								<option value="yes">Yes</option>
								<option value="no">Not yet</option>
							</select>
						</div>
						<div class="ws-field">
							<label for="wr-gov-id">Government photo ID (driver license preferred)<?php echo $req; ?></label>
							<input type="file" id="wr-gov-id" name="gov_id" accept=".pdf,.jpg,.jpeg,.png" required />
							<p class="wrrapd-apply-field-hint">PDF, JPG, or PNG.</p>
						</div>
					</section>

					<section class="wrrapd-apply-screen" data-screen="4" data-step-label="Step 4 of 4">
						<h2>Review &amp; submit</h2>
						<div id="wrrapd-wr-apply-review" class="wrrapd-apply-review"></div>

						<div class="wrrapd-apply-disclosure">
							<h3>Acknowledgments</h3>
							<label class="ws-check"><input type="checkbox" name="ack_both_roles" value="1" id="wr-ack-both" required /> <span><label for="wr-ack-both">I understand a WrapRider both wraps and delivers, and I want to do both.</label></span></label>
							<label class="ws-check"><input type="checkbox" name="ack_age_vehicle" value="1" id="wr-ack-age" required /> <span><label for="wr-ack-age">I confirm I am 21+, hold a valid license, and have an eligible vehicle, a smartphone, and a dedicated wrapping space.</label></span></label>
							<label class="ws-check"><input type="checkbox" name="ack_background_check" value="1" id="wr-ack-bg" required /> <span><label for="wr-ack-bg">I authorize a background check as part of WrapRider onboarding.</label></span></label>
							<label class="ws-check"><input type="checkbox" name="ack_contact" value="1" id="wr-ack-contact" required /> <span><label for="wr-ack-contact">Wrrapd may contact me by email or phone about this application.</label></span></label>
						</div>

						<button type="submit" class="wrrapd-wrapstars-btn wrrapd-apply-submit">Submit WrapRider application</button>
					</section>

					<div class="wrrapd-apply-wizard__nav" hidden>
						<button type="button" class="wrrapd-apply-back wrrapd-wrapstars-btn wrrapd-wrapstars-btn--ghost">Back</button>
						<button type="button" class="wrrapd-apply-next wrrapd-wrapstars-btn">Next</button>
					</div>
				</div>

				<aside class="wrrapd-apply-wizard__tidbit" id="wrrapd-wr-apply-tidbit" aria-live="polite" hidden></aside>
			</div>
		</form>
	</div>
	<?php
	return ob_get_clean();
}
