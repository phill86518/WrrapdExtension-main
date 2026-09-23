<?php
/**
 * Plugin Name: Wrrapd Sitemap HTTP 200
 * Description: Clean public sitemap, robots.txt, noindex for account pages, and titles/descriptions for shopper URLs.
 * Author: Wrrapd
 * Version: 1.2.0
 *
 * Install: wp-content/mu-plugins/ (also required from wrrapd-orders-bridge.php) or activate as a normal plugin.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! function_exists( 'wrrapd_public_sitemap_xml' ) ) {
	/**
	 * Clean urlset — public pages only. No stylesheet, no cache comments.
	 */
	function wrrapd_public_sitemap_xml() {
		$locs = array(
			'https://wrrapd.com/',
			'https://wrrapd.com/about-us/',
			'https://wrrapd.com/contact/',
			'https://wrrapd.com/top-gifting-choices/',
			'https://wrrapd.com/privacy/',
			'https://wrrapd.com/terms/',
			'https://wrrapd.com/affiliate-disclosure/',
			'https://wrrapd.com/sms-consent/',
			'https://wrrapd.com/ecomms-policy/',
		);
		$xml  = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
		$xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
		foreach ( $locs as $loc ) {
			$xml .= '  <url><loc>' . esc_url( $loc ) . '</loc></url>' . "\n";
		}
		$xml .= '</urlset>' . "\n";
		return $xml;
	}
}

if ( ! function_exists( 'wrrapd_seo_is_shopper_host' ) ) {
	/**
	 * Shopper site only — do not rewrite titles on apply/pros portal hosts.
	 */
	function wrrapd_seo_is_shopper_host() {
		$host = isset( $_SERVER['HTTP_HOST'] ) ? strtolower( (string) wp_unslash( $_SERVER['HTTP_HOST'] ) ) : '';
		$host = preg_replace( '/:\d+$/', '', $host );
		return in_array( $host, array( 'wrrapd.com', 'www.wrrapd.com' ), true );
	}
}

if ( ! function_exists( 'wrrapd_request_path' ) ) {
	/**
	 * Normalized request path, no query string.
	 */
	function wrrapd_request_path() {
		$uri  = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '';
		$path = wp_parse_url( $uri, PHP_URL_PATH );
		$path = is_string( $path ) ? $path : '/';
		if ( $path === '' ) {
			$path = '/';
		}
		if ( $path !== '/' ) {
			$path = untrailingslashit( $path ) . '/';
		}
		return $path;
	}
}

if ( ! function_exists( 'wrrapd_is_public_sitemap_request' ) ) {
	/**
	 * Clean static sitemap we control.
	 */
	function wrrapd_is_public_sitemap_request() {
		return (bool) preg_match( '#/wrrapd-public-sitemap\.xml/?$#i', wrrapd_request_path() );
	}
}

if ( ! function_exists( 'wrrapd_serve_public_sitemap' ) ) {
	/**
	 * Serve a clean XML body and stop before W3TC appends HTML comments.
	 */
	function wrrapd_serve_public_sitemap() {
		if ( is_admin() || ! wrrapd_seo_is_shopper_host() || ! wrrapd_is_public_sitemap_request() ) {
			return;
		}
		if ( ! defined( 'DONOTCACHEPAGE' ) ) {
			define( 'DONOTCACHEPAGE', true );
		}
		status_header( 200 );
		header( 'Content-Type: application/xml; charset=UTF-8' );
		header( 'X-Robots-Tag: noindex, follow', true );
		header( 'Cache-Control: public, max-age=3600' );
		echo wrrapd_public_sitemap_xml();
		exit;
	}
}

if ( ! function_exists( 'wrrapd_is_core_sitemap_request' ) ) {
	/**
	 * True for core sitemap / stylesheet URLs (pretty or query-string).
	 */
	function wrrapd_is_core_sitemap_request() {
		if ( wrrapd_is_public_sitemap_request() ) {
			return true;
		}
		if ( function_exists( 'get_query_var' ) ) {
			$sitemap = get_query_var( 'sitemap' );
			$sheet   = get_query_var( 'sitemap-stylesheet' );
			if ( ( is_string( $sitemap ) && $sitemap !== '' ) || ( is_string( $sheet ) && $sheet !== '' ) ) {
				return true;
			}
		}
		return (bool) preg_match( '#/(?:wp-)?sitemap[^/]*\.(?:xml|xsl)/?$#i', wrrapd_request_path() );
	}
}

