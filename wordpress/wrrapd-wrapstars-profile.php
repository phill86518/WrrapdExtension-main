<?php
/**
 * WrapStar profile — PII sync to GCS + editable profile after login.
 *
 * On approval, candidate personal data is written to:
 *   gs://wrrapd-wrapstars-profiles/{app_id}/profile.json
 * (via WRRAPD_WRAPSTARS_GCS_UPLOAD_URL when configured).
 *
 * @package WrrapdWrapStars
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @return string */
function wrrapd_wrapstars_gcs_profile_bucket() {
	if ( defined( 'WRRAPD_WRAPSTARS_GCS_PROFILE_BUCKET' ) && WRRAPD_WRAPSTARS_GCS_PROFILE_BUCKET !== '' ) {
		return (string) WRRAPD_WRAPSTARS_GCS_PROFILE_BUCKET;
	}
	return 'wrrapd-wrapstars-profiles';
}

/** @return array<string, string> */
function wrrapd_wrapstars_profile_field_labels() {
	return array(
		'first_name'    => 'First name',
		'middle_name'   => 'Middle name',
		'last_name'     => 'Last name',
		'email'         => 'Email address',
		'phone_mobile'  => 'Mobile phone',
		'phone_work'    => 'Work phone',
		'address_line1' => 'Street address',
		'address_line2' => 'Apt, suite, unit',
		'city'          => 'City',
		'state'         => 'State',
		'postal_code'   => 'ZIP code',
	);
}

/** @return array<string, mixed> */
function wrrapd_wrapstars_build_profile_payload( $app_id ) {
	$app_id = (int) $app_id;
	$state  = wrrapd_wrapstars_get_meta( $app_id, 'state' );
	return array(
		'app_id'       => $app_id,
		'user_id'      => (int) wrrapd_wrapstars_get_meta( $app_id, 'user_id' ),
		'status'       => wrrapd_wrapstars_get_meta( $app_id, 'status' ),
		'first_name'   => wrrapd_wrapstars_get_meta( $app_id, 'first_name' ),
		'middle_name'  => wrrapd_wrapstars_get_meta( $app_id, 'middle_name' ),
		'last_name'    => wrrapd_wrapstars_get_meta( $app_id, 'last_name' ),
		'full_name'    => wrrapd_wrapstars_get_meta( $app_id, 'full_name' ),
		'email'        => wrrapd_wrapstars_get_meta( $app_id, 'email' ),
		'phone_mobile' => wrrapd_wrapstars_get_meta( $app_id, 'phone_mobile', wrrapd_wrapstars_get_meta( $app_id, 'phone' ) ),
		'phone_work'   => wrrapd_wrapstars_get_meta( $app_id, 'phone_work' ),
		'address_line1' => wrrapd_wrapstars_get_meta( $app_id, 'address_line1' ),
		'address_line2' => wrrapd_wrapstars_get_meta( $app_id, 'address_line2' ),
		'city'         => wrrapd_wrapstars_get_meta( $app_id, 'city' ),
		'state'        => $state,
		'postal_code'  => wrrapd_wrapstars_get_meta( $app_id, 'postal_code' ),
		'bucket'       => wrrapd_wrapstars_gcs_profile_bucket(),
		'updated_at'   => gmdate( 'c' ),
	);
}

/**
 * Write profile.json locally and mirror to GCS (on approve + profile saves).
 *
 * @return bool
 */
