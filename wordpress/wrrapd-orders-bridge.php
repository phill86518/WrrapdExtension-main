<?php
/**
 * Plugin Name: Wrrapd Orders Bridge (MU)
 * Description: Orders bridge (claim + list shortcodes + studio layout) for Ulta, LEGO, Target, and Amazon; logout nonce fix; strip leading admin sort prefixes (e.g. 07.) from front-end titles (Elementor, menus, Yoast/Rank Math).
 * Author: Wrrapd
 *
 * Install: copy this file to wp-content/mu-plugins/wrrapd-orders-bridge.php (must-use plugins load automatically).
 * Define WRRAPD_INTERNAL_API_KEY and optionally WRRAPD_API_BASE in wp-config.php — see wordpress/README.md in the monorepo.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Logout links without a valid `_wpnonce` (common with hard-coded or Elementor URLs) show
 * WordPress “Do you really want to log out?” — bounce once to `wp_logout_url()` so logout completes immediately.
 */
function wrrapd_redirect_stale_logout_to_fresh_nonce() {
	if ( ! isset( $_GET['action'] ) || $_GET['action'] !== 'logout' ) {
		return;
	}
	if ( ! is_user_logged_in() ) {
		return;
	}
	$nonce = isset( $_GET['_wpnonce'] ) ? sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ) : '';
	if ( wp_verify_nonce( $nonce, 'log-out' ) ) {
		return;
	}
	$redirect = home_url( '/' );
	if ( ! empty( $_GET['redirect_to'] ) ) {
		$redirect = wp_validate_redirect( wp_unslash( $_GET['redirect_to'] ), $redirect );
	}
	wp_safe_redirect( wp_logout_url( $redirect ) );
	exit;
}
add_action( 'login_init', 'wrrapd_redirect_stale_logout_to_fresh_nonce', 0 );

/**
 * Strip a leading admin sort prefix from titles on the **front end** only
 * (WP admin and editor still show the full title).
 *
 * Matches: "07. My Orders", "07.My Orders", "7. My" — avoids "3.14 Pi" (no space after dot, single digit before dot).
 */
function wrrapd_strip_leading_title_sort_prefix( $title ) {
	if ( is_admin() || ! is_string( $title ) || $title === '' ) {
		return $title;
	}
	$out = preg_replace( '/^(?:(?:\d{2,}\.)|(?:\d+\.\s+))\s*/u', '', $title );
	return is_string( $out ) ? $out : $title;
}

/** Late priority so sort prefixes still strip if another plugin touched the title first. */
add_filter( 'the_title', 'wrrapd_strip_leading_title_sort_prefix', 999, 1 );

add_filter(
	'document_title_parts',
	static function ( $parts ) {
		if ( is_admin() || empty( $parts['title'] ) || ! is_string( $parts['title'] ) ) {
			return $parts;
		}
		$parts['title'] = wrrapd_strip_leading_title_sort_prefix( $parts['title'] );
		return $parts;
	},
	999,
	1
);

add_filter(
	'nav_menu_item_title',
	static function ( $title, $item, $args, $depth ) {
		if ( is_admin() || ! is_string( $title ) || $title === '' ) {
			return $title;
		}
		return wrrapd_strip_leading_title_sort_prefix( $title );
	},
	999,
	4
);

/** Some themes output raw post title; strip the same admin prefix. */
add_filter( 'single_post_title', 'wrrapd_strip_leading_title_sort_prefix', 999, 2 );

/** Yoast SEO title (browser / social when Yoast rewrites title). */
add_filter( 'wpseo_title', 'wrrapd_strip_leading_title_sort_prefix', 999, 1 );

/** Rank Math HTML title. */
add_filter( 'rank_math/frontend/title', 'wrrapd_strip_leading_title_sort_prefix', 999, 1 );

/** Elementor passes get_the_title() but some widgets/cache paths use this filter. */
add_filter(
	'elementor/utils/get_the_title',
	static function ( $title ) {
		return wrrapd_strip_leading_title_sort_prefix( (string) $title );
	},
	999,
	1
);

/**
 * On-disk folder for circular retailer PNGs (`mu-plugins/logos/`).
 */
function wrrapd_mu_logos_dir() {
	return dirname( __FILE__ ) . '/logos';
}

/**
 * Public URL for a built logo, or Google favicon fallback.
 *
 * @param string $slug            e.g. amazon, target.
 * @param string $favicon_domain  e.g. amazon.com.
 */
function wrrapd_mu_logo_url_for_slug( $slug, $favicon_domain ) {
	$slug = preg_replace( '/[^a-z0-9_-]/', '', strtolower( (string) $slug ) );
	if ( $slug === '' ) {
		return '';
	}
	$path = wrrapd_mu_logos_dir() . '/' . $slug . '.png';
	if ( is_readable( $path ) ) {
		return plugin_dir_url( __FILE__ ) . 'logos/' . $slug . '.png';
	}
	return 'https://www.google.com/s2/favicons?domain=' . rawurlencode( (string) $favicon_domain ) . '&sz=64';
}

/**
 * Map plain retailer name from order JSON to slug, label, and favicon domain.
 *
 * @param string $plain Raw retailer field.
 * @return array{slug:string,label:string,domain:string}|null Null = show plain text only.
 */
function wrrapd_retailer_row_from_plain( $plain ) {
	$plain = trim( (string) $plain );
	$lower = strtolower( $plain );
	if ( $plain === '' ) {
		return null;
	}
	if ( strpos( $lower, 'amazon' ) !== false ) {
		return array(
			'slug'   => 'amazon',
			'label'  => __( 'Amazon', 'wrrapd' ),
			'domain' => 'amazon.com',
		);
	}
	if ( preg_match( '/\bulta\b/i', $plain ) === 1 ) {
		return array(
			'slug'   => 'ulta',
			'label'  => __( 'Ulta', 'wrrapd' ),
			'domain' => 'ulta.com',
		);
	}
	if ( preg_match( '/\blego\b/i', $plain ) === 1 ) {
		return array(
			'slug'   => 'lego',
			'label'  => __( 'LEGO', 'wrrapd' ),
			'domain' => 'lego.com',
		);
	}
	if ( preg_match( '/\btarget\b/i', $plain ) === 1 ) {
		return array(
			'slug'   => 'target',
			'label'  => __( 'Target', 'wrrapd' ),
			'domain' => 'target.com',
		);
	}
	return null;
}

/**
 * Home page: retailer wheels (Ulta, LEGO, Target, Amazon) — JS moves the strip above “Gift-wrapping…” when that heading exists.
 */
function wrrapd_output_retailer_wheel_strip() {
	static $printed = false;
	if ( $printed ) {
		return;
	}
	if ( is_admin() || is_paged() ) {
		return;
	}
	if ( ! is_front_page() && ! is_home() ) {
		return;
	}
	$printed = true;
	$brands = array(
		array( 'slug' => 'ulta', 'label' => __( 'Ulta', 'wrrapd' ), 'domain' => 'ulta.com' ),
		array( 'slug' => 'lego', 'label' => __( 'LEGO', 'wrrapd' ), 'domain' => 'lego.com' ),
		array( 'slug' => 'target', 'label' => __( 'Target', 'wrrapd' ), 'domain' => 'target.com' ),
		array( 'slug' => 'amazon', 'label' => __( 'Amazon', 'wrrapd' ), 'domain' => 'amazon.com' ),
	);
	echo '<style id="wrrapd-retailer-wheels-css">';
	echo '@keyframes wrrapd-wheel-in{0%{transform:translateX(min(38vw,240px)) rotate(-540deg);opacity:0}100%{transform:translateX(0) rotate(0);opacity:1}}';
	echo '.wrrapd-retailer-wheels{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:clamp(.75rem,3vw,1.35rem);padding:.35rem 1rem .55rem;max-width:100%;margin:0 auto;box-sizing:border-box;}';
	echo '.wrrapd-retailer-wheels__item{flex:0 0 auto;width:100px;height:100px;border-radius:50%;overflow:hidden;box-shadow:0 2px 10px rgba(15,23,42,.12),inset 0 0 0 2px rgba(255,255,255,.75);background:#fff;animation:wrrapd-wheel-in 1.15s cubic-bezier(.2,.85,.15,1) forwards;opacity:0;}';
	echo '.wrrapd-retailer-wheels__item:nth-child(1){animation-delay:.06s}.wrrapd-retailer-wheels__item:nth-child(2){animation-delay:.2s}.wrrapd-retailer-wheels__item:nth-child(3){animation-delay:.34s}.wrrapd-retailer-wheels__item:nth-child(4){animation-delay:.48s}';
	echo '.wrrapd-retailer-wheels__item img{display:block;width:100%;height:100%;object-fit:cover;}';
	echo '</style>';
	echo '<div id="wrrapd-retailer-wheels-strip" class="wrrapd-retailer-wheels" role="region" aria-label="' . esc_attr__( 'Retailers: Ulta, LEGO, Target, and Amazon', 'wrrapd' ) . '">';
	foreach ( $brands as $b ) {
		$src = esc_url( wrrapd_mu_logo_url_for_slug( $b['slug'], $b['domain'] ) );
		$fb  = 'https://www.google.com/s2/favicons?domain=' . rawurlencode( $b['domain'] ) . '&sz=128';
		echo '<div class="wrrapd-retailer-wheels__item"><img src="' . $src . '" data-fallback="' . esc_url( $fb ) . '" width="100" height="100" alt="' . esc_attr( $b['label'] ) . '" loading="lazy" decoding="async" onerror="var u=this.dataset.fallback;if(u){this.onerror=null;this.src=u;}" /></div>';
	}
	echo '</div>';
	echo '<script>';
	echo 'document.addEventListener("DOMContentLoaded",function(){var s=document.getElementById("wrrapd-retailer-wheels-strip");if(!s)return;var nodes=document.querySelectorAll("h1,h2,h3,p,.elementor-heading-title");var a=null;for(var i=0;i<nodes.length;i++){var el=nodes[i],t=(el.textContent||"");if(/gift[-\s]?wrapp/i.test(t)&&t.length<500){a=el;break;}}if(a&&a.parentNode){a.parentNode.insertBefore(s,a);}});';
	echo '</script>';
}

add_action( 'wp_body_open', 'wrrapd_output_retailer_wheel_strip', 5 );
/** Same callback, run-once guard: outputs here if the active theme never calls `wp_body_open`. */
add_action( 'wp_footer', 'wrrapd_output_retailer_wheel_strip', 1 );

if ( ! defined( 'WRRAPD_INTERNAL_API_KEY' ) || WRRAPD_INTERNAL_API_KEY === '' ) {
	return;
}

if ( ! defined( 'WRRAPD_API_BASE' ) ) {
	define( 'WRRAPD_API_BASE', 'https://api.wrrapd.com' );
}

/**
 * @param string $path e.g. '/api/internal/claim-orders-by-email'
 * @param array  $body JSON body
 * @return array{ ok: bool, code: int, body: string|array|null, error?: string }
 */
function wrrapd_bridge_json_post( $path, array $body ) {
	$url  = rtrim( WRRAPD_API_BASE, '/' ) . $path;
	$json = wp_json_encode( $body );
	if ( false === $json ) {
		return array( 'ok' => false, 'code' => 0, 'body' => null, 'error' => 'json_encode_failed' );
	}
	$response = wp_remote_post(
		$url,
		array(
			'timeout' => 25,
			'headers' => array(
				'Content-Type'        => 'application/json',
				'X-Wrrapd-Internal-Key' => WRRAPD_INTERNAL_API_KEY,
			),
			'body'    => $json,
		)
	);
	if ( is_wp_error( $response ) ) {
		return array(
			'ok'     => false,
			'code'   => 0,
			'body'   => null,
			'error'  => $response->get_error_message(),
		);
	}
	$code = (int) wp_remote_retrieve_response_code( $response );
	$raw  = wp_remote_retrieve_body( $response );
	$decoded = json_decode( $raw, true );
	return array(
		'ok'    => $code >= 200 && $code < 300,
		'code'  => $code,
		'body'  => is_array( $decoded ) ? $decoded : $raw,
		'error' => null,
	);
}

/**
 * Stamp claimedWpUserId on all VM order JSON rows matching this user's email (idempotent).
 */
function wrrapd_claim_orders_for_user( WP_User $user ) {
	if ( ! $user || ! $user->ID ) {
		return;
	}
	$email = $user->user_email;
	if ( ! is_string( $email ) || $email === '' ) {
		return;
	}
	$r = wrrapd_bridge_json_post(
		'/api/internal/claim-orders-by-email',
		array(
			'email'    => $email,
			'wpUserId' => (string) $user->ID,
			'dryRun'   => false,
		)
	);
	if ( ! $r['ok'] ) {
		if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( '[wrrapd-orders-bridge] claim failed code=' . $r['code'] . ' err=' . ( $r['error'] ?? '' ) );
		}
	}
}

/** @param string $user_login */
function wrrapd_on_wp_login( $user_login, $user ) {
	if ( $user instanceof WP_User ) {
		wrrapd_claim_orders_for_user( $user );
	}
}

/** @param int $user_id */
function wrrapd_on_user_register( $user_id ) {
	$user = get_userdata( (int) $user_id );
	if ( $user instanceof WP_User ) {
		wrrapd_claim_orders_for_user( $user );
	}
}

add_action( 'wp_login', 'wrrapd_on_wp_login', 10, 2 );
add_action( 'user_register', 'wrrapd_on_user_register', 10, 1 );

/**
 * Fetch orders for the current WP user from the pay API.
 *
 * @return array<int, array<string, mixed>>|null
 */
function wrrapd_fetch_orders_for_user( WP_User $user ) {
	if ( ! $user || ! $user->ID || ! is_string( $user->user_email ) || $user->user_email === '' ) {
		return null;
	}
	$r = wrrapd_bridge_json_post(
		'/api/internal/orders-for-wp-user',
		array(
			'email'    => $user->user_email,
			'wpUserId' => (string) $user->ID,
		)
	);
	if ( ! $r['ok'] || ! is_array( $r['body'] ) || empty( $r['body']['ok'] ) ) {
		return null;
	}
	return isset( $r['body']['orders'] ) && is_array( $r['body']['orders'] ) ? $r['body']['orders'] : array();
}

/**
 * Slow the extension CTA blink globally and hide the CTA for signed-in users with orders.
 */
function wrrapd_inject_header_cta_rules() {
	if ( is_admin() ) {
		return;
	}
	echo '<style id="wrrapd-cta-slower-blink">@keyframes wrrapd-cta-blink-slow{0%,100%{filter:brightness(1);box-shadow:0 0 0 0 rgba(234,88,12,.45);}50%{filter:brightness(1.12);box-shadow:0 0 14px 3px rgba(234,88,12,.35);}}.elementor-element-7f1bdc1 .elementor-button,.elementor-element-eb0b235 .elementor-button,.elementor-element-7f1bdc1 a.elementor-button,.elementor-element-eb0b235 a.elementor-button{animation:wrrapd-cta-blink-slow 3.5s ease-in-out infinite!important;}</style>';

	if ( ! is_user_logged_in() ) {
		return;
	}
	$user = wp_get_current_user();
	if ( ! ( $user instanceof WP_User ) || ! $user->ID ) {
		return;
	}
	$orders = wrrapd_fetch_orders_for_user( $user );
	$has_orders = is_array( $orders ) && count( $orders ) > 0;
	if ( ! $has_orders ) {
		return;
	}
	echo '<style id="wrrapd-hide-cta-when-orders">.elementor-element-7f1bdc1,.elementor-element-eb0b235{display:none!important;}</style>';
	echo '<script>(function(){var re=/add\\s+your\\s+free\\s+chrome\\s+extension\\s+today/i;document.querySelectorAll("a,button,.elementor-button,.elementor-heading-title").forEach(function(el){var t=(el.textContent||"").replace(/\\s+/g," ").trim();if(!re.test(t))return;var wrap=el.closest(".elementor-element,section,div")||el;wrap.style.display="none";});})();</script>';
}
add_action( 'wp_head', 'wrrapd_inject_header_cta_rules', 99 );

/**
 * Keep footer year current and absorb dead Amazon callback route into home.
 */
function wrrapd_site_footer_hygiene() {
	if ( is_admin() ) {
		return;
	}
	$year = (string) gmdate( 'Y' );
	echo '<script>(function(){var y=' . wp_json_encode( $year ) . ';var yr=/\\b20\\d{2}\\b/;document.querySelectorAll("footer, .site-footer, .elementor-location-footer, [class*=footer]").forEach(function(root){if(!root)return;root.querySelectorAll("*").forEach(function(n){if(!n||!n.childNodes||n.childNodes.length!==1||n.childNodes[0].nodeType!==3)return;var t=(n.textContent||"").trim();if(!t)return;if(/copyright|all rights reserved|©/i.test(t)&&yr.test(t)){n.textContent=t.replace(yr,y);}});});})();</script>';
}
add_action( 'wp_footer', 'wrrapd_site_footer_hygiene', 99 );

