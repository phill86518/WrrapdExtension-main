<?php
/**
 * Driver application form + processing (loaded by wrrapd-drivers.php).
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
		$errors[] = 'Drivers must be 21 or older.';
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
		$errors[] = 'A smartphone is required for the Driver app.';
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

	$greet = $nickname !== '' ? $nickname : $first_name;
	if ( $greet === '' ) {
		$greet = 'there';
	}
	$candidate  = "Hi {$greet},\n\nThank you for applying to drive with Wrrapd!\n\n";
	$candidate .= "Your application is under review. We'll be in touch within about 7 days.\n\n";
	$candidate .= "If approved, you will receive login credentials from " . wrrapd_drivers_from_email_address() . ".\n\nTeam Wrrapd\n";
	wrrapd_drivers_send_email( $email, 'Thank you — your Driver application is under review', $candidate );

	$admin  = "New Driver application.\n\nName: {$full_name}\nEmail: {$email}\nMobile: {$phone_mobile}\n";
	$admin .= "Location: {$address}" . ( $address2 !== '' ? ', ' . $address2 : '' ) . ", {$city}, {$state} {$zip}\n";
	$admin .= "Vehicle: {$vehicle_type}\n";
	$admin .= 'Command Center → Applications (Driver filter)' . "\n";
	wrrapd_drivers_send_email( wrrapd_drivers_admin_notify_email(), 'New Driver application: ' . $full_name, $admin );

	wp_safe_redirect( wrrapd_drivers_apply_url( '/driver/driver-thank-you/' ) );
	exit;
}

function wrrapd_drivers_shortcode_apply() {
	if ( ! wrrapd_drivers_is_apply_host() ) {
		return '<p class="wrrapd-wrapstars-alert">Apply at <a href="' . esc_url( wrrapd_drivers_apply_url( '/driver/driver-apply/' ) ) . '">apply.wrrapd.com/driver/driver-apply/</a>.</p>';
	}
	$errors = $GLOBALS['wrrapd_drv_form_errors'] ?? array();
	$states = wrrapd_drivers_apply_state_options();
	$vtypes = wrrapd_drivers_vehicle_type_options();
	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-drivers">
		<section class="wrrapd-wrapstars-dasher-apply-head">
			<p class="wrrapd-wrapstars-dasher-kicker">Driver application</p>
			<h1>Apply to drive with Wrrapd</h1>
			<p class="wrrapd-wrapstars-dasher-lead">About five minutes. Have your driver license ready to upload.</p>
			<p><a href="<?php echo esc_url( wrrapd_drivers_apply_url( '/driver/' ) ); ?>">← Back to Drivers</a>
			· <a href="<?php echo esc_url( wrrapd_drivers_apply_url( '/apply/' ) ); ?>">WrapStar application</a></p>
		</section>

		<?php if ( $errors ) : ?>
			<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err">
				<ul><?php foreach ( $errors as $e ) : ?><li><?php echo esc_html( $e ); ?></li><?php endforeach; ?></ul>
			</div>
		<?php endif; ?>

		<form method="post" enctype="multipart/form-data" class="wrrapd-wrapstars-form wrrapd-wrapstars-card" autocomplete="on">
			<?php wp_nonce_field( 'wrrapd_drv_apply', 'wrrapd_drv_nonce' ); ?>
			<input type="hidden" name="wrrapd_drv_action" value="apply" />
			<input type="hidden" name="form_started_at" value="<?php echo esc_attr( (string) time() ); ?>" />
			<p class="ws-honeypot" style="position:absolute;left:-9999px;" aria-hidden="true">
				<label>Company website <input type="text" name="company_website" tabindex="-1" autocomplete="off" /></label>
			</p>

			<h2>Contact</h2>
			<div class="ws-grid-2">
				<label>First name * <input name="first_name" required /></label>
				<label>Last name * <input name="last_name" required /></label>
			</div>
			<div class="ws-grid-2">
				<label>Nickname <input name="nickname" /></label>
				<label>Middle name <input name="middle_name" /></label>
			</div>
			<div class="ws-grid-2">
				<label>Email * <input type="email" name="email" required /></label>
				<label>Mobile phone * <input name="phone_mobile" required /></label>
			</div>

			<h2>Address</h2>
			<label>Street address * <input name="address_line1" required /></label>
			<label>Apt / suite <input name="address_line2" /></label>
			<div class="ws-grid-3">
				<label>City * <input name="city" required /></label>
				<label>State *
					<select name="state" required>
						<option value="">Select…</option>
						<?php foreach ( $states as $code => $label ) : ?>
							<option value="<?php echo esc_attr( $code ); ?>"><?php echo esc_html( $label ); ?></option>
						<?php endforeach; ?>
					</select>
				</label>
				<label>ZIP * <input name="postal_code" required pattern="[0-9]{5}" /></label>
			</div>

			<h2>Requirements</h2>
			<label>Are you 21 or older? *
				<select name="age_21" required>
					<option value="">Select…</option>
					<option value="yes">Yes</option>
					<option value="no">No</option>
				</select>
			</label>
			<label>Do you have a valid driver license? *
				<select name="has_valid_license" required>
					<option value="">Select…</option>
					<option value="yes">Yes</option>
					<option value="no">No</option>
				</select>
			</label>
			<label>Do you have an eligible vehicle? *
				<select name="has_vehicle" required>
					<option value="">Select…</option>
					<option value="yes">Yes</option>
					<option value="no">No</option>
				</select>
			</label>
			<label>Vehicle type *
				<select name="vehicle_type" required>
					<option value="">Select…</option>
					<?php foreach ( $vtypes as $code => $label ) : ?>
						<option value="<?php echo esc_attr( $code ); ?>"><?php echo esc_html( $label ); ?></option>
					<?php endforeach; ?>
				</select>
			</label>
			<label>Do you have a smartphone for the Driver app? *
				<select name="has_smartphone" required>
					<option value="">Select…</option>
					<option value="yes">Yes</option>
					<option value="no">No</option>
				</select>
			</label>
			<label>Clean driving record? *
				<select name="clean_driving_record" required>
					<option value="">Select…</option>
					<option value="yes">Yes</option>
					<option value="no">No</option>
					<option value="discuss">Prefer to discuss</option>
				</select>
			</label>
			<label>Bank account ready for payouts? *
				<select name="bank_account_ready" required>
					<option value="">Select…</option>
					<option value="yes">Yes</option>
					<option value="no">Not yet</option>
				</select>
			</label>

			<h2>About you</h2>
			<label>Typical availability *
				<textarea name="availability" rows="3" required placeholder="Evenings, weekends, weekdays…"></textarea>
			</label>
			<label>Delivery / gig experience (optional)
				<textarea name="delivery_experience" rows="3"></textarea>
			</label>
			<label>Why do you want to drive with Wrrapd? *
				<textarea name="why_drive" rows="3" required></textarea>
			</label>
			<label>Government photo ID (driver license preferred) *
				<input type="file" name="gov_id" accept=".pdf,.jpg,.jpeg,.png" required />
			</label>

			<h2>Acknowledgments</h2>
			<label class="ws-check"><input type="checkbox" name="ack_age_vehicle" value="1" required /> <span>I confirm I am 21+, hold a valid license, and have an eligible vehicle and smartphone.</span></label>
			<label class="ws-check"><input type="checkbox" name="ack_background_check" value="1" required /> <span>I authorize a background check as part of Driver onboarding.</span></label>
			<label class="ws-check"><input type="checkbox" name="ack_contact" value="1" required /> <span>Wrrapd may contact me by email or phone about this application.</span></label>

			<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--xl">Submit Driver application</button>
		</form>
	</div>
	<?php
	return ob_get_clean();
}
