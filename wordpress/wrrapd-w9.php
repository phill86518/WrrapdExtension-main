<?php
/**
 * Plugin Name: Wrrapd Electronic W-9
 * Description: Form W-9 (Rev. March 2024) step for WrapStar, WrapRider and JoyRider onboarding. The pay server
 * (api.wrrapd.com) fills the official IRS PDF, stamps the electronic signature and stores the copy encrypted.
 * WordPress keeps only the W-9 id, TIN type, last four digits and signing time — never the full TIN.
 *
 * Install: wp-content/mu-plugins/wrrapd-w9.php
 * Uses: WRRAPD_WRAPSTARS_OPS_API_KEY (already in wp-config.php) as the shared key with the pay server.
 *
 * @package WrrapdW9
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function wrrapd_w9_api_base() {
	return defined( 'WRRAPD_W9_API_BASE' ) && WRRAPD_W9_API_BASE !== '' ? rtrim( (string) WRRAPD_W9_API_BASE, '/' ) : 'https://api.wrrapd.com';
}

function wrrapd_w9_key() {
	return defined( 'WRRAPD_WRAPSTARS_OPS_API_KEY' ) ? (string) WRRAPD_WRAPSTARS_OPS_API_KEY : '';
}

/**
 * @param string $suite wrapstar|wraprider|joyrider
 * @return array{get_app:string,get:string,set:string}|null
 */
function wrrapd_w9_suite( $suite ) {
	$map = array(
		'wrapstar'  => array( 'get_app' => 'wrrapd_wrapstars_get_application_by_user', 'get' => 'wrrapd_wrapstars_get_meta', 'set' => 'wrrapd_wrapstars_set_meta' ),
		'wraprider' => array( 'get_app' => 'wrrapd_wrapriders_get_application_by_user', 'get' => 'wrrapd_wrapriders_get_meta', 'set' => 'wrrapd_wrapriders_set_meta' ),
		'joyrider'  => array( 'get_app' => 'wrrapd_drivers_get_application_by_user', 'get' => 'wrrapd_drivers_get_meta', 'set' => 'wrrapd_drivers_set_meta' ),
	);
	$suite = sanitize_key( $suite );
	return isset( $map[ $suite ] ) && function_exists( $map[ $suite ]['get'] ) ? $map[ $suite ] : null;
}

function wrrapd_w9_on_file( $suite, $app_id ) {
	$cfg = wrrapd_w9_suite( $suite );
	return $cfg && (string) call_user_func( $cfg['get'], $app_id, 'w9_id' ) !== '';
}