function wrrapd_wrapstars_sync_profile_to_gcs( $app_id ) {
	$app_id  = (int) $app_id;
	$payload = wrrapd_wrapstars_build_profile_payload( $app_id );
	$json    = wp_json_encode( $payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
	if ( ! is_string( $json ) || $json === '' ) {
		return false;
	}

	$dir = wrrapd_wrapstars_app_dir( $app_id );
	if ( ! $dir ) {
		return false;
	}
	$local = $dir . '/profile.json';
	// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
	if ( file_put_contents( $local, $json ) === false ) {
		return false;
	}

	wrrapd_wrapstars_set_meta( $app_id, 'profile_local_path', $local );
	wrrapd_wrapstars_set_meta( $app_id, 'profile_synced_at', gmdate( 'c' ) );

	wrrapd_wrapstars_maybe_mirror_upload_to_gcs( $app_id, $local, 'profile.json' );
	$gcs_path = 'gs://' . wrrapd_wrapstars_gcs_profile_bucket() . '/' . $app_id . '/profile.json';
	wrrapd_wrapstars_set_meta( $app_id, 'gcs_profile_path', $gcs_path );

	return true;
}

function wrrapd_wrapstars_process_profile_save() {
	if ( ! wrrapd_wrapstars_is_pros_host() || ! is_user_logged_in() ) {
		return;
	}
	if ( ! isset( $_POST['wrrapd_ws_profile_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_ws_profile_nonce'] ) ), 'wrrapd_ws_profile' ) ) {
		return;
	}
	if ( ( $_POST['wrrapd_ws_action'] ?? '' ) !== 'save_profile' ) {
		return;
	}

	$user_id = get_current_user_id();
	$app     = wrrapd_wrapstars_get_application_by_user( $user_id );
	if ( ! $app ) {
		$GLOBALS['wrrapd_ws_profile_errors'] = array( 'No WrapStar application is linked to this account.' );
		return;
	}
	$status = wrrapd_wrapstars_get_meta( $app->ID, 'status' );
	if ( ! in_array( $status, array( 'approved', 'active' ), true ) ) {
		$GLOBALS['wrrapd_ws_profile_errors'] = array( 'Profile editing is available after approval.' );
		return;
	}

	$first = sanitize_text_field( wp_unslash( $_POST['first_name'] ?? '' ) );
	$last  = sanitize_text_field( wp_unslash( $_POST['last_name'] ?? '' ) );
	$email = sanitize_email( wp_unslash( $_POST['email'] ?? '' ) );
	if ( $first === '' || $last === '' || ! is_email( $email ) ) {
		$GLOBALS['wrrapd_ws_profile_errors'] = array( 'First name, last name, and a valid email are required.' );
		return;
	}

	wrrapd_wrapstars_set_meta( $app->ID, 'first_name', $first );
	wrrapd_wrapstars_set_meta( $app->ID, 'middle_name', sanitize_text_field( wp_unslash( $_POST['middle_name'] ?? '' ) ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'last_name', $last );
	wrrapd_wrapstars_set_meta( $app->ID, 'full_name', wrrapd_wrapstars_build_full_name( $first, wrrapd_wrapstars_get_meta( $app->ID, 'middle_name' ), $last ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'email', strtolower( $email ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'phone_mobile', sanitize_text_field( wp_unslash( $_POST['phone_mobile'] ?? '' ) ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'phone', wrrapd_wrapstars_get_meta( $app->ID, 'phone_mobile' ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'phone_work', sanitize_text_field( wp_unslash( $_POST['phone_work'] ?? '' ) ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'address_line1', sanitize_text_field( wp_unslash( $_POST['address_line1'] ?? '' ) ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'address_line2', sanitize_text_field( wp_unslash( $_POST['address_line2'] ?? '' ) ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'city', sanitize_text_field( wp_unslash( $_POST['city'] ?? '' ) ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'state', strtoupper( sanitize_text_field( wp_unslash( $_POST['state'] ?? '' ) ) ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'postal_code', sanitize_text_field( wp_unslash( $_POST['postal_code'] ?? '' ) ) );

	wrrapd_wrapstars_sync_profile_to_gcs( $app->ID );
	$GLOBALS['wrrapd_ws_profile_ok'] = true;
}

function wrrapd_wrapstars_shortcode_profile() {
	if ( ! wrrapd_wrapstars_is_pros_host() ) {
		return '<p class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">WrapStar profile is available on <a href="' . esc_url( wrrapd_wrapstars_pros_url( '/profile/' ) ) . '">pros.wrrapd.com</a>.</p>';
	}
	if ( ! is_user_logged_in() || ! wrrapd_wrapstars_is_onboarding_eligible_user( get_current_user_id() ) ) {
		return '<p class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">Please <a href="' . esc_url( wrrapd_wrapstars_portal_login_url( wrrapd_wrapstars_pros_url( '/profile/' ) ) ) . '">log in</a> to edit your WrapStar profile.</p>';
	}

	$app = wrrapd_wrapstars_get_application_by_user( get_current_user_id() );
	if ( ! $app ) {
		return '<p class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">No application is linked to this account.</p>';
	}

	$errors = $GLOBALS['wrrapd_ws_profile_errors'] ?? array();
	$ok     = ! empty( $GLOBALS['wrrapd_ws_profile_ok'] );
	$id     = $app->ID;

	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapstars-dasher wrrapd-apply-wizard-root">
		<h1>Your WrapStar profile</h1>
		<p class="wrrapd-wrapstars-dasher-lead">Keep your contact and mailing details current. Changes sync to Wrrapd's secure cloud storage.</p>
		<?php if ( $ok ) : ?>
			<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--ok">Profile saved.</div>
		<?php endif; ?>
		<?php foreach ( $errors as $err ) : ?>
			<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $err ); ?></div>
		<?php endforeach; ?>
		<form class="wrrapd-wrapstars-form wrrapd-wrapstars-card" method="post">
			<?php wp_nonce_field( 'wrrapd_ws_profile', 'wrrapd_ws_profile_nonce' ); ?>
			<input type="hidden" name="wrrapd_ws_action" value="save_profile" />
			<div class="ws-field-row ws-field-row--3">
				<div class="ws-field">
					<label for="pf-first">First name<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
					<input type="text" id="pf-first" name="first_name" value="<?php echo esc_attr( wrrapd_wrapstars_get_meta( $id, 'first_name' ) ); ?>" required />
				</div>
				<div class="ws-field">
					<label for="pf-middle">Middle name</label>
					<input type="text" id="pf-middle" name="middle_name" value="<?php echo esc_attr( wrrapd_wrapstars_get_meta( $id, 'middle_name' ) ); ?>" />
				</div>
				<div class="ws-field">
					<label for="pf-last">Last name<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
					<input type="text" id="pf-last" name="last_name" value="<?php echo esc_attr( wrrapd_wrapstars_get_meta( $id, 'last_name' ) ); ?>" required />
				</div>
			</div>
			<div class="ws-field">
				<label for="pf-email">Email address<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
				<input type="email" id="pf-email" name="email" value="<?php echo esc_attr( wrrapd_wrapstars_get_meta( $id, 'email' ) ); ?>" required />
			</div>
			<div class="ws-field-row">
				<div class="ws-field">
					<label for="pf-mobile">Mobile phone<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
					<input type="tel" id="pf-mobile" name="phone_mobile" value="<?php echo esc_attr( wrrapd_wrapstars_get_meta( $id, 'phone_mobile', wrrapd_wrapstars_get_meta( $id, 'phone' ) ) ); ?>" required />
				</div>
				<div class="ws-field">
					<label for="pf-work">Work phone</label>
					<input type="tel" id="pf-work" name="phone_work" value="<?php echo esc_attr( wrrapd_wrapstars_get_meta( $id, 'phone_work' ) ); ?>" />
				</div>
			</div>
			<div class="ws-field">
				<label for="pf-address">Street address<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
				<input type="text" id="pf-address" name="address_line1" value="<?php echo esc_attr( wrrapd_wrapstars_get_meta( $id, 'address_line1' ) ); ?>" required />
				<input type="text" id="pf-address2" name="address_line2" class="wrrapd-address-line2" value="<?php echo esc_attr( wrrapd_wrapstars_get_meta( $id, 'address_line2' ) ); ?>" placeholder="Apt, suite, unit, etc. (optional)" />
			</div>
			<div class="ws-field-row ws-field-row--3">
				<div class="ws-field">
					<label for="pf-city">City<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
					<input type="text" id="pf-city" name="city" value="<?php echo esc_attr( wrrapd_wrapstars_get_meta( $id, 'city' ) ); ?>" required />
				</div>
				<div class="ws-field">
					<label for="pf-zip">ZIP code<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
					<input type="text" id="pf-zip" name="postal_code" value="<?php echo esc_attr( wrrapd_wrapstars_get_meta( $id, 'postal_code' ) ); ?>" required />
				</div>
				<div class="ws-field">
					<label for="pf-state">State<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
					<select id="pf-state" name="state" required>
						<?php
						$cur = wrrapd_wrapstars_get_meta( $id, 'state' );
						foreach ( wrrapd_wrapstars_apply_state_options() as $value => $label ) :
							if ( $value === '' ) {
								continue;
							}
							?>
							<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $cur, $value ); ?>><?php echo esc_html( $label ); ?></option>
						<?php endforeach; ?>
					</select>
				</div>
			</div>
			<button type="submit" class="wrrapd-wrapstars-btn">Save profile</button>
		</form>
	</div>
	<?php
	return ob_get_clean();
}
