<?php
/**
 * WrapStar profile — PII sync to GCS + editable profile after login.
 *
 * Renders on apply.wrrapd.com/profile/ and pros.wrrapd.com/profile/ (any portal host).
 * Sections: summary from the application, documents on file, contact & mailing (editable),
 * username & password.
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
	if ( ! wrrapd_wrapstars_is_portal_host() || ! is_user_logged_in() ) {
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
	wrrapd_wrapstars_set_meta( $app->ID, 'nickname', sanitize_text_field( wp_unslash( $_POST['nickname'] ?? '' ) ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'email', strtolower( $email ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'phone_mobile', sanitize_text_field( wp_unslash( $_POST['phone_mobile'] ?? '' ) ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'phone', wrrapd_wrapstars_get_meta( $app->ID, 'phone_mobile' ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'phone_work', sanitize_text_field( wp_unslash( $_POST['phone_work'] ?? '' ) ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'address_line1', sanitize_text_field( wp_unslash( $_POST['address_line1'] ?? '' ) ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'address_line2', sanitize_text_field( wp_unslash( $_POST['address_line2'] ?? '' ) ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'city', sanitize_text_field( wp_unslash( $_POST['city'] ?? '' ) ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'state', strtoupper( sanitize_text_field( wp_unslash( $_POST['state'] ?? '' ) ) ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'postal_code', sanitize_text_field( wp_unslash( $_POST['postal_code'] ?? '' ) ) );
	wrrapd_wrapstars_set_meta( $app->ID, 'profile_updated_at', gmdate( 'c' ) );

	// Keep the WordPress account email in step so login keeps working.
	$user = get_userdata( $user_id );
	if ( $user && strtolower( (string) $user->user_email ) !== strtolower( $email ) && ! email_exists( $email ) ) {
		wp_update_user( array( 'ID' => $user_id, 'user_email' => strtolower( $email ), 'display_name' => wrrapd_wrapstars_get_meta( $app->ID, 'full_name' ) ) );
	}

	wrrapd_wrapstars_sync_profile_to_gcs( $app->ID );
	$GLOBALS['wrrapd_ws_profile_ok'] = true;
}

/**
 * Profile page password change (any time after approval — not the first-login gate).
 */
function wrrapd_wrapstars_process_profile_password() {
	if ( ! wrrapd_wrapstars_is_portal_host() || ! is_user_logged_in() ) {
		return;
	}
	if ( ! isset( $_POST['wrrapd_ws_profile_pw_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_ws_profile_pw_nonce'] ) ), 'wrrapd_ws_profile_password' ) ) {
		$GLOBALS['wrrapd_ws_profile_pw_error'] = 'Security check failed. Please try again.';
		return;
	}
	$user_id = get_current_user_id();
	$user    = get_userdata( $user_id );
	$current = isset( $_POST['current_password'] ) ? (string) wp_unslash( $_POST['current_password'] ) : '';
	$new     = isset( $_POST['new_password'] ) ? (string) wp_unslash( $_POST['new_password'] ) : '';
	$confirm = isset( $_POST['confirm_password'] ) ? (string) wp_unslash( $_POST['confirm_password'] ) : '';
	if ( ! $user || ! wp_check_password( $current, $user->user_pass, $user_id ) ) {
		$GLOBALS['wrrapd_ws_profile_pw_error'] = 'Current password is incorrect.';
		return;
	}
	if ( strlen( $new ) < 10 ) {
		$GLOBALS['wrrapd_ws_profile_pw_error'] = 'Choose a new password with at least 10 characters.';
		return;
	}
	if ( $new !== $confirm ) {
		$GLOBALS['wrrapd_ws_profile_pw_error'] = 'New password and confirmation do not match.';
		return;
	}
	if ( $new === $current ) {
		$GLOBALS['wrrapd_ws_profile_pw_error'] = 'Pick a password different from your current one.';
		return;
	}
	wp_set_password( $new, $user_id );
	$app = wrrapd_wrapstars_get_application_by_user( $user_id );
	if ( $app ) {
		wrrapd_wrapstars_set_must_change_password( $user_id, (int) $app->ID, false );
		wrrapd_wrapstars_set_meta( $app->ID, 'password_changed_at', gmdate( 'c' ) );
	}
	wp_set_current_user( $user_id );
	wp_set_auth_cookie( $user_id, true );
	$GLOBALS['wrrapd_ws_profile_pw_ok'] = true;
}

