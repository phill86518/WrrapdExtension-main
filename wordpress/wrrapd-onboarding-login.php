<?php
/**
 * Plugin Name: Wrrapd Shared Onboarding Login
 * Description: One login door at apply.wrrapd.com/onboarding/ — routes approved applicants to WrapStar, WrapRider, or JoyRider onboarding. Closed after Command Center activates them (unless reopened).
 * Version: 1.0.0
 *
 * Load on the hire WordPress (apply/pros) as mu-plugins/wrrapd-onboarding-login.php.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @return bool
 */
function wrrapd_onboarding_login_is_portal_host() {
	if ( function_exists( 'wrrapd_wrapstars_is_portal_host' ) ) {
		return wrrapd_wrapstars_is_portal_host();
	}
	$host = strtolower( (string) ( $_SERVER['HTTP_HOST'] ?? '' ) );
	$host = preg_replace( '/:\d+$/', '', $host );
	return in_array( $host, array( 'apply.wrrapd.com', 'pros.wrrapd.com', 'www.apply.wrrapd.com', 'www.pros.wrrapd.com' ), true );
}

/**
 * Exact path for the shared onboarding login (apply host).
 * Subpaths like /onboarding/agreement/ remain WrapStar steps on pros.
 *
 * @param string $path Request path.
 * @return bool
 */
function wrrapd_onboarding_login_is_login_path( $path ) {
	$path = '/' . trim( (string) $path, '/' );
	if ( $path === '//' || $path === '' ) {
		$path = '/';
	}
	return (bool) preg_match( '#^/onboarding/?$#', $path );
}

/**
 * Public URL for the shared onboarding login.
 *
 * @param string $redirect Optional post-login redirect (usually a pros onboarding URL).
 * @param string $greet    Optional first name for welcome copy.
 * @return string
 */
function wrrapd_onboarding_login_url( $redirect = '', $greet = '' ) {
	$base = function_exists( 'wrrapd_wrapstars_apply_url' )
		? wrrapd_wrapstars_apply_url( '/onboarding/' )
		: 'https://apply.wrrapd.com/onboarding/';
	$url = $base;
	if ( $redirect !== '' ) {
		$url = add_query_arg( 'redirect_to', $redirect, $url );
	}
	$greet = trim( (string) $greet );
	if ( $greet !== '' && strcasecmp( $greet, 'there' ) !== 0 ) {
		$url = add_query_arg( 'greet', $greet, $url );
	}
	return $url;
}

/**
 * Tracks the user may still enter via onboarding login.
 *
 * @param int $user_id User ID.
 * @return list<string> wrapstar|wraprider|joyrider
 */
function wrrapd_onboarding_login_eligible_tracks( $user_id ) {
	$user_id = (int) $user_id;
	$tracks  = array();
	if ( $user_id <= 0 ) {
		return $tracks;
	}
	if ( function_exists( 'wrrapd_wrapstars_is_onboarding_eligible_user' ) && wrrapd_wrapstars_is_onboarding_eligible_user( $user_id ) ) {
		$tracks[] = 'wrapstar';
	}
	if ( function_exists( 'wrrapd_wrapriders_is_onboarding_eligible_user' ) && wrrapd_wrapriders_is_onboarding_eligible_user( $user_id ) ) {
		$tracks[] = 'wraprider';
	}
	if ( function_exists( 'wrrapd_drivers_is_onboarding_eligible_user' ) && wrrapd_drivers_is_onboarding_eligible_user( $user_id ) ) {
		$tracks[] = 'joyrider';
	}
	return $tracks;
}

/**
 * Tracks whose onboarding is closed (activated) unless Command Center reopened it.
 *
 * @param int $user_id User ID.
 * @return list<string>
 */
function wrrapd_onboarding_login_closed_tracks( $user_id ) {
	$user_id = (int) $user_id;
	$closed  = array();
	if ( $user_id <= 0 ) {
		return $closed;
	}
	if ( function_exists( 'wrrapd_wrapstars_onboarding_closed_for_user' ) && wrrapd_wrapstars_onboarding_closed_for_user( $user_id ) ) {
		$closed[] = 'wrapstar';
	}
	if ( function_exists( 'wrrapd_wrapriders_onboarding_closed_for_user' ) && wrrapd_wrapriders_onboarding_closed_for_user( $user_id ) ) {
		$closed[] = 'wraprider';
	}
	if ( function_exists( 'wrrapd_drivers_onboarding_closed_for_user' ) && wrrapd_drivers_onboarding_closed_for_user( $user_id ) ) {
		$closed[] = 'joyrider';
	}
	return $closed;
}

