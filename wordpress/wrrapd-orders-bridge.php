<?php
/**
 * Plugin Name: Wrrapd Orders Bridge (MU)
 * Description: Orders bridge (claim + list shortcodes), logout nonce fix, strip leading "NN. " from front-end titles.
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
 * Strip a leading admin sort prefix like "07. " from titles on the **front end** only
 * (WP admin and editor still show the full title). Matches: digits + dot + optional spaces.
 */
function wrrapd_strip_leading_title_sort_prefix( $title ) {
	if ( is_admin() || ! is_string( $title ) || $title === '' ) {
		return $title;
	}
	$out = preg_replace( '/^\d+\.\s*/u', '', $title );
	return is_string( $out ) ? $out : $title;
}

add_filter( 'the_title', 'wrrapd_strip_leading_title_sort_prefix', 10, 1 );

add_filter(
	'document_title_parts',
	static function ( $parts ) {
		if ( is_admin() || empty( $parts['title'] ) || ! is_string( $parts['title'] ) ) {
			return $parts;
		}
		$parts['title'] = wrrapd_strip_leading_title_sort_prefix( $parts['title'] );
		return $parts;
	},
	10,
	1
);

add_filter(
	'nav_menu_item_title',
	static function ( $title, $item, $args, $depth ) {
		if ( is_admin() || ! is_string( $title ) || $title === '' ) {
			return $title;
		}
		if ( is_object( $item ) && isset( $item->type ) && $item->type === 'post_type' ) {
			return wrrapd_strip_leading_title_sort_prefix( $title );
		}
		return $title;
	},
	10,
	4
);

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
	echo '<th>' . esc_html__( 'Amazon / order #', 'wrrapd' ) . '</th>';
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
 * Shortcode: [wrrapd_review_orders] or [wrrapd_review_orders layout="rich"|"cards"]
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

	$r = wrrapd_bridge_json_post(
		'/api/internal/orders-for-wp-user',
		array(
			'email'    => $user->user_email,
			'wpUserId' => (string) $user->ID,
		)
	);
	if ( ! $r['ok'] || ! is_array( $r['body'] ) || empty( $r['body']['ok'] ) ) {
		return '<p class="wrrapd-review-orders wrrapd-error">' . esc_html__( 'We could not load your orders right now. Please try again later.', 'wrrapd' ) . '</p>';
	}
	$orders = isset( $r['body']['orders'] ) && is_array( $r['body']['orders'] ) ? $r['body']['orders'] : array();
	if ( count( $orders ) === 0 ) {
		return '<p class="wrrapd-review-orders">' . esc_html__( 'No Wrrapd orders were found for your account email yet.', 'wrrapd' ) . '</p>';
	}

	if ( $layout === 'rich' ) {
		return wrrapd_render_orders_table_rich( $orders );
	}
	if ( $layout === 'cards' ) {
		return wrrapd_render_orders_cards( $orders );
	}
	return wrrapd_render_orders_table_simple( $orders );
}

add_shortcode( 'wrrapd_review_orders', 'wrrapd_shortcode_review_orders' );
