<?php
/**
 * Wrrapd seasonal campaigns — auto-themed homepage hero, hot-gifts rail, admin reminder emails.
 *
 * Loaded by wrrapd-orders-bridge.php. Requires wrrapd-campaigns.json in the same folder.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Max cards in the homepage hot-gifts product rail. */
if ( ! defined( 'WRRAPD_HOT_GIFTS_RAIL_MAX' ) ) {
	define( 'WRRAPD_HOT_GIFTS_RAIL_MAX', 10 );
}

/**
 * @return array<string, mixed>|null
 */
function wrrapd_campaigns_config() {
	static $cfg = null;
	if ( $cfg !== null ) {
		return $cfg;
	}
	$path = dirname( __FILE__ ) . '/wrrapd-campaigns.json';
	if ( ! is_readable( $path ) ) {
		$cfg = null;
		return null;
	}
	$raw = file_get_contents( $path );
	$dec = is_string( $raw ) ? json_decode( $raw, true ) : null;
	$cfg = is_array( $dec ) ? $dec : null;
	return $cfg;
}

/**
 * @return DateTimeImmutable|null
 */
function wrrapd_campaigns_now() {
	$cfg = wrrapd_campaigns_config();
	$tz  = ( $cfg && ! empty( $cfg['timezone'] ) && is_string( $cfg['timezone'] ) ) ? $cfg['timezone'] : 'America/New_York';
	try {
		return new DateTimeImmutable( 'now', new DateTimeZone( $tz ) );
	} catch ( Exception $e ) {
		return new DateTimeImmutable( 'now', new DateTimeZone( 'America/New_York' ) );
	}
}

/**
 * Grace days after a holiday (late gifters). Config default 4.
 */
function wrrapd_campaign_grace_days() {
	$cfg = wrrapd_campaigns_config();
	$n   = ( $cfg && isset( $cfg['grace_days_after_holiday'] ) ) ? (int) $cfg['grace_days_after_holiday'] : 4;
	return max( 3, min( 4, $n ) );
}

/**
 * Lead days before a holiday. Config default 21.
 */
function wrrapd_campaign_lead_days() {
	$cfg = wrrapd_campaigns_config();
	$n   = ( $cfg && isset( $cfg['lead_days_before_holiday'] ) ) ? (int) $cfg['lead_days_before_holiday'] : 21;
	return max( 1, $n );
}

/**
 * Priority rank — lower wins when multiple holiday windows overlap (Christian first).
 *
 * @param string $tier christian|american|other
 */
function wrrapd_campaign_tier_rank( $tier ) {
	$map = array(
		'christian' => 0,
		'american'  => 1,
		'other'     => 2,
	);
	$t = strtolower( (string) $tier );
	return isset( $map[ $t ] ) ? $map[ $t ] : 3;
}

/**
 * @param int $year       Four-digit year.
 * @param int $month      1–12.
 * @param int $weekday    0=Sun … 6=Sat.
 * @param int $occurrence 1=first …
 */
function wrrapd_nth_weekday_of_month( $year, $month, $weekday, $occurrence ) {
	$count = 0;
	for ( $day = 1; $day <= 31; $day++ ) {
		try {
			$dt = new DateTimeImmutable( sprintf( '%04d-%02d-%02d', $year, $month, $day ) );
		} catch ( Exception $e ) {
			break;
		}
		if ( (int) $dt->format( 'n' ) !== $month ) {
			break;
		}
		if ( (int) $dt->format( 'w' ) === $weekday ) {
			++$count;
			if ( $count === $occurrence ) {
				return $dt;
			}
		}
	}
	return null;
}

/**
 * Western Easter Sunday (matches occasion ticker JS).
 */
function wrrapd_easter_sunday( $year ) {
	$year = (int) $year;
	$a    = $year % 19;
	$b    = (int) floor( $year / 100 );
	$c    = $year % 100;
	$d    = (int) floor( $b / 4 );
	$e    = $b % 4;
	$f    = (int) floor( ( $b + 8 ) / 25 );
	$g    = (int) floor( ( $b - $f + 1 ) / 3 );
	$h    = ( 19 * $a + $b - $d - $g + 15 ) % 30;
	$i    = (int) floor( $c / 4 );
	$k    = $c % 4;
	$l    = ( 32 + 2 * $e + 2 * $i - $h - $k ) % 7;
	$m    = (int) floor( ( $a + 11 * $h + 22 * $l ) / 451 );
	$mo   = (int) floor( ( $h + $l - 7 * $m + 114 ) / 31 );
	$dy   = ( ( $h + $l - 7 * $m + 114 ) % 31 ) + 1;
	try {
		return new DateTimeImmutable( sprintf( '%04d-%02d-%02d', $year, $mo, $dy ) );
	} catch ( Exception $e ) {
		return null;
	}
}

/**
 * Chinese New Year — same lookup table as occasion ticker.
 *
 * @return array<int, array{0:int,1:int}>|null
 */
function wrrapd_cny_lookup() {
	return array(
		2025 => array( 0, 29 ), 2026 => array( 1, 17 ), 2027 => array( 1, 6 ), 2028 => array( 0, 26 ),
		2029 => array( 1, 13 ), 2030 => array( 1, 3 ), 2031 => array( 0, 23 ), 2032 => array( 1, 11 ),
		2033 => array( 0, 31 ), 2034 => array( 1, 19 ), 2035 => array( 1, 8 ), 2036 => array( 0, 28 ),
	);
}

/**
 * Hanukkah first night — same lookup table as occasion ticker.
 *
 * @return array<int, array{0:int,1:int}>|null
 */
function wrrapd_hanukkah_lookup() {
	return array(
		2025 => array( 11, 15 ), 2026 => array( 11, 4 ), 2027 => array( 11, 23 ), 2028 => array( 11, 12 ),
		2029 => array( 11, 2 ), 2030 => array( 11, 20 ), 2031 => array( 11, 9 ), 2032 => array( 11, 27 ),
		2033 => array( 11, 16 ), 2034 => array( 11, 5 ), 2035 => array( 11, 23 ), 2036 => array( 11, 11 ),
	);
}

/**
 * Dated holidays for one calendar year (aligned with occasion ticker).
 *
 * @return list<array{key:string,tier:string,date:DateTimeImmutable}>
 */
function wrrapd_ticker_holidays_for_year( $year, DateTimeZone $tz ) {
	$year = (int) $year;
	$out  = array();

	$add = static function ( $key, $tier, DateTimeImmutable $date ) use ( &$out ) {
		$out[] = array(
			'key'  => (string) $key,
			'tier' => (string) $tier,
			'date' => $date,
		);
	};

	$cny = wrrapd_cny_lookup();
	if ( isset( $cny[ $year ] ) ) {
		$p = $cny[ $year ];
		try {
			$add( 'chinese-new-year', 'other', new DateTimeImmutable( sprintf( '%04d-%02d-%02d', $year, $p[0] + 1, $p[1] ), $tz ) );
		} catch ( Exception $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement.DetectedCatch
		}
	}

	try {
		$add( 'valentines', 'christian', new DateTimeImmutable( sprintf( '%04d-02-14', $year ), $tz ) );
		$add( 'st-patricks', 'christian', new DateTimeImmutable( sprintf( '%04d-03-17', $year ), $tz ) );
	} catch ( Exception $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement.DetectedCatch
	}

	$easter = wrrapd_easter_sunday( $year );
	if ( $easter ) {
		$add( 'easter', 'christian', $easter->setTimezone( $tz ) );
	}

	$md = wrrapd_nth_weekday_of_month( $year, 5, 0, 2 );
	if ( $md ) {
		$add( 'mothers-day', 'christian', $md->setTimezone( $tz ) );
	}
	$fd = wrrapd_nth_weekday_of_month( $year, 6, 0, 3 );
	if ( $fd ) {
		$add( 'fathers-day', 'christian', $fd->setTimezone( $tz ) );
	}

	try {
		$add( 'july-fourth', 'american', new DateTimeImmutable( sprintf( '%04d-07-04', $year ), $tz ) );
	} catch ( Exception $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement.DetectedCatch
	}

	$ld = wrrapd_nth_weekday_of_month( $year, 9, 1, 1 );
	if ( $ld ) {
		$add( 'labor-day', 'american', $ld->setTimezone( $tz ) );
	}

	$tg = wrrapd_nth_weekday_of_month( $year, 11, 4, 4 );
	if ( $tg ) {
		$add( 'thanksgiving', 'american', $tg->setTimezone( $tz ) );
	}

	$han = wrrapd_hanukkah_lookup();
	if ( isset( $han[ $year ] ) ) {
		$p = $han[ $year ];
		try {
			$add( 'hanukkah', 'other', new DateTimeImmutable( sprintf( '%04d-%02d-%02d', $year, $p[0] + 1, $p[1] ), $tz ) );
		} catch ( Exception $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement.DetectedCatch
		}
	}

	try {
		$add( 'christmas', 'christian', new DateTimeImmutable( sprintf( '%04d-12-25', $year ), $tz ) );
		$add( 'new-years', 'american', new DateTimeImmutable( sprintf( '%04d-01-01', $year ), $tz ) );
	} catch ( Exception $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement.DetectedCatch
	}

	usort(
		$out,
		static function ( $a, $b ) {
			return $a['date'] <=> $b['date'];
		}
	);
	return $out;
}

/**
 * Promo windows: 21 days before holiday (except Christmas → day after Veterans Day), through grace days after.
 * Next holiday cannot start until previous holiday's grace period ends.
 *
 * @return list<array{key:string,tier:string,date:DateTimeImmutable,start:DateTimeImmutable,end:DateTimeImmutable}>
 */
function wrrapd_holiday_windows_for_year( $year, DateTimeZone $tz ) {
	$holidays = wrrapd_ticker_holidays_for_year( $year, $tz );
	$lead     = wrrapd_campaign_lead_days();
	$grace    = wrrapd_campaign_grace_days();
	$windows  = array();
	$prev_end = null;

	foreach ( $holidays as $h ) {
		$key  = $h['key'];
		$date = $h['date'];
		$end  = $date->modify( '+' . $grace . ' days' );

		if ( $key === 'christmas' ) {
			try {
				$start = new DateTimeImmutable( $date->format( 'Y' ) . '-11-12', $tz );
			} catch ( Exception $e ) {
				$start = $date->modify( '-' . $lead . ' days' );
			}
		} else {
			$start = $date->modify( '-' . $lead . ' days' );
		}

		if ( $prev_end !== null ) {
			$min_start = $prev_end->modify( '+1 day' );
			if ( $key !== 'christmas' && $start < $min_start ) {
				$start = $min_start;
			}
		}

		// Labor Day is a short weekend — end on the holiday so Aug/Sep BTS + wedding themes take over the next day.
		if ( $key === 'labor-day' ) {
			$end = $date;
		}

		if ( $start <= $end ) {
			$windows[] = array(
				'key'   => $key,
				'tier'  => $h['tier'],
				'date'  => $date,
				'start' => $start,
				'end'   => $end,
			);
			if ( $prev_end === null || $end > $prev_end ) {
				$prev_end = $end;
			}
		}
	}
	return $windows;
}

