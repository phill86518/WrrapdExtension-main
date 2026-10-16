<?php
/**
 * One-shot check: which buy build is on disk versus the one PHP already loaded.
 * Removes itself after the first request.
 */
add_action(
	'send_headers',
	static function () {
		$path = WP_CONTENT_DIR . '/mu-plugins/wrrapd-buy-for-you.php';
		$text = is_readable( $path ) ? (string) file_get_contents( $path ) : '';
		$disk = 'missing';
		if ( $text && preg_match( "/WRRAPD_BUY_BUILD', '([^']+)'/", $text, $m ) ) {
			$disk = $m[1];
		}
		if ( function_exists( 'opcache_invalidate' ) ) {
			opcache_invalidate( $path, true );
		}
		if ( ! headers_sent() ) {
			header( 'X-Wrrapd-Buy-Disk: ' . $disk );
			header( 'X-Wrrapd-Buy-Defined: ' . ( defined( 'WRRAPD_BUY_BUILD' ) ? WRRAPD_BUY_BUILD : 'undef' ) );
		}
		@unlink( __FILE__ );
	}
);
