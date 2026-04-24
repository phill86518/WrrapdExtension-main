<?php
/**
 * Plugin Name: Wrrapd Orders Bridge (MU)
 * Description: Orders bridge (claim + list shortcodes + studio layout), logout nonce fix, strip leading "NN. " from front-end titles.
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
		'relationship'         => '',
		'occasion_pick'        => '',
		'giftee'               => '',
		'gift_message'         => '',
		'comment'              => '',
		'gift_date'            => '',
		'reminder_next_year'   => '',
		'customer_notes'      => '',
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
 * Collect unique occasion strings from API orders + saved overlay picks (for dropdowns).
 *
 * @param array<int, array<string, mixed>> $orders
 * @param array<string, array<string|int, array<string, string>>> $overlays
 * @return list<string>
 */
function wrrapd_collect_occasion_labels( array $orders, array $overlays ) {
	$set = array();
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
				$set[ $o ] = true;
			}
		}
	}
	foreach ( $overlays as $lines ) {
		if ( ! is_array( $lines ) ) {
			continue;
		}
		foreach ( $lines as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$p = isset( $row['occasion_pick'] ) ? trim( (string) $row['occasion_pick'] ) : '';
			if ( $p !== '' ) {
				$set[ $p ] = true;
			}
		}
	}
	$labels = array_keys( $set );
	sort( $labels, SORT_NATURAL | SORT_FLAG_CASE );
	return $labels;
}

/**
 * Occasion dropdown = canonical presets plus anything seen in orders / saved picks.
 *
 * @param array<int, array<string, mixed>> $orders
 * @param array<string, array<string|int, array<string, string>>> $overlays
 * @return list<string>
 */