/**
 * All windows that might apply around $now (this year + next).
 *
 * @return list<array{key:string,tier:string,date:DateTimeImmutable,start:DateTimeImmutable,end:DateTimeImmutable}>
 */
function wrrapd_all_holiday_windows( DateTimeImmutable $now ) {
	$tz = $now->getTimezone();
	$y  = (int) $now->format( 'Y' );
	$all = array_merge(
		wrrapd_holiday_windows_for_year( $y, $tz ),
		wrrapd_holiday_windows_for_year( $y + 1, $tz )
	);
	usort(
		$all,
		static function ( $a, $b ) {
			return $a['start'] <=> $b['start'];
		}
	);
	return $all;
}

/**
 * @param array{key:string,tier:string,date:DateTimeImmutable,start:DateTimeImmutable,end:DateTimeImmutable} $a
 * @param array{key:string,tier:string,date:DateTimeImmutable,start:DateTimeImmutable,end:DateTimeImmutable} $b
 */
function wrrapd_compare_holiday_windows( $a, $b ) {
	$ra = wrrapd_campaign_tier_rank( $a['tier'] );
	$rb = wrrapd_campaign_tier_rank( $b['tier'] );
	if ( $ra !== $rb ) {
		return $ra - $rb;
	}
	return $a['date'] <=> $b['date'];
}

/**
 * Windows containing $today (start of day comparison).
 *
 * @return list<array{key:string,tier:string,date:DateTimeImmutable,start:DateTimeImmutable,end:DateTimeImmutable}>
 */
function wrrapd_active_holiday_windows( DateTimeImmutable $now ) {
	$today = $now->setTime( 0, 0, 0 );
	$out   = array();
	foreach ( wrrapd_all_holiday_windows( $now ) as $w ) {
		$start = $w['start']->setTime( 0, 0, 0 );
		$end   = $w['end']->setTime( 23, 59, 59 );
		if ( $today >= $start && $today <= $end ) {
			$out[] = $w;
		}
	}
	return $out;
}

/**
 * @return array<string, mixed>|null
 */
function wrrapd_campaign_by_key( $key, $cfg = null ) {
	if ( ! is_array( $cfg ) ) {
		$cfg = wrrapd_campaigns_config();
	}
	if ( ! $cfg || empty( $cfg['campaigns'] ) || ! is_array( $cfg['campaigns'] ) ) {
		return null;
	}
	foreach ( $cfg['campaigns'] as $c ) {
		if ( ! is_array( $c ) ) {
			continue;
		}
		if ( ! empty( $c['holiday_key'] ) && (string) $c['holiday_key'] === (string) $key ) {
			return $c;
		}
		if ( ! empty( $c['slug'] ) && (string) $c['slug'] === (string) $key ) {
			return $c;
		}
	}
	return null;
}

/**
 * True when we are in a between-holiday gap long enough for generic messaging.
 */
function wrrapd_should_use_generic_gap( DateTimeImmutable $now ) {
	$next = wrrapd_next_campaign_start( $now );
	if ( ! $next || empty( $next['starts_on'] ) ) {
		return true;
	}
	$today = $now->setTime( 0, 0, 0 );
	$start = $next['starts_on']->setTime( 0, 0, 0 );
	$days  = (int) $today->diff( $start )->format( '%r%a' );
	return $days > wrrapd_campaign_lead_days();
}

/**
 * Interleave two hot-gift lists (back-to-school + weddings in late summer).
 *
 * @param list<array<string, mixed>> $a
 * @param list<array<string, mixed>> $b
 * @return list<array<string, mixed>>
 */
function wrrapd_interleave_hot_gifts( array $a, array $b, $limit = 10 ) {
	$limit = max( 1, min( WRRAPD_HOT_GIFTS_RAIL_MAX, (int) $limit ) );
	$out   = array();
	$i     = 0;
	$seen  = array();
	while ( count( $out ) < $limit && ( $i < count( $a ) || $i < count( $b ) ) ) {
		foreach ( array( $a, $b ) as $list ) {
			if ( count( $out ) >= $limit || $i >= count( $list ) || ! is_array( $list[ $i ] ) ) {
				continue;
			}
			$g = $list[ $i ];
			$key = isset( $g['href'] ) ? (string) $g['href'] : ( isset( $g['title'] ) ? (string) $g['title'] : '' );
			if ( $key !== '' && isset( $seen[ $key ] ) ) {
				continue;
			}
			if ( $key !== '' ) {
				$seen[ $key ] = true;
			}
			$out[] = $g;
		}
		$i++;
	}
	return $out;
}

/**
 * Generic theme for gaps (after grace, before next holiday window).
 * When $force is true (no active holiday window), always pick a generic — never return null.
 *
 * @return array<string, mixed>|null
 */
function wrrapd_generic_campaign_for_gap( DateTimeImmutable $now, $cfg = null, $force = false ) {
	if ( ! $force && ! wrrapd_should_use_generic_gap( $now ) ) {
		return null;
	}
	if ( ! is_array( $cfg ) ) {
		$cfg = wrrapd_campaigns_config();
	}
	$month = (int) $now->format( 'n' );
	// Late summer: back-to-school + wedding season (interleaved featured picks).
	if ( $month >= 8 && $month <= 9 ) {
		$bts = wrrapd_campaign_by_key( 'generic-back-to-school', $cfg );
		$wed = wrrapd_campaign_by_key( 'generic-weddings', $cfg );
		if ( $bts ) {
			$bts_gifts = ( ! empty( $bts['hot_gifts'] ) && is_array( $bts['hot_gifts'] ) ) ? $bts['hot_gifts'] : array();
			$wed_gifts = ( $wed && ! empty( $wed['hot_gifts'] ) && is_array( $wed['hot_gifts'] ) ) ? $wed['hot_gifts'] : array();
			$limit     = wrrapd_campaign_hot_gifts_display_count( $bts, 10 );
			$bts['hot_gifts']       = wrrapd_interleave_hot_gifts( $bts_gifts, $wed_gifts, $limit );
			$bts['hot_gifts_title'] = 'Back-to-school & wedding picks';
			return $bts;
		}
		if ( $wed ) {
			return $wed;
		}
	}
	if ( $month === 7 ) {
		$c = wrrapd_campaign_by_key( 'generic-weddings', $cfg );
		if ( $c ) {
			return $c;
		}
	}
	$week = (int) $now->format( 'W' );
	if ( $week % 2 === 0 ) {
		$c = wrrapd_campaign_by_key( 'generic-corporate', $cfg );
		if ( $c ) {
			return $c;
		}
	}
	return wrrapd_campaign_by_key( 'generic-birthdays', $cfg );
}

/**
 * Active campaign: ticker-aligned windows, Christian > American > Other, gap generics.
 *
 * @return array<string, mixed>|null
 */
function wrrapd_active_campaign( $now = null ) {
	if ( ! $now instanceof DateTimeImmutable ) {
		$now = wrrapd_campaigns_now();
	}
	if ( ! $now ) {
		return null;
	}
	$cfg    = wrrapd_campaigns_config();
	$active = wrrapd_active_holiday_windows( $now );
	if ( count( $active ) > 0 ) {
		usort( $active, 'wrrapd_compare_holiday_windows' );
		$win = $active[0];
		$c   = wrrapd_campaign_by_key( $win['key'], $cfg );
		if ( $c ) {
			return $c;
		}
	}
	return wrrapd_generic_campaign_for_gap( $now, $cfg, true );
}

/**
 * Next theme switch (window start) for admin reminder emails.
 *
 * @return array{campaign: array<string, mixed>, starts_on: DateTimeImmutable}|null
 */
function wrrapd_next_campaign_start( $now = null ) {
	if ( ! $now instanceof DateTimeImmutable ) {
		$now = wrrapd_campaigns_now();
	}
	if ( ! $now ) {
		return null;
	}
	$cfg   = wrrapd_campaigns_config();
	$today = $now->setTime( 0, 0, 0 );
	$best  = null;

	foreach ( wrrapd_all_holiday_windows( $now ) as $w ) {
		$start = $w['start']->setTime( 0, 0, 0 );
		if ( $start <= $today ) {
			continue;
		}
		$c = wrrapd_campaign_by_key( $w['key'], $cfg );
		if ( ! $c ) {
			continue;
		}
		if ( $best === null || $start < $best['starts_on'] ) {
			$best = array(
				'campaign'  => $c,
				'starts_on' => $start,
			);
		}
	}
	return $best;
}

/**
 * @param string $md MM-DD
 * @param string $start MM-DD
 * @param string $end MM-DD
 * @deprecated Use wrrapd_active_campaign() ticker calendar.
 */
function wrrapd_campaign_md_in_range( $md, $start, $end ) {
	if ( $start <= $end ) {
		return $md >= $start && $md <= $end;
	}
	return $md >= $start || $md <= $end;
}

/**
 * Stable retailer key for hot-gifts caps (max N per retailer).
 *
 * @param array<string, mixed> $gift
 */
function wrrapd_campaign_gift_retailer_key( array $gift ) {
	if ( ! empty( $gift['retailer_slug'] ) && is_string( $gift['retailer_slug'] ) ) {
		return sanitize_key( strtolower( (string) $gift['retailer_slug'] ) );
	}
	if ( ! empty( $gift['retailer'] ) && is_string( $gift['retailer'] ) ) {
		return sanitize_key( strtolower( (string) $gift['retailer'] ) );
	}
	if ( ! empty( $gift['domain'] ) && is_string( $gift['domain'] ) ) {
		return sanitize_key( preg_replace( '#^www\.#', '', strtolower( (string) $gift['domain'] ) ) );
	}
	return 'unknown';
}

/**
 * @param array<string, mixed> $gift
 * @param array<string, true>  $categories_seen
 */
function wrrapd_campaign_hot_gift_passes_category( array $gift, array $categories_seen ) {
	$cat = isset( $gift['category'] ) ? strtolower( trim( (string) $gift['category'] ) ) : '';
	if ( $cat === '' ) {
		return true;
	}
	return ! isset( $categories_seen[ $cat ] );
}

/**
 * @param list<array<string, mixed>> $ordered
 * @return list<array<string, mixed>>
 */