/**
 * Fallback: if Amazon returns to an unmapped WP path, avoid 404/footer corruption.
 */
function wrrapd_handle_amazon_callback_path() {
	$uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '';
	if ( $uri === '' ) {
		return;
	}
	if ( strpos( $uri, '/auth/amazon/callback' ) !== 0 ) {
		return;
	}
	$code = isset( $_GET['code'] ) ? sanitize_text_field( wp_unslash( $_GET['code'] ) ) : '';
	if ( $code === '' ) {
		wp_safe_redirect( home_url( '/' ), 302 );
		exit;
	}

	// Prefer WRRAPD_AMAZON_*; fall back to legacy AMAZON_* wp-config names. Treat obvious
	// template placeholders (YOUR_...) or non-LWA client ids as empty so fallback applies.
	$id_val  = defined( 'WRRAPD_AMAZON_CLIENT_ID' ) ? trim( (string) WRRAPD_AMAZON_CLIENT_ID ) : '';
	$sec_val = defined( 'WRRAPD_AMAZON_CLIENT_SECRET' ) ? trim( (string) WRRAPD_AMAZON_CLIENT_SECRET ) : '';
	if ( $id_val !== '' && strpos( $id_val, 'amzn1.application-oa2-client.' ) !== 0 ) {
		$id_val = '';
	}
	if ( $sec_val !== '' && stripos( $sec_val, 'YOUR_' ) !== false ) {
		$sec_val = '';
	}
	if ( defined( 'AMAZON_CLIENT_ID' ) ) {
		$legacy_id = trim( (string) AMAZON_CLIENT_ID );
		if ( $legacy_id !== '' && strpos( $legacy_id, 'amzn1.application-oa2-client.' ) === 0 && $id_val === '' ) {
			$id_val = $legacy_id;
		}
	}
	if ( defined( 'AMAZON_CLIENT_SECRET' ) ) {
		$legacy_sec = trim( (string) AMAZON_CLIENT_SECRET );
		if ( $legacy_sec !== '' && $sec_val === '' ) {
			$sec_val = $legacy_sec;
		}
	}

	$id_ok  = ( $id_val !== '' && strpos( $id_val, 'amzn1.application-oa2-client.' ) === 0 );
	$sec_ok = ( $sec_val !== '' && stripos( $sec_val, 'YOUR_' ) === false );
	if ( ! $id_ok || ! $sec_ok ) {
		wp_safe_redirect( home_url( '/' ), 302 );
		exit;
	}

	$redirect_uri = home_url( '/auth/amazon/callback' );
	$token_body   = array();
	$token_raw    = '';

	$token_res = wp_remote_post(
		'https://api.amazon.com/auth/o2/token',
		array(
			'timeout' => 20,
			'headers' => array(
				'Content-Type' => 'application/x-www-form-urlencoded',
			),
			'body'    => http_build_query(
				array(
					'grant_type'    => 'authorization_code',
					'code'          => $code,
					'client_id'     => $id_val,
					'client_secret' => $sec_val,
					'redirect_uri'  => $redirect_uri,
				),
				'',
				'&',
				PHP_QUERY_RFC3986
			),
		)
	);
	if ( is_wp_error( $token_res ) ) {
		wp_safe_redirect( home_url( '/' ), 302 );
		exit;
	}
	$token_raw  = (string) wp_remote_retrieve_body( $token_res );
	$decoded    = json_decode( $token_raw, true );
	$token_body = is_array( $decoded ) ? $decoded : array();
	$access     = ( is_array( $token_body ) && isset( $token_body['access_token'] ) ) ? trim( (string) $token_body['access_token'] ) : '';
	if ( $access === '' ) {
		wp_safe_redirect( home_url( '/' ), 302 );
		exit;
	}

	$profile_res = wp_remote_get(
		'https://api.amazon.com/user/profile',
		array(
			'timeout' => 20,
			'headers' => array(
				'Authorization' => 'Bearer ' . $access,
			),
		)
	);
	if ( is_wp_error( $profile_res ) ) {
		wp_safe_redirect( home_url( '/' ), 302 );
		exit;
	}
	$profile      = json_decode( (string) wp_remote_retrieve_body( $profile_res ), true );
	$amazon_email = ( is_array( $profile ) && isset( $profile['email'] ) ) ? sanitize_email( (string) $profile['email'] ) : '';
	if ( $amazon_email === '' || ! is_email( $amazon_email ) ) {
		wp_safe_redirect( home_url( '/' ), 302 );
		exit;
	}

	$user = get_user_by( 'email', $amazon_email );
	if ( ! ( $user instanceof WP_User ) ) {
		wp_safe_redirect( home_url( '/' ), 302 );
		exit;
	}

	wp_set_current_user( (int) $user->ID );
	wp_set_auth_cookie( (int) $user->ID, true );
	wrrapd_claim_orders_for_user( $user );
	wp_safe_redirect( home_url( '/' ), 302 );
	exit;
}
add_action( 'template_redirect', 'wrrapd_handle_amazon_callback_path', 0 );

/**
 * @param mixed $v
 */
function wrrapd_cell_text( $v ) {
	if ( $v === null || $v === '' ) {
		return '—';
	}
	return (string) $v;
}

/**
 * @param array<int, array<string, mixed>> $orders
 */
function wrrapd_render_orders_table_simple( array $orders ) {
	ob_start();
	echo '<div class="wrrapd-review-orders-table-wrap"><table class="wrrapd-review-orders-table wrrapd-review-orders-simple"><thead><tr>';
	echo '<th>' . esc_html__( 'Order', 'wrrapd' ) . '</th>';
	echo '<th>' . esc_html__( 'Date', 'wrrapd' ) . '</th>';
	echo '<th>' . esc_html__( 'Items', 'wrrapd' ) . '</th>';
	echo '<th>' . esc_html__( 'Payment', 'wrrapd' ) . '</th>';
	echo '</tr></thead><tbody>';
	foreach ( $orders as $row ) {
		if ( ! is_array( $row ) ) {
			continue;
		}
		$on  = isset( $row['orderNumber'] ) ? (string) $row['orderNumber'] : '—';
		$ts  = isset( $row['timestamp'] ) ? (string) $row['timestamp'] : '';
		$cnt = isset( $row['lineItemCount'] ) ? (int) $row['lineItemCount'] : 0;
		$st  = '';
		if ( isset( $row['payment'] ) && is_array( $row['payment'] ) ) {
			$st = isset( $row['payment']['status'] ) ? (string) $row['payment']['status'] : '';
		}
		echo '<tr>';
		echo '<td>' . esc_html( $on ) . '</td>';
		echo '<td>' . esc_html( $ts ) . '</td>';
		echo '<td>' . esc_html( (string) $cnt ) . '</td>';
		echo '<td>' . esc_html( $st ) . '</td>';
		echo '</tr>';
	}
	echo '</tbody></table></div>';
	return (string) ob_get_clean();
}

/**
 * Rich layout: giftee, occasion, design, gift note from pay-server line items (maps to your legacy columns).
 *
 * @param array<int, array<string, mixed>> $orders
 */
function wrrapd_render_orders_table_rich( array $orders ) {
	ob_start();
	echo '<div class="wrrapd-review-orders-table-wrap"><table class="wrrapd-review-orders-table wrrapd-review-orders-rich"><thead><tr>';
	echo '<th>' . esc_html__( 'Retailer / order #', 'wrrapd' ) . '</th>';
	echo '<th>' . esc_html__( 'Date placed', 'wrrapd' ) . '</th>';
	echo '<th>' . esc_html__( 'Giftee', 'wrrapd' ) . '</th>';
	echo '<th>' . esc_html__( 'Occasion', 'wrrapd' ) . '</th>';
	echo '<th>' . esc_html__( 'Design', 'wrrapd' ) . '</th>';
	echo '<th>' . esc_html__( 'Gift message', 'wrrapd' ) . '</th>';
	echo '<th>' . esc_html__( 'Wrrapd lines', 'wrrapd' ) . '</th>';
	echo '<th>' . esc_html__( 'Payment', 'wrrapd' ) . '</th>';
	echo '</tr></thead><tbody>';

	foreach ( $orders as $order ) {
		if ( ! is_array( $order ) ) {
			continue;
		}
		$on   = isset( $order['orderNumber'] ) ? (string) $order['orderNumber'] : '—';
		$ts   = isset( $order['timestamp'] ) ? (string) $order['timestamp'] : '';
		$st   = '';
		if ( isset( $order['payment'] ) && is_array( $order['payment'] ) ) {
			$st = isset( $order['payment']['status'] ) ? (string) $order['payment']['status'] : '';
		}
		$wl = isset( $order['wrrapdLineCount'] ) ? (int) $order['wrrapdLineCount'] : 0;
		$lines = isset( $order['lines'] ) && is_array( $order['lines'] ) ? $order['lines'] : array();
		if ( count( $lines ) === 0 ) {
			$lines = array(
				array(
					'gifteeName'          => null,
					'occasion'            => null,
					'designSummary'       => null,
					'giftMessageSnippet'  => null,
					'productTitle'        => null,
				),
			);
		}
		$n = count( $lines );
		$rs = max( 1, $n );

		foreach ( $lines as $i => $ln ) {
			if ( ! is_array( $ln ) ) {
				continue;
			}
			echo '<tr>';
			if ( $i === 0 ) {
				echo '<td rowspan="' . (int) $rs . '">' . esc_html( $on ) . '</td>';
				echo '<td rowspan="' . (int) $rs . '">' . esc_html( $ts ) . '</td>';
			}
			echo '<td>' . esc_html( wrrapd_cell_text( $ln['gifteeName'] ?? null ) ) . '</td>';
			echo '<td>' . esc_html( wrrapd_cell_text( $ln['occasion'] ?? null ) ) . '</td>';
			echo '<td>' . esc_html( wrrapd_cell_text( $ln['designSummary'] ?? null ) ) . '</td>';
			echo '<td>' . esc_html( wrrapd_cell_text( $ln['giftMessageSnippet'] ?? null ) ) . '</td>';
			if ( $i === 0 ) {
				echo '<td rowspan="' . (int) $rs . '">' . esc_html( (string) $wl ) . '</td>';
				echo '<td rowspan="' . (int) $rs . '">' . esc_html( $st ) . '</td>';
			}
			echo '</tr>';
		}
	}

	echo '</tbody></table></div>';
	return (string) ob_get_clean();
}

/**
 * Card layout + optional occasion filter (front-end only; scoped CSS).
 *
 * @param array<int, array<string, mixed>> $orders
 */