function wrrapd_w9_client_ip() {
	if ( ! empty( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ) {
		$parts = explode( ',', (string) $_SERVER['HTTP_X_FORWARDED_FOR'] );
		return sanitize_text_field( trim( $parts[0] ) );
	}
	return sanitize_text_field( (string) ( $_SERVER['REMOTE_ADDR'] ?? '' ) );
}

/**
 * Validate the posted W-9 and save it through the pay server.
 *
 * @return array{ok:bool,error?:string}
 */
function wrrapd_w9_submit_for_app( $suite, $app_id ) {
	$cfg = wrrapd_w9_suite( $suite );
	if ( ! $cfg ) {
		return array( 'ok' => false, 'error' => 'W-9 is not available. Contact Wrrapd support.' );
	}
	if ( wrrapd_w9_on_file( $suite, $app_id ) ) {
		return array( 'ok' => true );
	}
	if ( empty( $_POST['w9_perjury_ack'] ) || empty( $_POST['w9_esign_ack'] ) ) {
		return array( 'ok' => false, 'error' => 'Please check both boxes above your signature.' );
	}
	if ( wrrapd_w9_key() === '' ) {
		return array( 'ok' => false, 'error' => 'W-9 is not available right now. Contact Wrrapd support.' );
	}
	$t      = static function ( $k ) {
		return sanitize_text_field( wp_unslash( $_POST[ $k ] ?? '' ) );
	};
	$user   = wp_get_current_user();
	$fields = array(
		'name'              => $t( 'w9_name' ),
		'businessName'      => $t( 'w9_business' ),
		'classification'    => $t( 'w9_class' ),
		'llcClass'          => $t( 'w9_llc' ),
		'otherText'         => $t( 'w9_other' ),
		'foreignPartners'   => ! empty( $_POST['w9_foreign'] ),
		'exemptPayeeCode'   => $t( 'w9_exempt' ),
		'fatcaCode'         => $t( 'w9_fatca' ),
		'address'           => $t( 'w9_address' ),
		'cityStateZip'      => $t( 'w9_csz' ),
		'accountNumbers'    => $t( 'w9_accounts' ),
		'tinType'           => $t( 'w9_tin_type' ) === 'ein' ? 'ein' : 'ssn',
		'tin'               => preg_replace( '/\D/', '', (string) wp_unslash( $_POST['w9_tin'] ?? '' ) ),
		'backupWithholding' => ! empty( $_POST['w9_backup'] ),
		'signature'         => $t( 'w9_signature' ),
	);
	$res = wp_remote_post(
		wrrapd_w9_api_base() . '/api/w9/submit',
		array(
			'timeout' => 30,
			'headers' => array(
				'Content-Type'                   => 'application/json',
				'X-Wrrapd-Ops-Key'               => wrrapd_w9_key(),
				'X-Wrrapd-Wrapstars-Ops-Key'     => wrrapd_w9_key(),
			),
			'body'    => wp_json_encode(
				array(
					'suite'         => sanitize_key( $suite ),
					'applicationId' => (string) $app_id,
					'email'         => (string) $user->user_email,
					'ip'            => wrrapd_w9_client_ip(),
					'userAgent'     => substr( sanitize_text_field( (string) ( $_SERVER['HTTP_USER_AGENT'] ?? '' ) ), 0, 300 ),
					'fields'        => $fields,
				)
			),
		)
	);
	if ( is_wp_error( $res ) ) {
		return array( 'ok' => false, 'error' => 'We could not save your W-9. Please try again.' );
	}
	$code = (int) wp_remote_retrieve_response_code( $res );
	$json = json_decode( (string) wp_remote_retrieve_body( $res ), true );
	if ( $code !== 200 || empty( $json['ok'] ) || empty( $json['w9']['id'] ) ) {
		$msg = is_array( $json ) && ! empty( $json['error'] ) ? (string) $json['error'] : 'We could not save your W-9. Please try again.';
		return array( 'ok' => false, 'error' => $msg );
	}
	$w9 = $json['w9'];
	foreach (
		array(
			'w9_id'        => (string) $w9['id'],
			'w9_tin_type'  => (string) ( $w9['tinType'] ?? '' ),
			'w9_tin_last4' => (string) ( $w9['tinLast4'] ?? '' ),
			'w9_signed_at' => (string) ( $w9['signedAt'] ?? gmdate( 'c' ) ),
			'w9_name'      => (string) ( $w9['name'] ?? '' ),
		) as $k => $v
	) {
		call_user_func( $cfg['set'], $app_id, $k, $v );
	}
	return array( 'ok' => true );
}

/**
 * @param array $args { suite, app_id, nonce_action, nonce_field, action_name, action_value, step, error, next_url }
 */
function wrrapd_w9_render( $args ) {
	$suite  = sanitize_key( $args['suite'] ?? '' );
	$app_id = (int) ( $args['app_id'] ?? 0 );
	$cfg    = wrrapd_w9_suite( $suite );
	if ( ! $cfg ) {
		echo '<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err">W-9 is not available. Contact Wrrapd support.</div>';
		return;
	}
	$get = static function ( $k ) use ( $cfg, $app_id ) {
		return (string) call_user_func( $cfg['get'], $app_id, $k );
	};
	if ( $get( 'w9_id' ) !== '' ) {
		$label = $get( 'w9_tin_type' ) === 'ein' ? 'EIN' : 'SSN';
		$when  = $get( 'w9_signed_at' );
		$copy  = add_query_arg( array( 'wrrapd_w9_copy' => $suite ), home_url( '/' ) );
		?>
		<div class="wrrapd-wrapstars-card">
			<div class="wrrapd-wrapstars-ob-callout wrrapd-wrapstars-ob-callout--ok">
				<strong>W-9 signed</strong>
				<span><?php echo esc_html( $label . ' ending ' . $get( 'w9_tin_last4' ) . ( $when ? ' · ' . wp_date( 'M j, Y', strtotime( $when ) ) : '' ) ); ?></span>
			</div>
			<p class="wrrapd-wrapstars-ob-actions">
				<a class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--ghost" href="<?php echo esc_url( $copy ); ?>" target="_blank" rel="noopener">Download your signed W-9</a>
				<?php if ( ! empty( $args['next_url'] ) ) : ?>
					<a class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg" href="<?php echo esc_url( $args['next_url'] ); ?>">Continue</a>
				<?php endif; ?>
			</p>
			<p class="wrrapd-wrapstars-ob-note">Need to change it? Email Wrrapd and we will send you a new W-9 to sign.</p>
		</div>
		<?php
		return;
	}
	$p    = static function ( $k, $d = '' ) {
		return isset( $_POST[ $k ] ) ? sanitize_text_field( wp_unslash( $_POST[ $k ] ) ) : $d;
	};
	$user = wp_get_current_user();
	$name = trim( $user->first_name . ' ' . $user->last_name );
	$cls  = $p( 'w9_class', 'individual' );
	$opts = array(
		'individual'   => 'Individual/sole proprietor',
		'c_corp'       => 'C corporation',
		's_corp'       => 'S corporation',
		'partnership'  => 'Partnership',
		'trust_estate' => 'Trust/estate',
		'llc'          => 'LLC',
		'other'        => 'Other',
	);
	?>
	<div class="wrrapd-wrapstars-card wrrapd-w9">
		<p class="wrrapd-wrapstars-ob-lead">Form W-9 (Rev. March 2024), Request for Taxpayer Identification Number and Certification. Fill it in and sign below. You can download your signed copy right after.</p>
		<p class="wrrapd-wrapstars-ob-note"><a href="https://www.irs.gov/forms-pubs/about-form-w-9" target="_blank" rel="noopener">IRS instructions for Form W-9</a></p>
		<?php if ( ! empty( $args['error'] ) ) : ?>
			<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err" role="alert"><?php echo esc_html( (string) $args['error'] ); ?></div>
		<?php endif; ?>
		<form method="post" class="wrrapd-wrapstars-form" id="wrrapd-w9-form" autocomplete="off">
			<?php wp_nonce_field( (string) $args['nonce_action'], (string) $args['nonce_field'] ); ?>
			<input type="hidden" name="<?php echo esc_attr( (string) $args['action_name'] ); ?>" value="<?php echo esc_attr( (string) ( $args['action_value'] ?? 'onboarding_step' ) ); ?>" />
			<input type="hidden" name="step" value="<?php echo esc_attr( (string) ( $args['step'] ?? 'w9' ) ); ?>" />

			<label>1. Name of entity/individual (as shown on your income tax return)
				<input type="text" name="w9_name" required maxlength="100" value="<?php echo esc_attr( $p( 'w9_name', $name ) ); ?>" />
			</label>
			<label>2. Business name/disregarded entity name, if different (optional)
				<input type="text" name="w9_business" maxlength="100" value="<?php echo esc_attr( $p( 'w9_business' ) ); ?>" />
			</label>

			<fieldset>
				<legend>3a. Federal tax classification (choose one)</legend>
				<?php foreach ( $opts as $val => $lab ) : ?>
					<label class="ws-check"><input type="radio" name="w9_class" value="<?php echo esc_attr( $val ); ?>" <?php checked( $cls, $val ); ?> /> <span><?php echo esc_html( $lab ); ?></span></label>
				<?php endforeach; ?>
				<label data-w9-show="llc">LLC tax classification (C, S or P)
					<select name="w9_llc">
						<option value="">Choose</option>
						<?php foreach ( array( 'C' => 'C = C corporation', 'S' => 'S = S corporation', 'P' => 'P = Partnership' ) as $v => $l ) : ?>
							<option value="<?php echo esc_attr( $v ); ?>" <?php selected( $p( 'w9_llc' ), $v ); ?>><?php echo esc_html( $l ); ?></option>
						<?php endforeach; ?>
					</select>
				</label>
				<label data-w9-show="other">Describe
					<input type="text" name="w9_other" maxlength="60" value="<?php echo esc_attr( $p( 'w9_other' ) ); ?>" />
				</label>
				<label class="ws-check" data-w9-show="partnership trust_estate llc"><input type="checkbox" name="w9_foreign" value="1" <?php checked( ! empty( $_POST['w9_foreign'] ) ); ?> /> <span>3b. This entity has foreign partners, owners or beneficiaries</span></label>
			</fieldset>

			<details>
				<summary>4. Exemptions (most people leave these blank)</summary>
				<label>Exempt payee code
					<input type="text" name="w9_exempt" maxlength="4" value="<?php echo esc_attr( $p( 'w9_exempt' ) ); ?>" />
				</label>
				<label>FATCA exemption code
					<input type="text" name="w9_fatca" maxlength="4" value="<?php echo esc_attr( $p( 'w9_fatca' ) ); ?>" />
				</label>
			</details>

			<label>5. Address (number, street, and apt. or suite no.)
				<input type="text" name="w9_address" required maxlength="100" autocomplete="street-address" value="<?php echo esc_attr( $p( 'w9_address' ) ); ?>" />
			</label>
			<label>6. City, state, and ZIP code
				<input type="text" name="w9_csz" required maxlength="100" placeholder="Jacksonville, FL 32218" value="<?php echo esc_attr( $p( 'w9_csz' ) ); ?>" />
			</label>
			<label>7. Account number(s) (optional)
				<input type="text" name="w9_accounts" maxlength="60" value="<?php echo esc_attr( $p( 'w9_accounts' ) ); ?>" />
			</label>

			<fieldset>
				<legend>Part I. Taxpayer Identification Number (TIN)</legend>
				<label class="ws-check"><input type="radio" name="w9_tin_type" value="ssn" <?php checked( $p( 'w9_tin_type', 'ssn' ), 'ssn' ); ?> /> <span>Social security number (or ITIN)</span></label>
				<label class="ws-check"><input type="radio" name="w9_tin_type" value="ein" <?php checked( $p( 'w9_tin_type' ), 'ein' ); ?> /> <span>Employer identification number</span></label>
				<label>Number
					<input type="text" name="w9_tin" required inputmode="numeric" maxlength="11" pattern="[0-9 -]{9,11}" autocomplete="off" />
				</label>
			</fieldset>

			<fieldset>
				<legend>Part II. Certification</legend>
				<p class="wrrapd-wrapstars-ob-note">Under penalties of perjury, I certify that:</p>
				<ol class="wrrapd-wrapstars-ob-note">
					<li>The number shown on this form is my correct taxpayer identification number (or I am waiting for a number to be issued to me); and</li>
					<li>I am not subject to backup withholding because (a) I am exempt from backup withholding, or (b) I have not been notified by the Internal Revenue Service (IRS) that I am subject to backup withholding as a result of a failure to report all interest or dividends, or (c) the IRS has notified me that I am no longer subject to backup withholding; and</li>
					<li>I am a U.S. citizen or other U.S. person (defined in the instructions); and</li>
					<li>The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.</li>
				</ol>
				<label class="ws-check"><input type="checkbox" name="w9_backup" value="1" <?php checked( ! empty( $_POST['w9_backup'] ) ); ?> /> <span>The IRS has told me I am currently subject to backup withholding (this crosses out item 2).</span></label>
				<label class="ws-check"><input type="checkbox" name="w9_perjury_ack" value="1" required /> <span>Under penalties of perjury, I certify the statements above.</span></label>
				<label class="ws-check"><input type="checkbox" name="w9_esign_ack" value="1" required /> <span>I agree that typing my name below is my electronic signature on this Form W-9.</span></label>
				<label>Signature of U.S. person — sign as /John Doe/
					<input type="text" name="w9_signature" required pattern="/[^/]+/" placeholder="/John Doe/" autocomplete="off" />
				</label>
			</fieldset>

			<button type="submit" class="wrrapd-wrapstars-btn wrrapd-wrapstars-btn--lg">Sign W-9</button>
		</form>
		<script>
		(function () {
			var form = document.getElementById('wrrapd-w9-form');
			if (!form) return;
			function sync() {
				var c = (form.querySelector('input[name="w9_class"]:checked') || {}).value || '';
				form.querySelectorAll('[data-w9-show]').forEach(function (el) {
					var on = el.getAttribute('data-w9-show').split(' ').indexOf(c) >= 0;
					el.style.display = on ? '' : 'none';
				});
			}
			form.addEventListener('change', sync);
			sync();
		})();
		</script>
	</div>
	<?php
}

/** The signer's own copy: ?wrrapd_w9_copy=<suite> while logged in. */
function wrrapd_w9_serve_copy() {
	if ( empty( $_GET['wrrapd_w9_copy'] ) ) {
		return;
	}
	if ( ! is_user_logged_in() ) {
		auth_redirect();
	}
	$suite = sanitize_key( wp_unslash( $_GET['wrrapd_w9_copy'] ) );
	$cfg   = wrrapd_w9_suite( $suite );
	$app   = $cfg && function_exists( $cfg['get_app'] ) ? call_user_func( $cfg['get_app'], get_current_user_id() ) : null;
	$id    = $app ? (string) call_user_func( $cfg['get'], $app->ID, 'w9_id' ) : '';
	if ( $id === '' || wrrapd_w9_key() === '' ) {
		wp_die( 'No signed W-9 was found for your account.', 'W-9', array( 'response' => 404 ) );
	}
	$res = wp_remote_get(
		wrrapd_w9_api_base() . '/api/w9/' . rawurlencode( $id ) . '/pdf?email=' . rawurlencode( (string) wp_get_current_user()->user_email ),
		array(
			'timeout' => 30,
			'headers' => array(
				'X-Wrrapd-Ops-Key'           => wrrapd_w9_key(),
				'X-Wrrapd-Wrapstars-Ops-Key' => wrrapd_w9_key(),
			),
		)
	);
	if ( is_wp_error( $res ) || (int) wp_remote_retrieve_response_code( $res ) !== 200 ) {
		wp_die( 'Your W-9 could not be opened right now. Please try again.', 'W-9', array( 'response' => 502 ) );
	}
	nocache_headers();
	header( 'Content-Type: application/pdf' );
	header( 'Content-Disposition: attachment; filename="Wrrapd-W-9.pdf"' );
	echo wp_remote_retrieve_body( $res ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- PDF bytes.
	exit;
}
add_action( 'template_redirect', 'wrrapd_w9_serve_copy', 1 );