function wrrapd_campaign_hot_gifts_pick_constrained( array $ordered, $count, $max_per_retailer, $min_retailers, $diverse_categories ) {
	$count            = max( 1, min( WRRAPD_HOT_GIFTS_RAIL_MAX, (int) $count ) );
	$max_per_retailer = max( 1, (int) $max_per_retailer );
	$min_retailers    = max( 1, min( $count, (int) $min_retailers ) );
	$out              = array();
	$retailer_counts  = array();
	$categories_seen  = array();
	$used_keys        = array();

	$try_add = static function ( array $g ) use ( &$out, &$retailer_counts, &$categories_seen, &$used_keys, $count, $max_per_retailer, $diverse_categories ) {
		if ( count( $out ) >= $count ) {
			return false;
		}
		$key = isset( $g['product'] ) ? sanitize_key( (string) $g['product'] ) : sanitize_key( (string) ( $g['title'] ?? '' ) );
		if ( $key !== '' && isset( $used_keys[ $key ] ) ) {
			return false;
		}
		$rk = wrrapd_campaign_gift_retailer_key( $g );
		if ( ( $retailer_counts[ $rk ] ?? 0 ) >= $max_per_retailer ) {
			return false;
		}
		if ( $diverse_categories && ! wrrapd_campaign_hot_gift_passes_category( $g, $categories_seen ) ) {
			return false;
		}
		$out[] = $g;
		if ( $key !== '' ) {
			$used_keys[ $key ] = true;
		}
		$retailer_counts[ $rk ] = ( $retailer_counts[ $rk ] ?? 0 ) + 1;
		$cat                    = isset( $g['category'] ) ? strtolower( trim( (string) $g['category'] ) ) : '';
		if ( $cat !== '' ) {
			$categories_seen[ $cat ] = true;
		}
		return true;
	};

	foreach ( $ordered as $g ) {
		if ( ! is_array( $g ) || count( $out ) >= $count ) {
			break;
		}
		$rk = wrrapd_campaign_gift_retailer_key( $g );
		if ( ( $retailer_counts[ $rk ] ?? 0 ) > 0 ) {
			continue;
		}
		$try_add( $g );
	}
	foreach ( $ordered as $g ) {
		if ( ! is_array( $g ) || count( $out ) >= $count ) {
			break;
		}
		$try_add( $g );
	}
	if ( count( array_keys( $retailer_counts ) ) < $min_retailers ) {
		foreach ( $ordered as $g ) {
			if ( ! is_array( $g ) || count( $out ) >= $count ) {
				break;
			}
			$rk = wrrapd_campaign_gift_retailer_key( $g );
			if ( ( $retailer_counts[ $rk ] ?? 0 ) > 0 ) {
				continue;
			}
			$key = isset( $g['product'] ) ? sanitize_key( (string) $g['product'] ) : sanitize_key( (string) ( $g['title'] ?? '' ) );
			if ( $key !== '' && isset( $used_keys[ $key ] ) ) {
				continue;
			}
			if ( ( $retailer_counts[ $rk ] ?? 0 ) >= $max_per_retailer ) {
				continue;
			}
			$out[] = $g;
			if ( $key !== '' ) {
				$used_keys[ $key ] = true;
			}
			$retailer_counts[ $rk ] = ( $retailer_counts[ $rk ] ?? 0 ) + 1;
		}
	}
	// Pad to full rail length so mobile 5-col doesn't leave an orphan row (e.g. 5+3).
	if ( count( $out ) < $count ) {
		foreach ( $ordered as $g ) {
			if ( ! is_array( $g ) || count( $out ) >= $count ) {
				break;
			}
			$key = isset( $g['product'] ) ? sanitize_key( (string) $g['product'] ) : sanitize_key( (string) ( $g['title'] ?? '' ) );
			if ( $key !== '' && isset( $used_keys[ $key ] ) ) {
				continue;
			}
			$out[] = $g;
			if ( $key !== '' ) {
				$used_keys[ $key ] = true;
			}
		}
	}
	return array_slice( $out, 0, $count );
}

/**
 * How many hot-gift cards to show in the homepage rail.
 *
 * @param array<string, mixed> $campaign
 */
function wrrapd_campaign_hot_gifts_display_count( array $campaign, $default = 10 ) {
	$n = isset( $campaign['hot_gifts_display_count'] ) ? (int) $campaign['hot_gifts_display_count'] : $default;
	return max( 1, min( WRRAPD_HOT_GIFTS_RAIL_MAX, $n ) );
}

/**
 * Pick N hot gifts for this week (stable rotation).
 *
 * @param array<string, mixed> $campaign
 * @return list<array<string, mixed>>
 */
function wrrapd_campaign_hot_gifts_pick( array $campaign, $count = 6 ) {
	$count = max( 1, min( WRRAPD_HOT_GIFTS_RAIL_MAX, (int) $count ) );
	$pool  = array();
	if ( ! empty( $campaign['hot_gifts'] ) && is_array( $campaign['hot_gifts'] ) ) {
		foreach ( $campaign['hot_gifts'] as $g ) {
			if ( is_array( $g ) && ! empty( $g['title'] ) ) {
				$pool[] = $g;
			}
		}
	}
	$price_min = isset( $campaign['hot_gifts_price_min'] ) ? (float) $campaign['hot_gifts_price_min'] : 0;
	$price_max = isset( $campaign['hot_gifts_price_max'] ) ? (float) $campaign['hot_gifts_price_max'] : 0;
		if ( $price_min > 0 || $price_max > 0 ) {
			$pool = array_values(
				array_filter(
					$pool,
					static function ( $g ) use ( $price_min, $price_max ) {
						if ( ! is_array( $g ) ) {
							return false;
						}
						$p = isset( $g['price_approx'] ) ? (float) $g['price_approx'] : 0;
						if ( $p <= 0 ) {
							return true;
						}
						if ( $price_min > 0 && $p < $price_min ) {
							return false;
						}
						if ( $price_max > 0 && $p > $price_max ) {
							return false;
						}
						return true;
					}
				)
			);
		}
		if ( ! empty( $campaign['hot_gifts_diverse_categories'] ) ) {
			$seen = array();
			$pool = array_values(
				array_filter(
					$pool,
					static function ( $g ) use ( &$seen ) {
						if ( ! is_array( $g ) ) {
							return false;
						}
						$cat = isset( $g['category'] ) ? strtolower( trim( (string) $g['category'] ) ) : '';
						if ( $cat === '' ) {
							return true;
						}
						if ( isset( $seen[ $cat ] ) ) {
							return false;
						}
						$seen[ $cat ] = true;
						return true;
					}
				)
			);
		}
	$max_per_retailer = isset( $campaign['hot_gifts_max_per_retailer'] ) ? (int) $campaign['hot_gifts_max_per_retailer'] : 2;
	$min_retailers    = isset( $campaign['hot_gifts_min_retailers'] ) ? (int) $campaign['hot_gifts_min_retailers'] : 4;
	$diverse_cats     = ! empty( $campaign['hot_gifts_diverse_categories'] );
	if ( count( $pool ) < $count ) {
		$cfg = wrrapd_campaigns_config();
		// Prefer real product photos from other campaigns before logo-only evergreen cards.
		if ( $cfg && ! empty( $cfg['campaigns'] ) && is_array( $cfg['campaigns'] ) ) {
			foreach ( $cfg['campaigns'] as $other ) {
				if ( ! is_array( $other ) || empty( $other['hot_gifts'] ) || ! is_array( $other['hot_gifts'] ) ) {
					continue;
				}
				if ( isset( $campaign['slug'], $other['slug'] ) && (string) $campaign['slug'] === (string) $other['slug'] ) {
					continue;
				}
				foreach ( $other['hot_gifts'] as $g ) {
					if ( is_array( $g ) && ! empty( $g['title'] ) && wrrapd_campaign_gift_has_real_product_image( $g ) ) {
						$pool[] = $g;
					}
				}
				if ( count( $pool ) >= $count ) {
					break;
				}
			}
		}
		if ( count( $pool ) < $count && $cfg && ! empty( $cfg['evergreen_hot_gifts'] ) && is_array( $cfg['evergreen_hot_gifts'] ) ) {
			foreach ( $cfg['evergreen_hot_gifts'] as $g ) {
				if ( is_array( $g ) && ! empty( $g['title'] ) ) {
					$pool[] = $g;
				}
			}
		}
	}
	if ( count( $pool ) === 0 ) {
		return array();
	}
	$with_photo = array_values(
		array_filter(
			$pool,
			static function ( $g ) {
				return is_array( $g ) && wrrapd_campaign_gift_has_real_product_image( $g );
			}
		)
	);
	if ( count( $with_photo ) >= $count ) {
		$pool = $with_photo;
	}
	$pinned = array();
	$rest   = array();
	foreach ( $pool as $g ) {
		if ( ! is_array( $g ) ) {
			continue;
		}
		if ( ! empty( $g['pin'] ) || ! empty( $g['pinned'] ) ) {
			$pinned[] = $g;
		} else {
			$rest[] = $g;
		}
	}
	$rotate = count( $rest ) > 0 ? $rest : $pool;
	$now    = wrrapd_campaigns_now();
	$seed   = ( $now ? $now->format( 'o-W' ) : gmdate( 'o-W' ) ) . '|' . ( isset( $campaign['slug'] ) ? (string) $campaign['slug'] : 'x' );
	$off    = abs( crc32( $seed ) ) % count( $rotate );
	$ordered = $pinned;
	for ( $i = 0; $i < count( $rotate ); ++$i ) {
		$ordered[] = $rotate[ ( $off + $i ) % count( $rotate ) ];
	}
	return wrrapd_campaign_hot_gifts_pick_constrained( $ordered, $count, $max_per_retailer, $min_retailers, $diverse_cats );
}

/**
 * True when the gift has a real product photo (not a favicon or retailer logo fallback).
 *
 * @param array<string, mixed> $gift
 */
function wrrapd_campaign_gift_has_real_product_image( array $gift ) {
	if ( empty( $gift['image'] ) || ! is_string( $gift['image'] ) ) {
		return false;
	}
	$url = trim( (string) $gift['image'] );
	if ( $url === '' ) {
		return false;
	}
	if ( strpos( $url, 'favicons' ) !== false || strpos( $url, 'google.com/s2/favicons' ) !== false ) {
		return false;
	}
	return true;
}

/**
 * @param array<string, mixed> $gift
 */
function wrrapd_campaign_gift_image_url( array $gift ) {
	if ( ! wrrapd_campaign_gift_has_real_product_image( $gift ) ) {
		return '';
	}
	$url = trim( (string) $gift['image'] );
	if ( strpos( $url, 'covers.openlibrary.org' ) !== false ) {
		$url = preg_replace( '/-L\.jpg$/', '-M.jpg', $url );
	}
	return esc_url( $url );
}

/**
 * @param array<string, mixed> $gift
 */
function wrrapd_campaign_gift_retailer_name( array $gift ) {
	if ( ! empty( $gift['retailer'] ) && is_string( $gift['retailer'] ) ) {
		return trim( (string) $gift['retailer'] );
	}
	if ( ! empty( $gift['retailer_name'] ) && is_string( $gift['retailer_name'] ) ) {
		return trim( (string) $gift['retailer_name'] );
	}
	$title = isset( $gift['title'] ) ? (string) $gift['title'] : '';
	if ( $title !== '' && strpos( $title, '—' ) === false && strpos( $title, ' - ' ) === false ) {
		return '';
	}
	return $title;
}

/**
 * @param array<string, mixed> $gift
 */
function wrrapd_campaign_gift_logo_url( array $gift ) {
	if ( ! empty( $gift['retailer_slug'] ) && function_exists( 'wrrapd_mu_logo_url_for_slug' ) ) {
		$slug = preg_replace( '/[^a-z0-9_-]/', '', strtolower( (string) $gift['retailer_slug'] ) );
		$dom  = isset( $gift['domain'] ) ? (string) $gift['domain'] : $slug . '.com';
		if ( $slug !== '' ) {
			return wrrapd_mu_logo_url_for_slug( $slug, $dom );
		}
	}
	$dom = isset( $gift['domain'] ) ? preg_replace( '#^www\.#', '', strtolower( (string) $gift['domain'] ) ) : '';
	if ( $dom === '' ) {
		return '';
	}
	return 'https://www.google.com/s2/favicons?domain=' . rawurlencode( $dom ) . '&sz=256';
}