function wrrapd_merge_occasion_dropdown_choices( array $orders, array $overlays ) {
	$labels = array_merge( wrrapd_occasion_canonical(), wrrapd_collect_occasion_labels( $orders, $overlays ) );
	$labels = array_values( array_unique( array_map( 'strval', $labels ) ) );
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
 * Studio — Amazon-style order blocks, Wrrapd red/gold, editable overlays (one save per gift).
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
	echo '<div id="' . esc_attr( $wrap_id ) . '" class="wrrapd-amz-root" data-ajax-url="' . esc_url( $ajax ) . '" data-nonce="' . esc_attr( $nonce ) . '">';
	echo '<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&amp;family=Fraunces:opsz,wght@9..144,500;9..144,700&amp;display=swap" />';

	echo '<style>
.wrrapd-amz-root{--wr-red:#e53935;--wr-red-deep:#c62828;--wr-red-ink:#b71c1c;--wr-sun:#ffeb3b;--wr-lemon:#fff59d;--wr-gold:#ffc107;--wr-amber:#ff8f00;--wr-ink:#1a1008;--wr-muted:#5d4037;--wr-line:#ffe082;--wr-paper:#fffde7;--wr-bar-top:#fff176;--wr-bar-bot:#ffee58;--wr-font:"DM Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--wr-display:"Fraunces",Georgia,serif;width:100%;max-width:min(100%,960px);margin:0 auto 1rem;padding:0 .35rem;font-family:var(--wr-font);font-size:.72rem;line-height:1.25;color:var(--wr-ink);-webkit-font-smoothing:antialiased;box-sizing:border-box;}
.wrrapd-amz-root *,.wrrapd-amz-root *::before,.wrrapd-amz-root *::after{box-sizing:border-box;}
.wrrapd-amz-search{margin:0 0 .35rem;}
.wrrapd-amz-search input{width:100%;max-width:min(100%,360px);padding:.22rem .45rem;border-radius:8px;border:2px solid var(--wr-gold);font-size:.68rem;background:linear-gradient(180deg,#fffef5,var(--wr-lemon));font-family:var(--wr-font);color:var(--wr-ink);box-shadow:0 1px 3px rgba(255,152,0,.2);}
.wrrapd-amz-search input:focus{outline:2px solid var(--wr-red);outline-offset:1px;border-color:var(--wr-amber);}
.wrrapd-amz-order{background:linear-gradient(180deg,#fffde7,#fff9c4);border:2px solid var(--wr-gold);border-radius:8px;margin-bottom:.5rem;box-shadow:0 2px 8px rgba(255,143,0,.15);overflow:hidden;}
.wrrapd-amz-bar{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:.25rem .75rem;padding:.35rem .5rem;background:linear-gradient(90deg,var(--wr-sun),var(--wr-lemon) 40%,#ffe082);border-bottom:3px solid var(--wr-red);}
.wrrapd-amz-bar-lbl{font-size:.58rem;font-weight:800;font-family:var(--wr-display);color:var(--wr-red-ink);letter-spacing:.07em;text-transform:uppercase;}
.wrrapd-amz-bar-date{margin-top:0;font-size:.78rem;font-weight:800;font-family:var(--wr-display);color:var(--wr-ink);}
.wrrapd-amz-bar-onum{margin-top:0;font-size:.74rem;font-weight:800;color:var(--wr-red-deep);text-align:right;font-family:var(--wr-display);}
.wrrapd-amz-bar-right{text-align:right;}
.wrrapd-amz-line{border-top:1px solid rgba(255,193,7,.5);}
.wrrapd-amz-line:first-of-type{border-top:none;}
.wrrapd-amz-line-inner{display:flex;flex-direction:row;align-items:stretch;justify-content:flex-start;gap:0;width:100%;background:linear-gradient(180deg,#fffef5,#fff8e1);}
.wrrapd-amz-fields-col{flex:1 1 auto;min-width:0;width:100%;padding:.32rem .5rem .4rem;display:flex;flex-direction:column;align-items:stretch;gap:.2rem;text-align:left;}
.wrrapd-amz-design-col{flex:0 0 118px;width:118px;max-width:118px;min-height:9rem;padding:.35rem .28rem;border-left:2px solid var(--wr-gold);background:linear-gradient(180deg,var(--wr-lemon),var(--wr-sun));display:flex;flex-direction:column;justify-content:flex-end;align-items:center;}
.wrrapd-amz-design-stack{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:.28rem;width:100%;}
.wrrapd-amz-wrap-thumb{flex:0 0 auto;width:52px;height:52px;padding:0;border:2px solid var(--wr-red);border-radius:8px;cursor:zoom-in;overflow:hidden;background:repeating-linear-gradient(-42deg,var(--wr-sun),var(--wr-sun) 7px,var(--wr-red) 7px,var(--wr-red) 14px);box-shadow:0 2px 6px rgba(229,57,53,.25);}
.wrrapd-amz-wrap-thumb.has-img{background:#1a0505;border-color:var(--wr-amber);}
.wrrapd-amz-wrap-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
.wrrapd-amz-wrap-thumb:focus{outline:2px solid var(--wr-red);outline-offset:2px;}
.wrrapd-amz-design-kind{font-size:.56rem;font-weight:800;font-family:var(--wr-display);color:var(--wr-red-deep);line-height:1.2;text-align:center;width:100%;padding:0 .1rem;}
.wrrapd-amz-bouquet-ico{font-size:1.75rem;line-height:1;display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.15));}
@media(max-width:560px){.wrrapd-amz-line-inner{flex-direction:column;}.wrrapd-amz-design-col{flex:none;max-width:none;width:100%;min-height:0;border-left:none;border-top:2px solid var(--wr-gold);}}
.wrrapd-amz-f label{display:block;font-size:.55rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--wr-red-ink);margin-bottom:.06rem;font-family:var(--wr-font);}
.wrrapd-amz-f input[type=text],.wrrapd-amz-f select{width:100%;max-width:100%;padding:.18rem .35rem;border-radius:6px;border:2px solid rgba(255,193,7,.9);font-size:.65rem;font-family:var(--wr-font);background:#fff;line-height:1.2;color:var(--wr-ink);box-shadow:inset 0 1px 0 #fff;}
.wrrapd-amz-f select{cursor:pointer;accent-color:var(--wr-red);}
.wrrapd-amz-f select:focus,.wrrapd-amz-f input[type=text]:focus{outline:2px solid var(--wr-red);border-color:var(--wr-amber);}
.wrrapd-amz-f-datewrap{max-width:11rem;width:100%;}
.wrrapd-amz-f-datewrap input[type=date]{width:100%;max-width:11rem;padding:.14rem .28rem;border-radius:6px;border:2px solid var(--wr-gold);font-size:.64rem;font-family:var(--wr-font);background:linear-gradient(180deg,#fffef8,#fffde7);color:var(--wr-ink);accent-color:var(--wr-red);}
.wrrapd-amz-f-datewrap input[type=date]:focus{outline:2px solid var(--wr-red);border-color:var(--wr-amber);}
.wrrapd-amz-f-hint{font-size:.55rem;color:var(--wr-muted);margin-top:.06rem;line-height:1.2;}
.wrrapd-amz-prodrow{display:flex;align-items:center;gap:.35rem;flex-wrap:wrap;}
.wrrapd-amz-prod-thumb{flex:0 0 auto;width:36px;height:36px;padding:0;border:2px solid var(--wr-gold);border-radius:6px;cursor:zoom-in;overflow:hidden;background:#fff;box-shadow:0 1px 4px rgba(255,143,0,.25);}
.wrrapd-amz-prod-thumb img{width:100%;height:100%;object-fit:contain;display:block;}
.wrrapd-amz-rowcheck{display:flex;align-items:center;gap:.3rem;font-size:.62rem;font-weight:700;color:var(--wr-ink);margin:.06rem 0;}
.wrrapd-amz-rowcheck input{width:15px;height:15px;accent-color:var(--wr-red);margin:0;}
.wrrapd-amz-rowcheck label{margin:0;text-transform:none;letter-spacing:0;font-size:.62rem;}
.wrrapd-amz-savebar{margin-top:.12rem;padding-top:.22rem;border-top:1px dashed rgba(255,152,0,.5);display:flex;justify-content:flex-start;}
.wrrapd-amz-save{background:linear-gradient(180deg,var(--wr-sun),var(--wr-gold));color:var(--wr-red-deep);border:2px solid var(--wr-red);border-radius:8px;padding:.24rem .85rem;font-weight:800;font-size:.64rem;cursor:pointer;font-family:var(--wr-display);letter-spacing:.03em;box-shadow:0 2px 0 rgba(183,28,28,.2);}
.wrrapd-amz-save:hover{filter:brightness(1.06);}
.wrrapd-amz-save:disabled{opacity:.55;cursor:wait;}
.wrrapd-amz-lightbox{position:fixed;inset:0;z-index:100000;background:rgba(40,20,10,.9);display:none;align-items:center;justify-content:center;padding:1rem;box-sizing:border-box;}
.wrrapd-amz-lightbox.wrrapd-amz-lightbox--open{display:flex;}
.wrrapd-amz-lb-close{position:absolute;top:.5rem;right:.6rem;width:2.1rem;height:2.1rem;border:2px solid var(--wr-sun);border-radius:50%;background:linear-gradient(180deg,var(--wr-red),var(--wr-red-deep));color:#fff;font-size:1.15rem;line-height:1;cursor:pointer;font-weight:800;}
.wrrapd-amz-lb-inner{max-width:min(96vw,900px);max-height:92vh;overflow:auto;text-align:center;}
.wrrapd-amz-lb-inner img{max-width:100%;max-height:86vh;width:auto;height:auto;object-fit:contain;border:4px solid var(--wr-gold);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.4);}
.wrrapd-amz-lb-inner .wrrapd-amz-lb-paper{width:min(85vw,520px);height:min(70vh,520px);border-radius:12px;border:4px solid var(--wr-gold);margin:0 auto;background:repeating-linear-gradient(-45deg,var(--wr-sun),var(--wr-sun) 16px,var(--wr-red) 16px,var(--wr-red) 32px);}
</style>';

	echo '<div class="wrrapd-amz-search"><input type="search" id="' . esc_attr( $search_id ) . '" aria-label="' . esc_attr__( 'Search orders, giftee, or item', 'wrrapd' ) . '" placeholder="' . esc_attr__( 'Search orders, giftee, item…', 'wrrapd' ) . '" autocomplete="off" /></div>';

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

			$api_gm = isset( $ln['giftMessage'] ) ? (string) $ln['giftMessage'] : '';
			if ( $api_gm === '' && isset( $ln['giftMessageSnippet'] ) ) {
				$api_gm = (string) $ln['giftMessageSnippet'];
			}
			$gm_val = $ov['gift_message'] !== '' ? $ov['gift_message'] : $api_gm;

			$rel_val = isset( $ov['relationship'] ) ? (string) $ov['relationship'] : '';
			$comment = isset( $ov['comment'] ) ? (string) $ov['comment'] : '';
			$gdate   = isset( $ov['gift_date'] ) ? (string) $ov['gift_date'] : '';
			$rem     = ! empty( $ov['reminder_next_year'] );

			$img_raw = isset( $ln['productImageUrl'] ) ? trim( (string) $ln['productImageUrl'] ) : '';
			$img     = $img_raw !== '' ? esc_url( $img_raw ) : '';
			$dprev_r = isset( $ln['designPreviewUrl'] ) ? trim( (string) $ln['designPreviewUrl'] ) : '';
			$dprev   = $dprev_r !== '' ? esc_url( $dprev_r ) : '';
			$dlabel  = isset( $ln['designLabel'] ) ? trim( (string) $ln['designLabel'] ) : '';
			$flowers = ! empty( $ln['flowers'] );
			$dhint   = isset( $ln['deliveryHint'] ) ? trim( (string) $ln['deliveryHint'] ) : '';

			$line_search = strtolower(
				implode(
					' ',
					array_filter(
						array(
							$giftee_val,
							$occ_sel,
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

			$wrap_lb_src  = $dprev_r !== '' ? esc_url( $dprev_r ) : '';
			$wrap_lb_type = $wrap_lb_src !== '' ? 'img' : 'paper';
			$prod_lb_src  = $img_raw !== '' ? esc_url( $img_raw ) : '';
			$design_kind  = wrrapd_studio_design_kind_label( $ln );

			echo '<div class="wrrapd-amz-line" data-order="' . esc_attr( $on ) . '" data-line="' . (int) $li . '" data-wrrapd-search="' . esc_attr( $line_search ) . '">';
			echo '<div class="wrrapd-amz-line-inner">';
			echo '<div class="wrrapd-amz-fields-col">';
			echo '<div class="wrrapd-amz-f"><label for="' . esc_attr( $wrap_id . '-g-' . $id_sfx ) . '">' . esc_html__( 'Giftee', 'wrrapd' ) . '</label>';
			echo '<input type="text" class="wrrapd-amz-f-giftee" id="' . esc_attr( $wrap_id . '-g-' . $id_sfx ) . '" maxlength="200" value="' . esc_attr( $giftee_val ) . '" /></div>';

			echo '<div class="wrrapd-amz-f"><label for="' . esc_attr( $wrap_id . '-r-' . $id_sfx ) . '">' . esc_html__( 'Relationship', 'wrrapd' ) . '</label>';
			echo '<select class="wrrapd-amz-f-rel" id="' . esc_attr( $wrap_id . '-r-' . $id_sfx ) . '">';
			echo '<option value="">' . esc_html__( '— Select —', 'wrrapd' ) . '</option>';
			foreach ( $rel_opts as $r ) {
				echo '<option value="' . esc_attr( $r ) . '"' . selected( $rel_val, $r, false ) . '>' . esc_html( $r ) . '</option>';
			}
			echo '</select></div>';

			echo '<div class="wrrapd-amz-f"><label for="' . esc_attr( $wrap_id . '-o-' . $id_sfx ) . '">' . esc_html__( 'Occasion', 'wrrapd' ) . '</label>';
			echo '<select class="wrrapd-amz-f-occ" id="' . esc_attr( $wrap_id . '-o-' . $id_sfx ) . '">';
			echo '<option value="">' . esc_html__( '— Same as checkout —', 'wrrapd' ) . '</option>';
			foreach ( $occ_opts as $lab ) {
				echo '<option value="' . esc_attr( $lab ) . '"' . selected( $occ_sel, $lab, false ) . '>' . esc_html( $lab ) . '</option>';
			}
			echo '</select></div>';

			echo '<div class="wrrapd-amz-f wrrapd-amz-f-datewrap"><label for="' . esc_attr( $wrap_id . '-d-' . $id_sfx ) . '">' . esc_html__( 'Date', 'wrrapd' ) . '</label>';
			echo '<input type="date" class="wrrapd-amz-f-date" id="' . esc_attr( $wrap_id . '-d-' . $id_sfx ) . '" value="' . esc_attr( $gdate ) . '" />';
			if ( $dhint !== '' ) {
				echo '<div class="wrrapd-amz-f-hint">' . esc_html__( 'Delivery note:', 'wrrapd' ) . ' ' . esc_html( $dhint ) . '</div>';
			}
			echo '</div>';

			echo '<div class="wrrapd-amz-f wrrapd-amz-rowcheck"><input type="checkbox" class="wrrapd-amz-f-rem" id="' . esc_attr( $wrap_id . '-m-' . $id_sfx ) . '"' . ( $rem ? ' checked' : '' ) . ' />';
			echo '<label for="' . esc_attr( $wrap_id . '-m-' . $id_sfx ) . '">' . esc_html__( 'Set reminder for next year', 'wrrapd' ) . '</label></div>';

			echo '<div class="wrrapd-amz-f"><label>' . esc_html__( 'Main image of the gift', 'wrrapd' ) . '</label>';
			echo '<div class="wrrapd-amz-prodrow">';
			if ( $prod_lb_src !== '' ) {
				echo '<button type="button" class="wrrapd-amz-prod-thumb" data-wrrapd-lb-type="img" data-wrrapd-lb-src="' . esc_attr( $prod_lb_src ) . '" aria-label="' . esc_attr__( 'Enlarge item image', 'wrrapd' ) . '"><img src="' . $img . '" alt="" loading="lazy" decoding="async" /></button>';
				echo '<span class="wrrapd-amz-f-hint">' . esc_html__( 'Click thumbnail to enlarge.', 'wrrapd' ) . '</span>';
			} else {
				echo '<span class="wrrapd-amz-f-hint">' . esc_html__( 'No product image on file.', 'wrrapd' ) . '</span>';
			}
			echo '</div></div>';

			echo '<div class="wrrapd-amz-f"><label for="' . esc_attr( $wrap_id . '-msg-' . $id_sfx ) . '">' . esc_html__( 'Gift message', 'wrrapd' ) . '</label>';
			echo '<input type="text" class="wrrapd-amz-f-msg" id="' . esc_attr( $wrap_id . '-msg-' . $id_sfx ) . '" maxlength="6000" value="' . esc_attr( $gm_val ) . '" /></div>';

			echo '<div class="wrrapd-amz-f"><label for="' . esc_attr( $wrap_id . '-c-' . $id_sfx ) . '">' . esc_html__( 'Comment', 'wrrapd' ) . '</label>';
			echo '<input type="text" class="wrrapd-amz-f-comment" id="' . esc_attr( $wrap_id . '-c-' . $id_sfx ) . '" maxlength="4000" value="' . esc_attr( $comment ) . '" /></div>';

			echo '<div class="wrrapd-amz-savebar"><button type="button" class="wrrapd-amz-save">' . esc_html__( 'Save changes', 'wrrapd' ) . '</button></div>';
			echo '</div>';

			echo '<div class="wrrapd-amz-design-col">';
			echo '<div class="wrrapd-amz-design-stack">';
			echo '<button type="button" class="wrrapd-amz-wrap-thumb' . ( $wrap_lb_src !== '' ? ' has-img' : '' ) . '" data-wrrapd-lb-type="' . esc_attr( $wrap_lb_type ) . '" data-wrrapd-lb-src="' . esc_attr( $wrap_lb_src ) . '" aria-label="' . esc_attr__( 'Enlarge wrapping preview', 'wrrapd' ) . '">';
			if ( $wrap_lb_src !== '' ) {
				echo '<img src="' . $dprev . '" alt="" loading="lazy" decoding="async" />';
			}
			echo '</button>';
			echo '<div class="wrrapd-amz-design-kind">' . esc_html( $design_kind ) . '</div>';
			if ( $flowers ) {
				echo '<span class="wrrapd-amz-bouquet-ico" role="img" aria-label="' . esc_attr__( 'Flowers included with this gift', 'wrrapd' ) . '">&#x1F490;</span>';
			}
			echo '</div></div>';

			echo '</div></div>';
			++$li;
		}
		echo '</article>';
	}

	$wrap_json   = wp_json_encode( $wrap_id );
	$search_json = wp_json_encode( $search_id );
	$lb_json     = wp_json_encode( $wrap_id . '-lb' );
	echo '<div class="wrrapd-amz-lightbox" id="' . esc_attr( $wrap_id ) . '-lb" role="dialog" aria-modal="true" aria-hidden="true"><button type="button" class="wrrapd-amz-lb-close" aria-label="' . esc_attr__( 'Close', 'wrrapd' ) . '">&times;</button><div class="wrrapd-amz-lb-inner"></div></div>';
	echo '<script>(function(){var root=document.getElementById(' . $wrap_json . ');if(!root)return;function wrrapdRmNoOrderFiles(){var re=/no\\s+order\\s+files?\\s+found/i;var sels=".elementor-widget,.elementor-element,.elementor-widget-wrap,.e-con,.e-con-inner,.jet-listing-grid,.elementor-section";try{document.querySelectorAll(sels).forEach(function(el){var t=(el.textContent||"").replace(/\\s+/g," ").trim();if(!re.test(t)||t.length>160)return;el.style.display="none";el.style.height="0";el.style.maxHeight="0";el.style.overflow="hidden";el.style.margin="0";el.style.padding="0";el.style.border="none";el.setAttribute("aria-hidden","true");});}catch(e){}}wrrapdRmNoOrderFiles();[400,1200,2800].forEach(function(ms){setTimeout(wrrapdRmNoOrderFiles,ms);});var lb=document.getElementById(' . $lb_json . ');var q=document.getElementById(' . $search_json . ');function norm(s){return(s||"").toLowerCase().trim();}function filterOrders(){var needle=norm(q?q.value:"");root.querySelectorAll(".wrrapd-amz-order").forEach(function(ord){if(!needle){ord.style.display="";return;}var hay=norm(ord.getAttribute("data-wrrapd-search"));var hit=hay.indexOf(needle)!==-1;if(!hit){ord.querySelectorAll(".wrrapd-amz-line").forEach(function(ln){if(norm(ln.getAttribute("data-wrrapd-search")).indexOf(needle)!==-1)hit=true;});}ord.style.display=hit?"":"none";});}if(q){q.addEventListener("input",filterOrders);q.addEventListener("search",filterOrders);}function openLb(t,src){if(!lb)return;var inner=lb.querySelector(".wrrapd-amz-lb-inner");inner.innerHTML="";if(t==="img"&&src){var im=document.createElement("img");im.src=src;im.alt="";im.decoding="async";inner.appendChild(im);}else{var d=document.createElement("div");d.className="wrrapd-amz-lb-paper";inner.appendChild(d);}lb.classList.add("wrrapd-amz-lightbox--open");lb.setAttribute("aria-hidden","false");}function closeLb(){if(!lb)return;lb.classList.remove("wrrapd-amz-lightbox--open");lb.setAttribute("aria-hidden","true");}root.addEventListener("click",function(e){var b=e.target.closest(".wrrapd-amz-wrap-thumb,.wrrapd-amz-prod-thumb");if(b){openLb(b.getAttribute("data-wrrapd-lb-type")||"paper",b.getAttribute("data-wrrapd-lb-src")||"");return;}if(!lb||!lb.classList.contains("wrrapd-amz-lightbox--open"))return;if(e.target.classList.contains("wrrapd-amz-lb-close")||e.target===lb)closeLb();});document.addEventListener("keydown",function(e){if(e.key!=="Escape"||!lb||!lb.classList.contains("wrrapd-amz-lightbox--open"))return;closeLb();});var ajax=root.getAttribute("data-ajax-url");var nonce=root.getAttribute("data-nonce");root.querySelectorAll(".wrrapd-amz-save").forEach(function(btn){btn.addEventListener("click",function(){var line=btn.closest(".wrrapd-amz-line");if(!line)return;var fd=new FormData();fd.append("action","wrrapd_save_order_line_overlay");fd.append("nonce",nonce);fd.append("orderNumber",line.getAttribute("data-order")||"");fd.append("lineIndex",line.getAttribute("data-line")||"0");fd.append("giftee",line.querySelector(".wrrapd-amz-f-giftee")?line.querySelector(".wrrapd-amz-f-giftee").value:"");fd.append("relationship",line.querySelector(".wrrapd-amz-f-rel")?line.querySelector(".wrrapd-amz-f-rel").value:"");fd.append("occasion_pick",line.querySelector(".wrrapd-amz-f-occ")?line.querySelector(".wrrapd-amz-f-occ").value:"");fd.append("gift_date",line.querySelector(".wrrapd-amz-f-date")?line.querySelector(".wrrapd-amz-f-date").value:"");fd.append("reminder_next_year",line.querySelector(".wrrapd-amz-f-rem")&&line.querySelector(".wrrapd-amz-f-rem").checked?"1":"");fd.append("gift_message",line.querySelector(".wrrapd-amz-f-msg")?line.querySelector(".wrrapd-amz-f-msg").value:"");fd.append("comment",line.querySelector(".wrrapd-amz-f-comment")?line.querySelector(".wrrapd-amz-f-comment").value:"");btn.disabled=true;fetch(ajax,{method:"POST",body:fd,credentials:"same-origin"}).then(function(r){return r.json();}).then(function(j){btn.disabled=false;if(j&&j.success){btn.style.boxShadow="0 0 0 2px rgba(201,162,39,.9)";window.setTimeout(function(){btn.style.boxShadow="";},650);}else{btn.style.opacity="0.65";window.setTimeout(function(){btn.style.opacity="";},900);}}).catch(function(){btn.disabled=false;});});});})();</script>';

	echo '</div>';
	return (string) ob_get_clean();
}

/**
 * Shortcode: [wrrapd_review_orders] or [wrrapd_review_orders layout="rich"|"cards"|"studio"]
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
	if ( $layout === 'studio' ) {
		$ov = wrrapd_get_line_overlays( (int) $user->ID );
		return wrrapd_render_orders_studio( $orders, $ov );
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

	$gift_message = isset( $_POST['gift_message'] ) ? sanitize_textarea_field( wp_unslash( $_POST['gift_message'] ) ) : '';
	if ( strlen( $gift_message ) > 6000 ) {
		wp_send_json_error( array( 'message' => __( 'Gift message is too long.', 'wrrapd' ) ), 400 );
	}

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
		$gift_message === '' &&
		$comment === ''
	);

	if ( $is_empty ) {
		unset( $all[ $order ][ $key ] );
		if ( empty( $all[ $order ] ) ) {
			unset( $all[ $order ] );
		}
	} else {
		$all[ $order ][ $key ] = array(
			'giftee'              => $giftee,
			'relationship'        => $relationship,
			'occasion_pick'       => $pick,
			'gift_date'           => $gift_date,
			'reminder_next_year'  => $reminder,
			'gift_message'        => $gift_message,
			'comment'             => $comment,
		);
	}

	update_user_meta( $uid, WRRAPD_LINE_OVERLAYS_META, $all );
	wp_send_json_success();
}
add_action( 'wp_ajax_wrrapd_save_order_line_overlay', 'wrrapd_ajax_save_order_line_overlay' );