if ( ! function_exists( 'wrrapd_force_sitemap_http_200' ) ) {
	/**
	 * Clear the 404 flag and send 200 before cache plugins lock the status.
	 */
	function wrrapd_force_sitemap_http_200() {
		if ( is_admin() || ! wrrapd_seo_is_shopper_host() || ! wrrapd_is_core_sitemap_request() ) {
			return;
		}
		global $wp_query;
		if ( isset( $wp_query ) && $wp_query instanceof WP_Query ) {
			$wp_query->is_404 = false;
		}
		if ( ! defined( 'DONOTCACHEPAGE' ) ) {
			define( 'DONOTCACHEPAGE', true );
		}
		status_header( 200 );
		static $robots_sent = false;
		if ( ! $robots_sent && ! headers_sent() ) {
			header( 'X-Robots-Tag: noindex, follow', true );
			$robots_sent = true;
		}
	}
}

if ( ! function_exists( 'wrrapd_sitemap_rewrite_404_status_header' ) ) {
	/**
	 * @param string $status_header Full status line.
	 * @param int    $code         HTTP status code.
	 * @param string $description  Reason phrase.
	 * @param string $protocol     Protocol.
	 * @return string
	 */
	function wrrapd_sitemap_rewrite_404_status_header( $status_header, $code, $description, $protocol ) {
		unset( $description );
		if ( (int) $code !== 404 || ! wrrapd_is_core_sitemap_request() ) {
			return $status_header;
		}
		$ok = function_exists( 'get_status_header_desc' ) ? get_status_header_desc( 200 ) : 'OK';
		return $protocol . ' 200 ' . $ok;
	}
}

if ( ! function_exists( 'wrrapd_sitemap_w3tc_no_cache' ) ) {
	/**
	 * @param bool $can Whether W3TC may cache this response.
	 * @return bool
	 */
	function wrrapd_sitemap_w3tc_no_cache( $can ) {
		if ( wrrapd_is_core_sitemap_request() ) {
			return false;
		}
		return $can;
	}
}

if ( ! function_exists( 'wrrapd_sitemap_w3tc_no_comment' ) ) {
	/**
	 * W3TC appends an HTML comment after XML; Google then rejects the sitemap.
	 *
	 * @param bool $can Whether W3TC may print its footer comment.
	 * @return bool
	 */
	function wrrapd_sitemap_w3tc_no_comment( $can ) {
		if ( wrrapd_is_core_sitemap_request() ) {
			return false;
		}
		return $can;
	}
}

if ( ! function_exists( 'wrrapd_sitemap_drop_users_provider' ) ) {
	/**
	 * @param WP_Sitemaps_Provider|false $provider Provider.
	 * @param string                     $name     Provider name.
	 * @return WP_Sitemaps_Provider|false
	 */
	function wrrapd_sitemap_drop_users_provider( $provider, $name ) {
		if ( $name === 'users' ) {
			return false;
		}
		return $provider;
	}
}

if ( ! function_exists( 'wrrapd_seo_noindex_paths' ) ) {
	/**
	 * Account / auth / private pages that should not appear in Google.
	 *
	 * @return string[]
	 */
	function wrrapd_seo_noindex_paths() {
		return array(
			'/login/',
			'/register/',
			'/members/',
			'/logout/',
			'/account/',
			'/my-account/',
			'/my-account-2/',
			'/password-reset/',
			'/welcome/',
			'/decline-offer/',
			'/06-email_verification/',
			'/my-orders/',
		);
	}
}