/**
 * @param array<string, mixed> $gift
 * @return array{src: string, width: int, height: int, srcset: string, sizes: string}
 */
function wrrapd_campaign_gift_logo_img_meta( array $gift, $display_css_px = 32 ) {
	$url = wrrapd_campaign_gift_logo_url( $gift );
	if ( $url === '' ) {
		return array(
			'src'     => '',
			'width'   => 0,
			'height'  => 0,
			'srcset'  => '',
			'sizes'   => '',
		);
	}
	$intrinsic = 256;
	if ( strpos( $url, '/logos/' ) !== false || preg_match( '#mu-plugins/logos/#', $url ) ) {
		$intrinsic = 512;
	}
	$render = max( 64, (int) round( $display_css_px * 2 ) );
	return array(
		'src'     => $url,
		'width'   => $render,
		'height'  => $render,
		'srcset'  => $intrinsic > $render ? ( $url . ' ' . $intrinsic . 'w' ) : '',
		'sizes'   => $display_css_px . 'px',
	);
}

/**
 * @param array<string, mixed> $gift
 */
function wrrapd_campaign_gift_product_img_meta( array $gift ) {
	$url = wrrapd_campaign_gift_image_url( $gift );
	if ( $url === '' ) {
		return array(
			'src'    => '',
			'width'  => 0,
			'height' => 0,
		);
	}
	return array(
		'src'    => $url,
		'width'  => 480,
		'height' => 480,
	);
}

/**
 * Affiliate hop URL with optional subid for Rakuten / network reporting.
 *
 * @param array<string, mixed> $gift
 */
function wrrapd_campaign_gift_href( array $gift, $campaign_slug = '' ) {
	$href = isset( $gift['href'] ) ? trim( (string) $gift['href'] ) : '';
	if ( $href === '' ) {
		return '';
	}
	if ( strpos( $href, '/go/' ) === false && function_exists( 'wrrapd_affiliate_slug_for_hostname' ) ) {
		$parts = wp_parse_url( $href );
		if ( is_array( $parts ) && ! empty( $parts['host'] ) ) {
			$slug = wrrapd_affiliate_slug_for_hostname( (string) $parts['host'] );
			if ( $slug !== '' && function_exists( 'wrrapd_affiliate_go_url' ) ) {
				$href = wrrapd_affiliate_go_url( $slug, $href );
			}
		}
	}
	if ( strpos( $href, '/go/' ) === false ) {
		return esc_url( $href );
	}
	$sub = '';
	if ( ! empty( $gift['category'] ) && is_string( $gift['category'] ) ) {
		$sub = sanitize_key( (string) $gift['category'] );
	}
	if ( $sub === '' && ! empty( $gift['product'] ) && is_string( $gift['product'] ) ) {
		$sub = sanitize_key( (string) $gift['product'] );
	}
	if ( $sub === '' && ! empty( $gift['title'] ) && is_string( $gift['title'] ) ) {
		$sub = sanitize_key( (string) $gift['title'] );
	}
	if ( $sub === '' ) {
		$sub = 'gift';
	}
	if ( $campaign_slug !== '' ) {
		$sub = sanitize_key( (string) $campaign_slug ) . '-' . $sub;
	}
	return esc_url( add_query_arg( 'subid', 'hot-gifts-' . $sub, $href ) );
}

/**
 * @param array<string, mixed> $gift
 */
function wrrapd_campaign_gift_shop_cta( array $gift ) {
	if ( ! empty( $gift['shop_cta'] ) && is_string( $gift['shop_cta'] ) ) {
		return trim( (string) $gift['shop_cta'] );
	}
	$retailer = wrrapd_campaign_gift_retailer_name( $gift );
	if ( $retailer !== '' ) {
		return sprintf(
			/* translators: %s: retailer name */
			__( 'Shop at %s -->', 'wrrapd' ),
			$retailer
		);
	}
	return __( 'Shop now -->', 'wrrapd' );
}

/**
 * Red / white / blue ribbon stripe markup for "250" in hero copy.
 *
 * @param string $text      Plain text (not HTML).
 * @param string $image_url Optional media URL — use your ribbon PNG instead of CSS stripes.
 */
function wrrapd_format_ribbon_numerals_in_text( $text, $image_url = '' ) {
	$html      = esc_html( (string) $text );
	$image_url = trim( (string) $image_url );
	if ( $image_url !== '' ) {
		$img = '<img class="wrrapd-ribbon-numerals-img" src="' . esc_url( $image_url ) . '" alt="250" width="140" height="56" decoding="async" />';
		return preg_replace( '/\b250\b/i', $img, $html );
	}
	return preg_replace(
		'/\b(250)(th)?\b/i',
		'<span class="wrrapd-ribbon-numerals" aria-label="250">$1</span>$2',
		$html
	);
}

/**
 * Hero h1 line with ribbon-styled 250.
 *
 * @param string $shout
 * @param string $image_url
 */
function wrrapd_format_hero_shout_html( $shout, $image_url = '' ) {
	return wrrapd_format_ribbon_numerals_in_text( $shout, $image_url );
}

/**
 * Inline patriotic USA — ribbon stripes; stars on S.
 */
function wrrapd_render_usa_letters_html() {
	return '<span class="wrrapd-usa-letters wrrapd-usa-letters--ribbon" aria-label="USA">'
		. '<span class="wrrapd-ribbon-letter wrrapd-usa-u">U</span>'
		. '<span class="wrrapd-ribbon-letter wrrapd-usa-s wrrapd-usa-s--stars">S</span>'
		. '<span class="wrrapd-ribbon-letter wrrapd-usa-a">A</span>'
		. '</span>';
}

/**
 * Replace {USA} token or bare "USA" with styled letter chips.
 *
 * @param string $text
 */
function wrrapd_campaign_format_tagline_html( $text ) {
	$text = trim( (string) $text );
	if ( $text === '' ) {
		return '';
	}
	$usa = wrrapd_render_usa_letters_html();
	if ( strpos( $text, '{USA}' ) !== false ) {
		$parts = explode( '{USA}', $text );
		$out   = '';
		foreach ( $parts as $i => $part ) {
			if ( $part !== '' ) {
				$out .= esc_html( $part );
			}
			if ( $i < count( $parts ) - 1 ) {
				$out .= $usa;
			}
		}
		return $out;
	}
	if ( preg_match( '/\bUSA\b/u', $text ) ) {
		return preg_replace( '/\bUSA\b/u', $usa, esc_html( $text ) );
	}
	return esc_html( $text );
}

/**
 * Hero shout + body + tagline for Elementor widget 6466f5b (replaces Father's Day h1 + p only).
 *
 * @param array<string, mixed> $campaign
 */