/**
 * Destination onboarding URL for a track.
 *
 * @param string $track wrapstar|wraprider|joyrider
 * @return string
 */
function wrrapd_onboarding_login_destination_for_track( $track ) {
	switch ( $track ) {
		case 'wraprider':
			return function_exists( 'wrrapd_wrapriders_pros_url' )
				? wrrapd_wrapriders_pros_url( '/wraprider-onboarding/' )
				: 'https://pros.wrrapd.com/wraprider-onboarding/';
		case 'joyrider':
			return function_exists( 'wrrapd_drivers_pros_url' )
				? wrrapd_drivers_pros_url( '/driver-onboarding/' )
				: 'https://pros.wrrapd.com/driver-onboarding/';
		case 'wrapstar':
		default:
			return function_exists( 'wrrapd_wrapstars_pros_url' )
				? wrrapd_wrapstars_pros_url( '/onboarding/' )
				: 'https://pros.wrrapd.com/onboarding/';
	}
}

/**
 * Role-portal login URL after activation (not the shared onboarding door).
 *
 * @param string $track wrapstar|wraprider|joyrider
 * @return string
 */
function wrrapd_onboarding_login_role_portal_url( $track ) {
	switch ( $track ) {
		case 'wraprider':
			return function_exists( 'wrrapd_wrapriders_apply_url' )
				? wrrapd_wrapriders_apply_url( '/wraprider/login/' )
				: 'https://apply.wrrapd.com/wraprider/login/';
		case 'joyrider':
			return function_exists( 'wrrapd_drivers_apply_url' )
				? wrrapd_drivers_apply_url( '/drive/driver-login/' )
				: 'https://apply.wrrapd.com/drive/driver-login/';
		case 'wrapstar':
		default:
			return function_exists( 'wrrapd_wrapstars_apply_url' )
				? wrrapd_wrapstars_apply_url( '/wrapstar-login/' )
				: 'https://apply.wrrapd.com/wrapstar-login/';
	}
}

/**
 * Pick destination after a successful shared onboarding login.
 *
 * @param int    $user_id  User ID.
 * @param string $redirect Optional requested redirect.
 * @return string Absolute URL.
 */
function wrrapd_onboarding_login_resolve_destination( $user_id, $redirect = '' ) {
	$tracks = wrrapd_onboarding_login_eligible_tracks( $user_id );
	if ( ! $tracks ) {
		return wrrapd_onboarding_login_url();
	}

	$redirect = (string) $redirect;
	if ( $redirect !== '' ) {
		foreach ( $tracks as $track ) {
			$dest = wrrapd_onboarding_login_destination_for_track( $track );
			if ( strpos( $redirect, wp_parse_url( $dest, PHP_URL_PATH ) ?: '' ) !== false
				|| ( $track === 'wrapstar' && preg_match( '#/onboarding(/|$)#', $redirect ) && strpos( $redirect, 'wraprider-onboarding' ) === false && strpos( $redirect, 'driver-onboarding' ) === false )
				|| ( $track === 'wraprider' && strpos( $redirect, 'wraprider-onboarding' ) !== false )
				|| ( $track === 'joyrider' && strpos( $redirect, 'driver-onboarding' ) !== false )
			) {
				return $redirect;
			}
		}
		// Safe external/internal redirect only if it stays on apply/pros.
		$host = wp_parse_url( $redirect, PHP_URL_HOST );
		if ( $host && in_array( strtolower( (string) $host ), array( 'apply.wrrapd.com', 'pros.wrrapd.com', 'www.apply.wrrapd.com', 'www.pros.wrrapd.com' ), true ) ) {
			return $redirect;
		}
	}

	// Prefer WrapRider when dual-approved (hybrid), else first eligible.
	if ( in_array( 'wraprider', $tracks, true ) ) {
		return wrrapd_onboarding_login_destination_for_track( 'wraprider' );
	}
	return wrrapd_onboarding_login_destination_for_track( $tracks[0] );
}

/**
 * Human label for a track.
 *
 * @param string $track Track key.
 * @return string
 */
function wrrapd_onboarding_login_track_label( $track ) {
	$map = array(
		'wrapstar'  => 'WrapStar',
		'wraprider' => 'WrapRider',
		'joyrider'  => 'JoyRider',
	);
	return $map[ $track ] ?? 'Wrrapd';
}

add_action( 'init', 'wrrapd_onboarding_login_process', 25 );
add_action( 'template_redirect', 'wrrapd_onboarding_login_routing', 4 );
add_filter( 'the_content', 'wrrapd_onboarding_login_filter_content', 5 );
add_shortcode( 'wrrapd_onboarding_login', 'wrrapd_onboarding_login_shortcode' );

