<?php
/**
 * Plugin Name: Wrrapd ESIGN Click-to-Accept Agreements
 * Description: Uber-style ESIGN Act clickwrap for contractor agreement suites on pros.wrrapd.com onboarding. No company countersignature — applicant "I Accept" binds the packet.
 *
 * Install: wp-content/mu-plugins/wrrapd-esign-agreements.php
 * Plus:   wp-content/mu-plugins/legal-agreements/{wrapstar,joyrider,wraprider}/
 *
 * @package WrrapdEsign
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Absolute path to legal-agreements folder (alongside this MU plugin).
 */
function wrrapd_esign_legal_root() {
	return trailingslashit( dirname( __FILE__ ) ) . 'legal-agreements';
}

/**
 * @param string $suite wrapstar|joyrider|wraprider
 * @return array{version:string,docs:array<int,array{file:string,title:string,sha256_16:string}>}|null
 */
function wrrapd_esign_suite_manifest( $suite ) {
	$suite = sanitize_key( $suite );
	$path  = wrrapd_esign_legal_root() . '/' . $suite . '/manifest.json';
	if ( ! is_readable( $path ) ) {
		return null;
	}
	$data = json_decode( (string) file_get_contents( $path ), true );
	return is_array( $data ) && ! empty( $data['docs'] ) ? $data : null;
}

/**
 * @param string $suite
 * @param string $file
 * @return string HTML body (already escaped content from our build) or empty.
 */
function wrrapd_esign_doc_html( $suite, $file ) {
	$suite = sanitize_key( $suite );
	$file  = basename( (string) $file );
	if ( ! preg_match( '/^[a-zA-Z0-9_.-]+\.html$/', $file ) ) {
		return '';
	}
	$path = wrrapd_esign_legal_root() . '/' . $suite . '/' . $file;
	if ( ! is_readable( $path ) ) {
		return '';
	}
	return (string) file_get_contents( $path );
}

/**
 * Public track label for copy (the role they are applying toward — not yet granted).
 *
 * @param string $suite
 */
function wrrapd_esign_track_label( $suite ) {
	$map = array(
		'wrapstar'  => 'gift-wrapping independent contractor',
		'joyrider'  => 'logistics / delivery independent contractor',
		'wraprider' => 'wrap-and-deliver independent contractor',
	);
	$suite = sanitize_key( $suite );
	return $map[ $suite ] ?? 'independent contractor';
}

/**
 * Render Uber-style click-to-accept for a full agreement suite.
 *
 * @param array $args {
 *   @type string $suite          wrapstar|joyrider|wraprider
 *   @type string $nonce_action   e.g. wrrapd_ws_onboarding
 *   @type string $nonce_field    e.g. wrrapd_ws_nonce
 *   @type string $action_name    hidden action field name
 *   @type string $action_value   hidden action value
 *   @type string $step           onboarding step key (usually agreement)
 *   @type string $extra_hidden   optional HTML of extra hidden inputs
 * }
 */
function wrrapd_esign_render_clickwrap( $args ) {
	$suite = sanitize_key( $args['suite'] ?? '' );
	$man   = wrrapd_esign_suite_manifest( $suite );
	if ( ! $man ) {
		echo '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err">Agreement packet is not installed. Contact Wrrapd support.</div>';
		return;
	}
	$nonce_action = (string) ( $args['nonce_action'] ?? '' );
	$nonce_field  = (string) ( $args['nonce_field'] ?? '' );
	$action_name  = (string) ( $args['action_name'] ?? '' );
	$action_value = (string) ( $args['action_value'] ?? 'onboarding_step' );
	$step         = (string) ( $args['step'] ?? 'agreement' );
	$track        = wrrapd_esign_track_label( $suite );
	$version      = (string) $man['version'];
	?>
	<div class="wrrapd-wrapstars-card wrrapd-esign">
		<p class="wrrapd-wrapstars-ob-lead">Please review each agreement below. This is a standard form packet (not negotiated). By tapping <strong>I Accept</strong>, you electronically sign and agree to every document listed, under the federal ESIGN Act and applicable state law. Wrrapd does <strong>not</strong> countersign your individual packet — your acceptance is the binding trigger, the same way major gig platforms use click-to-accept.</p>
		<p class="wrrapd-wrapstars-ob-note">You are an <strong>applicant</strong> completing onboarding for the <?php echo esc_html( $track ); ?> track. You are <strong>not</strong> engaged until Wrrapd activates you after this process.</p>
		<p class="wrrapd-esign__version">Packet version <code><?php echo esc_html( $version ); ?></code></p>

		<div class="wrrapd-esign__docs" id="wrrapd-esign-docs">
			<?php foreach ( $man['docs'] as $i => $doc ) :
				$html = wrrapd_esign_doc_html( $suite, $doc['file'] );
				$fid  = 'esign-doc-' . (int) $i;
				?>
				<details class="wrrapd-esign__doc" <?php echo $i === 0 ? 'open' : ''; ?>>
					<summary>
						<span class="wrrapd-esign__doc-num"><?php echo esc_html( (string) ( $i + 1 ) ); ?></span>
						<span class="wrrapd-esign__doc-title"><?php echo esc_html( $doc['title'] ); ?></span>
					</summary>
					<div class="wrrapd-esign__doc-body" id="<?php echo esc_attr( $fid ); ?>">
						<?php
						// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- trusted built HTML from legal-agreements/
						echo $html;
						?>
					</div>
				</details>
			<?php endforeach; ?>
		</div>

		<form method="post" class="wrrapd-wrapstars-form wrrapd-wrapstars-ob-actions wrrapd-esign__form" id="wrrapd-esign-form">
			<?php if ( $nonce_action && $nonce_field ) : ?>
				<?php wp_nonce_field( $nonce_action, $nonce_field ); ?>
			<?php endif; ?>
			<?php if ( $action_name ) : ?>
				<input type="hidden" name="<?php echo esc_attr( $action_name ); ?>" value="<?php echo esc_attr( $action_value ); ?>" />
			<?php endif; ?>
			<input type="hidden" name="step" value="<?php echo esc_attr( $step ); ?>" />
			<input type="hidden" name="esign_suite" value="<?php echo esc_attr( $suite ); ?>" />
			<input type="hidden" name="esign_version" value="<?php echo esc_attr( $version ); ?>" />
			<?php
			if ( ! empty( $args['extra_hidden'] ) ) {
				// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				echo $args['extra_hidden'];
			}
			?>

			<label class="ws-check wrrapd-esign__read-all">
				<input type="checkbox" name="esign_read_all" value="1" required />
				<span>I have opened and read <strong>every</strong> document in this packet (including the Compensation Schedule).</span>
			</label>

			<label class="ws-check wrrapd-esign__ic-status">
				<input type="checkbox" name="esign_ic_ack" value="1" required />
				<span>I understand I am applying as an <strong>independent contractor</strong>, not an employee, and that engagement begins only if Wrrapd activates me after onboarding.</span>
			</label>

			<label class="ws-check wrrapd-esign__esign-ack">
				<input type="checkbox" name="esign_act_ack" value="1" required />
				<span>I agree that clicking <strong>I Accept</strong> is my electronic signature under the ESIGN Act, has the same legal effect as a handwritten signature, and immediately binds me to this packet. No Wrrapd executive signature on my copy is required.</span>
			</label>

			<div class="wrrapd-wrapstars-ob-sign">
				<label for="esign_typed_name">Type your full legal name</label>
				<input type="text" id="esign_typed_name" name="esign_typed_name" class="wrrapd-wrapstars-ob-sign__input" autocomplete="name" placeholder="Your full legal name" required />
			</div>

			<button type="submit" name="esign_accept" value="1" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg wrrapd-esign__accept">I Accept</button>
			<p class="wrrapd-wrapstars-ob-note">If you do not accept, you cannot continue onboarding. Wrrapd may update these terms later; continued access after notice may require a new acceptance.</p>
		</form>
	</div>
	<?php
}