function wrrapd_render_seasonal_headline_html( array $campaign ) {
	$shout    = isset( $campaign['hero_shout'] ) ? trim( (string) $campaign['hero_shout'] ) : '';
	$body     = isset( $campaign['hero_body'] ) ? trim( (string) $campaign['hero_body'] ) : '';
	$tagline  = isset( $campaign['hero_tagline'] ) ? trim( (string) $campaign['hero_tagline'] ) : '';
	$headline = isset( $campaign['headline'] ) ? trim( (string) $campaign['headline'] ) : '';
	$hook     = isset( $campaign['hook'] ) ? trim( (string) $campaign['hook'] ) : '';
	$lead     = isset( $campaign['headline_lead'] ) ? trim( (string) $campaign['headline_lead'] ) : '';
	$label    = isset( $campaign['label'] ) ? trim( (string) $campaign['label'] ) : '';

	if ( $shout === '' && $headline !== '' ) {
		if ( $lead === '' && $label !== '' ) {
			$lead = 'This ' . $label . ',';
		}
		$shout = trim( $lead . ' ' . $headline );
	}
	if ( $body === '' && $hook !== '' ) {
		$body = $hook;
	}
	$shout = preg_replace( '/\s+/u', ' ', (string) $shout );
	$body  = preg_replace( '/\s+/u', ' ', (string) $body );
	$ribbon_250_img = isset( $campaign['hero_250_image_url'] ) ? trim( (string) $campaign['hero_250_image_url'] ) : '';

	if ( $shout === '' ) {
		return '';
	}

	ob_start();
	echo '<h1><strong>' . wrrapd_format_hero_shout_html( $shout, $ribbon_250_img ) . '</strong></h1>';
	if ( $body !== '' ) {
		echo '<p class="wrrapd-season-hero-body"><span>' . esc_html( $body ) . '</span></p>';
	}
	if ( $tagline !== '' ) {
		echo '<p class="wrrapd-season-hero-tagline">';
		echo wrrapd_campaign_format_tagline_html( $tagline ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		echo '</p>';
	}
	return (string) ob_get_clean();
}

/**
 * Full hero block — my-orders compact pages only.
 *
 * @param array<string, mixed> $campaign
 */
function wrrapd_render_seasonal_hero_html( array $campaign ) {
	$slug     = isset( $campaign['slug'] ) ? sanitize_html_class( (string) $campaign['slug'] ) : 'season';
	$theme    = isset( $campaign['theme_class'] ) ? sanitize_html_class( (string) $campaign['theme_class'] ) : 'wrrapd-season-default';
	$headline = wrrapd_render_seasonal_headline_html( $campaign );
	if ( $headline === '' ) {
		return '';
	}

	ob_start();
	echo '<section class="wrrapd-season-hero ' . esc_attr( $theme ) . '" data-wrrapd-campaign="' . esc_attr( $slug ) . '">';
	echo '<div class="wrrapd-season-hero__inner wrrapd-season-headline-injected">';
	echo $headline; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	echo '</div></section>';
	return (string) ob_get_clean();
}

/**
 * @param array<string, mixed>      $campaign
 * @param list<array<string,mixed>> $gifts
 * @param string                    $variant full|compact
 */
function wrrapd_render_hot_gifts_rail_html( array $campaign, array $gifts, $variant = 'full' ) {
	if ( count( $gifts ) === 0 ) {
		return '';
	}
	$title     = isset( $campaign['hot_gifts_title'] ) ? (string) $campaign['hot_gifts_title'] : __( 'Featured gift picks', 'wrrapd' );
	$title_sub = isset( $campaign['hot_gifts_title_sub'] ) ? trim( (string) $campaign['hot_gifts_title_sub'] ) : '';
	$show_flag = ! empty( $campaign['hot_gifts_title_flag'] );
	$mod       = $variant === 'compact' ? ' wrrapd-hot-gifts-rail--compact' : ' wrrapd-hot-gifts-rail--mixed-occasions';
	$slug      = isset( $campaign['slug'] ) ? sanitize_html_class( (string) $campaign['slug'] ) : '';

	ob_start();
	echo '<section class="wrrapd-hot-gifts-rail' . esc_attr( $mod ) . '" data-wrrapd-campaign="' . esc_attr( $slug ) . '" aria-labelledby="wrrapd-hot-gifts-title-' . esc_attr( $slug ) . '">';
	echo '<div class="wrrapd-hot-gifts-rail__head">';
	echo '<h2 id="wrrapd-hot-gifts-title-' . esc_attr( $slug ) . '" class="wrrapd-hot-gifts-rail__title">';
	if ( $show_flag ) {
		echo '<span class="wrrapd-hot-gifts-rail__flag" aria-hidden="true"></span>';
	}
	echo '<span class="wrrapd-hot-gifts-rail__title-wrap">';
	echo '<span class="wrrapd-hot-gifts-rail__title-main">' . esc_html( $title ) . '</span>';
	if ( $title_sub !== '' ) {
		echo '<span class="wrrapd-hot-gifts-rail__title-sep" aria-hidden="true"> — </span>';
		echo '<span class="wrrapd-hot-gifts-rail__title-sub">' . wrrapd_format_ribbon_numerals_in_text( $title_sub ) . '</span>';
	}
	echo '</span></h2>';
	echo '<a class="wrrapd-hot-gifts-rail__more" href="' . esc_url( home_url( '/top-gifting-choices/' ) ) . '">' . esc_html__( 'See all picks', 'wrrapd' ) . '</a>';
	echo '</div>';
	echo '<div class="wrrapd-hot-gifts-rail__grid" role="list">';
	foreach ( $gifts as $g ) {
		if ( ! is_array( $g ) || empty( $g['title'] ) ) {
			continue;
		}
		$href = wrrapd_campaign_gift_href( $g, $slug );
		if ( $href === '' ) {
			continue;
		}
		$photo     = wrrapd_campaign_gift_image_url( $g );
		$logo      = wrrapd_campaign_gift_logo_url( $g );
		$logo_meta = wrrapd_campaign_gift_logo_img_meta( $g, 44 );
		$prod_meta = wrrapd_campaign_gift_product_img_meta( $g );
		$copy      = isset( $g['copy'] ) ? (string) $g['copy'] : '';
		$retailer  = wrrapd_campaign_gift_retailer_name( $g );
		$ret_line  = isset( $g['retailer_line'] ) ? trim( (string) $g['retailer_line'] ) : '';
		$prod_name = isset( $g['product'] ) ? trim( (string) $g['product'] ) : trim( (string) $g['title'] );
		$occasion  = isset( $g['occasion'] ) ? trim( (string) $g['occasion'] ) : '';
		$is_prod   = wrrapd_campaign_gift_has_real_product_image( $g ) && $prod_meta['src'] !== '';

		echo '<a class="wrrapd-hot-gifts-rail__card' . ( $is_prod ? ' wrrapd-hot-gifts-rail__card--product' : '' ) . '" role="listitem" href="' . $href . '" rel="sponsored noopener noreferrer" title="' . esc_attr( $prod_name ) . '">';
		if ( $is_prod ) {
			echo '<span class="wrrapd-hot-gifts-rail__photo">';
			if ( $prod_meta['src'] !== '' ) {
				echo '<img src="' . esc_url( $prod_meta['src'] ) . '" width="' . (int) $prod_meta['width'] . '" height="' . (int) $prod_meta['height'] . '" alt="' . esc_attr( $prod_name ) . '" decoding="async" loading="lazy" referrerpolicy="no-referrer" />';
			}
			echo '<span class="wrrapd-hot-gifts-rail__card-body wrrapd-hot-gifts-rail__card-overlay">';
			echo '<span class="wrrapd-hot-gifts-rail__card-title">' . esc_html( $prod_name ) . '</span>';
			if ( $variant !== 'compact' && $retailer !== '' ) {
				if ( $logo_meta['src'] !== '' ) {
					$srcset = $logo_meta['srcset'] !== '' ? ' srcset="' . esc_attr( $logo_meta['srcset'] ) . '"' : '';
					$sizes  = $logo_meta['sizes'] !== '' ? ' sizes="' . esc_attr( $logo_meta['sizes'] ) . '"' : '';
					echo '<span class="wrrapd-hot-gifts-rail__retailer-logo"><img src="' . esc_url( $logo_meta['src'] ) . '" width="' . (int) $logo_meta['width'] . '" height="' . (int) $logo_meta['height'] . '"' . $srcset . $sizes . ' alt="' . esc_attr( $retailer ) . '" decoding="async" loading="lazy" referrerpolicy="no-referrer" /></span>';
				}
				echo '<span class="wrrapd-hot-gifts-rail__shop-at">' . esc_html( $retailer ) . '</span>';
				if ( $occasion !== '' ) {
					echo '<span class="wrrapd-hot-gifts-rail__occasion">' . esc_html( $occasion ) . '</span>';
				}
			}
			echo '</span>';
			echo '</span>';
		} else {
			if ( $logo_meta['src'] !== '' ) {
				$srcset = $logo_meta['srcset'] !== '' ? ' srcset="' . esc_attr( $logo_meta['srcset'] ) . '"' : '';
				$sizes  = $logo_meta['sizes'] !== '' ? ' sizes="' . esc_attr( $logo_meta['sizes'] ) . '"' : '';
				echo '<span class="wrrapd-hot-gifts-rail__logo"><img src="' . esc_url( $logo_meta['src'] ) . '" width="' . (int) $logo_meta['width'] . '" height="' . (int) $logo_meta['height'] . '"' . $srcset . $sizes . ' alt="" decoding="async" loading="lazy" /></span>';
			}
			echo '<span class="wrrapd-hot-gifts-rail__card-title">' . esc_html( (string) $g['title'] ) . '</span>';
			if ( $copy !== '' && $variant !== 'compact' ) {
				echo '<span class="wrrapd-hot-gifts-rail__card-copy">' . esc_html( $copy ) . '</span>';
			}
			echo '<span class="wrrapd-hot-gifts-rail__card-cta">' . esc_html__( 'Shop now →', 'wrrapd' ) . '</span>';
		}
		echo '</a>';
	}
	echo '</div></section>';
	return (string) ob_get_clean();
}

/**
 * Front page + logged-in home: inject hero + hot gifts; hide stale Elementor seasonal widgets.
 */
function wrrapd_should_output_seasonal_blocks() {
	if ( is_admin() || is_paged() ) {
		return false;
	}
	return is_front_page() || is_home();
}

/**
 * @param list<string> $classes
 * @return list<string>
 */
function wrrapd_campaign_body_class( $classes ) {
	$on_welcome = function_exists( 'wrrapd_is_welcome_page' ) ? wrrapd_is_welcome_page() : ( is_page( array( 5576, 'welcome' ) ) );
	if ( ! wrrapd_should_output_seasonal_blocks() && ! is_page( 'my-orders' ) && ! $on_welcome ) {
		return $classes;
	}
	$c = wrrapd_active_campaign();
	if ( ! $c ) {
		return $classes;
	}
	if ( ! empty( $c['theme_class'] ) ) {
		$classes[] = sanitize_html_class( (string) $c['theme_class'] );
	}
	$classes[] = 'wrrapd-season-active';
	if ( ! empty( $c['slug'] ) ) {
		$classes[] = 'wrrapd-season-' . sanitize_html_class( (string) $c['slug'] );
	}
	if ( $on_welcome && is_user_logged_in() ) {
		$classes[] = 'wrrapd-welcome-hub-page';
	}
	return $classes;
}
add_filter( 'body_class', 'wrrapd_campaign_body_class', 20 );

function wrrapd_output_seasonal_campaign_assets() {
	if ( is_admin() ) {
		return;
	}
	$c = wrrapd_active_campaign();
	if ( ! $c ) {
		return;
	}
	$path = dirname( __FILE__ ) . '/wrrapd-seasonal-campaigns.css';
	if ( is_readable( $path ) ) {
		$css = file_get_contents( $path );
		if ( is_string( $css ) && $css !== '' ) {
			echo '<style id="wrrapd-seasonal-campaigns-css">' . $css . '</style>';
		}
	}
	echo '<link rel="preconnect" href="https://fonts.googleapis.com" />';
	echo '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />';
	echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560&amp;display=swap" />';
}
add_action( 'wp_head', 'wrrapd_output_seasonal_campaign_assets', 98 );

function wrrapd_output_seasonal_campaign_blocks() {
	static $done = false;
	if ( $done || is_admin() ) {
		return;
	}
	$c = wrrapd_active_campaign();
	if ( ! $c ) {
		return;
	}
	$gifts    = wrrapd_campaign_hot_gifts_pick( $c, wrrapd_campaign_hot_gifts_display_count( $c ) );
	$headline = wrrapd_render_seasonal_headline_html( $c );
	$rail     = wrrapd_render_hot_gifts_rail_html( $c, $gifts, 'full' );
	if ( $headline === '' && $rail === '' ) {
		return;
	}
	$done = true;
	echo '<div id="wrrapd-seasonal-campaign-root" hidden aria-hidden="true">';
	if ( $headline !== '' ) {
		echo '<div id="wrrapd-season-headline-html" class="wrrapd-season-headline-src">';
		echo $headline; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		echo '</div>';
	}
	if ( $rail !== '' ) {
		echo '<div id="wrrapd-hot-gifts-rail-slot">';
		echo $rail; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		echo '</div>';
	}
	echo '</div>';
	echo '<!-- wrrapd-season-active:' . esc_html( isset( $c['slug'] ) ? (string) $c['slug'] : 'none' ) . ' -->';
}
add_action( 'wp_footer', 'wrrapd_output_seasonal_campaign_blocks', 12 );

function wrrapd_output_seasonal_campaign_placement_script() {
	if ( is_admin() ) {
		return;
	}
	$show_home = wrrapd_should_output_seasonal_blocks();
	$show_ord  = is_page( 'my-orders' );
	if ( ! $show_home && ! $show_ord ) {
		return;
	}
	$c = wrrapd_active_campaign();
	if ( ! $c ) {
		return;
	}
	$gifts = wrrapd_campaign_hot_gifts_pick( $c, $show_ord ? 4 : wrrapd_campaign_hot_gifts_display_count( $c ) );
	$rail  = $show_ord ? wrrapd_render_hot_gifts_rail_html( $c, $gifts, 'compact' ) : '';

	echo '<script id="wrrapd-seasonal-placement">';
	echo '(function(){';
	echo 'var slug=' . wp_json_encode( isset( $c['slug'] ) ? (string) $c['slug'] : '' ) . ';';
	echo 'function findHeroTarget(){var w=document.querySelector(".elementor-element-6466f5b");if(w)return w;var eds=document.querySelectorAll(".elementor-page-4857 .elementor-widget-text-editor");for(var j=0;j<eds.length;j++){var h1=eds[j].querySelector("h1");if(h1&&/this\\s+(father|fourth|mother|valentine|christmas|thanksgiving|happy)/i.test(h1.textContent||""))return eds[j];}return null;}';
	echo 'function insertAfterAnchor(node,anchor){if(!node||!anchor||!anchor.el||!anchor.el.parentNode)return false;if(anchor.mode==="before"){anchor.el.parentNode.insertBefore(node,anchor.el);return true;}anchor.el.insertAdjacentElement("afterend",node);return true;}';
	echo 'function placeHeadline(){var src=document.getElementById("wrrapd-season-headline-html");var tgt=findHeroTarget();if(!src||!tgt)return false;tgt.innerHTML=src.innerHTML;tgt.classList.add("wrrapd-season-headline-injected");src.remove();return true;}';
	echo 'function placeHotGifts(){var slot=document.getElementById("wrrapd-hot-gifts-rail-slot");if(!slot||!slot.firstElementChild)return false;var rail=slot.firstElementChild;slot.remove();var shell=document.getElementById("occasionTickerShell")||document.querySelector(".occasion-ticker-shell");var red=document.querySelector(".elementor-element-5601b5d");var placed=false;if(shell&&shell.parentNode&&red&&red.parentNode){if(shell.nextElementSibling===red){red.parentNode.insertBefore(rail,red);placed=true;}else if(shell.parentNode===red.parentNode){red.parentNode.insertBefore(rail,red);placed=true;}}if(!placed&&shell&&shell.parentNode){shell.insertAdjacentElement("afterend",rail);placed=true;}if(!placed&&red&&red.parentNode){red.parentNode.insertBefore(rail,red);placed=true;}if(!placed)return false;rail.style.display="";rail.classList.remove("wrrapd-hot-gifts-rail--in-ticker-shell");rail.classList.add("wrrapd-hot-gifts-rail--below-ticker");return true;}';
	echo 'function placeHome(){var okH=placeHeadline();var okG=placeHotGifts();if(!okH||!okG)document.documentElement.setAttribute("data-wrrapd-season-pending",slug||"1");}';
	if ( $rail !== '' ) {
		$rail_json = wp_json_encode( $rail );
		echo 'function placeOrders(){var root=document.querySelector(".wrrapd-amz-root")||document.querySelector(".user-registration-MyAccount")||document.querySelector("#primary .site-main");if(!root||!root.parentNode)return;var wrap=document.createElement("div");wrap.innerHTML=' . $rail_json . ';var rail=wrap.firstElementChild;if(!rail)return;root.parentNode.insertBefore(rail,root);}';
	} else {
		echo 'function placeOrders(){}';
	}
	echo 'function run(){var root=document.getElementById("wrrapd-seasonal-campaign-root");if(root){root.hidden=false;root.removeAttribute("aria-hidden");}if(document.body.classList.contains("wrrapd-orders-page"))placeOrders();else placeHome();var r=document.getElementById("wrrapd-seasonal-campaign-root");if(r&&!r.children.length)r.remove();}';
	echo 'document.addEventListener("DOMContentLoaded",run);window.addEventListener("load",function(){run();setTimeout(run,400);setTimeout(run,1200);setTimeout(run,2500);});';
	echo '})();';
	echo '</script>';
}
add_action( 'wp_footer', 'wrrapd_output_seasonal_campaign_placement_script', 18 );

/** Admin email for campaign reminders. */
function wrrapd_campaign_admin_email() {
	if ( defined( 'WRRAPD_CAMPAIGN_ADMIN_EMAIL' ) && is_string( WRRAPD_CAMPAIGN_ADMIN_EMAIL ) && WRRAPD_CAMPAIGN_ADMIN_EMAIL !== '' ) {
		return sanitize_email( WRRAPD_CAMPAIGN_ADMIN_EMAIL );
	}
	$cfg = wrrapd_campaigns_config();
	if ( $cfg && ! empty( $cfg['admin_email'] ) && is_string( $cfg['admin_email'] ) ) {
		return sanitize_email( $cfg['admin_email'] );
	}
	return sanitize_email( get_option( 'admin_email' ) );
}

/**
 * Build reminder email body with suggested copy for the upcoming campaign.
 *
 * @param array<string, mixed> $campaign
 */
function wrrapd_campaign_reminder_email_body( array $campaign, DateTimeImmutable $starts_on ) {
	$label    = isset( $campaign['label'] ) ? (string) $campaign['label'] : 'Next season';
	$slug     = isset( $campaign['slug'] ) ? (string) $campaign['slug'] : '';
	$eyebrow  = isset( $campaign['eyebrow'] ) ? (string) $campaign['eyebrow'] : '';
	$headline = isset( $campaign['headline'] ) ? (string) $campaign['headline'] : '';
	$hook     = isset( $campaign['hook'] ) ? (string) $campaign['hook'] : '';
	$date_str = $starts_on->format( 'F j, Y' );

	$lines   = array();
	$lines[] = 'Hi Roger,';
	$lines[] = '';
	$lines[] = 'Wrrapd\'s seasonal homepage will switch to **' . $label . '** on **' . $date_str . '**.';
	$lines[] = '';
	$lines[] = 'Calendar rules: 21 days before each holiday; stay 4 days after for late gifters; next holiday waits until previous grace ends; Christmas from Nov 12; Christian holidays beat American when overlapping.';
	$lines[] = '';
	$lines[] = 'Suggested hero copy (already in wrrapd-campaigns.json — edit that file on the server or in GitHub to change live text):';
	$lines[] = '';
	$lines[] = 'Eyebrow: ' . $eyebrow;
	$lines[] = 'Headline: ' . $headline;
	$lines[] = 'Hook: ' . $hook;
	$lines[] = '';
	$lines[] = 'Keep your existing Elementor paragraphs about actual gift wrapping & flowers below the hero — those stay untouched.';
	$lines[] = '';
	$lines[] = 'To customize hot gifts for this window, edit the "hot_gifts" array for slug "' . $slug . '" in wp-content/mu-plugins/wrrapd-campaigns.json.';
	$lines[] = '';
	$lines[] = 'Want AI-generated alternates? Reply to this thread or ask Cursor to draft new eyebrow/headline/hook for ' . $label . '.';
	$lines[] = '';
	$lines[] = '— Wrrapd seasonal cron (' . home_url( '/' ) . ')';

	return implode( "\n", $lines );
}

function wrrapd_campaign_maybe_send_reminder() {
	if ( is_admin() && ! ( defined( 'WP_CLI' ) && WP_CLI ) ) {
		return;
	}
	$cfg = wrrapd_campaigns_config();
	if ( ! $cfg ) {
		return;
	}
	$days_before = isset( $cfg['reminder_days_before'] ) ? (int) $cfg['reminder_days_before'] : 15;
	if ( $days_before < 1 ) {
		$days_before = 15;
	}
	$next = wrrapd_next_campaign_start();
	if ( ! $next || empty( $next['campaign'] ) || ! $next['starts_on'] instanceof DateTimeImmutable ) {
		return;
	}
	$now    = wrrapd_campaigns_now();
	if ( ! $now ) {
		return;
	}
	$diff   = (int) $now->diff( $next['starts_on'] )->format( '%r%a' );
	if ( $diff !== $days_before ) {
		return;
	}
	$campaign = $next['campaign'];
	$slug     = isset( $campaign['slug'] ) ? (string) $campaign['slug'] : 'next';
	$key      = 'wrrapd_campaign_reminder_' . $slug . '_' . $next['starts_on']->format( 'Y-m-d' );
	if ( get_option( $key ) ) {
		return;
	}
	$to      = wrrapd_campaign_admin_email();
	$subject = '[Wrrapd] Seasonal copy check — ' . ( isset( $campaign['label'] ) ? (string) $campaign['label'] : 'upcoming campaign' ) . ' starts ' . $next['starts_on']->format( 'M j' );
	$body    = wrrapd_campaign_reminder_email_body( $campaign, $next['starts_on'] );
	$sent    = wp_mail( $to, $subject, $body );
	if ( $sent ) {
		update_option( $key, gmdate( 'c' ), false );
	}
}

function wrrapd_campaign_cron_schedules( $schedules ) {
	if ( ! isset( $schedules['wrrapd_daily'] ) ) {
		$schedules['wrrapd_daily'] = array(
			'interval' => DAY_IN_SECONDS,
			'display'  => 'Wrrapd daily (campaign reminders)',
		);
	}
	return $schedules;
}
add_filter( 'cron_schedules', 'wrrapd_campaign_cron_schedules' );

function wrrapd_campaign_cron_activate() {
	if ( ! wp_next_scheduled( 'wrrapd_campaign_daily_reminder' ) ) {
		wp_schedule_event( time() + HOUR_IN_SECONDS, 'wrrapd_daily', 'wrrapd_campaign_daily_reminder' );
	}
}
add_action( 'init', 'wrrapd_campaign_cron_activate' );

add_action( 'wrrapd_campaign_daily_reminder', 'wrrapd_campaign_maybe_send_reminder' );

/** Run once per day on front-end traffic if cron is lazy (SiteGround). */
function wrrapd_campaign_reminder_on_visit() {
	if ( is_admin() || wp_doing_ajax() || wp_doing_cron() ) {
		return;
	}
	$last = get_option( 'wrrapd_campaign_reminder_last_check', '' );
	$today = wrrapd_campaigns_now();
	if ( ! $today ) {
		return;
	}
	$ymd = $today->format( 'Y-m-d' );
	if ( $last === $ymd ) {
		return;
	}
	update_option( 'wrrapd_campaign_reminder_last_check', $ymd, false );
	wrrapd_campaign_maybe_send_reminder();
}
add_action( 'template_redirect', 'wrrapd_campaign_reminder_on_visit', 99 );

/* =============================================================================
 * Logged-in /welcome/ hub — "The Wrrapd Gift Journal"
 * Seasonal hot-gifts rail + long-form original gift guides (rotated weekly) +
 * shop-by-store band. Injected after the Elementor welcome copy; header untouched.
 * ============================================================================= */

function wrrapd_is_welcome_page() {
	return is_page( array( 5576, 'welcome' ) );
}

function wrrapd_should_output_welcome_hub() {
	if ( is_admin() || is_paged() || wp_doing_ajax() ) {
		return false;
	}
	return wrrapd_is_welcome_page() && is_user_logged_in();
}

/**
 * @return array<string, mixed>|null
 */
function wrrapd_welcome_journal_config() {
	static $cfg = null;
	if ( $cfg !== null ) {
		return $cfg ?: null;
	}
	$cfg  = array();
	$path = dirname( __FILE__ ) . '/wrrapd-welcome-ideas.json';
	if ( is_readable( $path ) ) {
		$raw = file_get_contents( $path );
		$dec = is_string( $raw ) ? json_decode( $raw, true ) : null;
		if ( is_array( $dec ) && ! empty( $dec['stories'] ) && is_array( $dec['stories'] ) ) {
			$cfg = $dec;
		}
	}
	return $cfg ?: null;
}

/**
 * Season tags active right now (site timezone). Evergreen is always on.
 *
 * @return list<string>
 */
function wrrapd_welcome_active_seasons() {
	$now = current_datetime();
	$m   = (int) $now->format( 'n' );
	$d   = (int) $now->format( 'j' );
	$md  = $m * 100 + $d;
	$out = array( 'evergreen' );
	if ( $md >= 720 && $md <= 930 ) {
		$out[] = 'back-to-school';
	}
	if ( $m >= 5 && $m <= 10 ) {
		$out[] = 'wedding';
	}
	if ( $md >= 910 && $md <= 1130 ) {
		$out[] = 'fall';
	}
	if ( $m === 11 || $m === 12 ) {
		$out[] = 'holiday';
	}
	if ( $m === 1 || $m === 2 ) {
		$out[] = 'winter';
	}
	if ( $m >= 3 && $m <= 4 ) {
		$out[] = 'spring';
	}
	return $out;
}

/**
 * Pick the featured story + supporting stories. Ordered by weight, rotated by ISO week
 * so the page reads fresh each week without new content work.
 *
 * @return array{featured: array<string,mixed>|null, more: list<array<string,mixed>>}
 */
function wrrapd_welcome_stories_pick( $count_more = 3 ) {
	$cfg = wrrapd_welcome_journal_config();
	if ( ! $cfg ) {
		return array( 'featured' => null, 'more' => array() );
	}
	$seasons = wrrapd_welcome_active_seasons();
	$pool    = array();
	foreach ( $cfg['stories'] as $s ) {
		if ( ! is_array( $s ) || empty( $s['title'] ) || empty( $s['sections'] ) ) {
			continue;
		}
		$tags = isset( $s['seasons'] ) && is_array( $s['seasons'] ) ? $s['seasons'] : array( 'evergreen' );
		if ( count( array_intersect( $tags, $seasons ) ) === 0 ) {
			continue;
		}
		$pool[] = $s;
	}
	if ( count( $pool ) === 0 ) {
		return array( 'featured' => null, 'more' => array() );
	}
	usort(
		$pool,
		static function ( $a, $b ) {
			$wa = isset( $a['weight'] ) ? (int) $a['weight'] : 0;
			$wb = isset( $b['weight'] ) ? (int) $b['weight'] : 0;
			return $wb <=> $wa;
		}
	);
	// Rotate the featured slot weekly among the top two seasonal stories; keep the rest in weight order.
	$week    = (int) current_datetime()->format( 'W' );
	$top_n   = min( 2, count( $pool ) );
	$lead_ix = $week % $top_n;
	$feat    = $pool[ $lead_ix ];
	$more    = array();
	foreach ( $pool as $ix => $s ) {
		if ( $ix === $lead_ix ) {
			continue;
		}
		$more[] = $s;
		if ( count( $more ) >= $count_more ) {
			break;
		}
	}
	return array( 'featured' => $feat, 'more' => $more );
}

/**
 * Affiliate-aware URL for a story link: {path} → site URL; {slug,to} → /go/ redirect.
 *
 * @param array<string, mixed> $link
 */
function wrrapd_welcome_link_url( array $link ) {
	if ( ! empty( $link['path'] ) ) {
		return home_url( (string) $link['path'] );
	}
	$slug = isset( $link['slug'] ) ? preg_replace( '/[^a-z0-9_-]/', '', strtolower( (string) $link['slug'] ) ) : '';
	if ( $slug === '' ) {
		return '';
	}
	$to = isset( $link['to'] ) ? (string) $link['to'] : '';
	if ( function_exists( 'wrrapd_affiliate_go_url' ) ) {
		return (string) wrrapd_affiliate_go_url( $slug, $to );
	}
	$u = home_url( '/go/' . $slug . '/' );
	return $to !== '' ? add_query_arg( 'to', rawurlencode( $to ), $u ) : $u;
}

/**
 * @return array<string, array{label:string, domain:string}>
 */
function wrrapd_welcome_retailer_meta() {
	static $meta = null;
	if ( $meta !== null ) {
		return $meta;
	}
	$meta = array(
		'giftcards'          => array( 'label' => 'GiftCards.com', 'domain' => 'giftcards.com' ),
		'booksamillion'      => array( 'label' => 'Books-A-Million', 'domain' => 'booksamillion.com' ),
		'russellstover'      => array( 'label' => 'Russell Stover', 'domain' => 'russellstover.com' ),
		'freshroastedcoffee' => array( 'label' => 'Fresh Roasted Coffee', 'domain' => 'freshroastedcoffee.com' ),
		'zchocolat'          => array( 'label' => 'zChocolat', 'domain' => 'zchocolat.com' ),
		'gearup'             => array( 'label' => 'GearUp', 'domain' => 'gearup.com' ),
		'vyjewelry'          => array( 'label' => 'VY Jewelry', 'domain' => 'vyjewelry.shop' ),
		'peetscoffee'        => array( 'label' => 'Peet’s Coffee', 'domain' => 'peets.com' ),
	);
	if ( function_exists( 'wrrapd_home_retailer_wheel_brands' ) ) {
		foreach ( wrrapd_home_retailer_wheel_brands() as $b ) {
			$meta[ (string) $b['slug'] ] = array( 'label' => (string) $b['label'], 'domain' => (string) $b['domain'] );
		}
	}
	return $meta;
}

function wrrapd_welcome_retailer_label( $slug ) {
	$m = wrrapd_welcome_retailer_meta();
	return isset( $m[ $slug ] ) ? $m[ $slug ]['label'] : ucfirst( (string) $slug );
}

function wrrapd_welcome_retailer_logo( $slug ) {
	$m   = wrrapd_welcome_retailer_meta();
	$dom = isset( $m[ $slug ] ) ? $m[ $slug ]['domain'] : $slug . '.com';
	if ( function_exists( 'wrrapd_mu_logo_url_for_slug' ) ) {
		return (string) wrrapd_mu_logo_url_for_slug( $slug, $dom );
	}
	return 'https://www.google.com/s2/favicons?domain=' . rawurlencode( $dom ) . '&sz=64';
}

/**
 * One story link (pick / CTA) as an <a>. Retailer name is appended when a slug is present.
 *
 * @param array<string, mixed> $link
 */
function wrrapd_welcome_render_pick_html( array $link, $with_logo = true ) {
	$url = wrrapd_welcome_link_url( $link );
	if ( $url === '' || empty( $link['label'] ) ) {
		return '';
	}
	$slug = isset( $link['slug'] ) ? preg_replace( '/[^a-z0-9_-]/', '', strtolower( (string) $link['slug'] ) ) : '';
	$ext  = $slug !== '';
	$h    = '<li class="wrrapd-wj__pick"><a class="wrrapd-wj__pick-link" href="' . esc_url( $url ) . '"' . ( $ext ? ' rel="sponsored noopener noreferrer" target="_blank"' : '' ) . '>';
	if ( $with_logo && $slug !== '' ) {
		$h .= '<span class="wrrapd-wj__pick-logo"><img src="' . esc_url( wrrapd_welcome_retailer_logo( $slug ) ) . '" width="36" height="36" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" /></span>';
	}
	$h .= '<span class="wrrapd-wj__pick-text"><span class="wrrapd-wj__pick-label">' . esc_html( (string) $link['label'] ) . '</span>';
	if ( $slug !== '' ) {
		$h .= '<span class="wrrapd-wj__pick-store">' . esc_html( wrrapd_welcome_retailer_label( $slug ) ) . '</span>';
	}
	$h .= '</span></a></li>';
	return $h;
}

/**
 * @param array<string, mixed> $story
 */
function wrrapd_welcome_render_cta_html( array $story, $class = 'wrrapd-wj__cta' ) {
	if ( empty( $story['cta'] ) || ! is_array( $story['cta'] ) ) {
		return '';
	}
	$url = wrrapd_welcome_link_url( $story['cta'] );
	if ( $url === '' ) {
		return '';
	}
	$slug = isset( $story['cta']['slug'] ) ? (string) $story['cta']['slug'] : '';
	$lbl  = isset( $story['cta']['label'] ) ? (string) $story['cta']['label'] : __( 'Shop now', 'wrrapd' );
	return '<a class="' . esc_attr( $class ) . '" href="' . esc_url( $url ) . '"' . ( $slug !== '' ? ' rel="sponsored noopener noreferrer" target="_blank"' : '' ) . '>' . esc_html( $lbl ) . ' <span aria-hidden="true">→</span></a>';
}

/**
 * @param array<string, mixed> $story
 */
function wrrapd_welcome_render_sections_html( array $story, $from = 0, $to = null ) {
	$secs = isset( $story['sections'] ) && is_array( $story['sections'] ) ? array_values( $story['sections'] ) : array();
	$to   = $to === null ? count( $secs ) : min( (int) $to, count( $secs ) );
	$h    = '';
	for ( $i = (int) $from; $i < $to; $i++ ) {
		$s = $secs[ $i ];
		if ( ! is_array( $s ) || empty( $s['body'] ) ) {
			continue;
		}
		if ( ! empty( $s['heading'] ) ) {
			$h .= '<h4 class="wrrapd-wj__h">' . esc_html( (string) $s['heading'] ) . '</h4>';
		}
		$h .= '<p class="wrrapd-wj__p">' . esc_html( (string) $s['body'] ) . '</p>';
	}
	return $h;
}

/**
 * @param array<string, mixed> $story
 */
function wrrapd_welcome_render_tip_html( array $story ) {
	if ( empty( $story['tip'] ) ) {
		return '';
	}
	return '<p class="wrrapd-wj__tip"><span class="wrrapd-wj__tip-label">' . esc_html__( 'The Wrrapd touch', 'wrrapd' ) . '</span> ' . esc_html( (string) $story['tip'] ) . '</p>';
}

/**
 * Featured long-form story: body on the left, "Shop this story" panel on the right.
 *
 * @param array<string, mixed> $story
 */
function wrrapd_welcome_render_feature_html( array $story ) {
	$h  = '<article class="wrrapd-wj__feature">';
	$h .= '<div class="wrrapd-wj__feature-body">';
	if ( ! empty( $story['kicker'] ) ) {
		$h .= '<p class="wrrapd-wj__kicker">' . esc_html( (string) $story['kicker'] ) . '</p>';
	}
	$h .= '<h3 class="wrrapd-wj__title">' . esc_html( (string) $story['title'] ) . '</h3>';
	if ( ! empty( $story['dek'] ) ) {
		$h .= '<p class="wrrapd-wj__dek">' . esc_html( (string) $story['dek'] ) . '</p>';
	}
	$h .= '<div class="wrrapd-wj__prose wrrapd-wj__prose--dropcap">' . wrrapd_welcome_render_sections_html( $story ) . '</div>';
	$h .= wrrapd_welcome_render_tip_html( $story );
	$h .= '</div>';
	$picks = isset( $story['picks'] ) && is_array( $story['picks'] ) ? $story['picks'] : array();
	$h    .= '<aside class="wrrapd-wj__panel" aria-label="' . esc_attr__( 'Shop this story', 'wrrapd' ) . '">';
	$h    .= '<h4 class="wrrapd-wj__panel-title">' . esc_html__( 'Shop this story', 'wrrapd' ) . '</h4>';
	if ( count( $picks ) > 0 ) {
		$h .= '<ul class="wrrapd-wj__picks">';
		foreach ( $picks as $p ) {
			if ( is_array( $p ) ) {
				$h .= wrrapd_welcome_render_pick_html( $p, true );
			}
		}
		$h .= '</ul>';
	}
	$h .= wrrapd_welcome_render_cta_html( $story, 'wrrapd-wj__cta wrrapd-wj__cta--panel' );
	$h .= '<p class="wrrapd-wj__panel-note">' . esc_html__( 'Shop as usual — choose Wrrapd at checkout for custom wrapping and flowers.', 'wrrapd' ) . '</p>';
	$h .= '</aside>';
	$h .= '</article>';
	return $h;
}

/**
 * Supporting story card: kicker, title, dek, first two sections; the rest folds under “Keep reading”.
 *
 * @param array<string, mixed> $story
 */
function wrrapd_welcome_render_story_html( array $story ) {
	$secs = isset( $story['sections'] ) && is_array( $story['sections'] ) ? $story['sections'] : array();
	$h    = '<article class="wrrapd-wj__story">';
	if ( ! empty( $story['kicker'] ) ) {
		$h .= '<p class="wrrapd-wj__kicker">' . esc_html( (string) $story['kicker'] ) . '</p>';
	}
	$h .= '<h3 class="wrrapd-wj__title wrrapd-wj__title--sm">' . esc_html( (string) $story['title'] ) . '</h3>';
	if ( ! empty( $story['dek'] ) ) {
		$h .= '<p class="wrrapd-wj__dek wrrapd-wj__dek--sm">' . esc_html( (string) $story['dek'] ) . '</p>';
	}
	$h .= '<div class="wrrapd-wj__prose">' . wrrapd_welcome_render_sections_html( $story, 0, 2 ) . '</div>';
	if ( count( $secs ) > 2 || ! empty( $story['tip'] ) ) {
		$h .= '<details class="wrrapd-wj__more"><summary class="wrrapd-wj__more-btn">' . esc_html__( 'Keep reading', 'wrrapd' ) . '</summary>';
		$h .= '<div class="wrrapd-wj__prose">' . wrrapd_welcome_render_sections_html( $story, 2 ) . '</div>';
		$h .= wrrapd_welcome_render_tip_html( $story );
		$h .= '</details>';
	}
	$picks = isset( $story['picks'] ) && is_array( $story['picks'] ) ? array_slice( $story['picks'], 0, 3 ) : array();
	if ( count( $picks ) > 0 ) {
		$h .= '<ul class="wrrapd-wj__picks wrrapd-wj__picks--chips">';
		foreach ( $picks as $p ) {
			if ( is_array( $p ) ) {
				$h .= wrrapd_welcome_render_pick_html( $p, true );
			}
		}
		$h .= '</ul>';
	}
	$h .= wrrapd_welcome_render_cta_html( $story );
	$h .= '</article>';
	return $h;
}

/**
 * @return list<string>
 */
function wrrapd_welcome_shop_slugs() {
	$cfg   = wrrapd_welcome_journal_config();
	$slugs = $cfg && ! empty( $cfg['shop_slugs'] ) && is_array( $cfg['shop_slugs'] ) ? $cfg['shop_slugs'] : array();
	if ( count( $slugs ) === 0 && function_exists( 'wrrapd_extension_retailer_slugs' ) ) {
		$slugs = wrrapd_extension_retailer_slugs();
	}
	$allowed = function_exists( 'wrrapd_affiliate_go_allowed_slugs' ) ? wrrapd_affiliate_go_allowed_slugs() : null;
	$out     = array();
	foreach ( $slugs as $s ) {
		$s = preg_replace( '/[^a-z0-9_-]/', '', strtolower( (string) $s ) );
		if ( $s === '' || ( is_array( $allowed ) && ! in_array( $s, $allowed, true ) ) ) {
			continue;
		}
		$out[] = $s;
	}
	return array_values( array_unique( $out ) );
}

/**
 * Full hub markup.
 */
function wrrapd_render_welcome_hub_html() {
	$cfg = wrrapd_welcome_journal_config();
	if ( ! $cfg ) {
		return '';
	}
	$user  = wp_get_current_user();
	$first = $user && $user->exists() ? trim( (string) get_user_meta( $user->ID, 'first_name', true ) ) : '';
	if ( $first === '' && $user && $user->exists() ) {
		$first = trim( (string) $user->display_name );
	}
	$journal = ! empty( $cfg['journal_name'] ) ? (string) $cfg['journal_name'] : __( 'The Wrrapd Gift Journal', 'wrrapd' );
	$month   = wp_date( 'F Y' );
	$picked  = wrrapd_welcome_stories_pick( 3 );
	$c       = wrrapd_active_campaign();
	$rail    = '';
	if ( $c ) {
		$gifts = wrrapd_campaign_hot_gifts_pick( $c, wrrapd_campaign_hot_gifts_display_count( $c ) );
		$rail  = wrrapd_render_hot_gifts_rail_html( $c, $gifts, 'full' );
	}

	ob_start();
	echo '<section id="wrrapd-welcome-hub" class="wrrapd-wj" aria-label="' . esc_attr( $journal ) . '">';
	echo '<div class="wrrapd-wj__inner">';

	// Masthead.
	echo '<header class="wrrapd-wj__masthead">';
	echo '<div class="wrrapd-wj__rule wrrapd-wj__rule--top" aria-hidden="true"><span></span><i></i><span></span></div>';
	echo '<p class="wrrapd-wj__eyebrow">' . esc_html( $journal ) . ' <span class="wrrapd-wj__eyebrow-sep" aria-hidden="true">·</span> ' . esc_html( $month ) . '</p>';
	echo '<h2 class="wrrapd-wj__masthead-title">' . esc_html( $first !== '' ? sprintf( __( 'Gift ideas while you’re here, %s', 'wrrapd' ), $first ) : __( 'Gift ideas while you’re here', 'wrrapd' ) ) . '</h2>';
	echo '<p class="wrrapd-wj__lede">' . esc_html__( 'This season’s picks and a few short guides, refreshed every week. Shop any store you like — we’ll wrap it beautifully at checkout.', 'wrrapd' ) . '</p>';
	echo '</header>';

	// Seasonal rail.
	if ( $rail !== '' ) {
		echo '<div class="wrrapd-wj__rail">' . $rail . '</div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}

	// Featured guide.
	if ( ! empty( $picked['featured'] ) ) {
		echo wrrapd_welcome_render_feature_html( $picked['featured'] ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}

	// Supporting guides.
	if ( count( $picked['more'] ) > 0 ) {
		echo '<div class="wrrapd-wj__section-head"><h3 class="wrrapd-wj__section-title">' . esc_html__( 'More from the journal', 'wrrapd' ) . '</h3></div>';
		echo '<div class="wrrapd-wj__grid wrrapd-wj__grid--' . (int) count( $picked['more'] ) . '">';
		foreach ( $picked['more'] as $s ) {
			echo wrrapd_welcome_render_story_html( $s ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		}
		echo '</div>';
	}

	// Shop-by-store band.
	$slugs = wrrapd_welcome_shop_slugs();
	if ( count( $slugs ) > 0 ) {
		echo '<section class="wrrapd-wj__shops" aria-label="' . esc_attr__( 'Shop by store', 'wrrapd' ) . '">';
		echo '<h3 class="wrrapd-wj__section-title wrrapd-wj__section-title--band">' . esc_html__( 'Shop by store', 'wrrapd' ) . '</h3>';
		echo '<p class="wrrapd-wj__shops-sub">' . esc_html__( 'Pick any of these, then choose Wrrapd at checkout.', 'wrrapd' ) . '</p>';
		echo '<ul class="wrrapd-wj__shops-list">';
		foreach ( $slugs as $slug ) {
			$url = wrrapd_welcome_link_url( array( 'slug' => $slug ) );
			if ( $url === '' ) {
				continue;
			}
			echo '<li><a class="wrrapd-wj__shop" href="' . esc_url( $url ) . '" rel="sponsored noopener noreferrer" target="_blank">';
			echo '<img src="' . esc_url( wrrapd_welcome_retailer_logo( $slug ) ) . '" width="48" height="48" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />';
			echo '<span>' . esc_html( wrrapd_welcome_retailer_label( $slug ) ) . '</span></a></li>';
		}
		echo '</ul>';
		echo '<a class="wrrapd-wj__all" href="' . esc_url( home_url( '/top-gifting-choices/' ) ) . '">' . esc_html__( 'See all featured picks', 'wrrapd' ) . ' <span aria-hidden="true">→</span></a>';
		echo '</section>';
	}

	echo '<div class="wrrapd-wj__rule wrrapd-wj__rule--bottom" aria-hidden="true"><span></span><i></i><span></span></div>';
	echo '</div></section>';
	return (string) ob_get_clean();
}

function wrrapd_output_welcome_hub_blocks() {
	if ( ! wrrapd_should_output_welcome_hub() ) {
		return;
	}
	$html = wrrapd_render_welcome_hub_html();
	if ( $html === '' ) {
		return;
	}
	echo '<div id="wrrapd-welcome-hub-slot" hidden aria-hidden="true">' . $html . '</div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	echo '<!-- wrrapd-welcome-hub:' . esc_html( implode( ',', wrrapd_welcome_active_seasons() ) ) . ' -->';
}
add_action( 'wp_footer', 'wrrapd_output_welcome_hub_blocks', 13 );

/**
 * Move the hub into the Elementor page flow (after the welcome copy / buttons row),
 * hide the old 10rem spacer, and align the hub’s gutters to the welcome heading.
 */
function wrrapd_output_welcome_hub_placement_script() {
	if ( ! wrrapd_should_output_welcome_hub() ) {
		return;
	}
	echo '<script id="wrrapd-welcome-hub-placement">';
	echo '(function(){';
	echo 'var done=false;';
	echo 'function q(sel,root){try{return (root||document).querySelector(sel);}catch(e){return null;}}';
	echo 'function pageRoot(){return q(".elementor-5576")||q(\'[data-elementor-id="5576"]\')||q(".elementor-location-single .elementor")||q("#content .elementor")||q("#content")||q("main");}';
	echo 'function anchor(root){return q(".elementor-element-4b38cef",root)||q(".elementor-element-556f615d",root)||q(".elementor-widget-text-editor",root);}';
	echo 'function align(hub){var ref=q(".elementor-element-5c3b382b .elementor-widget-container")||q(".elementor-element-5c3b382b")||q(".elementor-element-556f615d .elementor-widget-container");if(!ref)return;var r=ref.getBoundingClientRect(),h=hub.getBoundingClientRect();if(!r.width||!h.width)return;var l=Math.round(r.left-h.left),rt=Math.round(h.right-r.right);if(l>=0&&rt>=0&&(l+rt)<h.width*0.5){hub.style.setProperty("--wj-gutter-l",l+"px");hub.style.setProperty("--wj-gutter-r",rt+"px");}}';
	echo 'function place(){if(done)return true;var slot=document.getElementById("wrrapd-welcome-hub-slot");if(!slot||!slot.firstElementChild)return false;var hub=slot.firstElementChild;var root=pageRoot();if(!root)return false;var a=anchor(root);';
	echo 'var top=a;while(top&&top.parentElement&&top.parentElement!==root){top=top.parentElement;}';
	echo 'if(top&&top.parentElement===root){top.insertAdjacentElement("afterend",hub);}else{root.appendChild(hub);}';
	echo 'slot.remove();var sp=q(".elementor-element-c481830",root)||q(".elementor-element-3247e24",root);if(sp){sp.style.display="none";}';
	echo 'document.body.classList.add("wrrapd-welcome-hub-ready");done=true;align(hub);window.addEventListener("resize",function(){align(hub);});return true;}';
	echo 'document.addEventListener("DOMContentLoaded",place);window.addEventListener("load",function(){place();setTimeout(place,300);setTimeout(place,1200);});';
	echo '})();';
	echo '</script>';
}
add_action( 'wp_footer', 'wrrapd_output_welcome_hub_placement_script', 19 );