/**
 * On apply.wrrapd.com exact /onboarding/, swap page body for the shared login
 * so we do not overwrite the pros.wrrapd.com WrapStar onboarding page content.
 *
 * @param string $content Post content.
 * @return string
 */
function wrrapd_onboarding_login_filter_content( $content ) {
	if ( is_admin() || ! wrrapd_onboarding_login_is_portal_host() ) {
		return $content;
	}
	if ( ! function_exists( 'wrrapd_wrapstars_is_apply_host' ) || ! wrrapd_wrapstars_is_apply_host() ) {
		return $content;
	}
	$uri  = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '/';
	$path = '/' . trim( (string) strtok( $uri, '?' ), '/' );
	if ( ! wrrapd_onboarding_login_is_login_path( $path ) ) {
		return $content;
	}
	if ( ! in_the_loop() || ! is_main_query() ) {
		return $content;
	}
	// Logged-in eligible applicants: keep WrapStar welcome content on unified hosts
	// (login door and welcome share /onboarding/). Closed/activated users see the login gate message.
	if ( is_user_logged_in() ) {
		$uid    = get_current_user_id();
		$tracks = wrrapd_onboarding_login_eligible_tracks( $uid );
		if ( $tracks ) {
			return $content;
		}
	}
	return wrrapd_onboarding_login_shortcode();
}

/**
 * Host routing for the shared login door.
 */
function wrrapd_onboarding_login_routing() {
	if ( is_admin() || ! wrrapd_onboarding_login_is_portal_host() ) {
		return;
	}
	$uri  = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '/';
	$path = '/' . trim( (string) strtok( $uri, '?' ), '/' );
	if ( $path === '//' || $path === '' ) {
		$path = '/';
	}

	$is_apply = function_exists( 'wrrapd_wrapstars_is_apply_host' ) ? wrrapd_wrapstars_is_apply_host() : true;
	$is_pros  = function_exists( 'wrrapd_wrapstars_is_pros_host' ) ? wrrapd_wrapstars_is_pros_host() : false;

	// Apply host: exact /onboarding/ is the shared login (never bounce to pros).
	if ( $is_apply && wrrapd_onboarding_login_is_login_path( $path ) ) {
		if ( is_user_logged_in() ) {
			$uid    = get_current_user_id();
			$tracks = wrrapd_onboarding_login_eligible_tracks( $uid );
			if ( $tracks ) {
				// Invite expiry checks per track.
				foreach ( $tracks as $track ) {
					if ( $track === 'wrapstar' && function_exists( 'wrrapd_wrapstars_enforce_active_invite_or_logout' ) && wrrapd_wrapstars_enforce_active_invite_or_logout( $uid ) ) {
						wp_safe_redirect( add_query_arg( 'invite_expired', '1', wrrapd_onboarding_login_url() ) );
						exit;
					}
					if ( $track === 'wraprider' && function_exists( 'wrrapd_wrapriders_enforce_active_invite_or_logout' ) && wrrapd_wrapriders_enforce_active_invite_or_logout( $uid ) ) {
						wp_safe_redirect( add_query_arg( 'invite_expired', '1', wrrapd_onboarding_login_url() ) );
						exit;
					}
					if ( $track === 'joyrider' && function_exists( 'wrrapd_drivers_enforce_active_invite_or_logout' ) && wrrapd_drivers_enforce_active_invite_or_logout( $uid ) ) {
						wp_safe_redirect( add_query_arg( 'invite_expired', '1', wrrapd_onboarding_login_url() ) );
						exit;
					}
				}
				$redirect = isset( $_GET['redirect_to'] ) ? esc_url_raw( wp_unslash( $_GET['redirect_to'] ) ) : '';
				// Never redirect back onto the login door itself.
				if ( $redirect !== '' && wrrapd_onboarding_login_is_login_path( (string) wp_parse_url( $redirect, PHP_URL_PATH ) ) ) {
					$redirect = '';
				}
				$dest = wrrapd_onboarding_login_resolve_destination( $uid, $redirect );
				$dest_path = (string) wp_parse_url( $dest, PHP_URL_PATH );
				// Unified host: login door === WrapStar welcome — stay put and render steps.
				if ( wrrapd_onboarding_login_is_login_path( $dest_path ) ) {
					return;
				}
				wp_safe_redirect( $dest );
				exit;
			}
		}
		return;
	}

	// Pros-only host: logged-out visitors hitting onboarding trees go to the shared apply login.
	// Skip when this request is already the apply login door (unified apply===pros).
	if ( $is_pros && ! $is_apply && ! is_user_logged_in() ) {
		if ( preg_match( '#^/(onboarding|wraprider-onboarding|driver-onboarding)(/|$)#', $path ) ) {
			$dest = function_exists( 'wrrapd_wrapstars_pros_url' )
				? wrrapd_wrapstars_pros_url( $path )
				: ( 'https://pros.wrrapd.com' . $path );
			wp_safe_redirect( wrrapd_onboarding_login_url( $dest ) );
			exit;
		}
	}
}

