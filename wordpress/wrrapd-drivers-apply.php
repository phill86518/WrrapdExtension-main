<?php
/**
 * JoyRider application form + processing (loaded by wrrapd-drivers.php).
 *
 * @package WrrapdDrivers
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function wrrapd_drivers_apply_state_options() {
	return array(
		'FL' => 'Florida',
		'GA' => 'Georgia',
		'AL' => 'Alabama',
		'SC' => 'South Carolina',
		'NC' => 'North Carolina',
		'TN' => 'Tennessee',
		'OTHER' => 'Other',
	);
}

function wrrapd_drivers_vehicle_type_options() {
	return array(
		'sedan'  => 'Sedan / coupe',
		'suv'    => 'SUV / crossover',
		'truck'  => 'Pickup truck',
		'van'    => 'Van',
		'other'  => 'Other eligible vehicle',
	);
}

function wrrapd_drivers_apply_bot_checks() {
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

function wrrapd_drivers_build_full_name( $first, $middle, $last ) {
	$parts = array_filter( array( trim( $first ), trim( $middle ), trim( $last ) ) );
	return implode( ' ', $parts );
}

function wrrapd_drivers_process_application() {
	if ( ! wrrapd_drivers_is_apply_host() ) {
		return;
	}
	if ( ! isset( $_POST['wrrapd_drv_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_drv_nonce'] ) ), 'wrrapd_drv_apply' ) ) {
		return;
	}
	$bot = wrrapd_drivers_apply_bot_checks();
	if ( ! $bot['ok'] ) {
		$GLOBALS['wrrapd_drv_form_errors'] = array( $bot['error'] );
		return;
	}

	$first_name   = sanitize_text_field( wp_unslash( $_POST['first_name'] ?? '' ) );
	$nickname     = sanitize_text_field( wp_unslash( $_POST['nickname'] ?? '' ) );
	$middle_name  = sanitize_text_field( wp_unslash( $_POST['middle_name'] ?? '' ) );
	$last_name    = sanitize_text_field( wp_unslash( $_POST['last_name'] ?? '' ) );
	$full_name    = wrrapd_drivers_build_full_name( $first_name, $middle_name, $last_name );
	$email        = sanitize_email( wp_unslash( $_POST['email'] ?? '' ) );
	$phone_mobile = sanitize_text_field( wp_unslash( $_POST['phone_mobile'] ?? '' ) );
	$address      = sanitize_text_field( wp_unslash( $_POST['address_line1'] ?? '' ) );
	$address2     = sanitize_text_field( wp_unslash( $_POST['address_line2'] ?? '' ) );
	$city         = sanitize_text_field( wp_unslash( $_POST['city'] ?? '' ) );
	$state        = strtoupper( sanitize_text_field( wp_unslash( $_POST['state'] ?? '' ) ) );
	$zip          = sanitize_text_field( wp_unslash( $_POST['postal_code'] ?? '' ) );
	$age_21       = sanitize_text_field( wp_unslash( $_POST['age_21'] ?? '' ) );
	$has_license  = sanitize_text_field( wp_unslash( $_POST['has_valid_license'] ?? '' ) );
	$has_vehicle  = sanitize_text_field( wp_unslash( $_POST['has_vehicle'] ?? '' ) );
	$vehicle_type = sanitize_text_field( wp_unslash( $_POST['vehicle_type'] ?? '' ) );
	$has_phone    = sanitize_text_field( wp_unslash( $_POST['has_smartphone'] ?? '' ) );
	$clean_record = sanitize_text_field( wp_unslash( $_POST['clean_driving_record'] ?? '' ) );
	$availability = sanitize_textarea_field( wp_unslash( $_POST['availability'] ?? '' ) );
	$why_drive    = sanitize_textarea_field( wp_unslash( $_POST['why_drive'] ?? '' ) );
	$gig_exp      = sanitize_textarea_field( wp_unslash( $_POST['delivery_experience'] ?? '' ) );
	$bank_ready   = sanitize_text_field( wp_unslash( $_POST['bank_account_ready'] ?? '' ) );

	$states = wrrapd_drivers_apply_state_options();
	$vtypes = wrrapd_drivers_vehicle_type_options();
	$errors = array();

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
		$errors[] = 'JoyRiders must be 21 or older.';
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
		$errors[] = 'A smartphone is required for the JoyRider app.';
	}
	if ( ! in_array( $clean_record, array( 'yes', 'no', 'discuss' ), true ) ) {
		$errors[] = 'Please answer the driving record question.';
	}
	if ( ! in_array( $bank_ready, array( 'yes', 'no' ), true ) ) {
		$errors[] = 'Please indicate bank account readiness.';
	}
	if ( $availability === '' ) {
		$errors[] = 'Please describe your availability.';
	}
	if ( $why_drive === '' ) {
		$errors[] = 'Please tell us why you want to drive with Wrrapd.';
	}
	if ( empty( $_POST['ack_background_check'] ) ) {
		$errors[] = 'Background check authorization is required.';
	}
	if ( empty( $_POST['ack_contact'] ) || empty( $_POST['ack_age_vehicle'] ) ) {
		$errors[] = 'Please accept the required acknowledgments.';
	}

	if ( $errors ) {
		$GLOBALS['wrrapd_drv_form_errors'] = $errors;
		return;
	}

	$existing = wrrapd_drivers_get_application_by_email( $email );
	if ( $existing && wrrapd_drivers_get_meta( $existing->ID, 'status' ) !== 'rejected' ) {
		$st = (string) wrrapd_drivers_get_meta( $existing->ID, 'status', 'under_review' );
		$GLOBALS['wrrapd_drv_form_errors'] = array(
			'An application already exists for this email (status: ' . $st . '). Email ' . wrrapd_drivers_from_email_address() . ' if you need an update.',
		);
		return;
	}

	$post_id = wp_insert_post(
		array(
			'post_type'   => WRRAPD_DRIVERS_CPT,
			'post_title'  => $full_name . ' — ' . $email,
			'post_status' => 'publish',
		)
	);
	if ( ! $post_id || is_wp_error( $post_id ) ) {
		$GLOBALS['wrrapd_drv_form_errors'] = array( 'Could not save application.' );
		return;
	}

	wrrapd_drivers_set_meta( $post_id, 'status', 'under_review' );
	wrrapd_drivers_set_meta( $post_id, 'user_id', 0 );
	wrrapd_drivers_set_meta( $post_id, 'full_name', $full_name );
	wrrapd_drivers_set_meta( $post_id, 'first_name', $first_name );
	wrrapd_drivers_set_meta( $post_id, 'nickname', $nickname );
	wrrapd_drivers_set_meta( $post_id, 'middle_name', $middle_name );
	wrrapd_drivers_set_meta( $post_id, 'last_name', $last_name );
	wrrapd_drivers_set_meta( $post_id, 'email', strtolower( $email ) );
	wrrapd_drivers_set_meta( $post_id, 'phone', $phone_mobile );
	wrrapd_drivers_set_meta( $post_id, 'phone_mobile', $phone_mobile );
	wrrapd_drivers_set_meta( $post_id, 'address_line1', $address );
	wrrapd_drivers_set_meta( $post_id, 'address_line2', $address2 );
	wrrapd_drivers_set_meta( $post_id, 'city', $city );
	wrrapd_drivers_set_meta( $post_id, 'state', $state );
	wrrapd_drivers_set_meta( $post_id, 'postal_code', $zip );
	wrrapd_drivers_set_meta( $post_id, 'age_21', $age_21 );
	wrrapd_drivers_set_meta( $post_id, 'has_valid_license', $has_license );
	wrrapd_drivers_set_meta( $post_id, 'has_vehicle', $has_vehicle );
	wrrapd_drivers_set_meta( $post_id, 'vehicle_type', $vehicle_type );
	wrrapd_drivers_set_meta( $post_id, 'has_smartphone', $has_phone );
	wrrapd_drivers_set_meta( $post_id, 'clean_driving_record', $clean_record );
	wrrapd_drivers_set_meta( $post_id, 'availability', $availability );
	wrrapd_drivers_set_meta( $post_id, 'why_drive', $why_drive );
	wrrapd_drivers_set_meta( $post_id, 'delivery_experience', $gig_exp );
	wrrapd_drivers_set_meta( $post_id, 'bank_account_ready', $bank_ready );
	wrrapd_drivers_set_meta( $post_id, 'ack_background_check', '1' );
	wrrapd_drivers_set_meta( $post_id, 'ack_contact', '1' );
	wrrapd_drivers_set_meta( $post_id, 'ack_age_vehicle', '1' );
	wrrapd_drivers_set_meta( $post_id, 'submitted_at', gmdate( 'c' ) );
	wrrapd_drivers_set_meta( $post_id, 'application_type', 'driver' );

	$upload = wrrapd_drivers_handle_upload( $post_id, 'gov_id' );
	if ( ! $upload['ok'] ) {
		wp_delete_post( $post_id, true );
		$GLOBALS['wrrapd_drv_form_errors'] = array( $upload['error'] );
		return;
	}
	wrrapd_drivers_set_meta( $post_id, 'id_file', $upload['path'] );

	$abstract = wrrapd_drivers_handle_upload( $post_id, 'driving_abstract' );
	if ( ! $abstract['ok'] ) {
		wp_delete_post( $post_id, true );
		$GLOBALS['wrrapd_drv_form_errors'] = array( $abstract['error'] );
		return;
	}
	wrrapd_drivers_set_meta( $post_id, 'driving_abstract_file', $abstract['path'] );

	$greet = $nickname !== '' ? $nickname : $first_name;
	if ( $greet === '' ) {
		$greet = 'there';
	}
	$candidate  = "Hi {$greet},\n\nThank you for applying to drive with Wrrapd!\n\n";
	$candidate .= "Your application is under review. We'll be in touch within about 7 days.\n\n";
	$candidate .= "If approved, you will receive login credentials from " . wrrapd_drivers_from_email_address() . ".\n\nTeam Wrrapd\n";
	wrrapd_drivers_send_email( $email, 'Thank you — your JoyRider application is under review', $candidate );

	$admin  = "New JoyRider application.\n\nName: {$full_name}\nEmail: {$email}\nMobile: {$phone_mobile}\n";
	$admin .= "Location: {$address}" . ( $address2 !== '' ? ', ' . $address2 : '' ) . ", {$city}, {$state} {$zip}\n";
	$admin .= "Vehicle: {$vehicle_type}\n";
	$admin .= 'Command Center → Applications (JoyRider filter)' . "\n";
	wrrapd_drivers_send_email( wrrapd_drivers_admin_notify_email(), 'New JoyRider application: ' . $full_name, $admin );

	wp_safe_redirect( wrrapd_drivers_apply_url( '/drive/driver-thank-you/' ) );
	exit;
}

/**
 * Red required asterisk (reuse WrapStars helper when present).
 *
 * @return string
 */