/**
 * Site-timezone label for a stored ISO stamp (profile page).
 *
 * @param string $iso ISO timestamp.
 * @return string
 */
function wrrapd_wrapstars_profile_date( $iso, $with_time = false ) {
	$iso = trim( (string) $iso );
	if ( $iso === '' ) {
		return '';
	}
	$ts = strtotime( $iso );
	if ( ! $ts ) {
		return '';
	}
	return wp_date( $with_time ? 'M j, Y, g:i A' : 'M j, Y', $ts );
}

/**
 * @param string $status Application status.
 * @return array{label:string,class:string}
 */
function wrrapd_wrapstars_profile_status_badge( $status ) {
	switch ( $status ) {
		case 'active':
			return array( 'label' => 'Active WrapStar', 'class' => 'is-active' );
		case 'approved':
			return array( 'label' => 'Approved · onboarding', 'class' => 'is-approved' );
		case 'interview':
			return array( 'label' => 'Interview stage', 'class' => 'is-review' );
		case 'under_review':
			return array( 'label' => 'Application under review', 'class' => 'is-review' );
		case 'declined':
			return array( 'label' => 'Invitation declined', 'class' => 'is-closed' );
		case 'rejected':
			return array( 'label' => 'Not selected', 'class' => 'is-closed' );
		default:
			return array( 'label' => ucfirst( str_replace( '_', ' ', (string) $status ) ), 'class' => '' );
	}
}