/**
 * Validate POST acceptance for a suite. Call from onboarding processors when step=agreement.
 *
 * @param string $expected_suite
 * @return array{ok:bool,error?:string,meta?:array<string,string>}
 */
function wrrapd_esign_validate_acceptance( $expected_suite ) {
	$expected_suite = sanitize_key( $expected_suite );
	$suite          = sanitize_key( wp_unslash( $_POST['esign_suite'] ?? '' ) );
	$version        = sanitize_text_field( wp_unslash( $_POST['esign_version'] ?? '' ) );
	$name           = sanitize_text_field( wp_unslash( $_POST['esign_typed_name'] ?? '' ) );
	$man            = wrrapd_esign_suite_manifest( $expected_suite );

	if ( ! $man ) {
		return array( 'ok' => false, 'error' => 'Agreement packet missing. Contact support.' );
	}
	if ( $suite !== $expected_suite ) {
		return array( 'ok' => false, 'error' => 'Invalid agreement suite.' );
	}
	if ( $version === '' || $version !== (string) $man['version'] ) {
		return array( 'ok' => false, 'error' => 'This agreement packet was updated. Please refresh and review again.' );
	}
	if ( empty( $_POST['esign_read_all'] ) || empty( $_POST['esign_ic_ack'] ) || empty( $_POST['esign_act_ack'] ) ) {
		return array( 'ok' => false, 'error' => 'Please check every acknowledgment box.' );
	}
	if ( empty( $_POST['esign_accept'] ) ) {
		return array( 'ok' => false, 'error' => 'Please tap I Accept to continue.' );
	}
	if ( strlen( $name ) < 2 ) {
		return array( 'ok' => false, 'error' => 'Please type your full legal name.' );
	}

	$ip = '';
	if ( ! empty( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ) {
		$parts = explode( ',', (string) $_SERVER['HTTP_X_FORWARDED_FOR'] );
		$ip    = sanitize_text_field( trim( $parts[0] ) );
	} elseif ( ! empty( $_SERVER['REMOTE_ADDR'] ) ) {
		$ip = sanitize_text_field( (string) $_SERVER['REMOTE_ADDR'] );
	}
	$ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? substr( sanitize_text_field( (string) $_SERVER['HTTP_USER_AGENT'] ), 0, 400 ) : '';

	$doc_list = array();
	foreach ( $man['docs'] as $d ) {
		$doc_list[] = $d['file'] . '#' . $d['sha256_16'];
	}

	return array(
		'ok'   => true,
		'meta' => array(
			'esign_suite'       => $expected_suite,
			'esign_version'     => $version,
			'esign_accepted_at' => gmdate( 'c' ),
			'esign_typed_name'  => $name,
			'esign_ip'          => $ip,
			'esign_ua'          => $ua,
			'esign_docs'        => implode( '|', $doc_list ),
			'esign_method'      => 'clickwrap_i_accept',
		),
	);
}

/**
 * Persist ESIGN meta via a setter callback: function( $key, $value ).
 *
 * @param callable               $setter
 * @param array<string,string>   $meta
 */
function wrrapd_esign_store_meta( $setter, $meta ) {
	foreach ( $meta as $k => $v ) {
		call_user_func( $setter, $k, $v );
	}
}