function wrrapd_drivers_apply_required_mark() {
	if ( function_exists( 'wrrapd_wrapstars_apply_required_mark' ) ) {
		return wrrapd_wrapstars_apply_required_mark();
	}
	return '<span class="ws-required" aria-hidden="true">*</span>';
}

function wrrapd_drivers_shortcode_apply() {
	if ( ! wrrapd_drivers_is_apply_host() ) {
		return '<p class="wrrapd-wrapstars-alert">Apply at <a href="' . esc_url( wrrapd_drivers_apply_url( '/drive/driver-apply/' ) ) . '">apply.wrrapd.com/drive/driver-apply/</a>.</p>';
	}
	$errors = $GLOBALS['wrrapd_drv_form_errors'] ?? array();
	$states = wrrapd_drivers_apply_state_options();
	$vtypes = wrrapd_drivers_vehicle_type_options();
	$req    = wrrapd_drivers_apply_required_mark();
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapstars-dasher wrrapd-drivers wrrapd-apply-wizard-root wrrapd-drivers-apply-root">
		<?php if ( $errors ) : ?>
			<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err">
				<ul><?php foreach ( $errors as $e ) : ?><li><?php echo esc_html( $e ); ?></li><?php endforeach; ?></ul>
			</div>
		<?php endif; ?>

		<form class="wrrapd-apply-wizard wrrapd-wrapstars-form" id="wrrapd-driver-apply-form" method="post" enctype="multipart/form-data" autocomplete="on" novalidate>
			<?php wp_nonce_field( 'wrrapd_drv_apply', 'wrrapd_drv_nonce' ); ?>
			<input type="hidden" name="wrrapd_drv_action" value="apply" />
			<input type="hidden" name="form_started_at" id="drv_form_started_at" value="" />
			<label class="wrrapd-apply-honeypot" aria-hidden="true" tabindex="-1">Company website <input type="text" name="company_website" autocomplete="off" tabindex="-1" /></label>

			<div class="wrrapd-apply-wizard__progress" aria-live="polite" hidden>
				<div class="wrrapd-apply-wizard__progress-track"><div class="wrrapd-apply-wizard__progress-fill" id="wrrapd-drv-progress-fill"></div></div>
				<p class="wrrapd-apply-wizard__progress-label" id="wrrapd-drv-progress-label"></p>
			</div>

			<div class="wrrapd-apply-wizard__layout">
				<div class="wrrapd-apply-wizard__main">

					<section class="wrrapd-apply-screen is-active" data-screen="0" data-step-label="" data-screen-type="basics">
						<p class="wrrapd-drivers-apply-kicker">JoyRider application · ~5 minutes</p>
						<h1 class="wrrapd-apply-hero-title">Let's drive with Wrrapd!</h1>
						<p class="wrrapd-apply-standards-intro">Have your driver license ready to upload. We'll start with your contact info.</p>

						<div class="wrrapd-apply-basics-fields">
							<div class="ws-field-row ws-field-row--3">
								<div class="ws-field">
									<label for="drv-first-name">First name<?php echo $req; ?></label>
									<input type="text" id="drv-first-name" name="first_name" autocomplete="given-name" required />
								</div>
								<div class="ws-field">
									<label for="drv-middle-name">Middle name</label>
									<input type="text" id="drv-middle-name" name="middle_name" autocomplete="additional-name" />
								</div>
								<div class="ws-field">
									<label for="drv-last-name">Last name<?php echo $req; ?></label>
									<input type="text" id="drv-last-name" name="last_name" autocomplete="family-name" required />
								</div>
							</div>

							<div class="ws-field">
								<label for="drv-nickname">Nickname <span class="ws-optional">(optional — how we should greet you)</span></label>
								<input type="text" id="drv-nickname" name="nickname" autocomplete="nickname" maxlength="60" placeholder="e.g. Ace" />
							</div>

							<div class="ws-field-row">
								<div class="ws-field">
									<label for="drv-email">Email address<?php echo $req; ?></label>
									<input type="email" id="drv-email" name="email" autocomplete="email" required />
								</div>
								<div class="ws-field">
									<label for="drv-phone">Mobile phone<?php echo $req; ?></label>
									<input type="tel" id="drv-phone" name="phone_mobile" autocomplete="tel" inputmode="tel" maxlength="14" placeholder="(555) 555-5555" required />
								</div>
							</div>

							<div class="ws-field">
								<label for="drv-address-line1">Street address<?php echo $req; ?></label>
								<input type="text" id="drv-address-line1" name="address_line1" autocomplete="address-line1" required />
								<input type="text" id="drv-address-line2" name="address_line2" class="wrrapd-address-line2" autocomplete="address-line2" placeholder="Apt, suite, unit, etc. (optional)" />
							</div>

							<div class="ws-field-row ws-field-row--3">
								<div class="ws-field">
									<label for="drv-city">City<?php echo $req; ?></label>
									<input type="text" id="drv-city" name="city" autocomplete="address-level2" required />
								</div>
								<div class="ws-field">
									<label for="drv-state">State<?php echo $req; ?></label>
									<select name="state" id="drv-state" required>
										<option value="">Select…</option>
										<?php foreach ( $states as $code => $label ) : ?>
											<option value="<?php echo esc_attr( $code ); ?>"><?php echo esc_html( $label ); ?></option>
										<?php endforeach; ?>
									</select>
								</div>
								<div class="ws-field">
									<label for="drv-postal">ZIP code<?php echo $req; ?></label>
									<input type="text" id="drv-postal" name="postal_code" autocomplete="postal-code" inputmode="numeric" maxlength="10" required pattern="[0-9]{5}(-[0-9]{4})?" />
								</div>
							</div>
							<p class="wrrapd-apply-note">Launching in Florida &amp; Georgia first — other states welcome; service may be limited initially.</p>
						</div>

						<div class="wrrapd-apply-basics-nav">
							<a class="wrrapd-drivers-apply-backlink" href="<?php echo esc_url( wrrapd_drivers_apply_url( '/drive/' ) ); ?>">← JoyRiders</a>
							<button type="button" class="wrrapd-wrapstars-btn wrrapd-apply-basics-next" id="wrrapd-drv-basics-next" disabled>Next</button>
						</div>
					</section>

					<section class="wrrapd-apply-screen" data-screen="1" data-step-label="Step 1 of 3">
						<h2>Requirements</h2>
						<p class="wrrapd-apply-standards-intro">A few quick checks — age, license, vehicle, and phone.</p>
						<div class="ws-field-row">
							<div class="ws-field">
								<label for="drv-age-21">Are you 21 or older?<?php echo $req; ?></label>
								<select name="age_21" id="drv-age-21" required>
									<option value="">Select…</option>
									<option value="yes">Yes</option>
									<option value="no">No</option>
								</select>
							</div>
							<div class="ws-field">
								<label for="drv-license">Valid driver license?<?php echo $req; ?></label>
								<select name="has_valid_license" id="drv-license" required>
									<option value="">Select…</option>
									<option value="yes">Yes</option>
									<option value="no">No</option>
								</select>
							</div>
						</div>
						<div class="ws-field-row">
							<div class="ws-field">
								<label for="drv-has-vehicle">Eligible vehicle?<?php echo $req; ?></label>
								<select name="has_vehicle" id="drv-has-vehicle" required>
									<option value="">Select…</option>
									<option value="yes">Yes</option>
									<option value="no">No</option>
								</select>
							</div>
							<div class="ws-field">
								<label for="drv-vehicle-type">Vehicle type<?php echo $req; ?></label>
								<select name="vehicle_type" id="drv-vehicle-type" required>
									<option value="">Select…</option>
									<?php foreach ( $vtypes as $code => $label ) : ?>
										<option value="<?php echo esc_attr( $code ); ?>"><?php echo esc_html( $label ); ?></option>
									<?php endforeach; ?>
								</select>
							</div>
						</div>
						<div class="ws-field-row">
							<div class="ws-field">
								<label for="drv-smartphone">Smartphone for the JoyRider app?<?php echo $req; ?></label>
								<select name="has_smartphone" id="drv-smartphone" required>
									<option value="">Select…</option>
									<option value="yes">Yes</option>
									<option value="no">No</option>
								</select>
							</div>
							<div class="ws-field">
								<label for="drv-clean-record">Clean driving record?<?php echo $req; ?></label>
								<select name="clean_driving_record" id="drv-clean-record" required>
									<option value="">Select…</option>
									<option value="yes">Yes</option>
									<option value="no">No</option>
									<option value="discuss">Prefer to discuss</option>
								</select>
							</div>
						</div>
						<div class="ws-field">
							<label for="drv-bank-ready">Do you have a US bank account?<?php echo $req; ?></label>
							<select name="bank_account_ready" id="drv-bank-ready" required>
								<option value="">Select…</option>
								<option value="yes">Yes</option>
								<option value="no">Not yet</option>
							</select>
						</div>
					</section>

					<section class="wrrapd-apply-screen" data-screen="2" data-step-label="Step 2 of 3">
						<h2>About you</h2>
						<p class="wrrapd-apply-standards-intro">Tell us when you can drive — and upload your ID and driving record.</p>
						<div class="ws-field">
							<label for="drv-availability">Typical availability<?php echo $req; ?></label>
							<textarea name="availability" id="drv-availability" rows="3" required placeholder="Evenings, weekends, weekdays…"></textarea>
						</div>
						<div class="ws-field">
							<label for="drv-experience">Delivery / gig experience <span class="ws-optional">(optional)</span></label>
							<textarea name="delivery_experience" id="drv-experience" rows="3" placeholder="DoorDash, Uber, Amazon Flex, etc."></textarea>
						</div>
						<div class="ws-field">
							<label for="drv-why">Why do you want to drive with Wrrapd?<?php echo $req; ?></label>
							<textarea name="why_drive" id="drv-why" rows="4" required placeholder="Share your motivation and what you know about your local area."></textarea>
						</div>
						<div class="ws-field">
							<label for="drv-gov-id">Government photo ID (driver license preferred)<?php echo $req; ?></label>
							<input type="file" id="drv-gov-id" name="gov_id" accept=".pdf,.jpg,.jpeg,.png" required />
							<p class="wrrapd-apply-field-hint">PDF, JPG, or PNG.</p>
						</div>
						<div class="ws-field">
							<label for="drv-driving-abstract">Driving record / abstract<?php echo $req; ?></label>
							<input type="file" id="drv-driving-abstract" name="driving_abstract" accept=".pdf,.jpg,.jpeg,.png" required />
							<p class="wrrapd-apply-field-hint">Official copy from your state. PDF, JPG, or PNG.</p>
						</div>
					</section>

					<section class="wrrapd-apply-screen" data-screen="3" data-step-label="Step 3 of 3">
						<h2>Review &amp; submit</h2>
						<div id="wrrapd-drv-apply-review" class="wrrapd-apply-review"></div>

						<div class="wrrapd-apply-disclosure">
							<h3>Acknowledgments</h3>
							<label class="ws-check"><input type="checkbox" name="ack_age_vehicle" value="1" id="drv-ack-age" required /> <span><label for="drv-ack-age">I confirm I am 21+, hold a valid license, and have an eligible vehicle and smartphone.</label></span></label>
							<label class="ws-check"><input type="checkbox" name="ack_background_check" value="1" id="drv-ack-bg" required /> <span><label for="drv-ack-bg">I authorize a background check as part of JoyRider onboarding.</label></span></label>
							<label class="ws-check"><input type="checkbox" name="ack_contact" value="1" id="drv-ack-contact" required /> <span><label for="drv-ack-contact">Wrrapd may contact me by email or phone about this application.</label></span></label>
						</div>

						<button type="submit" class="wrrapd-wrapstars-btn wrrapd-apply-submit">Submit JoyRider application</button>
					</section>

					<div class="wrrapd-apply-wizard__nav" hidden>
						<button type="button" class="wrrapd-apply-back wrrapd-wrapstars-btn wrrapd-wrapstars-btn--ghost">Back</button>
						<button type="button" class="wrrapd-apply-next wrrapd-wrapstars-btn">Next</button>
					</div>
				</div>

				<aside class="wrrapd-apply-wizard__tidbit" id="wrrapd-drv-apply-tidbit" aria-live="polite" hidden></aside>
			</div>
		</form>
	</div>
	<?php
	return ob_get_clean();
}