function wrrapd_wrapstars_shortcode_profile() {
	if ( ! wrrapd_wrapstars_is_portal_host() ) {
		return '<p class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">WrapStar profile is available on <a href="' . esc_url( wrrapd_wrapstars_pros_url( '/profile/' ) ) . '">pros.wrrapd.com</a>.</p>';
	}
	if ( ! is_user_logged_in() || ! wrrapd_wrapstars_is_onboarding_eligible_user( get_current_user_id() ) ) {
		$login = wrrapd_wrapstars_portal_login_url( wrrapd_wrapstars_pros_url( '/profile/' ) );
		return '<div class="wrrapd-wrapstars wrrapd-wrapstars-dasher"><div class="wrrapd-wrapstars-card wrrapd-ws-profile-gate"><h1>Your WrapStar profile</h1><p>Please <a href="' . esc_url( $login ) . '">log in</a> to view your profile.</p><a class="wrrapd-wrapstars-btn" href="' . esc_url( $login ) . '">Log in</a></div></div>';
	}

	$user = wp_get_current_user();
	$app  = wrrapd_wrapstars_get_application_by_user( $user->ID );
	if ( ! $app ) {
		return '<p class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--info">No application is linked to this account.</p>';
	}

	$errors   = $GLOBALS['wrrapd_ws_profile_errors'] ?? array();
	$ok       = ! empty( $GLOBALS['wrrapd_ws_profile_ok'] );
	$pw_ok    = ! empty( $GLOBALS['wrrapd_ws_profile_pw_ok'] );
	$pw_error = $GLOBALS['wrrapd_ws_profile_pw_error'] ?? '';
	$id       = (int) $app->ID;
	$status   = (string) wrrapd_wrapstars_get_meta( $id, 'status' );
	$badge    = wrrapd_wrapstars_profile_status_badge( $status );
	$greet    = wrrapd_wrapstars_greeting_name( $id );
	$full     = (string) wrrapd_wrapstars_get_meta( $id, 'full_name' );
	$editable = in_array( $status, array( 'approved', 'active' ), true );

	$registry  = function_exists( 'wrrapd_wrapstars_onboarding_step_registry' ) ? wrrapd_wrapstars_onboarding_step_registry() : array();
	$steps     = array_keys( $registry );
	$done      = 0;
	$total     = 0;
	foreach ( $steps as $key ) {
		if ( $key === 'activation' ) {
			continue;
		}
		$total++;
		if ( wrrapd_wrapstars_step_complete( $id, $key ) ) {
			$done++;
		}
	}

	$submitted = wrrapd_wrapstars_profile_date( wrrapd_wrapstars_get_meta( $id, 'submitted_at' ) );
	$approved  = wrrapd_wrapstars_profile_date( wrrapd_wrapstars_get_meta( $id, 'approved_at' ) );
	$activated = wrrapd_wrapstars_profile_date( wrrapd_wrapstars_get_meta( $id, 'activated_at' ) );
	$pw_changed = wrrapd_wrapstars_profile_date( wrrapd_wrapstars_get_meta( $id, 'password_changed_at' ), true );
	$app_url   = function_exists( 'wrrapd_wrapstars_app_url' ) ? wrrapd_wrapstars_app_url() : 'https://wrapstar.wrrapd.com/';

	$workspace_addr = (string) wrrapd_wrapstars_get_meta( $id, 'workspace_address', wrrapd_wrapstars_get_meta( $id, 'po_box_address' ) );
	$windows        = array_values( array_filter( explode( ',', (string) wrrapd_wrapstars_get_meta( $id, 'workspace_windows' ) ) ) );
	$window_labels  = array(
		'weekday_morning'   => 'Weekday mornings',
		'weekday_midday'    => 'Weekday midday',
		'weekday_afternoon' => 'Weekday afternoons',
		'weekday_evening'   => 'Weekday evenings',
		'saturday'          => 'Saturdays',
		'sunday'            => 'Sundays',
	);
	$window_text = array();
	foreach ( $windows as $w ) {
		$window_text[] = $window_labels[ trim( $w ) ] ?? trim( $w );
	}

	$printer      = (string) wrrapd_wrapstars_get_meta( $id, 'has_large_format_printer' );
	$printer_size = (string) wrrapd_wrapstars_get_meta( $id, 'printer_size' );
	$experience   = (string) wrrapd_wrapstars_get_meta( $id, 'gift_wrapping_experience' );

	// Documents on file (read-only).
	$docs = array(
		array(
			'label' => 'Independent Contractor Agreement',
			'value' => wrrapd_wrapstars_step_complete( $id, 'agreement' ) ? 'Signed' : 'Not yet signed',
			'ok'    => wrrapd_wrapstars_step_complete( $id, 'agreement' ),
		),
		array(
			'label' => 'Standards & Policies',
			'value' => wrrapd_wrapstars_get_meta( $id, 'policies_ack_at' ) !== '' ? 'Acknowledged ' . wrrapd_wrapstars_profile_date( wrrapd_wrapstars_get_meta( $id, 'policies_ack_at' ) ) : 'Not yet acknowledged',
			'ok'    => wrrapd_wrapstars_get_meta( $id, 'policies_ack_at' ) !== '',
		),
		array(
			'label' => 'W-9',
			'value' => wrrapd_wrapstars_step_complete( $id, 'w9' ) ? 'On file' : 'Not yet signed',
			'ok'    => wrrapd_wrapstars_step_complete( $id, 'w9' ),
		),
		array(
			'label' => 'Tax acknowledgments',
			'value' => wrrapd_wrapstars_get_meta( $id, 'tax_ack_at' ) !== '' ? 'Confirmed ' . wrrapd_wrapstars_profile_date( wrrapd_wrapstars_get_meta( $id, 'tax_ack_at' ) ) : 'Pending',
			'ok'    => wrrapd_wrapstars_get_meta( $id, 'tax_ack_at' ) !== '',
		),
		array(
			'label' => 'Proof of insurance',
			'value' => wrrapd_wrapstars_get_meta( $id, 'insurance_file' ) !== ''
				? 'On file' . ( wrrapd_wrapstars_get_meta( $id, 'insurance_carrier' ) !== '' ? ' · ' . wrrapd_wrapstars_get_meta( $id, 'insurance_carrier' ) : '' ) . ( wrrapd_wrapstars_get_meta( $id, 'insurance_expires' ) !== '' ? ' · expires ' . wrrapd_wrapstars_get_meta( $id, 'insurance_expires' ) : '' )
				: 'Not yet uploaded',
			'ok'    => wrrapd_wrapstars_get_meta( $id, 'insurance_file' ) !== '',
		),
		array(
			'label' => 'Identity verification',
			'value' => wrrapd_wrapstars_get_meta( $id, 'identity_confirmed_at' ) !== '' ? 'Confirmed ' . wrrapd_wrapstars_profile_date( wrrapd_wrapstars_get_meta( $id, 'identity_confirmed_at' ) ) : 'Pending',
			'ok'    => wrrapd_wrapstars_get_meta( $id, 'identity_confirmed_at' ) !== '',
		),
		array(
			'label' => 'Background check',
			'value' => wrrapd_wrapstars_get_meta( $id, 'bg_consent_at' ) !== ''
				? ( wrrapd_wrapstars_get_meta( $id, 'bg_status' ) === 'clear' ? 'Clear' : 'Authorized · in progress' )
				: 'Not yet authorized',
			'ok'    => wrrapd_wrapstars_get_meta( $id, 'bg_status' ) === 'clear',
		),
	);

	$payout_method = (string) wrrapd_wrapstars_get_meta( $id, 'payout_method' );
	$payout_text   = 'Not set up yet';
	if ( $payout_method === 'direct_deposit' ) {
		$payout_text = 'Direct deposit';
		$bank        = (string) wrrapd_wrapstars_get_meta( $id, 'payout_bank_name' );
		$last4       = (string) wrrapd_wrapstars_get_meta( $id, 'payout_account_last4' );
		if ( $bank !== '' ) {
			$payout_text .= ' · ' . $bank;
		}
		if ( $last4 !== '' ) {
			$payout_text .= ' · account ending ' . $last4;
		}
	} elseif ( $payout_method === 'connect' ) {
		$payout_text = 'Connected payout account';
	}

	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapstars-dasher wrrapd-apply-wizard-root wrrapd-ws-profile">
		<section class="wrrapd-wrapstars-dasher-apply-head wrrapd-ws-profile__head">
			<p class="wrrapd-wrapstars-dasher-kicker">WrapStar profile</p>
			<h1><?php echo esc_html( $full !== '' ? $full : $greet ); ?></h1>
			<p class="wrrapd-ws-profile__badges">
				<span class="wrrapd-ws-profile__badge <?php echo esc_attr( $badge['class'] ); ?>"><?php echo esc_html( $badge['label'] ); ?></span>
				<?php if ( $activated !== '' ) : ?>
					<span class="wrrapd-ws-profile__since">WrapStar since <?php echo esc_html( $activated ); ?></span>
				<?php elseif ( $approved !== '' ) : ?>
					<span class="wrrapd-ws-profile__since">Approved <?php echo esc_html( $approved ); ?></span>
				<?php elseif ( $submitted !== '' ) : ?>
					<span class="wrrapd-ws-profile__since">Applied <?php echo esc_html( $submitted ); ?></span>
				<?php endif; ?>
			</p>
		</section>

		<?php if ( $ok ) : ?>
			<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--ok">Profile saved.</div>
		<?php endif; ?>
		<?php foreach ( $errors as $err ) : ?>
			<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $err ); ?></div>
		<?php endforeach; ?>

		<div class="wrrapd-ws-profile__grid">
			<section class="wrrapd-wrapstars-card wrrapd-ws-profile__card">
				<h2>At a glance</h2>
				<dl class="wrrapd-ws-profile__dl">
					<div><dt>Goes by</dt><dd><?php echo esc_html( $greet ); ?></dd></div>
					<div><dt>Status</dt><dd><?php echo esc_html( $badge['label'] ); ?></dd></div>
					<?php if ( $submitted !== '' ) : ?><div><dt>Applied</dt><dd><?php echo esc_html( $submitted ); ?></dd></div><?php endif; ?>
					<?php if ( $approved !== '' ) : ?><div><dt>Approved</dt><dd><?php echo esc_html( $approved ); ?></dd></div><?php endif; ?>
					<?php if ( $activated !== '' ) : ?><div><dt>Activated</dt><dd><?php echo esc_html( $activated ); ?></dd></div><?php endif; ?>
					<?php if ( $status === 'approved' && $total > 0 ) : ?>
						<div><dt>Onboarding</dt><dd><?php echo esc_html( $done . ' of ' . $total ); ?> steps complete · <a href="<?php echo esc_url( wrrapd_wrapstars_pros_url( '/onboarding/' ) ); ?>">Continue</a></dd></div>
					<?php endif; ?>
					<div><dt>Home base</dt><dd><?php echo esc_html( trim( wrrapd_wrapstars_get_meta( $id, 'city' ) . ', ' . wrrapd_wrapstars_get_meta( $id, 'state' ) . ' ' . wrrapd_wrapstars_get_meta( $id, 'postal_code' ) ) ); ?></dd></div>
					<?php if ( $workspace_addr !== '' ) : ?><div><dt>Wrapping location</dt><dd><?php echo nl2br( esc_html( $workspace_addr ) ); ?></dd></div><?php endif; ?>
					<?php if ( $window_text ) : ?><div><dt>Handoff windows</dt><dd><?php echo esc_html( implode( ', ', $window_text ) ); ?></dd></div><?php endif; ?>
					<?php if ( $printer === 'yes' ) : ?><div><dt>Custom print</dt><dd>Large-format printer<?php echo $printer_size !== '' ? ' (' . esc_html( $printer_size ) . ')' : ''; ?></dd></div><?php endif; ?>
					<?php if ( $experience !== '' ) : ?><div class="is-wide"><dt>Wrapping experience</dt><dd><?php echo esc_html( $experience ); ?></dd></div><?php endif; ?>
				</dl>
				<?php if ( $status === 'active' ) : ?>
					<p class="wrrapd-ws-profile__app"><a class="wrrapd-wrapstars-btn" href="<?php echo esc_url( $app_url ); ?>">Open the WrapStar app</a></p>
				<?php endif; ?>
			</section>

			<section class="wrrapd-wrapstars-card wrrapd-ws-profile__card">
				<h2>Documents &amp; payout</h2>
				<ul class="wrrapd-ws-profile__docs">
					<?php foreach ( $docs as $doc ) : ?>
						<li class="<?php echo $doc['ok'] ? 'is-ok' : 'is-open'; ?>">
							<span class="wrrapd-ws-profile__mark" aria-hidden="true"><?php echo $doc['ok'] ? '✓' : '○'; ?></span>
							<span class="wrrapd-ws-profile__doclabel"><?php echo esc_html( $doc['label'] ); ?></span>
							<span class="wrrapd-ws-profile__docval"><?php echo esc_html( $doc['value'] ); ?></span>
						</li>
					<?php endforeach; ?>
					<li class="<?php echo $payout_method !== '' ? 'is-ok' : 'is-open'; ?>">
						<span class="wrrapd-ws-profile__mark" aria-hidden="true"><?php echo $payout_method !== '' ? '✓' : '○'; ?></span>
						<span class="wrrapd-ws-profile__doclabel">Payout</span>
						<span class="wrrapd-ws-profile__docval"><?php echo esc_html( $payout_text ); ?></span>
					</li>
				</ul>
				<p class="wrrapd-ws-profile__note">Need to update a document or bank account? Email <a href="mailto:<?php echo esc_attr( wrrapd_wrapstars_from_email_address() ); ?>"><?php echo esc_html( wrrapd_wrapstars_from_email_address() ); ?></a>.</p>
			</section>
		</div>

		<section class="wrrapd-wrapstars-card wrrapd-ws-profile__card">
			<h2>Contact &amp; mailing</h2>
			<?php if ( ! $editable ) : ?>
				<p class="wrrapd-ws-profile__note">Contact details can be edited after approval.</p>
			<?php endif; ?>
			<form class="wrrapd-wrapstars-form" method="post">
				<?php wp_nonce_field( 'wrrapd_ws_profile', 'wrrapd_ws_profile_nonce' ); ?>
				<input type="hidden" name="wrrapd_ws_action" value="save_profile" />
				<fieldset class="wrrapd-ws-profile__fieldset" <?php disabled( ! $editable ); ?>>
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
				<div class="ws-field-row">
					<div class="ws-field">
						<label for="pf-nick">Preferred name</label>
						<input type="text" id="pf-nick" name="nickname" value="<?php echo esc_attr( wrrapd_wrapstars_get_meta( $id, 'nickname' ) ); ?>" placeholder="How we greet you" />
					</div>
					<div class="ws-field">
						<label for="pf-email">Email address<?php echo wrrapd_wrapstars_apply_required_mark(); ?></label>
						<input type="email" id="pf-email" name="email" value="<?php echo esc_attr( wrrapd_wrapstars_get_meta( $id, 'email' ) ); ?>" required />
					</div>
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
				<?php if ( $editable ) : ?>
					<button type="submit" class="wrrapd-wrapstars-btn">Save profile</button>
				<?php endif; ?>
				</fieldset>
			</form>
		</section>

		<section class="wrrapd-wrapstars-card wrrapd-ws-profile__card" id="account">
			<h2>Username &amp; password</h2>
			<?php if ( $pw_ok ) : ?>
				<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--ok">Password updated.</div>
			<?php endif; ?>
			<?php if ( $pw_error !== '' ) : ?>
				<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $pw_error ); ?></div>
			<?php endif; ?>
			<dl class="wrrapd-ws-profile__dl">
				<div><dt>Username</dt><dd><code><?php echo esc_html( $user->user_email ); ?></code></dd></div>
				<div><dt>Password</dt><dd>••••••••••<?php echo $pw_changed !== '' ? ' <span class="wrrapd-ws-profile__muted">· changed ' . esc_html( $pw_changed ) . '</span>' : ''; ?></dd></div>
				<div class="is-wide"><dt>Where to sign in</dt><dd>
					<?php if ( $status === 'active' ) : ?>
						<a href="<?php echo esc_url( $app_url ); ?>"><?php echo esc_html( preg_replace( '#^https?://#', '', rtrim( $app_url, '/' ) ) ); ?></a> — same email and password.
					<?php else : ?>
						<a href="<?php echo esc_url( wrrapd_wrapstars_pros_url( '/onboarding/' ) ); ?>">Onboarding</a> for now. Once you are activated, the same email and password open the WrapStar app at <a href="<?php echo esc_url( $app_url ); ?>"><?php echo esc_html( preg_replace( '#^https?://#', '', rtrim( $app_url, '/' ) ) ); ?></a>.
					<?php endif; ?>
				</dd></div>
			</dl>
			<form class="wrrapd-wrapstars-form wrrapd-ws-profile__pw" method="post">
				<?php wp_nonce_field( 'wrrapd_ws_profile_password', 'wrrapd_ws_profile_pw_nonce' ); ?>
				<input type="hidden" name="wrrapd_ws_action" value="profile_password" />
				<h3>Change password</h3>
				<div class="ws-field-row ws-field-row--3">
					<div class="ws-field">
						<label for="pf-pw-current">Current password</label>
						<input type="password" id="pf-pw-current" name="current_password" required autocomplete="current-password" />
					</div>
					<div class="ws-field">
						<label for="pf-pw-new">New password</label>
						<input type="password" id="pf-pw-new" name="new_password" required minlength="10" autocomplete="new-password" />
					</div>
					<div class="ws-field">
						<label for="pf-pw-confirm">Confirm new password</label>
						<input type="password" id="pf-pw-confirm" name="confirm_password" required minlength="10" autocomplete="new-password" />
					</div>
				</div>
				<p class="wrrapd-ws-profile__note">At least 10 characters.</p>
				<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--secondary">Update password</button>
			</form>
		</section>
	</div>
	<?php
	return ob_get_clean();
}