if ( ! function_exists( 'wrrapd_seo_is_noindex_request' ) ) {
	/**
	 * True for private shopper/account URLs and author archives.
	 */
	function wrrapd_seo_is_noindex_request() {
		if ( ! wrrapd_seo_is_shopper_host() ) {
			return false;
		}
		$path = wrrapd_request_path();
		if ( in_array( $path, wrrapd_seo_noindex_paths(), true ) ) {
			return true;
		}
		return (bool) preg_match( '#^/author/#', $path );
	}
}

if ( ! function_exists( 'wrrapd_seo_public_map' ) ) {
	/**
	 * Shopper-facing titles and descriptions for the public sitemap URLs.
	 *
	 * @return array<string, array{title:string, description:string}>
	 */
	function wrrapd_seo_public_map() {
		return array(
			'/'                         => array(
				'title'       => 'Wrrapd | Wrapping Happiness',
				'description' => 'Shop as usual. We wrap your gift at checkout.',
			),
			'/about-us/'                => array(
				'title'       => 'About Wrrapd',
				'description' => 'Wrrapd wraps gifts at checkout so every present feels personal.',
			),
			'/contact/'                 => array(
				'title'       => 'Contact Wrrapd',
				'description' => 'How can we help — shopper, pro, and press contact paths.',
			),
			'/top-gifting-choices/'     => array(
				'title'       => 'Top gifting choices | Wrrapd',
				'description' => 'Hand-picked gift ideas — chocolates, beauty, electronics, and more.',
			),
			'/privacy/'                 => array(
				'title'       => 'Privacy policy | Wrrapd',
				'description' => 'How Wrrapd collects and uses your information.',
			),
			'/terms/'                   => array(
				'title'       => 'Terms of use | Wrrapd',
				'description' => 'Terms for using Wrrapd’s website, extension, and gift-wrap services.',
			),
			'/affiliate-disclosure/'    => array(
				'title'       => 'Affiliate disclosure | Wrrapd',
				'description' => 'We may earn a commission if you buy through a partner link. No extra cost to you.',
			),
			'/sms-consent/'             => array(
				'title'       => 'Text messages | Wrrapd',
				'description' => 'Opt in to Wrrapd text updates.',
			),
			'/ecomms-policy/'           => array(
				'title'       => 'Electronic communications | Wrrapd',
				'description' => 'How Wrrapd sends account notices electronically.',
			),
		);
	}
}

if ( ! function_exists( 'wrrapd_seo_for_request' ) ) {
	/**
	 * @return array{title:string, description:string}|null
	 */
	function wrrapd_seo_for_request() {
		if ( ! wrrapd_seo_is_shopper_host() ) {
			return null;
		}
		$map  = wrrapd_seo_public_map();
		$path = wrrapd_request_path();
		return isset( $map[ $path ] ) ? $map[ $path ] : null;
	}
}

if ( ! function_exists( 'wrrapd_seo_pre_get_document_title' ) ) {
	/**
	 * @param string $title Current title.
	 * @return string
	 */
	function wrrapd_seo_pre_get_document_title( $title ) {
		$seo = wrrapd_seo_for_request();
		return $seo ? $seo['title'] : $title;
	}
}

if ( ! function_exists( 'wrrapd_seo_document_title_parts' ) ) {
	/**
	 * @param array $parts Title parts.
	 * @return array
	 */
	function wrrapd_seo_document_title_parts( $parts ) {
		$seo = wrrapd_seo_for_request();
		if ( ! $seo ) {
			return $parts;
		}
		$parts['title'] = $seo['title'];
		$parts['site']  = '';
		return $parts;
	}
}

if ( ! function_exists( 'wrrapd_seo_wp_robots' ) ) {
	/**
	 * @param array $robots Robots directives.
	 * @return array
	 */
	function wrrapd_seo_wp_robots( $robots ) {
		if ( ! wrrapd_seo_is_noindex_request() ) {
			return $robots;
		}
		$robots['noindex']  = true;
		$robots['nofollow'] = true;
		return $robots;
	}
}