/**
 * Process shared onboarding login POST.
 */
function wrrapd_onboarding_login_process() {
	if ( ! wrrapd_onboarding_login_is_portal_host() ) {
		return;
	}
	if ( ! isset( $_POST['wrrapd_ob_action'] ) || (string) $_POST['wrrapd_ob_action'] !== 'onboarding_login' ) {
		return;
	}
	if ( ! isset( $_POST['wrrapd_ob_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wrrapd_ob_nonce'] ) ), 'wrrapd_ob_login' ) ) {
		$GLOBALS['wrrapd_ob_login_error'] = 'Please try again.';
		return;
	}

	$email    = sanitize_email( wp_unslash( $_POST['email'] ?? '' ) );
	$password = isset( $_POST['password'] ) ? (string) wp_unslash( $_POST['password'] ) : '';
	$redirect = isset( $_POST['redirect_to'] ) ? esc_url_raw( wp_unslash( $_POST['redirect_to'] ) ) : '';

	if ( ! is_email( $email ) || $password === '' ) {
		$GLOBALS['wrrapd_ob_login_error'] = 'Enter your email and password.';
		return;
	}

	$user = wp_signon(
		array(
			'user_login'    => $email,
			'user_password' => $password,
			'remember'      => ! empty( $_POST['remember'] ),
		),
		is_ssl()
	);
	if ( is_wp_error( $user ) ) {
		$GLOBALS['wrrapd_ob_login_error'] = 'Invalid email or password.';
		return;
	}

	$uid     = (int) $user->ID;
	$tracks  = wrrapd_onboarding_login_eligible_tracks( $uid );
	$closed  = wrrapd_onboarding_login_closed_tracks( $uid );

	if ( ! $tracks && $closed ) {
		wp_logout();
		$labels = array_map( 'wrrapd_onboarding_login_track_label', $closed );
		$portals = array();
		foreach ( $closed as $track ) {
			$portals[] = wrrapd_onboarding_login_track_label( $track ) . ' portal (' . wrrapd_onboarding_login_role_portal_url( $track ) . ')';
		}
		$GLOBALS['wrrapd_ob_login_error'] = 'Your onboarding is complete. Sign in at your '
			. implode( ' or ', $portals )
			. ' with this same email and password.';
		return;
	}

	if ( ! $tracks ) {
		wp_logout();
		$GLOBALS['wrrapd_ob_login_error'] = 'Login is only available after your application is approved. Check your email for next steps.';
		return;
	}

	// Per-track invite expiry / declined checks.
	foreach ( $tracks as $track ) {
		if ( $track === 'wrapstar' && function_exists( 'wrrapd_wrapstars_get_application_by_user' ) ) {
			$app = wrrapd_wrapstars_get_application_by_user( $uid );
			if ( $app && (string) wrrapd_wrapstars_get_meta( $app->ID, 'status' ) === 'declined' ) {
				wp_logout();
				$GLOBALS['wrrapd_ob_login_error'] = 'This invitation was declined. Contact admin@wrrapd.com if that was a mistake.';
				return;
			}
			if ( $app && function_exists( 'wrrapd_wrapstars_invite_is_expired' ) && wrrapd_wrapstars_invite_is_expired( $app->ID ) ) {
				if ( function_exists( 'wrrapd_wrapstars_invalidate_expired_invite' ) ) {
					wrrapd_wrapstars_invalidate_expired_invite( $app->ID );
				}
				wp_logout();
				$GLOBALS['wrrapd_ob_login_error'] = 'This onboarding invitation expired after 15 days. Email us and we will send you a fresh welcome email.';
				return;
			}
		}
		if ( $track === 'wraprider' && function_exists( 'wrrapd_wrapriders_get_application_by_user' ) ) {
			$app = wrrapd_wrapriders_get_application_by_user( $uid );
			if ( $app && (string) wrrapd_wrapriders_get_meta( $app->ID, 'status' ) === 'declined' ) {
				wp_logout();
				$GLOBALS['wrrapd_ob_login_error'] = 'This invitation was declined.';
				return;
			}
			if ( $app && function_exists( 'wrrapd_wrapriders_invite_is_expired' ) && wrrapd_wrapriders_invite_is_expired( $app->ID ) ) {
				if ( function_exists( 'wrrapd_wrapriders_invalidate_expired_invite' ) ) {
					wrrapd_wrapriders_invalidate_expired_invite( $app->ID );
				}
				wp_logout();
				$GLOBALS['wrrapd_ob_login_error'] = 'Your invitation has expired. Contact us to resend.';
				return;
			}
		}
		if ( $track === 'joyrider' && function_exists( 'wrrapd_drivers_get_application_by_user' ) ) {
			$app = wrrapd_drivers_get_application_by_user( $uid );
			if ( $app && (string) wrrapd_drivers_get_meta( $app->ID, 'status' ) === 'declined' ) {
				wp_logout();
				$GLOBALS['wrrapd_ob_login_error'] = 'This invitation was declined.';
				return;
			}
			if ( $app && function_exists( 'wrrapd_drivers_invite_is_expired' ) && wrrapd_drivers_invite_is_expired( $app->ID ) ) {
				if ( function_exists( 'wrrapd_drivers_invalidate_expired_invite' ) ) {
					wrrapd_drivers_invalidate_expired_invite( $app->ID );
				}
				wp_logout();
				$GLOBALS['wrrapd_ob_login_error'] = 'Your invitation has expired. Contact us to resend.';
				return;
			}
		}
	}

	wp_safe_redirect( wrrapd_onboarding_login_resolve_destination( $uid, $redirect ) );
	exit;
}