function wrrapd_render_orders_cards( array $orders ) {
	$wrap_id = function_exists( 'wp_unique_id' ) ? wp_unique_id( 'wrrapd-orders-' ) : 'wrrapd-orders-' . uniqid( '', false );
	$sel_id  = $wrap_id . '-occasion';

	$occasions = array();
	foreach ( $orders as $order ) {
		if ( ! is_array( $order ) ) {
			continue;
		}
		$lines = isset( $order['lines'] ) && is_array( $order['lines'] ) ? $order['lines'] : array();
		foreach ( $lines as $ln ) {
			if ( ! is_array( $ln ) ) {
				continue;
			}
			$o = isset( $ln['occasion'] ) ? trim( (string) $ln['occasion'] ) : '';
			if ( $o !== '' ) {
				$occasions[ $o ] = true;
			}
		}
	}
	$occasion_keys = array_keys( $occasions );
	sort( $occasion_keys, SORT_NATURAL | SORT_FLAG_CASE );

	ob_start();
	echo '<div id="' . esc_attr( $wrap_id ) . '" class="wrrapd-orders-cards-root">';

	echo '<style>
.wrrapd-orders-cards-root{--wrrapd-navy:#152a45;--wrrapd-gold:#c9a227;--wrrapd-card:#fff;--wrrapd-muted:#5c6b7a;max-width:1100px;margin:0 auto 2.5rem;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}
.wrrapd-orders-cards-root .wrrapd-occ-row{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem 1.25rem;margin:0 0 1.25rem;padding:1rem 1.25rem;background:linear-gradient(135deg,var(--wrrapd-navy),#1e3d66);border-radius:12px;color:#fff;box-shadow:0 4px 18px rgba(21,42,69,.25);}
.wrrapd-orders-cards-root .wrrapd-occ-row label{font-weight:600;font-size:.95rem;}
.wrrapd-orders-cards-root .wrrapd-occ-row select{min-width:220px;padding:.55rem .9rem;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:#fff;font-size:.95rem;}
.wrrapd-orders-cards-root .wrrapd-occ-row select option{color:#111;}
.wrrapd-orders-cards-root article.wrrapd-order-card{background:var(--wrrapd-card);border-radius:14px;box-shadow:0 2px 14px rgba(21,42,69,.08);margin-bottom:1.35rem;overflow:hidden;border:1px solid rgba(21,42,69,.08);}
.wrrapd-orders-cards-root .wrrapd-order-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.75rem 1rem;padding:1rem 1.25rem;background:linear-gradient(90deg,rgba(201,162,39,.12),transparent);border-bottom:1px solid rgba(21,42,69,.08);}
.wrrapd-orders-cards-root .wrrapd-order-head strong{font-size:1.1rem;color:var(--wrrapd-navy);}
.wrrapd-orders-cards-root .wrrapd-order-meta{font-size:.88rem;color:var(--wrrapd-muted);}
.wrrapd-orders-cards-root .wrrapd-pay-badge{display:inline-block;padding:.2rem .65rem;border-radius:999px;font-size:.78rem;font-weight:600;background:rgba(201,162,39,.25);color:#6a5300;}
.wrrapd-orders-cards-root .wrrapd-line-card{padding:1rem 1.25rem 1.15rem;border-top:1px solid rgba(21,42,69,.06);}
.wrrapd-orders-cards-root .wrrapd-line-card:first-of-type{border-top:none;}
.wrrapd-orders-cards-root .wrrapd-line-top{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem .75rem;margin-bottom:.45rem;}
.wrrapd-orders-cards-root .wrrapd-occ-pill{display:inline-block;padding:.2rem .65rem;border-radius:999px;font-size:.78rem;font-weight:600;background:#eef4ff;color:#2a4a8a;}
.wrrapd-orders-cards-root .wrrapd-giftee{font-size:1.05rem;font-weight:600;color:var(--wrrapd-navy);}
.wrrapd-orders-cards-root .wrrapd-sub{font-size:.88rem;color:var(--wrrapd-muted);margin:.35rem 0 .15rem;}
.wrrapd-orders-cards-root .wrrapd-design,.wrrapd-orders-cards-root .wrrapd-gift{font-size:.9rem;line-height:1.45;color:#334155;}
</style>';

	if ( count( $occasion_keys ) > 0 ) {
		echo '<div class="wrrapd-occ-row"><label for="' . esc_attr( $sel_id ) . '">' . esc_html__( 'Occasion', 'wrrapd' ) . '</label>';
		echo '<select id="' . esc_attr( $sel_id ) . '">';
		echo '<option value="">' . esc_html__( 'All occasions', 'wrrapd' ) . '</option>';
		foreach ( $occasion_keys as $lab ) {
			$key = md5( $lab );
			echo '<option value="' . esc_attr( $key ) . '">' . esc_html( $lab ) . '</option>';
		}
		echo '</select></div>';
	}

	foreach ( $orders as $order ) {
		if ( ! is_array( $order ) ) {
			continue;
		}
		$on = isset( $order['orderNumber'] ) ? (string) $order['orderNumber'] : '—';
		$ts = isset( $order['timestamp'] ) ? (string) $order['timestamp'] : '';
		$st = '';
		if ( isset( $order['payment'] ) && is_array( $order['payment'] ) ) {
			$st = isset( $order['payment']['status'] ) ? (string) $order['payment']['status'] : '';
		}
		$lines = isset( $order['lines'] ) && is_array( $order['lines'] ) ? $order['lines'] : array();
		if ( count( $lines ) === 0 ) {
			$lines = array(
				array(
					'gifteeName'         => null,
					'occasion'           => null,
					'designSummary'      => null,
					'giftMessageSnippet' => null,
					'productTitle'       => null,
				),
			);
		}

		echo '<article class="wrrapd-order-card">';
		echo '<div class="wrrapd-order-head"><div><strong>' . esc_html__( 'Order', 'wrrapd' ) . ' ' . esc_html( $on ) . '</strong>';
		echo '<div class="wrrapd-order-meta">' . esc_html( $ts ) . '</div></div>';
		if ( $st !== '' ) {
			echo '<span class="wrrapd-pay-badge">' . esc_html( $st ) . '</span>';
		}
		echo '</div>';

		foreach ( $lines as $ln ) {
			if ( ! is_array( $ln ) ) {
				continue;
			}
			$gif = wrrapd_cell_text( $ln['gifteeName'] ?? null );
			$occ = isset( $ln['occasion'] ) ? trim( (string) $ln['occasion'] ) : '';
			$key = $occ !== '' ? md5( $occ ) : '';
			$des = wrrapd_cell_text( $ln['designSummary'] ?? null );
			$gifm = wrrapd_cell_text( $ln['giftMessageSnippet'] ?? null );
			$pt   = wrrapd_cell_text( $ln['productTitle'] ?? null );

			echo '<div class="wrrapd-line-card" data-wrrapd-occ="' . esc_attr( $key ) . '">';
			echo '<div class="wrrapd-line-top">';
			if ( $occ !== '' ) {
				echo '<span class="wrrapd-occ-pill">' . esc_html( $occ ) . '</span>';
			}
			echo '<span class="wrrapd-giftee">' . esc_html( $gif ) . '</span>';
			echo '</div>';
			if ( $pt !== '—' ) {
				echo '<div class="wrrapd-sub">' . esc_html__( 'Item', 'wrrapd' ) . ': ' . esc_html( $pt ) . '</div>';
			}
			if ( $des !== '—' ) {
				echo '<div class="wrrapd-design"><strong>' . esc_html__( 'Design', 'wrrapd' ) . '</strong> — ' . esc_html( $des ) . '</div>';
			}
			if ( $gifm !== '—' ) {
				echo '<div class="wrrapd-gift"><strong>' . esc_html__( 'Gift message', 'wrrapd' ) . '</strong> — ' . esc_html( $gifm ) . '</div>';
			}
			echo '</div>';
		}
		echo '</article>';
	}

	if ( count( $occasion_keys ) > 0 ) {
		$sel_json = wp_json_encode( $sel_id );
		echo '<script>(function(){var s=document.getElementById(' . $sel_json . ');if(!s)return;var root=document.getElementById(' . wp_json_encode( $wrap_id ) . ');if(!root)return;function run(){var v=s.value||"";root.querySelectorAll("[data-wrrapd-occ]").forEach(function(el){var m=el.getAttribute("data-wrrapd-occ")||"";el.style.display=(!v||m===v)?"":"none";});}s.addEventListener("change",run);})();</script>';
	}

	echo '</div>';
	return (string) ob_get_clean();
}

/**
 * Legacy “card” layout (historical Elementor HTML widget) — server-rendered from API orders, no fetch/CORS.
 * Use: [wrrapd_review_orders layout="legacy-cards"]
 *
 * @param array<int, array<string, mixed>>                  $orders
 * @param array<string, array<string|int, array<string, string>>> $overlays
 */
function wrrapd_render_orders_legacy_cards( array $orders, array $overlays ) {
	$wrap_id = function_exists( 'wp_unique_id' ) ? wp_unique_id( 'wrrapd-legacy-' ) : 'wrrapd-legacy-' . uniqid( '', false );
	$nonce   = wp_create_nonce( 'wrrapd_line_extras' );
	$ajax    = admin_url( 'admin-ajax.php' );
	$labels  = wrrapd_merge_occasion_dropdown_choices( $orders, $overlays );
	$rels    = wrrapd_relationship_choices();
	$def_img = 'https://www.publicdomainpictures.net/pictures/30000/velka/christmas-wrapping-paper.jpg';

	ob_start();
	echo '<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&amp;display=swap" />';
	echo '<div id="' . esc_attr( $wrap_id ) . '" class="wrrapd-legacy-cards-root" data-ajax-url="' . esc_url( $ajax ) . '" data-nonce="' . esc_attr( $nonce ) . '">';
	echo '<style>
.wrrapd-legacy-cards-root{--wr-amber:#ea580c;--wr-amber-deep:#c2410c;--wr-navy:#162a52;font-family:Roboto,system-ui,sans-serif;font-size:.875rem;max-width:100%;padding:.85rem;box-sizing:border-box;color:#1a1a1a;line-height:1.35;}
.wrrapd-legacy-cards-root *,.wrrapd-legacy-cards-root *::before,.wrrapd-legacy-cards-root *::after{box-sizing:border-box;}
.wrrapd-legacy-cards-root h2{font-size:1.2rem;margin:0 0 1.1rem;font-weight:700;}
.wrrapd-legacy-cards-root .order-card{display:flex;flex-direction:column;border:1px solid #c5c5c5;padding:.85rem 1rem;border-radius:.65rem;box-shadow:0 .12rem .35rem rgba(0,0,0,.06);margin-bottom:1.15rem;background:#fff;}
.wrrapd-legacy-cards-root .order-content{display:grid;grid-template-columns:minmax(260px,1fr) minmax(240px,400px) minmax(260px,1fr);gap:1.35rem;align-items:flex-start;}
.wrrapd-legacy-cards-root .order-details{min-width:0;}
.wrrapd-legacy-cards-root .order-meta{margin-bottom:.65rem;font-size:.8rem;color:#333;}
.wrrapd-legacy-cards-root .order-meta strong{display:block;font-weight:600;margin-bottom:.15rem;}
.wrrapd-legacy-cards-root .order-items{display:flex;flex-direction:column;gap:.65rem;}
.wrrapd-legacy-cards-root .order-item{display:grid;grid-template-columns:4.25rem 4.25rem minmax(0,1fr);gap:.62rem;padding:.45rem 0;border-bottom:1px solid #eee;align-items:start;}
.wrrapd-legacy-cards-root .order-item:last-child{border-bottom:none;}
.wrrapd-legacy-cards-root .order-item img{width:4.25rem;height:4.25rem;object-fit:cover;border-radius:.45rem;border:1px solid #ccc;background:#fff;}
.wrrapd-legacy-cards-root .order-item .wrrapd-legacy-wrap-preview.is-empty{width:4.25rem;height:4.25rem;border-radius:.45rem;border:1px dashed #94a3b8;background:#f8fafc;}
.wrrapd-legacy-cards-root .item-details{flex:1;min-width:0;font-size:.8rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-retail-row{display:flex;align-items:center;gap:.3rem;font-weight:700;color:#0f172a;margin-bottom:.08rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-item-id{font-size:.72rem;color:#334155;font-weight:700;line-height:1.2;margin-bottom:.08rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-item-title{font-size:.78rem;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:.1rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-design-choice{font-size:.74rem;font-weight:700;color:#0f172a;line-height:1.22;margin-bottom:.08rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-flowers-line{font-size:.74rem;line-height:1.22;margin-bottom:.06rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-msg-line{font-size:.74rem;line-height:1.28;color:#1f2937;}
.wrrapd-legacy-cards-root .legacy-forms{width:100%;min-width:240px;max-width:400px;display:flex;flex-direction:column;gap:.85rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-line{border:1px solid #ddd;border-radius:.5rem;padding:.65rem .75rem;background:#fafafa;}
.wrrapd-legacy-cards-root .info-box{background:transparent;padding:0;border-radius:0;border:none;margin-bottom:.38rem;}
.wrrapd-legacy-cards-root .info-box label{display:block;margin-bottom:.35rem;font-size:.72rem;font-weight:600;color:#333;}
.wrrapd-legacy-cards-root .info-box input[type=text],.wrrapd-legacy-cards-root .info-box input[type=date]{width:100%;padding:.32rem .4rem;font-size:.78rem;border:1px solid #bbb;border-radius:.3rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-giftee-readonly{width:100%;padding:.38rem .52rem;border-radius:6px;background:linear-gradient(180deg,#7f1d1d,#5c1a2e);color:#fff5f5;font-weight:700;font-size:.78rem;line-height:1.35;box-shadow:inset 0 1px 0 rgba(255,255,255,.12);}
.wrrapd-legacy-cards-root .wrrapd-legacy-orange-select select{width:100%;padding:.32rem .45rem;font-size:.78rem;border-radius:6px;border:2px solid var(--wr-navy);background:linear-gradient(180deg,var(--wr-amber),var(--wr-amber-deep));color:#fff7ed;line-height:1.25;box-shadow:inset 0 1px 0 rgba(255,255,255,.2);cursor:pointer;}
.wrrapd-legacy-cards-root .wrrapd-legacy-orange-select select:focus{outline:2px solid #f5c518;outline-offset:1px;}
.wrrapd-legacy-cards-root .wrrapd-legacy-orange-select select option{background:#fff;color:#0f172a;}
.wrrapd-legacy-cards-root .wrrapd-legacy-rem-date-box{background:transparent;padding:0;}
.wrrapd-legacy-cards-root .wrrapd-legacy-rem-date-row{display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:flex-start;gap:.45rem;margin-top:.05rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-date-block{flex:0 1 8.3rem;min-width:8.3rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-date-block input[type=date]{width:100%;padding:.28rem .35rem;font-size:.74rem;border:1px solid #bbb;border-radius:.3rem;background:#fff;line-height:1.25;}
.wrrapd-legacy-cards-root .wrrapd-legacy-rem-block{flex:0 1 auto;min-width:0;display:flex;flex-wrap:nowrap;align-items:center;gap:.35rem;font-size:.68rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-rem-block > label{display:inline-flex;align-items:center;gap:.28rem;margin:0;font-weight:600;white-space:nowrap;}
.wrrapd-legacy-cards-root .wrrapd-legacy-rem-block input[type=checkbox]{width:14px;height:14px;margin:0;accent-color:var(--wr-amber-deep);}
.wrrapd-legacy-cards-root .wrrapd-legacy-days-inline{display:inline-flex;align-items:center;gap:.25rem;flex-wrap:nowrap;white-space:nowrap;}
.wrrapd-legacy-cards-root .wrrapd-legacy-rem-days{padding:.18rem .28rem;font-size:.68rem;border-radius:4px;border:1px solid #64748b;font-weight:600;background:#fff;color:#0f172a;min-width:2.5rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-rem-days:disabled{opacity:.45;cursor:not-allowed;}
.wrrapd-legacy-cards-root .wrrapd-legacy-days-tail{font-size:.65rem;font-weight:600;color:#334155;white-space:nowrap;}
.wrrapd-legacy-cards-root .wrrapd-legacy-comment-row label{margin-bottom:.2rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-comment{width:100%;padding:.3rem .4rem;font-size:.78rem;border:1px solid #94a3b8;border-radius:.3rem;background:#fff;}
.wrrapd-legacy-cards-root .save-section{display:flex;flex-direction:column;gap:.4rem;margin-top:.35rem;}
.wrrapd-legacy-cards-root .save-btn,.wrrapd-legacy-cards-root .delivery-btn{padding:.42rem .85rem;width:100%;border:none;border-radius:.3rem;cursor:pointer;font-size:.8rem;}
.wrrapd-legacy-cards-root .save-btn{background:#c00;color:#fff;font-weight:600;}
.wrrapd-legacy-cards-root .delivery-btn{background:#f6b933;color:#000;}
.wrrapd-legacy-cards-root .wrrapd-legacy-modal{position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.72);display:none;align-items:center;justify-content:center;padding:1rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-modal.wrrapd-legacy-modal--open{display:flex;}
.wrrapd-legacy-cards-root .wrrapd-legacy-modal-card{width:min(96vw,460px);max-height:86vh;overflow:auto;background:#fff;border-radius:.6rem;border:1px solid #cbd5e1;padding:.9rem 1rem;box-shadow:0 14px 30px rgba(0,0,0,.25);}
.wrrapd-legacy-cards-root .wrrapd-legacy-modal-card h3{margin:0 0 .55rem;font-size:.95rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-modal-copy{white-space:pre-wrap;word-break:break-word;font-size:.8rem;line-height:1.45;color:#111827;margin:0 0 .7rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-modal-actions{display:flex;justify-content:flex-end;}
.wrrapd-legacy-cards-root .wrrapd-legacy-modal-close{border:1px solid #94a3b8;background:#f8fafc;color:#0f172a;border-radius:.35rem;padding:.35rem .65rem;cursor:pointer;font-size:.78rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-order-foot{margin-top:0;padding-top:0;border-top:none;min-width:0;}
.wrrapd-legacy-cards-root .wrrapd-legacy-order-foot .wrrapd-amz-summary{font-size:.86rem;padding:.42rem .52rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-order-foot .wrrapd-amz-inv-row{font-size:.82rem;padding:.1rem 0;}
.wrrapd-legacy-cards-root .wrrapd-legacy-order-foot .wrrapd-amz-inv-row--grand{font-size:.92rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-order-foot .wrrapd-amz-inv-sub{font-size:.74rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-order-foot .wrrapd-amz-inv-note{font-size:.68rem;font-style:italic;opacity:.9;}
.wrrapd-legacy-cards-root .wrrapd-amz-inv-lab .wrrapd-retailer-brand{display:inline-flex;align-items:center;gap:.28rem;vertical-align:middle;}
.wrrapd-legacy-cards-root .wrrapd-retailer-logo{flex:0 0 auto;display:block;border-radius:50%;object-fit:cover;}
.wrrapd-legacy-cards-root .wrrapd-retailer-name{font-weight:700;}
@media(max-width:980px){.wrrapd-legacy-cards-root .order-content{grid-template-columns:1fr;}}
@media(max-width:560px){.wrrapd-legacy-cards-root .wrrapd-legacy-rem-date-row{flex-wrap:wrap;}.wrrapd-legacy-cards-root .wrrapd-legacy-date-block,.wrrapd-legacy-cards-root .wrrapd-legacy-rem-block{flex:1 1 100%;min-width:0;}}
</style>';

	echo '<h2>' . esc_html__( 'Your Orders', 'wrrapd' ) . '</h2>';

	foreach ( $orders as $order ) {
		if ( ! is_array( $order ) ) {
			continue;
		}
		$on = isset( $order['orderNumber'] ) ? (string) $order['orderNumber'] : '—';
		$ts = isset( $order['timestamp'] ) ? (string) $order['timestamp'] : '';
		$st = '';
		if ( isset( $order['payment'] ) && is_array( $order['payment'] ) ) {
			$st = isset( $order['payment']['status'] ) ? (string) $order['payment']['status'] : '';
		}
		$date_show = wrrapd_studio_format_order_date( $ts );
		$lines     = isset( $order['lines'] ) && is_array( $order['lines'] ) ? $order['lines'] : array();
		if ( count( $lines ) === 0 ) {
			$lines = array(
				array(
					'productTitle'       => null,
					'designLabel'        => null,
					'flowers'            => false,
					'giftMessage'        => null,
					'giftMessageSnippet' => null,
					'productImageUrl'    => null,
					'designPreviewUrl'   => null,
				),
			);
		}

		echo '<div class="order-card">';
		echo '<div class="order-content">';
		echo '<div class="order-details">';
		echo '<div class="order-meta">';
		echo '<strong>' . esc_html__( 'Order #:', 'wrrapd' ) . ' ' . esc_html( $on ) . '</strong>';
		echo '<div>' . esc_html__( 'Order date:', 'wrrapd' ) . ' ' . esc_html( $date_show !== '' ? $date_show : '—' ) . '</div>';
		if ( $st !== '' ) {
			echo '<div>' . esc_html__( 'Payment:', 'wrrapd' ) . ' ' . esc_html( $st ) . '</div>';
		}
		echo '</div><div class="order-items">';

		foreach ( $lines as $ln ) {
			if ( ! is_array( $ln ) ) {
				continue;
			}
			$desc = isset( $ln['productTitle'] ) ? trim( (string) $ln['productTitle'] ) : '';
			if ( $desc === '' ) {
				$desc = __( 'Gift line', 'wrrapd' );
			}
			$dprev = isset( $ln['designPreviewUrl'] ) ? trim( (string) $ln['designPreviewUrl'] ) : '';
			$pimg  = isset( $ln['productImageUrl'] ) ? trim( (string) $ln['productImageUrl'] ) : '';
			$img_u = $pimg !== '' && preg_match( '#^https?://#i', $pimg ) ? $pimg : $def_img;
			$wrap_u = $dprev !== '' && preg_match( '#^https?://#i', $dprev ) ? $dprev : '';
			$wrap_lab = wrrapd_studio_design_kind_label( $ln );
			$fl       = ! empty( $ln['flowers'] );
			$flower_opt = isset( $ln['flowerOption'] ) ? trim( (string) $ln['flowerOption'] ) : '';
			if ( $flower_opt === '' ) {
				$dl_flow = isset( $ln['designLabel'] ) ? trim( (string) $ln['designLabel'] ) : '';
				if ( preg_match( '/^Flowers:\s*(.+)$/i', $dl_flow, $fm ) ) {
					$flower_opt = trim( (string) $fm[1] );
				}
			}
			$id_raw = isset( $ln['productId'] ) ? trim( (string) $ln['productId'] ) : '';
			if ( $id_raw === '' ) {
				$id_raw = isset( $ln['asin'] ) ? trim( (string) $ln['asin'] ) : '';
			}
			$line_id = $id_raw !== '' ? $id_raw : __( 'N/A', 'wrrapd' );
			$gm       = isset( $ln['giftMessage'] ) ? trim( (string) $ln['giftMessage'] ) : '';
			if ( $gm === '' && isset( $ln['giftMessageSnippet'] ) ) {
				$gm = trim( (string) $ln['giftMessageSnippet'] );
			}
			$design_choice = __( 'Design chosen by Wrrapd', 'wrrapd' );
			if ( stripos( $wrap_lab, 'AI' ) !== false ) {
				$design_choice = __( 'Design chosen by AI', 'wrrapd' );
			} elseif ( stripos( $wrap_lab, 'Upload' ) !== false ) {
				$design_choice = __( 'Design chosen by uploaded image', 'wrrapd' );
			} elseif ( stripos( $wrap_lab, 'Flower' ) !== false ) {
				$design_choice = __( 'Design chosen as flowers add-on', 'wrrapd' );
			}
			$retailer_html = wrrapd_order_retailer_label_html( $order );

			echo '<div class="order-item">';
			echo '<img src="' . esc_url( $img_u ) . '" alt="" loading="lazy" decoding="async" />';
			if ( $wrap_u !== '' ) {
				echo '<img class="wrrapd-legacy-wrap-preview" src="' . esc_url( $wrap_u ) . '" alt="" loading="lazy" decoding="async" />';
			} else {
				echo '<div class="wrrapd-legacy-wrap-preview is-empty" aria-hidden="true"></div>';
			}
			echo '<div class="item-details">';
			echo '<div class="wrrapd-legacy-retail-row">' . wp_kses_post( $retailer_html ) . '<span>' . esc_html__( 'order', 'wrrapd' ) . '</span></div>';
			echo '<div class="wrrapd-legacy-item-id">' . esc_html__( 'ASIN / SKU #:', 'wrrapd' ) . ' ' . esc_html( $line_id ) . '</div>';
			echo '<div class="wrrapd-legacy-item-title">' . esc_html( $desc ) . '</div>';
			echo '<div class="wrrapd-legacy-design-choice">' . esc_html( $design_choice ) . '</div>';
			$flowers_line = esc_html__( 'Flowers:', 'wrrapd' ) . ' ' . ( $fl ? esc_html__( 'Yes', 'wrrapd' ) : esc_html__( 'No', 'wrrapd' ) );
			if ( $fl && $flower_opt !== '' ) {
				$flowers_line .= ', ' . esc_html__( 'Option', 'wrrapd' ) . ' ' . esc_html( $flower_opt );
			}
			echo '<div class="wrrapd-legacy-flowers-line">' . $flowers_line . '</div>';
			echo '<div class="wrrapd-legacy-msg-line">' . esc_html__( 'Gift message:', 'wrrapd' ) . ' &quot;' . esc_html( $gm !== '' ? $gm : __( 'None', 'wrrapd' ) ) . '&quot;</div>';
			echo '</div></div>';
		}
		echo '</div></div>';

		echo '<div class="legacy-forms">';
		$li = 0;
		foreach ( $lines as $ln ) {
			if ( ! is_array( $ln ) ) {
				continue;
			}
			$ov = wrrapd_overlay_row( $overlays, $on, $li );

			$api_giftee = isset( $ln['gifteeName'] ) ? trim( (string) $ln['gifteeName'] ) : '';
			$giftee_val = $ov['giftee'] !== '' ? $ov['giftee'] : $api_giftee;

			$api_occ = isset( $ln['occasion'] ) ? trim( (string) $ln['occasion'] ) : '';
			$pick    = isset( $ov['occasion_pick'] ) ? trim( (string) $ov['occasion_pick'] ) : '';
			$occ_sel = $pick !== '' ? $pick : $api_occ;

			$rel_val = isset( $ov['relationship'] ) ? (string) $ov['relationship'] : '';
			$comment = isset( $ov['comment'] ) ? (string) $ov['comment'] : '';
			$gdate   = isset( $ov['gift_date'] ) ? (string) $ov['gift_date'] : '';
			$rem     = ! empty( $ov['reminder_next_year'] );
			$rem_prior = isset( $ov['reminder_days_prior'] ) ? (int) $ov['reminder_days_prior'] : 1;
			if ( $rem_prior < 1 || $rem_prior > 7 ) {
				$rem_prior = 1;
			}

			$rel_opts = $rels;
			if ( $rel_val !== '' && ! in_array( $rel_val, $rel_opts, true ) ) {
				$rel_opts = array_merge( array( $rel_val ), $rel_opts );
			}
			$occ_opts = $labels;
			if ( $occ_sel !== '' && ! in_array( $occ_sel, $occ_opts, true ) ) {
				$occ_opts = array_merge( array( $occ_sel ), $occ_opts );
			}

			$id_sfx = substr( md5( $on . ':' . (string) $li ), 0, 10 );

			echo '<div class="wrrapd-legacy-line" data-order="' . esc_attr( $on ) . '" data-line="' . (int) $li . '">';
			echo '<div class="info-box">';
			echo '<input type="hidden" class="wrrapd-legacy-giftee" id="' . esc_attr( $wrap_id . '-g-' . $id_sfx ) . '" value="' . esc_attr( $giftee_val ) . '" />';
			echo '<div class="wrrapd-legacy-giftee-readonly" aria-label="' . esc_attr__( 'Giftee', 'wrrapd' ) . '">' . esc_html( $giftee_val !== '' ? $giftee_val : '—' ) . '</div>';
			echo '</div>';

			echo '<div class="info-box wrrapd-legacy-orange-select">';
			echo '<select class="wrrapd-legacy-rel" id="' . esc_attr( $wrap_id . '-r-' . $id_sfx ) . '">';
			echo '<option value="">' . esc_html__( 'Relationship', 'wrrapd' ) . '</option>';
			foreach ( $rel_opts as $r ) {
				echo '<option value="' . esc_attr( $r ) . '"' . selected( $rel_val, $r, false ) . '>' . esc_html( $r ) . '</option>';
			}
			echo '</select></div>';

			echo '<div class="info-box wrrapd-legacy-orange-select">';
			echo '<select class="wrrapd-legacy-occ" id="' . esc_attr( $wrap_id . '-o-' . $id_sfx ) . '">';
			echo '<option value="">' . esc_html__( 'Occasion', 'wrrapd' ) . '</option>';
			foreach ( $occ_opts as $lab ) {
				$lab_s = trim( (string) $lab );
				if ( $lab_s === '' ) {
					continue;
				}
				echo '<option value="' . esc_attr( $lab_s ) . '"' . selected( $occ_sel, $lab_s, false ) . '>' . esc_html( $lab_s ) . '</option>';
			}
			echo '</select></div>';

			echo '<div class="info-box wrrapd-legacy-rem-date-box">';
			echo '<div class="wrrapd-legacy-rem-date-row">';
			echo '<div class="wrrapd-legacy-date-block">';
			echo '<input type="date" class="wrrapd-legacy-date" id="' . esc_attr( $wrap_id . '-d-' . $id_sfx ) . '" value="' . esc_attr( $gdate ) . '" aria-label="' . esc_attr__( 'Date', 'wrrapd' ) . '" /></div>';
			echo '<div class="wrrapd-legacy-rem-block">';
			echo '<label for="' . esc_attr( $wrap_id . '-m-' . $id_sfx ) . '"><input type="checkbox" class="wrrapd-legacy-rem" id="' . esc_attr( $wrap_id . '-m-' . $id_sfx ) . '"' . ( $rem ? ' checked' : '' ) . ' /> ';
			echo '<span>' . esc_html__( 'Set reminder', 'wrrapd' ) . '</span></label>';
			echo '<span class="wrrapd-legacy-days-inline">';
			echo '<select class="wrrapd-legacy-rem-days" id="' . esc_attr( $wrap_id . '-md-' . $id_sfx ) . '" aria-label="' . esc_attr__( 'Days before the date', 'wrrapd' ) . '"' . ( $rem ? '' : ' disabled' ) . '>';
			for ( $rd = 1; $rd <= 7; $rd++ ) {
				echo '<option value="' . (int) $rd . '"' . selected( $rem_prior, $rd, false ) . '>' . (int) $rd . '</option>';
			}
			echo '</select>';
			echo '<span class="wrrapd-legacy-days-tail">' . esc_html__( 'days prior', 'wrrapd' ) . '</span>';
			echo '</span></div></div></div>';

			echo '<div class="info-box wrrapd-legacy-comment-row">';
			echo '<input type="text" class="wrrapd-legacy-comment" id="' . esc_attr( $wrap_id . '-c-' . $id_sfx ) . '" value="' . esc_attr( $comment ) . '" maxlength="4000" placeholder="' . esc_attr__( 'Additional note', 'wrrapd' ) . '" aria-label="' . esc_attr__( 'Additional note', 'wrrapd' ) . '" /></div>';

			$delivery_bits = array();
			$delivery_map  = array(
				'deliveryHint'   => __( 'Delivery', 'wrrapd' ),
				'deliveryDate'   => __( 'Delivery date', 'wrrapd' ),
				'deliveryEta'    => __( 'Estimated arrival', 'wrrapd' ),
				'carrier'        => __( 'Carrier', 'wrrapd' ),
				'trackingNumber' => __( 'Tracking #', 'wrrapd' ),
			);
			foreach ( $delivery_map as $k => $lbl ) {
				$v = isset( $ln[ $k ] ) ? trim( (string) $ln[ $k ] ) : '';
				if ( $v !== '' ) {
					$delivery_bits[] = $lbl . ': ' . $v;
				}
			}
			if ( isset( $ln['delivery'] ) && is_array( $ln['delivery'] ) ) {
				foreach ( array( 'carrier', 'trackingNumber', 'eta', 'status', 'address' ) as $k ) {
					$v = isset( $ln['delivery'][ $k ] ) ? trim( (string) $ln['delivery'][ $k ] ) : '';
					if ( $v !== '' ) {
						$delivery_bits[] = ucfirst( (string) $k ) . ': ' . $v;
					}
				}
			}
			$delivery_text = count( $delivery_bits ) > 0 ? implode( "\n", array_unique( $delivery_bits ) ) : (string) __( 'No delivery details are available for this line item yet.', 'wrrapd' );

			echo '<div class="save-section">';
			echo '<button type="button" class="save-btn wrrapd-legacy-save">' . esc_html__( 'Save / Update', 'wrrapd' ) . '</button>';
			echo '<button type="button" class="delivery-btn wrrapd-legacy-delivery" data-delivery="' . esc_attr( $delivery_text ) . '">' . esc_html__( 'Delivery details', 'wrrapd' ) . '</button>';
			echo '</div></div>';

			++$li;
		}
		echo '</div>';
		echo '<div class="wrrapd-legacy-order-foot">';
		echo wrrapd_studio_order_summary_html( $order, $lines );
		echo '</div>';
		echo '</div></div>';
	}
	echo '<div class="wrrapd-legacy-modal" id="' . esc_attr( $wrap_id ) . '-delivery-modal" aria-hidden="true"><div class="wrrapd-legacy-modal-card" role="dialog" aria-modal="true" aria-label="' . esc_attr__( 'Delivery details', 'wrrapd' ) . '"><h3>' . esc_html__( 'Delivery details', 'wrrapd' ) . '</h3><div class="wrrapd-legacy-modal-copy"></div><div class="wrrapd-legacy-modal-actions"><button type="button" class="wrrapd-legacy-modal-close">' . esc_html__( 'Close', 'wrrapd' ) . '</button></div></div></div>';

	$wrap_json = wp_json_encode( $wrap_id );
	echo '<script>(function(){var root=document.getElementById(' . $wrap_json . ');if(!root)return;var ajax=root.getAttribute("data-ajax-url");var nonce=root.getAttribute("data-nonce");root.querySelectorAll(".wrrapd-legacy-rem").forEach(function(cb){var line=cb.closest(".wrrapd-legacy-line");if(!line)return;var sd=line.querySelector(".wrrapd-legacy-rem-days");function sync(){if(sd)sd.disabled=!cb.checked;}sync();cb.addEventListener("change",sync);});root.querySelectorAll(".wrrapd-legacy-save").forEach(function(btn){btn.addEventListener("click",function(){var line=btn.closest(".wrrapd-legacy-line");if(!line)return;var fd=new FormData();fd.append("action","wrrapd_save_order_line_overlay");fd.append("nonce",nonce);fd.append("orderNumber",line.getAttribute("data-order")||"");fd.append("lineIndex",line.getAttribute("data-line")||"0");var g=line.querySelector(".wrrapd-legacy-giftee");fd.append("giftee",g?g.value:"");var rel=line.querySelector(".wrrapd-legacy-rel");fd.append("relationship",rel?rel.value:"");var occ=line.querySelector(".wrrapd-legacy-occ");fd.append("occasion_pick",occ?occ.value:"");var dt=line.querySelector(".wrrapd-legacy-date");fd.append("gift_date",dt?dt.value:"");var rcb=line.querySelector(".wrrapd-legacy-rem");var ron=rcb&&rcb.checked;fd.append("reminder_next_year",ron?"1":"");var rdp=line.querySelector(".wrrapd-legacy-rem-days");fd.append("reminder_days_prior",ron&&rdp&&!rdp.disabled?(rdp.value||"1"):"");var cm=line.querySelector(".wrrapd-legacy-comment");fd.append("comment",cm?cm.value:"");btn.disabled=true;fetch(ajax,{method:"POST",body:fd,credentials:"same-origin"}).then(function(r){return r.json();}).then(function(j){btn.disabled=false;if(j&&j.success){btn.style.boxShadow="0 0 0 2px rgba(34,197,94,.6)";window.setTimeout(function(){btn.style.boxShadow="";},650);}else{btn.style.opacity="0.65";window.setTimeout(function(){btn.style.opacity="";},800);}}).catch(function(){btn.disabled=false;});});});})();</script>';
	echo '<script>(function(){var root=document.getElementById(' . $wrap_json . ');if(!root)return;var modal=document.getElementById(root.id+"-delivery-modal");if(!modal)return;var body=modal.querySelector(".wrrapd-legacy-modal-copy");function closeModal(){modal.classList.remove("wrrapd-legacy-modal--open");modal.setAttribute("aria-hidden","true");}root.querySelectorAll(".wrrapd-legacy-delivery").forEach(function(btn){btn.addEventListener("click",function(){if(body)body.textContent=btn.getAttribute("data-delivery")||"";modal.classList.add("wrrapd-legacy-modal--open");modal.setAttribute("aria-hidden","false");});});modal.addEventListener("click",function(e){if(e.target===modal||e.target.closest(".wrrapd-legacy-modal-close"))closeModal();});document.addEventListener("keydown",function(e){if(e.key==="Escape"&&modal.classList.contains("wrrapd-legacy-modal--open"))closeModal();});})();</script>';

	echo '</div>';
	return (string) ob_get_clean();
}

/** @var string */
const WRRAPD_LINE_OVERLAYS_META = 'wrrapd_order_line_overlays';

/**
 * @return array<string, array<string|int, array<string, string>>>
 */
function wrrapd_get_line_overlays( $user_id ) {
	$raw = get_user_meta( (int) $user_id, WRRAPD_LINE_OVERLAYS_META, true );
	return is_array( $raw ) ? $raw : array();
}

/**
 * @param array<string, array<string|int, array<string, string>>> $overlays
 * @return array<string, string>
 */
function wrrapd_overlay_row( array $overlays, $order_number, $line_index ) {
	$base = array(
		'relationship'          => '',
		'occasion_pick'         => '',
		'giftee'                => '',
		'gift_message'          => '',
		'comment'               => '',
		'gift_date'             => '',
		'reminder_next_year'    => '',
		'reminder_days_prior'   => '',
		'customer_notes'        => '',
	);
	if ( ! isset( $overlays[ $order_number ] ) || ! is_array( $overlays[ $order_number ] ) ) {
		return $base;
	}
	$blk = $overlays[ $order_number ];
	$key = (string) (int) $line_index;
	$out = $base;
	if ( isset( $blk[ $key ] ) && is_array( $blk[ $key ] ) ) {
		$out = array_merge( $base, $blk[ $key ] );
	} elseif ( isset( $blk[ $line_index ] ) && is_array( $blk[ $line_index ] ) ) {
		$out = array_merge( $base, $blk[ $line_index ] );
	}
	if ( $out['comment'] === '' && $out['customer_notes'] !== '' ) {
		$out['comment'] = $out['customer_notes'];
	}
	return $out;
}

/**
 * @return list<string>
 */
function wrrapd_relationship_choices() {
	return array(
		'Husband',
		'Wife',
		'Father',
		'Mother',
		'Son',
		'Daughter',
		'Sister',
		'Brother',
		'Friend',
		'Colleague',
		'Uncle',
		'Aunt',
		'Cousin',
		'Teacher',
		'Mentor',
		'Elder',
		'Fiance',
		'Fiancee',
		"Father-in-Law",
		"Mother-in-Law",
		'Brother/Sister-in-Law',
		'Godfather',
		'Godmother',
		'Godson',
		'Goddaughter',
		'Great-Grandfather',
		'Great-Grandmother',
		'Great-grandson',
		'Great-granddaugther',
		'Other',
	);
}

/**
 * @return list<string>
 */
function wrrapd_occasion_canonical() {
	return array(
		'Birthday',
		'Christmas',
		'Anniversary',
		"Father's Day",
		"Mother's Day",
		"Valentine's Day",
		'Graduation',
		'Thank you',
		'Thanksgiving',
		'Easter',
		'Hanukkah',
		'Wedding',
		'Retirement',
		'July Fourth',
		'Corporate Gift',
		"St. Patrick's Day",
		'Diwali',
		'Ramadan / Eid',
		'Chinese New Year',
		'Housewarming',
		'New baby',
		'Sympathy',
		'Get well',
		'Congratulations',
		'Just because',
		'Other',
	);
}

/**
 * Occasion dropdown = canonical presets only.
 * Dynamic collection from order data is intentionally disabled: AI prompts and other
 * freetext stored in the `occasion` field must never surface as dropdown choices.
 *
 * @param array<int, array<string, mixed>> $orders   Unused — kept for signature compatibility.
 * @param array<string, array<string|int, array<string, string>>> $overlays  Unused — kept for signature compatibility.
 * @return list<string>
 */
function wrrapd_merge_occasion_dropdown_choices( array $orders, array $overlays ) {
	$labels = wrrapd_occasion_canonical();
	sort( $labels, SORT_NATURAL | SORT_FLAG_CASE );
	return $labels;
}

/**
 * @param string $ts ISO-like timestamp from pay server
 */
function wrrapd_studio_format_order_date( $ts ) {
	$ts = is_string( $ts ) ? trim( $ts ) : '';
	if ( $ts === '' ) {
		return '';
	}
	$t = strtotime( $ts );
	if ( ! $t ) {
		return $ts;
	}
	return date_i18n( get_option( 'date_format' ), $t );
}

/**
 * Short design-source label for the studio left rail (Wrrapd / upload / AI / flowers add-on).
 *
 * @param array<string, mixed> $ln Order line from API.
 */
function wrrapd_studio_design_kind_label( array $ln ) {
	$dl = isset( $ln['designLabel'] ) ? trim( (string) $ln['designLabel'] ) : '';
	if ( $dl !== '' ) {
		if ( preg_match( '/^AI:/i', $dl ) || stripos( $dl, 'AI-generated' ) !== false ) {
			return __( 'AI design', 'wrrapd' );
		}
		if ( preg_match( '/^Upload:/i', $dl ) ) {
			return __( 'Uploaded design', 'wrrapd' );
		}
		if ( preg_match( '/^Wrrapd:/i', $dl ) ) {
			return __( 'Wrrapd design', 'wrrapd' );
		}
		if ( preg_match( '/^Flowers:/i', $dl ) || stripos( $dl, 'Flowers add-on' ) !== false ) {
			return __( 'Flowers add-on', 'wrrapd' );
		}
	}
	$prev = isset( $ln['designPreviewUrl'] ) ? trim( (string) $ln['designPreviewUrl'] ) : '';
	if ( $prev !== '' ) {
		return __( 'AI design', 'wrrapd' );
	}
	return __( 'Wrrapd design', 'wrrapd' );
}

/**
 * @param float|int $n Dollar amount.
 */
function wrrapd_money_usd( $n ) {
	return '$' . number_format( (float) $n, 2, '.', ',' );
}

/**
 * Pretty-print checkout invoice line labels (API sometimes concatenates without a space).
 *
 * Pay checkout historically prefixed rows with "AmazonFlowers" / "AmazonAI" / "AmazonWrrapd"
 * (internal channel names). Those are Wrrapd add-ons, not Amazon-sold products — strip for display.
 *
 * @param string $lab Raw label from checkout snapshot.
 */
function wrrapd_normalize_checkout_invoice_label( $lab ) {
	$lab = trim( (string) $lab );
	if ( $lab === '' ) {
		return '';
	}
	// Glued / internal pay-UI garbage (never show raw on the payment summary).
	if ( preg_match( '/gift\s*wrap\s*wrrapd|wrapwrrapd|wrrapd\s*:\s*wrrapd/i', $lab ) ) {
		return __( 'Gift wrap', 'wrrapd' );
	}
	if ( preg_match( '/^lego\s*flowers/i', $lab ) ) {
		return __( 'Flowers add-on', 'wrrapd' );
	}
	if ( preg_match( '/^lego\s*ai/i', $lab ) ) {
		return __( 'AI design add-on', 'wrrapd' );
	}
	if ( preg_match( '/^lego\s*wrrapd/i', $lab ) ) {
		return __( 'Gift wrap', 'wrrapd' );
	}
	if ( preg_match( '/^gift\s*wrap/i', $lab ) && strpos( $lab, ':' ) !== false ) {
		return __( 'Gift wrap', 'wrrapd' );
	}
	// Internal invoice row tags from pay UI (all retailers, including LEGO.com).
	// Handles both run-together forms (AmazonFlowers) and spaced forms (Amazon Flowers).
	if ( preg_match( '/^Amazon\s*Flowers\s*:\s*(.*)$/i', $lab, $m ) ) {
		return __( 'Flowers add-on', 'wrrapd' );
	}
	if ( preg_match( '/^Amazon\s*Flowers$/i', $lab ) ) {
		return __( 'Flowers add-on', 'wrrapd' );
	}
	if ( preg_match( '/^Amazon\s*AI\s*:\s*(.*)$/i', $lab, $m ) ) {
		return __( 'AI design add-on', 'wrrapd' );
	}
	if ( preg_match( '/^Amazon\s*Wrrapd\s*:\s*(.*)$/i', $lab, $m ) ) {
		return __( 'Gift wrap', 'wrrapd' );
	}
	// Catch any remaining "Amazon <something>: <rest>" prefix from pay UI channel names.
	if ( preg_match( '/^Amazon\s+(\w+)\s*:\s*(.*)$/i', $lab, $m ) ) {
		$addon = trim( (string) $m[1] );
		$rest  = trim( (string) $m[2] );
		if ( strcasecmp( $addon, 'ai' ) === 0 ) {
			return __( 'AI design add-on', 'wrrapd' );
		}
		if ( strcasecmp( $addon, 'flowers' ) === 0 ) {
			return __( 'Flowers add-on', 'wrrapd' );
		}
		if ( strcasecmp( $addon, 'wrrapd' ) === 0 ) {
			return __( 'Gift wrap', 'wrrapd' );
		}
		if ( strcasecmp( $addon, 'upload' ) === 0 ) {
			return $rest !== '' ? __( 'Uploaded design', 'wrrapd' ) . ': ' . $rest : __( 'Uploaded design', 'wrrapd' );
		}
		return $rest !== '' ? $addon . ': ' . $rest : $addon;
	}
	return $lab;
}

/**
 * Detect malformed legacy checkout labels like "Gift wrapWrrapd: wrrapd".
 *
 * @param string $lab Raw label text.
 */
function wrrapd_is_bad_checkout_invoice_label( $lab ) {
	$lab = trim( (string) $lab );
	if ( $lab === '' ) {
		return false;
	}
	if ( preg_match( '/gift\s*wrap\s*wrrapd|wrapwrrapd|wrrapd\s*:\s*wrrapd/i', $lab ) === 1 ) {
		return true;
	}
	return preg_match( '/^gift\s*wrap\s*wrrapd\s*:/i', $lab ) === 1;
}

/**
 * Plain retailer name from order JSON (e.g. Ulta, LEGO, Target, Amazon). Empty if unset.
 *
 * @param array<string, mixed> $order Order payload from API / VM JSON.
 */
function wrrapd_order_retailer_plain( array $order ) {
	foreach ( array( 'Retailer', 'retailer', 'merchant', 'store' ) as $k ) {
		if ( isset( $order[ $k ] ) && is_string( $order[ $k ] ) ) {
			$t = trim( $order[ $k ] );
			if ( $t !== '' ) {
				return $t;
			}
		}
	}
	// Infer retailer from order number prefix when the field is missing.
	$num = '';
	foreach ( array( 'orderNumber', 'order_number', 'orderId', 'order_id' ) as $k ) {
		if ( isset( $order[ $k ] ) && is_string( $order[ $k ] ) ) {
			$num = trim( $order[ $k ] );
			break;
		}
	}
	if ( $num !== '' ) {
		if ( preg_match( '/^LG/i', $num ) ) {
			return 'Lego';
		}
		if ( preg_match( '/^UL/i', $num ) ) {
			return 'Ulta';
		}
		if ( preg_match( '/^TG/i', $num ) ) {
			return 'Target';
		}
		if ( preg_match( '/^\d{3}-\d{5}-\d{7}$/', $num ) ) {
			return 'Amazon';
		}
	}
	return '';
}

/**
 * HTML for the retailer line (logo + name for Ulta, LEGO, Target, Amazon when recognized; else plain text).
 *
 * @param array<string, mixed> $order Order payload.
 */
function wrrapd_order_retailer_label_html( array $order ) {
	$plain = wrrapd_order_retailer_plain( $order );
	$row   = wrrapd_retailer_row_from_plain( $plain );
	if ( $row !== null ) {
		$src = esc_url( wrrapd_mu_logo_url_for_slug( $row['slug'], $row['domain'] ) );
		return '<span class="wrrapd-retailer-brand">'
			. '<img class="wrrapd-retailer-logo" src="' . $src . '" width="14" height="14" decoding="async" alt="' . esc_attr( $row['label'] ) . '" />'
			. '<span class="wrrapd-retailer-name">' . esc_html( $row['label'] ) . '</span></span>';
	}
	return '<span class="wrrapd-retailer-brand wrrapd-retailer-brand--text-only"><span class="wrrapd-retailer-name">'
		. esc_html( $plain ) . '</span></span>';
}

/**
 * Human label for checkout aggregate line codes (matches pay server CHECKOUT_INVOICE_AGGREGATE_CODES).
 *
 * @param string $code Raw code from checkout snapshot.
 */
function wrrapd_checkout_aggregate_code_label( $code ) {
	$code = trim( (string) $code );
	$map  = array(
		'WRPD_GIFT_WRAP_BASE'       => __( 'Gift wrap', 'wrrapd' ),
		'WRPD_CUSTOM_DESIGN_AI'     => __( 'AI design add-on', 'wrrapd' ),
		'WRPD_CUSTOM_DESIGN_UPLOAD' => __( 'Upload design add-on', 'wrrapd' ),
		'WRPD_FLOWERS'              => __( 'Flowers add-on', 'wrrapd' ),
		'WRPD_SUBTOTAL_BEFORE_TAX'  => __( 'Subtotal (before tax)', 'wrrapd' ),
		'WRPD_ESTIMATED_TAX'        => __( 'Estimated tax', 'wrrapd' ),
		'WRPD_ORDER_TOTAL'          => __( 'Total (checkout)', 'wrrapd' ),
	);
	return isset( $map[ $code ] ) ? $map[ $code ] : $code;
}

/**
 * Receipt block at bottom of studio order (checkout snapshot when available).
 *
 * @param array<string, mixed>              $order Order payload from API.
 * @param array<int, array<string, mixed>> $lines Normalized gift lines (unused for payment summary; kept for signature stability).
 */
function wrrapd_studio_order_summary_html( array $order, array $lines ) {
	$pay   = isset( $order['payment'] ) && is_array( $order['payment'] ) ? $order['payment'] : null;
	$cents = isset( $pay['amount'] ) ? (int) $pay['amount'] : 0;
	$total_str = '';
	if ( $cents > 0 ) {
		$total_str = wrrapd_money_usd( $cents / 100.0 );
	}

	$ci = isset( $order['checkoutInvoice'] ) && is_array( $order['checkoutInvoice'] ) ? $order['checkoutInvoice'] : null;
	if ( ! $ci && isset( $order['checkoutInvoiceComplete'] ) && is_array( $order['checkoutInvoiceComplete'] ) ) {
		$ci = array( 'complete' => $order['checkoutInvoiceComplete'] );
	}
	$complete     = ( $ci && isset( $ci['complete'] ) && is_array( $ci['complete'] ) ) ? $ci['complete'] : null;
	$agg_in       = ( $complete && isset( $complete['aggregateLines'] ) && is_array( $complete['aggregateLines'] ) ) ? $complete['aggregateLines'] : array();
	$ci_lines     = ( $ci && isset( $ci['lines'] ) && is_array( $ci['lines'] ) ) ? $ci['lines'] : array();
	$ci_subtotal  = ( $ci && isset( $ci['subtotal'] ) && is_numeric( $ci['subtotal'] ) ) ? (float) $ci['subtotal'] : null;
	$ci_tax       = ( $ci && isset( $ci['estimatedTax'] ) && is_numeric( $ci['estimatedTax'] ) ) ? (float) $ci['estimatedTax'] : null;
	$ci_total     = ( $ci && isset( $ci['total'] ) && is_numeric( $ci['total'] ) ) ? (float) $ci['total'] : null;
	$use_agg      = count( $agg_in ) > 0;
	$use_ci_lines = ! $use_agg && count( $ci_lines ) > 0;
	$use_ci_nums  = ! $use_agg && ! $use_ci_lines && ( $ci_subtotal !== null || $ci_tax !== null || $ci_total !== null );

	ob_start();
	echo '<div class="wrrapd-amz-summary" role="region" aria-label="' . esc_attr__( 'Payment summary', 'wrrapd' ) . '">';
	echo '<div class="wrrapd-amz-inv-list">';

	if ( $use_agg ) {
		$order_codes = array(
			'WRPD_GIFT_WRAP_BASE',
			'WRPD_CUSTOM_DESIGN_AI',
			'WRPD_CUSTOM_DESIGN_UPLOAD',
			'WRPD_FLOWERS',
			'WRPD_SUBTOTAL_BEFORE_TAX',
			'WRPD_ESTIMATED_TAX',
		);
		$by_code = array();
		foreach ( $agg_in as $row ) {
			if ( ! is_array( $row ) || ! isset( $row['code'] ) ) {
				continue;
			}
			$c = trim( (string) $row['code'] );
			if ( $c !== '' ) {
				$by_code[ $c ] = $row;
			}
		}
		foreach ( $order_codes as $code ) {
			if ( ! isset( $by_code[ $code ] ) ) {
				continue;
			}
			$row   = $by_code[ $code ];
			$amt_f = isset( $row['amount'] ) && is_numeric( $row['amount'] ) ? (float) $row['amount'] : null;
			if ( $amt_f === null ) {
				continue;
			}
			$lab = wrrapd_checkout_aggregate_code_label( $code );
			echo '<div class="wrrapd-amz-inv-row">';
			echo '<span class="wrrapd-amz-inv-lab">' . esc_html( $lab ) . '</span>';
			echo '<span class="wrrapd-amz-inv-amt">' . esc_html( wrrapd_money_usd( $amt_f ) ) . '</span>';
			echo '</div>';
		}
	} elseif ( $use_ci_lines ) {
		foreach ( $ci_lines as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$lab_raw = isset( $row['label'] ) ? trim( (string) $row['label'] ) : '';
			if ( $lab_raw === '' ) {
				continue;
			}
			$amt_f = isset( $row['amount'] ) && is_numeric( $row['amount'] ) ? (float) $row['amount'] : null;
			$lab   = wrrapd_normalize_checkout_invoice_label( $lab_raw );
			if ( wrrapd_is_bad_checkout_invoice_label( $lab_raw ) ) {
				$lab = __( 'Gift wrap', 'wrrapd' );
			}
			if ( $lab === '' ) {
				continue;
			}
			echo '<div class="wrrapd-amz-inv-row">';
			echo '<span class="wrrapd-amz-inv-lab">' . esc_html( $lab ) . '</span>';
			echo '<span class="wrrapd-amz-inv-amt">' . ( $amt_f !== null ? esc_html( wrrapd_money_usd( $amt_f ) ) : '' ) . '</span>';
			echo '</div>';
		}
	} elseif ( $use_ci_nums ) {
		if ( $ci_subtotal !== null ) {
			echo '<div class="wrrapd-amz-inv-row"><span class="wrrapd-amz-inv-lab">' . esc_html__( 'Subtotal (before tax)', 'wrrapd' ) . '</span>';
			echo '<span class="wrrapd-amz-inv-amt">' . esc_html( wrrapd_money_usd( $ci_subtotal ) ) . '</span></div>';
		}
		if ( $ci_tax !== null ) {
			echo '<div class="wrrapd-amz-inv-row"><span class="wrrapd-amz-inv-lab">' . esc_html__( 'Estimated tax', 'wrrapd' ) . '</span>';
			echo '<span class="wrrapd-amz-inv-amt">' . esc_html( wrrapd_money_usd( $ci_tax ) ) . '</span></div>';
		}
		if ( $ci_total !== null ) {
			echo '<div class="wrrapd-amz-inv-row"><span class="wrrapd-amz-inv-lab">' . esc_html__( 'Total (checkout)', 'wrrapd' ) . '</span>';
			echo '<span class="wrrapd-amz-inv-amt">' . esc_html( wrrapd_money_usd( $ci_total ) ) . '</span></div>';
		}
	}

	echo '</div>';

	if ( $total_str !== '' ) {
		echo '<div class="wrrapd-amz-inv-row wrrapd-amz-inv-row--grand">';
		echo '<span class="wrrapd-amz-inv-lab">' . esc_html__( 'Order total', 'wrrapd' ) . '</span>';
		echo '<span class="wrrapd-amz-inv-amt">' . esc_html( $total_str ) . '</span>';
		echo '</div>';
	}
	echo '<div class="wrrapd-amz-inv-note">' . esc_html__( 'Sales tax included in total where applicable.', 'wrrapd' ) . '</div>';
	echo '</div>';
	return (string) ob_get_clean();
}

/**
 * Studio — multi-retailer order blocks (Ulta, LEGO, Target, Amazon), Wrrapd red/gold, editable overlays (one save per gift).
 *
 * @param array<int, array<string, mixed>> $orders
 * @param array<string, array<string|int, array<string, string>>> $overlays
 */
function wrrapd_render_orders_studio( array $orders, array $overlays ) {
	$wrap_id = function_exists( 'wp_unique_id' ) ? wp_unique_id( 'wrrapd-amz-' ) : 'wrrapd-amz-' . uniqid( '', false );
	$search_id = $wrap_id . '-q';
	$labels    = wrrapd_merge_occasion_dropdown_choices( $orders, $overlays );
	$rels      = wrrapd_relationship_choices();
	$nonce     = wp_create_nonce( 'wrrapd_line_extras' );
	$ajax      = admin_url( 'admin-ajax.php' );

	ob_start();
	echo '<div id="' . esc_attr( $wrap_id ) . '" class="wrrapd-amz-root" data-wrrapd-bridge-rev="2026-04-28" data-ajax-url="' . esc_url( $ajax ) . '" data-nonce="' . esc_attr( $nonce ) . '">';
	echo '<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&amp;family=Fraunces:opsz,wght@9..144,500;9..144,700&amp;display=swap" />';

	echo '<style>
.wrrapd-amz-root{--wr-navy:#162a52;--wr-navy-mid:#1e3a5f;--wr-navy-soft:#2d4a7c;--wr-amber:#ea580c;--wr-amber-deep:#c2410c;--wr-gold:#f5c518;--wr-gold-deep:#d4a106;--bx:var(--wr-navy);--bx-soft:var(--wr-navy-soft);--bx-line:#cbd5e1;--ink:#0f172a;--muted:#475569;--wr-field:var(--wr-amber-deep);--wr-field-hi:var(--wr-amber);--wr-field-ink:#fff7ed;--wr-bar:var(--wr-gold);--wr-bar-ink:#162a52;--wr-font:"DM Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--wr-display:"Fraunces",Georgia,serif;width:100%;max-width:min(100%,960px);margin:-1.35rem auto .55rem;padding:0 .45rem;font-family:var(--wr-font);font-size:.68rem;line-height:1.22;color:var(--ink);-webkit-font-smoothing:antialiased;box-sizing:border-box;}
.wrrapd-amz-root *,.wrrapd-amz-root *::before,.wrrapd-amz-root *::after{box-sizing:border-box;}
.wrrapd-amz-search-wrap{position:relative;transform:translateY(-2.85rem);margin-bottom:-1.65rem;z-index:4;}
.wrrapd-amz-search{margin:0 auto;padding:0 .25rem;text-align:center;}
.wrrapd-amz-search input{width:100%;max-width:min(100%,28rem);margin-left:auto;margin-right:auto;display:block;padding:.22rem .5rem;border-radius:8px;border:2px solid var(--bx);font-size:.68rem;background:#fff;font-family:var(--wr-font);color:var(--ink);box-shadow:0 1px 2px rgba(15,23,42,.06);}
.wrrapd-amz-search input:focus{outline:2px solid var(--wr-gold-deep);outline-offset:1px;border-color:var(--wr-navy-mid);}
.wrrapd-amz-order{display:flex;flex-direction:column;min-height:0;background:#fff;border:3px solid var(--wr-gold-deep);border-radius:10px;margin-bottom:.42rem;box-shadow:0 2px 0 rgba(212,161,6,.25),0 6px 16px rgba(15,23,42,.08);overflow:hidden;}
.wrrapd-amz-order-top{display:flex;flex-direction:row;align-items:stretch;gap:.5rem;flex:1 1 auto;width:100%;padding:.32rem .48rem .38rem;background:#fafafa;flex-wrap:nowrap;}
.wrrapd-amz-strip-col{flex:0 1 42%;min-width:8.5rem;max-width:52%;display:flex;flex-direction:column;gap:.14rem;align-self:flex-start;}
.wrrapd-amz-wraps-row,.wrrapd-amz-flowers-row,.wrrapd-amz-kind-row{display:flex;flex-direction:row;flex-wrap:wrap;justify-content:center;align-items:flex-start;gap:.32rem;margin-bottom:.12rem;}
.wrrapd-amz-strip-cell{width:56px;flex:0 0 auto;display:flex;flex-direction:column;align-items:center;}
.wrrapd-amz-kind-row{margin-bottom:.02rem;}
.wrrapd-amz-flowers-cell{min-height:2.1rem;justify-content:flex-start;padding-top:.04rem;}
.wrrapd-amz-flowers-cell .wrrapd-amz-flowers-art{width:44px;height:50px;border-radius:7px;border:2px solid var(--bx);margin:0 auto;background:radial-gradient(circle at 32% 32%,#e11d48 16%,transparent 18%),radial-gradient(circle at 66% 36%,#ea580c 14%,transparent 17%),radial-gradient(circle at 50% 58%,#c2410c 18%,transparent 21%),radial-gradient(circle at 50% 86%,#166534 10%,transparent 12%),linear-gradient(165deg,#fffbeb,#fff);}
.wrrapd-amz-flowers-cell .wrrapd-amz-flowers-not{font-size:.52rem;font-weight:700;color:#3f0d1a;text-align:center;line-height:1.15;padding:0 .04rem;}
.wrrapd-amz-order-foot{width:100%;padding:.28rem .55rem .4rem;background:#fff;border-top:2px solid var(--wr-gold-deep);}
.wrrapd-amz-summary{margin:0 auto;max-width:min(100%,34rem);text-align:left;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:.42rem .55rem .48rem;box-shadow:inset 0 1px 0 rgba(255,255,255,.55);}
.wrrapd-amz-inv-list{width:100%;}
.wrrapd-amz-inv-row{display:flex;flex-direction:row;justify-content:space-between;align-items:baseline;gap:.75rem;width:100%;padding:.1rem 0;border-bottom:1px solid #e2e8f0;font-size:.62rem;line-height:1.35;}
.wrrapd-amz-inv-row:last-of-type:not(.wrrapd-amz-inv-row--grand){border-bottom:none;}
.wrrapd-amz-inv-row--grand{margin-top:.18rem;padding-top:.2rem;border-top:2px solid var(--wr-navy-mid);border-bottom:none;font-weight:800;font-size:.72rem;color:#0f172a;}
.wrrapd-amz-inv-row--stack{align-items:flex-start;}
.wrrapd-amz-inv-left{flex:1;min-width:0;}
.wrrapd-amz-inv-lab{color:#0f172a;font-weight:600;word-break:break-word;}
.wrrapd-amz-inv-lab .wrrapd-retailer-brand{display:inline-flex;align-items:center;gap:.28rem;vertical-align:middle;}
.wrrapd-retailer-logo{flex:0 0 auto;display:block;border-radius:50%;object-fit:cover;}
.wrrapd-retailer-name{font-weight:700;}
.wrrapd-amz-inv-sub{display:block;margin-top:.06rem;font-size:.56rem;color:#475569;font-weight:500;line-height:1.3;word-break:break-word;}
.wrrapd-amz-inv-amt{flex:0 0 auto;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;color:#0f172a;font-weight:600;}
.wrrapd-amz-inv-note{margin-top:.12rem;font-size:.52rem;color:#64748b;line-height:1.3;}
.wrrapd-amz-lines-col{flex:1 1 58%;min-width:13.5rem;max-width:100%;margin-left:auto;display:flex;flex-direction:column;}
.wrrapd-amz-lines-col .wrrapd-amz-fields-col{max-width:100%!important;width:100%;min-width:0;flex:1 1 auto;margin-left:0;padding:.22rem .52rem .34rem .32rem;}
.wrrapd-amz-line-inner .wrrapd-amz-fields-col{gap:.16rem;}
.wrrapd-amz-prod-after-rem{display:flex;flex-direction:row;align-items:center;justify-content:flex-end;width:100%;max-width:min(100%,13.5rem);margin:.14rem 0 .06rem;padding-top:.08rem;border-top:1px dashed var(--bx-line);}
.wrrapd-amz-prod-ph{display:inline-block;flex-shrink:0;width:52px;height:52px;border-radius:6px;background:#f1f5f9;border:1px dashed var(--bx-line);}
.wrrapd-amz-bar{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:.2rem .55rem;padding:.32rem .48rem;background:linear-gradient(180deg,#ffd54a,var(--wr-gold));border-bottom:2px solid var(--bx);}
.wrrapd-amz-bar-lbl{font-size:.54rem;font-weight:700;font-family:var(--wr-display);color:var(--wr-bar-ink);letter-spacing:.06em;text-transform:uppercase;opacity:.88;}
.wrrapd-amz-bar-date{margin-top:0;font-size:.72rem;font-weight:700;font-family:var(--wr-display);color:var(--wr-bar-ink);}
.wrrapd-amz-bar-onum{margin-top:0;font-size:.68rem;font-weight:700;color:var(--wr-bar-ink);text-align:right;font-family:var(--wr-display);}
.wrrapd-amz-bar-right{text-align:right;}
.wrrapd-amz-line{border-top:1px solid var(--bx-line);}
.wrrapd-amz-line:first-of-type{border-top:none;}
.wrrapd-amz-line-inner{display:flex;flex-direction:row;align-items:stretch;justify-content:flex-end;gap:0;width:100%;background:#fff;}
.wrrapd-amz-wrap-thumb{flex:0 0 auto;width:52px;height:52px;padding:0;border:none;border-radius:10px;cursor:zoom-in;overflow:hidden;background:radial-gradient(ellipse 95% 75% at 18% 12%,rgba(251,207,232,.55),transparent 52%),radial-gradient(ellipse 80% 70% at 88% 8%,rgba(254,243,199,.45),transparent 48%),radial-gradient(ellipse 120% 90% at 50% 100%,rgba(226,232,240,.9),transparent 55%),linear-gradient(152deg,#fffdfb 0%,#f8fafc 38%,#e2e8f0 72%,#f1f5f9 100%),repeating-linear-gradient(125deg,rgba(255,255,255,.14) 0 1px,transparent 1px 9px);}
.wrrapd-amz-wrap-thumb.has-img{background:#0f172a;border:2px solid var(--bx);border-radius:7px;box-shadow:0 2px 8px rgba(15,23,42,.2);}
.wrrapd-amz-wrap-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
.wrrapd-amz-wrap-thumb:focus{outline:2px solid var(--wr-gold-deep);outline-offset:1px;}
.wrrapd-amz-design-kind{font-size:.5rem;font-weight:700;font-family:var(--wr-display);color:var(--ink);line-height:1.15;text-align:center;width:100%;padding:0 .06rem;}
.wrrapd-amz-fields-col{flex:1 1 auto;min-width:0;width:100%;max-width:min(100%,13.5rem);padding:.24rem .42rem .32rem .28rem;display:flex;flex-direction:column;align-items:flex-end;gap:.14rem;text-align:left;background:#fff;border-left:none;box-shadow:none;overflow:visible;margin-left:auto;}
@media(max-width:720px){.wrrapd-amz-order-top{flex-wrap:wrap;}.wrrapd-amz-strip-col{max-width:100%;flex:1 1 100%;}.wrrapd-amz-lines-col{flex:1 1 100%;max-width:100%;margin-left:0;}}
@media(max-width:560px){.wrrapd-amz-search-wrap{transform:translateY(-1rem);margin-bottom:-.5rem;}.wrrapd-amz-line-inner{flex-direction:column;align-items:stretch;}.wrrapd-amz-fields-col{max-width:100%;width:100%;align-items:stretch;margin-left:0;}.wrrapd-amz-fields-col > .wrrapd-amz-f,.wrrapd-amz-occ-date-row,.wrrapd-amz-rem-inline-row,.wrrapd-amz-prod-after-rem{max-width:100%;width:100%;margin-left:0!important;}.wrrapd-amz-occ-date-row{flex-direction:column;align-items:stretch;}.wrrapd-amz-prodrow{justify-content:flex-start;}}
.wrrapd-amz-fields-col > .wrrapd-amz-f{position:relative;width:100%;max-width:min(100%,13.5rem);margin-left:auto;margin-right:0;}
.wrrapd-amz-fields-col > .wrrapd-amz-f--select{max-width:min(100%,13.5rem);}
.wrrapd-amz-occ-date-row{display:flex;flex-direction:row;align-items:flex-end;flex-wrap:nowrap;gap:.28rem;width:100%;max-width:min(100%,13.5rem);margin-left:auto;margin-right:0;}
.wrrapd-amz-occ-date-row .wrrapd-amz-f{flex:1 1 auto;min-width:0;margin:0;max-width:none;}
.wrrapd-amz-occ-date-row .wrrapd-amz-f-occwrap{flex:1 1 58%;min-width:0;}
.wrrapd-amz-occ-date-row .wrrapd-amz-f-datewrap{flex:0 1 40%;min-width:7.25rem;max-width:none;}
.wrrapd-amz-f-datewrap{margin:0;text-align:left;}
.wrrapd-amz-rem-inline-row{display:flex;flex-direction:row;align-items:center;flex-wrap:wrap;gap:.16rem .22rem;width:100%;max-width:min(100%,13.5rem);margin-left:auto;margin-right:0;padding:.12rem 0 .08rem;color:#0f172a;}
.wrrapd-amz-rem-inline-row .wrrapd-amz-f-rem-days{flex:0 0 auto;width:auto;min-width:1.75rem;max-width:2.2rem;padding:.08rem .16rem;border-radius:5px;border:2px solid #334155;font-size:.58rem;font-family:var(--wr-font);background:#fff;color:#0f172a;line-height:1.25;font-weight:700;}
.wrrapd-amz-f-rem-days:disabled{opacity:.45;cursor:not-allowed;}
.wrrapd-amz-f label{display:block;font-size:.48rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--wr-navy);margin-bottom:.05rem;font-family:var(--wr-font);width:100%;text-align:left;}
.wrrapd-amz-f input[type=text],.wrrapd-amz-f select:not(.wrrapd-amz-f-rem-days){width:100%;max-width:100%;min-height:1.35rem;padding:.14rem .32rem;border-radius:6px;border:2px solid var(--bx);font-size:.62rem;font-family:var(--wr-font);background:linear-gradient(180deg,var(--wr-field-hi),var(--wr-field));line-height:1.25;color:var(--wr-field-ink);box-shadow:inset 0 1px 0 rgba(255,255,255,.2),inset 0 -1px 0 rgba(0,0,0,.12);transition:border-color .15s ease,box-shadow .15s ease;}
.wrrapd-amz-f--select select{color:var(--ink);}
.wrrapd-amz-f--select select option{color:var(--ink);background:#fff;}
.wrrapd-amz-f input[type=text]::placeholder{color:rgba(255,247,237,.78);}
.wrrapd-amz-f select:not(.wrrapd-amz-f-rem-days){cursor:pointer;accent-color:var(--wr-gold-deep);}
.wrrapd-amz-f select option{background:#fff;color:var(--ink);}
.wrrapd-amz-f select:not(.wrrapd-amz-f-rem-days):focus,.wrrapd-amz-f input[type=text]:focus{outline:none;border-color:var(--wr-gold-deep);box-shadow:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -1px 0 rgba(0,0,0,.1),0 0 0 3px rgba(245,197,24,.35);}
.wrrapd-amz-f-datewrap input[type=date]{width:100%;max-width:100%;min-width:6.5rem;padding:.12rem .2rem;border-radius:6px;border:2px solid var(--bx);font-size:.54rem;font-family:var(--wr-font);background:#fff;color:var(--ink);accent-color:var(--wr-navy-mid);box-sizing:border-box;}
.wrrapd-amz-f-datewrap input[type=date]:focus{outline:none;border-color:var(--wr-gold-deep);box-shadow:0 0 0 3px rgba(245,197,24,.3);}
.wrrapd-amz-f-hint{font-size:.5rem;color:var(--muted);margin-top:.04rem;line-height:1.2;max-width:100%;text-align:left;}
.wrrapd-amz-giftee-readonly{width:100%;padding:.2rem .42rem;border-radius:6px;background:linear-gradient(180deg,#7f1d1d,#5c1a2e);color:#fff5f5;font-weight:700;font-size:.76rem;line-height:1.35;box-shadow:inset 0 1px 0 rgba(255,255,255,.12);}
.wrrapd-amz-f input.wrrapd-amz-f-giftee[type=hidden]{display:none;}
.wrrapd-amz-f-commentplain{background:#fff!important;color:#0f172a!important;border:1px solid #94a3b8!important;box-shadow:none!important;background-image:none!important;}
.wrrapd-amz-f input.wrrapd-amz-f-commentplain::placeholder{color:#475569;font-weight:500;}
.wrrapd-amz-giftmsg{max-width:min(100%,13.5rem);width:100%;margin-left:auto;margin-right:0;font-size:.6rem;line-height:1.38;color:var(--ink);padding:.08rem 0 .04rem;text-align:left;}
.wrrapd-amz-giftmsg-lbl{font-weight:700;font-size:.48rem;text-transform:uppercase;letter-spacing:.06em;color:var(--wr-navy);display:block;margin-bottom:.04rem;}
.wrrapd-amz-giftmsg-txt{font-weight:500;white-space:pre-wrap;word-break:break-word;}
.wrrapd-amz-prodrow{display:flex;align-items:center;justify-content:flex-start;gap:.28rem;flex-wrap:wrap;width:100%;max-width:min(100%,12rem);margin-left:auto;margin-right:0;position:relative;overflow:visible;}
.wrrapd-amz-prod-thumb{flex:0 0 auto;width:48px;height:48px;padding:0;border:2px solid var(--bx);border-radius:6px;cursor:zoom-in;overflow:hidden;background:#fff;position:relative;z-index:1;transition:transform .2s ease,box-shadow .2s ease,overflow .01s step-end .2s;box-shadow:0 1px 3px rgba(15,23,42,.1);}
.wrrapd-amz-prod-thumb img{width:100%;height:100%;object-fit:contain;display:block;border-radius:4px;}
.wrrapd-amz-prod-thumb:hover,.wrrapd-amz-prod-thumb:focus{z-index:30;overflow:visible;transform:scale(2);box-shadow:0 8px 24px rgba(15,23,42,.25);}
.wrrapd-amz-rowcheck{display:inline-flex;align-items:center;gap:.2rem;font-size:.68rem;font-weight:800;color:#0f172a;margin:0;flex:1 1 auto;min-width:0;}
.wrrapd-amz-rowcheck input{width:16px;height:16px;accent-color:#7f1d1d;margin:0;flex-shrink:0;}
.wrrapd-amz-rowcheck span,.wrrapd-amz-rowcheck label{margin:0;text-transform:none;letter-spacing:.01em;font-size:.68rem;line-height:1.3;font-weight:800;color:#0f172a;}
.wrrapd-amz-rem-tail{font-size:.68rem;font-weight:800;color:#0f172a;white-space:nowrap;flex:0 0 auto;}
.wrrapd-amz-savebar{margin-top:.14rem;padding-top:.2rem;border-top:1px dashed var(--bx-line);display:flex;justify-content:flex-end;width:100%;max-width:min(100%,13.5rem);margin-left:auto;margin-right:0;}
.wrrapd-amz-save{background:linear-gradient(180deg,var(--wr-navy-mid),var(--wr-navy));color:#fffef8;border:2px solid var(--bx);border-radius:7px;padding:.2rem .75rem;font-weight:700;font-size:.6rem;cursor:pointer;font-family:var(--wr-display);letter-spacing:.02em;box-shadow:0 1px 0 rgba(0,0,0,.1),0 3px 10px rgba(22,42,82,.2);transition:transform .12s ease,box-shadow .15s ease,background .15s ease;}
.wrrapd-amz-save:hover{background:linear-gradient(180deg,var(--wr-navy-soft),var(--wr-navy-mid));}
.wrrapd-amz-save:active{transform:translateY(1px);}
.wrrapd-amz-save:disabled{opacity:.55;cursor:wait;transform:none;}
.wrrapd-amz-lightbox{position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.9);display:none;align-items:center;justify-content:center;padding:1rem;box-sizing:border-box;}
.wrrapd-amz-lightbox.wrrapd-amz-lightbox--open{display:flex;}
.wrrapd-amz-lb-close{position:absolute;top:.5rem;right:.6rem;width:2.1rem;height:2.1rem;border:2px solid var(--bx);border-radius:50%;background:var(--wr-navy-mid);color:#fff;font-size:1.15rem;line-height:1;cursor:pointer;font-weight:700;}
.wrrapd-amz-lb-inner{max-width:min(96vw,900px);max-height:92vh;overflow:auto;text-align:center;}
.wrrapd-amz-lb-inner img{max-width:100%;max-height:86vh;width:auto;height:auto;object-fit:contain;border:1px solid var(--bx);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);}
.wrrapd-amz-lb-inner .wrrapd-amz-lb-paper{width:min(85vw,520px);height:min(70vh,520px);border-radius:8px;border:1px solid var(--bx);margin:0 auto;background:radial-gradient(ellipse at 30% 15%,rgba(30,58,95,.06),transparent 50%),linear-gradient(165deg,#fff,#eef2f7);}
</style>';

	echo '<div class="wrrapd-amz-search-wrap"><div class="wrrapd-amz-search"><input type="search" id="' . esc_attr( $search_id ) . '" aria-label="' . esc_attr__( 'Search orders, giftee, or item', 'wrrapd' ) . '" placeholder="' . esc_attr__( 'Search orders, giftee, item…', 'wrrapd' ) . '" autocomplete="off" /></div></div>';

	foreach ( $orders as $order ) {
		if ( ! is_array( $order ) ) {
			continue;
		}
		$on = isset( $order['orderNumber'] ) ? (string) $order['orderNumber'] : '—';
		$ts = isset( $order['timestamp'] ) ? (string) $order['timestamp'] : '';
		$date_show = wrrapd_studio_format_order_date( $ts );
		$lines = isset( $order['lines'] ) && is_array( $order['lines'] ) ? $order['lines'] : array();
		if ( count( $lines ) === 0 ) {
			$lines = array(
				array(
					'gifteeName'         => null,
					'occasion'           => null,
					'designSummary'      => null,
					'giftMessageSnippet' => null,
					'giftMessage'        => null,
					'productTitle'       => null,
					'productImageUrl'    => null,
					'designPreviewUrl'   => null,
					'designLabel'        => null,
					'flowers'            => false,
					'deliveryHint'       => null,
				),
			);
		}

		$search_bits = array( $on, $date_show, $ts );
		foreach ( $lines as $ln0 ) {
			if ( is_array( $ln0 ) ) {
				$search_bits[] = isset( $ln0['gifteeName'] ) ? (string) $ln0['gifteeName'] : '';
				$search_bits[] = isset( $ln0['occasion'] ) ? (string) $ln0['occasion'] : '';
				$search_bits[] = isset( $ln0['productTitle'] ) ? (string) $ln0['productTitle'] : '';
			}
		}
		$search_blob = strtolower( implode( ' ', array_filter( $search_bits ) ) );

		echo '<article class="wrrapd-amz-order" data-wrrapd-search="' . esc_attr( $search_blob ) . '">';
		echo '<div class="wrrapd-amz-bar"><div><div class="wrrapd-amz-bar-lbl">' . esc_html__( 'ORDER PLACED', 'wrrapd' ) . '</div>';
		echo '<div class="wrrapd-amz-bar-date">' . esc_html( $date_show !== '' ? $date_show : '—' ) . '</div></div>';
		echo '<div class="wrrapd-amz-bar-right"><div class="wrrapd-amz-bar-lbl">' . esc_html__( 'Order #', 'wrrapd' ) . '</div>';
		echo '<div class="wrrapd-amz-bar-onum">' . esc_html( $on ) . '</div></div></div>';

		$line_strips = array();
		foreach ( $lines as $lnx ) {
			if ( ! is_array( $lnx ) ) {
				continue;
			}
			$dpr = isset( $lnx['designPreviewUrl'] ) ? trim( (string) $lnx['designPreviewUrl'] ) : '';
			$wsrc = $dpr !== '' ? esc_url( $dpr ) : '';
			$line_strips[] = array(
				'wrap_src'    => $wsrc,
				'wrap_type'   => $wsrc !== '' ? 'img' : 'paper',
				'flowers'     => ! empty( $lnx['flowers'] ),
				'design_kind' => wrrapd_studio_design_kind_label( $lnx ),
			);
		}

		echo '<div class="wrrapd-amz-order-top">';
		echo '<div class="wrrapd-amz-strip-col">';
		echo '<div class="wrrapd-amz-wraps-row">';
		foreach ( $line_strips as $s ) {
			$hcls = ( $s['wrap_src'] !== '' ) ? ' has-img' : '';
			echo '<div class="wrrapd-amz-strip-cell"><button type="button" class="wrrapd-amz-wrap-thumb' . $hcls . '" data-wrrapd-lb-type="' . esc_attr( $s['wrap_type'] ) . '" data-wrrapd-lb-src="' . esc_attr( $s['wrap_src'] ) . '" aria-label="' . esc_attr__( 'Enlarge wrapping preview', 'wrrapd' ) . '">';
			if ( $s['wrap_src'] !== '' ) {
				echo '<img src="' . esc_url( $s['wrap_src'] ) . '" alt="" loading="lazy" decoding="async" />';
			}
			echo '</button></div>';
		}
		echo '</div>';
		echo '<div class="wrrapd-amz-kind-row">';
		foreach ( $line_strips as $s ) {
			echo '<div class="wrrapd-amz-strip-cell"><div class="wrrapd-amz-design-kind">' . esc_html( $s['design_kind'] ) . '</div></div>';
		}
		echo '</div>';
		echo '<div class="wrrapd-amz-flowers-row">';
		foreach ( $line_strips as $s ) {
			echo '<div class="wrrapd-amz-strip-cell wrrapd-amz-flowers-cell">';
			if ( ! empty( $s['flowers'] ) ) {
				echo '<div class="wrrapd-amz-flowers-art" role="img" aria-label="' . esc_attr__( 'Bouquet with this gift', 'wrrapd' ) . '"></div>';
			} else {
				echo '<span class="wrrapd-amz-flowers-not">' . esc_html__( 'Flowers not sent.', 'wrrapd' ) . '</span>';
			}
			echo '</div>';
		}
		echo '</div>';
		echo '</div>';

		echo '<div class="wrrapd-amz-lines-col">';
		$li = 0;
		foreach ( $lines as $ln ) {
			if ( ! is_array( $ln ) ) {
				continue;
			}
			$ov = wrrapd_overlay_row( $overlays, $on, $li );

			$api_giftee = isset( $ln['gifteeName'] ) ? trim( (string) $ln['gifteeName'] ) : '';
			$giftee_val = $ov['giftee'] !== '' ? $ov['giftee'] : $api_giftee;

			$api_occ = isset( $ln['occasion'] ) ? trim( (string) $ln['occasion'] ) : '';
			$pick    = isset( $ov['occasion_pick'] ) ? trim( (string) $ov['occasion_pick'] ) : '';
			$occ_sel = $pick !== '' ? $pick : $api_occ;

			$gm_show = isset( $ln['giftMessage'] ) ? trim( (string) $ln['giftMessage'] ) : '';
			if ( $gm_show === '' && isset( $ln['giftMessageSnippet'] ) ) {
				$gm_show = trim( (string) $ln['giftMessageSnippet'] );
			}

			$rel_val = isset( $ov['relationship'] ) ? (string) $ov['relationship'] : '';
			$comment = isset( $ov['comment'] ) ? (string) $ov['comment'] : '';
			$gdate   = isset( $ov['gift_date'] ) ? (string) $ov['gift_date'] : '';
			$rem     = ! empty( $ov['reminder_next_year'] );
			$rem_prior = isset( $ov['reminder_days_prior'] ) ? (int) $ov['reminder_days_prior'] : 0;
			if ( $rem_prior < 1 || $rem_prior > 7 ) {
				$rem_prior = 1;
			}

			$dlabel = isset( $ln['designLabel'] ) ? trim( (string) $ln['designLabel'] ) : '';

			$img_raw     = isset( $ln['productImageUrl'] ) ? trim( (string) $ln['productImageUrl'] ) : '';
			$img         = $img_raw !== '' ? esc_url( $img_raw ) : '';
			$prod_lb_src = $img_raw !== '' ? esc_url( $img_raw ) : '';

			$line_search = strtolower(
				implode(
					' ',
					array_filter(
						array(
							$giftee_val,
							$occ_sel,
							$gm_show,
							isset( $ln['productTitle'] ) ? (string) $ln['productTitle'] : '',
							$dlabel,
						)
					)
				)
			);

			$id_sfx = substr( md5( $on . ':' . (string) $li ), 0, 12 );

			$rel_opts = $rels;
			if ( $rel_val !== '' && ! in_array( $rel_val, $rel_opts, true ) ) {
				$rel_opts = array_merge( array( $rel_val ), $rel_opts );
			}
			$occ_opts = $labels;
			if ( $occ_sel !== '' && ! in_array( $occ_sel, $occ_opts, true ) ) {
				$occ_opts = array_merge( array( $occ_sel ), $occ_opts );
			}

			$giftee_show = $giftee_val !== '' ? $giftee_val : '—';

			echo '<div class="wrrapd-amz-line" data-order="' . esc_attr( $on ) . '" data-line="' . (int) $li . '" data-wrrapd-search="' . esc_attr( $line_search ) . '">';
			echo '<div class="wrrapd-amz-line-inner">';
			echo '<div class="wrrapd-amz-fields-col">';
			echo '<div class="wrrapd-amz-f">';
			echo '<input type="hidden" class="wrrapd-amz-f-giftee" name="giftee_' . esc_attr( $id_sfx ) . '" value="' . esc_attr( $giftee_val ) . '" />';
			echo '<div class="wrrapd-amz-giftee-readonly" aria-label="' . esc_attr__( 'Giftee', 'wrrapd' ) . '">' . esc_html( $giftee_show ) . '</div></div>';

			echo '<div class="wrrapd-amz-f wrrapd-amz-f--select">';
			echo '<select class="wrrapd-amz-f-rel" id="' . esc_attr( $wrap_id . '-r-' . $id_sfx ) . '" aria-label="' . esc_attr__( 'Relationship', 'wrrapd' ) . '">';
			echo '<option value="">' . esc_html__( 'Relationship', 'wrrapd' ) . '</option>';
			foreach ( $rel_opts as $r ) {
				echo '<option value="' . esc_attr( $r ) . '"' . selected( $rel_val, $r, false ) . '>' . esc_html( $r ) . '</option>';
			}
			echo '</select></div>';

			echo '<div class="wrrapd-amz-occ-date-row">';
			echo '<div class="wrrapd-amz-f wrrapd-amz-f-occwrap wrrapd-amz-f--select">';
			echo '<select class="wrrapd-amz-f-occ" id="' . esc_attr( $wrap_id . '-o-' . $id_sfx ) . '" aria-label="' . esc_attr__( 'Occasion', 'wrrapd' ) . '">';
			echo '<option value="">' . esc_html__( 'Occasion', 'wrrapd' ) . '</option>';
			foreach ( $occ_opts as $lab ) {
				$lab_s = trim( (string) $lab );
				if ( $lab_s === '' ) {
					continue;
				}
				echo '<option value="' . esc_attr( $lab_s ) . '"' . selected( $occ_sel, $lab_s, false ) . '>' . esc_html( $lab_s ) . '</option>';
			}
			echo '</select></div>';
			echo '<div class="wrrapd-amz-f wrrapd-amz-f-datewrap">';
			echo '<input type="date" class="wrrapd-amz-f-date" id="' . esc_attr( $wrap_id . '-d-' . $id_sfx ) . '" value="' . esc_attr( $gdate ) . '" aria-label="' . esc_attr__( 'Date', 'wrrapd' ) . '" />';
			echo '</div></div>';

			if ( $gm_show !== '' ) {
				echo '<div class="wrrapd-amz-giftmsg"><span class="wrrapd-amz-giftmsg-lbl">' . esc_html__( 'Gift message', 'wrrapd' ) . '</span>';
				echo '<span class="wrrapd-amz-giftmsg-txt">' . esc_html( $gm_show ) . '</span></div>';
			}

			echo '<div class="wrrapd-amz-rem-inline-row">';
			echo '<label class="wrrapd-amz-rowcheck wrrapd-amz-rowcheck--rem" for="' . esc_attr( $wrap_id . '-m-' . $id_sfx ) . '">';
			echo '<input type="checkbox" class="wrrapd-amz-f-rem" id="' . esc_attr( $wrap_id . '-m-' . $id_sfx ) . '"' . ( $rem ? ' checked' : '' ) . ' />';
			echo '<span>' . esc_html__( 'Set reminder', 'wrrapd' ) . '</span></label>';
			echo '<select class="wrrapd-amz-f-rem-days" id="' . esc_attr( $wrap_id . '-md-' . $id_sfx ) . '" aria-label="' . esc_attr__( 'Days before the date', 'wrrapd' ) . '"' . ( $rem ? '' : ' disabled' ) . '>';
			for ( $rd = 1; $rd <= 7; $rd++ ) {
				echo '<option value="' . (int) $rd . '"' . selected( $rem_prior, $rd, false ) . '>' . esc_html( (string) (int) $rd ) . '</option>';
			}
			echo '</select>';
			echo '<span class="wrrapd-amz-rem-tail">' . esc_html__( 'days prior.', 'wrrapd' ) . '</span>';
			echo '</div>';

			echo '<div class="wrrapd-amz-prod-after-rem">';
			if ( $prod_lb_src !== '' ) {
				echo '<button type="button" class="wrrapd-amz-prod-thumb" data-wrrapd-lb-type="img" data-wrrapd-lb-src="' . esc_attr( $prod_lb_src ) . '" aria-label="' . esc_attr__( 'Enlarge item image', 'wrrapd' ) . '"><img src="' . $img . '" alt="" loading="lazy" decoding="async" /></button>';
			}
			echo '</div>';

			echo '<div class="wrrapd-amz-f">';
			echo '<input type="text" class="wrrapd-amz-f-comment wrrapd-amz-f-commentplain" id="' . esc_attr( $wrap_id . '-c-' . $id_sfx ) . '" maxlength="4000" value="' . esc_attr( $comment ) . '" placeholder="' . esc_attr__( 'Additional comments', 'wrrapd' ) . '" aria-label="' . esc_attr__( 'Additional comments', 'wrrapd' ) . '" /></div>';

			echo '<div class="wrrapd-amz-savebar"><button type="button" class="wrrapd-amz-save">' . esc_html__( 'Save changes', 'wrrapd' ) . '</button></div>';
			echo '</div>';

			echo '</div></div>';
			++$li;
		}
		echo '</div>';
		echo '</div>';
		echo '<div class="wrrapd-amz-order-foot">';
		echo wrrapd_studio_order_summary_html( $order, $lines );
		echo '</div>';
		echo '</article>';
	}

	$wrap_json   = wp_json_encode( $wrap_id );
	$search_json = wp_json_encode( $search_id );
	$lb_json     = wp_json_encode( $wrap_id . '-lb' );
	echo '<div class="wrrapd-amz-lightbox" id="' . esc_attr( $wrap_id ) . '-lb" role="dialog" aria-modal="true" aria-hidden="true"><button type="button" class="wrrapd-amz-lb-close" aria-label="' . esc_attr__( 'Close', 'wrrapd' ) . '">&times;</button><div class="wrrapd-amz-lb-inner"></div></div>';
	echo '<script>(function(){var root=document.getElementById(' . $wrap_json . ');if(!root)return;function wrrapdHideNoOrderMsg(el){if(!el||el===document.body)return;el.style.display="none";el.style.visibility="hidden";el.style.height="0";el.style.maxHeight="0";el.style.overflow="hidden";el.style.margin="0";el.style.padding="0";el.style.border="none";el.setAttribute("aria-hidden","true");}function wrrapdRmNoOrderFiles(){var re=/no\\s+order\\s+files?\\s*found\\.?/i;var strip=function(t){return t.replace(/no\\s+order\\s+files?\\s*found\\.?/gi,"").replace(/[\\s\\u00a0.,;…·\\-–—]+/g,"").trim();};var sels=".elementor-widget,.elementor-element,.elementor-widget-wrap,.e-con,.e-con-inner,.jet-listing-grid,.elementor-section,.elementor-widget-text-editor,.elementor-widget-heading,.widget,.wp-block-column,.wp-block-group";try{document.querySelectorAll(sels).forEach(function(el){var t=(el.textContent||"").replace(/\\s+/g," ").trim();if(!re.test(t))return;if(strip(t).length>80)return;wrrapdHideNoOrderMsg(el);});}catch(e){}try{var tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null,false);var tn;while(tn=tw.nextNode()){if(!re.test(tn.nodeValue||""))continue;var p=tn.parentElement;while(p&&p!==document.body){var pt=(p.textContent||"").replace(/\\s+/g," ").trim();if(re.test(pt)&&strip(pt).length<=2){wrrapdHideNoOrderMsg(p);break;}p=p.parentElement;}}}catch(e){}}if(!window.__wrrapdNoOrdObs){var _tmo;window.__wrrapdNoOrdObs=new MutationObserver(function(){clearTimeout(_tmo);_tmo=setTimeout(function(){wrrapdRmNoOrderFiles();},90);});try{window.__wrrapdNoOrdObs.observe(document.body,{childList:true,subtree:true});}catch(e){}}wrrapdRmNoOrderFiles();window.addEventListener("load",function(){wrrapdRmNoOrderFiles();});[80,200,500,1200,2400,4800,9000].forEach(function(ms){setTimeout(wrrapdRmNoOrderFiles,ms);});var lb=document.getElementById(' . $lb_json . ');var q=document.getElementById(' . $search_json . ');function norm(s){return(s||"").toLowerCase().trim();}function filterOrders(){var needle=norm(q?q.value:"");root.querySelectorAll(".wrrapd-amz-order").forEach(function(ord){if(!needle){ord.style.display="";return;}var hay=norm(ord.getAttribute("data-wrrapd-search"));var hit=hay.indexOf(needle)!==-1;if(!hit){ord.querySelectorAll(".wrrapd-amz-line").forEach(function(ln){if(norm(ln.getAttribute("data-wrrapd-search")).indexOf(needle)!==-1)hit=true;});}ord.style.display=hit?"":"none";});}if(q){q.addEventListener("input",filterOrders);q.addEventListener("search",filterOrders);}function openLb(t,src){if(!lb)return;var inner=lb.querySelector(".wrrapd-amz-lb-inner");inner.innerHTML="";if(t==="img"&&src){var im=document.createElement("img");im.src=src;im.alt="";im.decoding="async";inner.appendChild(im);}else{var d=document.createElement("div");d.className="wrrapd-amz-lb-paper";inner.appendChild(d);}lb.classList.add("wrrapd-amz-lightbox--open");lb.setAttribute("aria-hidden","false");}function closeLb(){if(!lb)return;lb.classList.remove("wrrapd-amz-lightbox--open");lb.setAttribute("aria-hidden","true");}root.addEventListener("click",function(e){var b=e.target.closest(".wrrapd-amz-wrap-thumb,.wrrapd-amz-prod-thumb");if(b){openLb(b.getAttribute("data-wrrapd-lb-type")||"paper",b.getAttribute("data-wrrapd-lb-src")||"");return;}if(!lb||!lb.classList.contains("wrrapd-amz-lightbox--open"))return;if(e.target.classList.contains("wrrapd-amz-lb-close")||e.target===lb)closeLb();});document.addEventListener("keydown",function(e){if(e.key!=="Escape"||!lb||!lb.classList.contains("wrrapd-amz-lightbox--open"))return;closeLb();});var ajax=root.getAttribute("data-ajax-url");var nonce=root.getAttribute("data-nonce");root.querySelectorAll(".wrrapd-amz-f-rem").forEach(function(cb){function snc(){var ln=cb.closest(".wrrapd-amz-line");if(!ln)return;var sd=ln.querySelector(".wrrapd-amz-f-rem-days");if(sd)sd.disabled=!cb.checked;}cb.addEventListener("change",snc);snc();});root.querySelectorAll(".wrrapd-amz-save").forEach(function(btn){btn.addEventListener("click",function(){var line=btn.closest(".wrrapd-amz-line");if(!line)return;var fd=new FormData();fd.append("action","wrrapd_save_order_line_overlay");fd.append("nonce",nonce);fd.append("orderNumber",line.getAttribute("data-order")||"");fd.append("lineIndex",line.getAttribute("data-line")||"0");fd.append("giftee",line.querySelector(".wrrapd-amz-f-giftee")?line.querySelector(".wrrapd-amz-f-giftee").value:"");fd.append("relationship",line.querySelector(".wrrapd-amz-f-rel")?line.querySelector(".wrrapd-amz-f-rel").value:"");fd.append("occasion_pick",line.querySelector(".wrrapd-amz-f-occ")?line.querySelector(".wrrapd-amz-f-occ").value:"");fd.append("gift_date",line.querySelector(".wrrapd-amz-f-date")?line.querySelector(".wrrapd-amz-f-date").value:"");var rcb=line.querySelector(".wrrapd-amz-f-rem");var ron=rcb&&rcb.checked;fd.append("reminder_next_year",ron?"1":"");var rdp=line.querySelector(".wrrapd-amz-f-rem-days");fd.append("reminder_days_prior",ron&&rdp&&!rdp.disabled?(rdp.value||"1"):"");fd.append("comment",line.querySelector(".wrrapd-amz-f-comment")?line.querySelector(".wrrapd-amz-f-comment").value:"");btn.disabled=true;fetch(ajax,{method:"POST",body:fd,credentials:"same-origin"}).then(function(r){return r.json();}).then(function(j){btn.disabled=false;if(j&&j.success){btn.style.boxShadow="0 0 0 2px rgba(107,114,128,.85)";window.setTimeout(function(){btn.style.boxShadow="";},650);}else{btn.style.opacity="0.65";window.setTimeout(function(){btn.style.opacity="";},900);}}).catch(function(){btn.disabled=false;});});});})();</script>';

	echo '</div>';
	return (string) ob_get_clean();
}

/**
 * Shortcode: [wrrapd_review_orders] or [wrrapd_review_orders layout="rich"|"cards"|"studio"|"legacy-cards"]
 * Re-claims (idempotent) then lists orders for the current user.
 *
 * @param array<string, string>|string $atts
 */
function wrrapd_shortcode_review_orders( $atts ) {
	$atts = shortcode_atts(
		array( 'layout' => 'simple' ),
		is_array( $atts ) ? $atts : array(),
		'wrrapd_review_orders'
	);
	$layout = isset( $atts['layout'] ) ? strtolower( trim( (string) $atts['layout'] ) ) : 'simple';

	if ( ! is_user_logged_in() ) {
		return '<p class="wrrapd-review-orders">' . esc_html__( 'Please log in to see your Wrrapd orders.', 'wrrapd' ) . '</p>';
	}
	$user = wp_get_current_user();
	if ( ! $user || ! $user->ID ) {
		return '';
	}
	wrrapd_claim_orders_for_user( $user );
	$orders = wrrapd_fetch_orders_for_user( $user );
	if ( ! is_array( $orders ) ) {
		return '<p class="wrrapd-review-orders wrrapd-error">' . esc_html__( 'We could not load your orders right now. Please try again later.', 'wrrapd' ) . '</p>';
	}
	if ( count( $orders ) === 0 ) {
		return '<p class="wrrapd-review-orders">' . esc_html__( 'No Wrrapd orders were found for your account email yet.', 'wrrapd' ) . '</p>';
	}

	if ( $layout === 'rich' ) {
		return wrrapd_render_orders_table_rich( $orders );
	}
	if ( $layout === 'cards' ) {
		return wrrapd_render_orders_cards( $orders );
	}
	if ( $layout === 'studio' ) {
		$ov = wrrapd_get_line_overlays( (int) $user->ID );
		return wrrapd_render_orders_studio( $orders, $ov );
	}
	if ( $layout === 'legacy-cards' ) {
		$ov = wrrapd_get_line_overlays( (int) $user->ID );
		return wrrapd_render_orders_legacy_cards( $orders, $ov );
	}
	return wrrapd_render_orders_table_simple( $orders );
}

add_shortcode( 'wrrapd_review_orders', 'wrrapd_shortcode_review_orders' );

/**
 * Save per–gift-line customer overlay (studio fields) on the logged-in user.
 */
function wrrapd_ajax_save_order_line_overlay() {
	if ( ! is_user_logged_in() ) {
		wp_send_json_error( array( 'message' => __( 'Not logged in.', 'wrrapd' ) ), 403 );
	}
	check_ajax_referer( 'wrrapd_line_extras', 'nonce' );

	$uid   = get_current_user_id();
	$order = isset( $_POST['orderNumber'] ) ? sanitize_text_field( wp_unslash( $_POST['orderNumber'] ) ) : '';
	$line  = isset( $_POST['lineIndex'] ) ? (int) wp_unslash( $_POST['lineIndex'] ) : -1;
	if ( $order === '' || $line < 0 ) {
		wp_send_json_error( array( 'message' => __( 'Bad request.', 'wrrapd' ) ), 400 );
	}

	$giftee = isset( $_POST['giftee'] ) ? sanitize_text_field( wp_unslash( $_POST['giftee'] ) ) : '';
	if ( strlen( $giftee ) > 200 ) {
		wp_send_json_error( array( 'message' => __( 'Giftee name is too long.', 'wrrapd' ) ), 400 );
	}

	$relationship = isset( $_POST['relationship'] ) ? sanitize_text_field( wp_unslash( $_POST['relationship'] ) ) : '';
	if ( $relationship !== '' && ! in_array( $relationship, wrrapd_relationship_choices(), true ) ) {
		wp_send_json_error( array( 'message' => __( 'Invalid relationship.', 'wrrapd' ) ), 400 );
	}

	$pick = isset( $_POST['occasion_pick'] ) ? sanitize_text_field( wp_unslash( $_POST['occasion_pick'] ) ) : '';
	if ( strlen( $pick ) > 120 ) {
		wp_send_json_error( array( 'message' => __( 'Occasion is too long.', 'wrrapd' ) ), 400 );
	}

	$gift_date = isset( $_POST['gift_date'] ) ? sanitize_text_field( wp_unslash( $_POST['gift_date'] ) ) : '';
	if ( $gift_date !== '' && ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $gift_date ) ) {
		wp_send_json_error( array( 'message' => __( 'Invalid date.', 'wrrapd' ) ), 400 );
	}

	$reminder = isset( $_POST['reminder_next_year'] ) ? sanitize_text_field( wp_unslash( $_POST['reminder_next_year'] ) ) : '';
	$reminder = ( $reminder === '1' || $reminder === 'true' || $reminder === 'on' ) ? '1' : '';

	$rem_prior = isset( $_POST['reminder_days_prior'] ) ? (int) wp_unslash( $_POST['reminder_days_prior'] ) : 0;
	if ( $rem_prior < 1 || $rem_prior > 7 ) {
		$rem_prior = 0;
	}
	$reminder_days_prior = ( $reminder !== '' && $rem_prior >= 1 && $rem_prior <= 7 ) ? (string) $rem_prior : '';

	$comment = isset( $_POST['comment'] ) ? sanitize_textarea_field( wp_unslash( $_POST['comment'] ) ) : '';
	if ( strlen( $comment ) > 4000 ) {
		wp_send_json_error( array( 'message' => __( 'Comment is too long.', 'wrrapd' ) ), 400 );
	}

	$all = wrrapd_get_line_overlays( $uid );
	if ( ! isset( $all[ $order ] ) || ! is_array( $all[ $order ] ) ) {
		$all[ $order ] = array();
	}
	$key = (string) $line;

	$is_empty = (
		$giftee === '' &&
		$relationship === '' &&
		$pick === '' &&
		$gift_date === '' &&
		$reminder === '' &&
		$comment === ''
	);

	if ( $is_empty ) {
		unset( $all[ $order ][ $key ] );
		if ( empty( $all[ $order ] ) ) {
			unset( $all[ $order ] );
		}
	} else {
		$all[ $order ][ $key ] = array(
			'giftee'                => $giftee,
			'relationship'          => $relationship,
			'occasion_pick'         => $pick,
			'gift_date'             => $gift_date,
			'reminder_next_year'    => $reminder,
			'reminder_days_prior'   => $reminder_days_prior,
			'comment'               => $comment,
		);
	}

	update_user_meta( $uid, WRRAPD_LINE_OVERLAYS_META, $all );
	wp_send_json_success();
}
add_action( 'wp_ajax_wrrapd_save_order_line_overlay', 'wrrapd_ajax_save_order_line_overlay' );