if ( ! function_exists( 'wrrapd_seo_output_head' ) ) {
	/**
	 * Meta description, OG tags, and Organization JSON-LD on public pages.
	 */
	function wrrapd_seo_output_head() {
		if ( is_admin() ) {
			return;
		}
		if ( wrrapd_seo_is_noindex_request() ) {
			echo '<meta name="robots" content="noindex, nofollow" />' . "\n";
			return;
		}
		$seo = wrrapd_seo_for_request();
		if ( ! $seo ) {
			return;
		}
		$url = home_url( wrrapd_request_path() );
		echo '<meta name="description" content="' . esc_attr( $seo['description'] ) . '" />' . "\n";
		echo '<meta property="og:title" content="' . esc_attr( $seo['title'] ) . '" />' . "\n";
		echo '<meta property="og:description" content="' . esc_attr( $seo['description'] ) . '" />' . "\n";
		echo '<meta property="og:url" content="' . esc_url( $url ) . '" />' . "\n";
		echo '<meta property="og:type" content="website" />' . "\n";
		echo '<meta property="og:site_name" content="Wrrapd" />' . "\n";
		if ( wrrapd_request_path() === '/' ) {
			$schema = wp_json_encode(
				array(
					'@context' => 'https://schema.org',
					'@type'    => 'Organization',
					'name'     => 'Wrrapd',
					'url'      => 'https://wrrapd.com/',
					'email'    => 'help@wrrapd.com',
					'telephone'=> '+1-844-638-5484',
				),
				JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
			);
			if ( is_string( $schema ) ) {
				echo '<script type="application/ld+json">' . $schema . '</script>' . "\n";
			}
		}
	}
}

if ( ! function_exists( 'wrrapd_seo_robots_txt' ) ) {
	/**
	 * Point crawlers at the working public sitemap; keep junk query URLs out.
	 *
	 * @param string $output Robots.txt body.
	 * @param bool   $public Whether the blog is public.
	 * @return string
	 */
	function wrrapd_seo_robots_txt( $output, $public ) {
		unset( $public );
		if ( ! wrrapd_seo_is_shopper_host() ) {
			return $output;
		}
		$output = preg_replace( '/^Sitemap:\s*.+$/mi', '', (string) $output );
		$output = rtrim( (string) $output ) . "\n";
		$extra  = array(
			'Disallow: /*?add-to-wishlist=',
			'Disallow: /*?*add-to-wishlist=',
			'Disallow: /*?add_to_compare=',
			'Disallow: /*?*add_to_compare=',
			'',
			'Sitemap: https://wrrapd.com/wrrapd-public-sitemap.xml',
		);
		foreach ( $extra as $line ) {
			if ( $line !== '' && strpos( $output, $line ) !== false ) {
				continue;
			}
			$output .= $line . "\n";
		}
		return $output;
	}
}

if ( ! has_action( 'init', 'wrrapd_serve_public_sitemap' ) ) {
	add_action( 'init', 'wrrapd_serve_public_sitemap', 0 );
	add_action( 'parse_query', 'wrrapd_force_sitemap_http_200', 1 );
	add_action( 'wp', 'wrrapd_force_sitemap_http_200', 0 );
	add_action( 'template_redirect', 'wrrapd_force_sitemap_http_200', 0 );
	add_action( 'send_headers', 'wrrapd_force_sitemap_http_200', 0 );
	add_filter( 'status_header', 'wrrapd_sitemap_rewrite_404_status_header', 99, 4 );
	add_filter( 'w3tc_can_cache', 'wrrapd_sitemap_w3tc_no_cache' );
	add_filter( 'w3tc_can_print_comment', 'wrrapd_sitemap_w3tc_no_comment' );
	add_filter( 'wp_sitemaps_add_provider', 'wrrapd_sitemap_drop_users_provider', 10, 2 );
	add_filter( 'pre_get_document_title', 'wrrapd_seo_pre_get_document_title', 99999 );
	add_filter( 'document_title_parts', 'wrrapd_seo_document_title_parts', 1000 );
	add_filter( 'wp_robots', 'wrrapd_seo_wp_robots' );
	add_action( 'wp_head', 'wrrapd_seo_output_head', 1 );
	add_filter( 'robots_txt', 'wrrapd_seo_robots_txt', 99, 2 );
}