/**
 * Shared onboarding login markup.
 *
 * @return string
 */
function wrrapd_onboarding_login_shortcode() {
	$redirect = isset( $_GET['redirect_to'] ) ? esc_url_raw( wp_unslash( $_GET['redirect_to'] ) ) : '';
	$error    = $GLOBALS['wrrapd_ob_login_error'] ?? '';
	if ( $error === '' && ! empty( $_GET['invite_expired'] ) ) {
		$error = 'This onboarding invitation expired after 15 days. Email us and we will send you a fresh welcome email.';
	}
	$greet = isset( $_GET['greet'] ) ? sanitize_text_field( wp_unslash( $_GET['greet'] ) ) : '';
	if ( $greet === '' && ! empty( $_POST['greet'] ) ) {
		$greet = sanitize_text_field( wp_unslash( $_POST['greet'] ) );
	}
	$welcome = $greet !== '' && strcasecmp( $greet, 'there' ) !== 0
		? 'Welcome to your onboarding, ' . $greet . '!'
		: 'Welcome to your onboarding!';

	ob_start();
	?>
	<div class="wrrapd-wrapstars wrrapd-wrapstars-login wrrapd-onboarding-login">
		<div class="wrrapd-onboarding-login__stage">
			<section class="wrrapd-wrapstars-login__head wrrapd-onboarding-login__intro">
				<p class="wrrapd-wrapstars-login__eyebrow">Onboarding</p>
				<h1><?php echo esc_html( $welcome ); ?></h1>
			</section>
			<?php if ( $error ) : ?>
				<div class="wrrapd-wrapstars-alert wrrapd-wrapstars-alert--err"><?php echo esc_html( $error ); ?></div>
			<?php endif; ?>
			<form class="wrrapd-wrapstars-form wrrapd-wrapstars-card wrrapd-wrapstars-login__form wrrapd-onboarding-login__form" method="post" action="">
				<?php wp_nonce_field( 'wrrapd_ob_login', 'wrrapd_ob_nonce' ); ?>
				<input type="hidden" name="wrrapd_ob_action" value="onboarding_login" />
				<?php if ( $redirect !== '' ) : ?>
					<input type="hidden" name="redirect_to" value="<?php echo esc_attr( $redirect ); ?>" />
				<?php endif; ?>
				<?php if ( $greet !== '' ) : ?>
					<input type="hidden" name="greet" value="<?php echo esc_attr( $greet ); ?>" />
				<?php endif; ?>
				<label>Email address <input type="email" name="email" required autocomplete="username" /></label>
				<label>Password <input type="password" name="password" required autocomplete="current-password" /></label>
				<label class="ws-check"><input type="checkbox" name="remember" value="1" /> <span>Keep me signed in</span></label>
				<div class="wrrapd-wrapstars-login__actions">
					<button type="submit" class="wrrapd-wrapstars-btn">Log in</button>
				</div>
			</form>
		</div>
	</div>
	<?php
	return (string) ob_get_clean();
}
