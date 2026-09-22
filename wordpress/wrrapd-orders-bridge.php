<?php
/**
 * Plugin Name: Wrrapd Orders Bridge (MU)
 * Description: Orders bridge (claim + list shortcodes + studio layout) for Ulta, LEGO, Target, and Amazon; logout nonce fix; strip leading admin sort prefixes (e.g. 07.) from front-end titles (Elementor, menus, Yoast/Rank Math).
 * Author: Wrrapd
 *
 * Install: copy wrrapd-orders-bridge.php to wp-content/mu-plugins/ (required).
 * Also copy wrrapd-account-critical.css and wrrapd-auth-critical.css to the same mu-plugins/ folder.
 * Define WRRAPD_INTERNAL_API_KEY and optionally WRRAPD_API_BASE in wp-config.php — see wordpress/README.md in the monorepo.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Bump when account UI / header polish changes — view-source should contain this string. */
define( 'WRRAPD_MU_BUILD', '2026-09-22-hire-chrome-gate' );

/** Published Chrome Web Store item id (Wrrapd 3.0.10+). */
if ( ! defined( 'WRRAPD_CHROME_EXTENSION_ID' ) ) {
	define( 'WRRAPD_CHROME_EXTENSION_ID', 'kdfcahdcgpaoohpgagpmpbgcmkdbocbg' );
}

/** Wordmark gold — letters “p” and “d” in the Wrrapd logo. Never neon #f7ff00 / #fff300. */
if ( ! defined( 'WRRAPD_LOGO_GOLD' ) ) {
	define( 'WRRAPD_LOGO_GOLD', '#f6b933' );
}

/** Header / footer chrome — deep navy, slightly lifted from #060014 so it does not read as black. */
if ( ! defined( 'WRRAPD_NAVY_DEEP' ) ) {
	define( 'WRRAPD_NAVY_DEEP', '#0c0638' );
}

/**
 * Hire / onboarding hosts (apply + pros). Prefer HTTP_HOST so shopper chrome never
 * depends on WrapStars MU load order — false negatives were leaking ticker/wheels onto apply.
 *
 * @return bool
 */
function wrrapd_is_hire_portal_host() {
	static $cached = null;
	if ( $cached !== null ) {
		return $cached;
	}
	$host = isset( $_SERVER['HTTP_HOST'] ) ? strtolower( (string) $_SERVER['HTTP_HOST'] ) : '';
	$host = preg_replace( '/:\d+$/', '', $host );
	$hire_hosts = array( 'apply.wrrapd.com', 'pros.wrrapd.com' );
	if ( defined( 'WRRAPD_WRAPSTARS_APPLY_HOST' ) && WRRAPD_WRAPSTARS_APPLY_HOST !== '' ) {
		$hire_hosts[] = strtolower( (string) WRRAPD_WRAPSTARS_APPLY_HOST );
	}
	if ( defined( 'WRRAPD_WRAPSTARS_PROS_HOST' ) && WRRAPD_WRAPSTARS_PROS_HOST !== '' ) {
		$hire_hosts[] = strtolower( (string) WRRAPD_WRAPSTARS_PROS_HOST );
	}
	$hire_hosts = array_values( array_unique( $hire_hosts ) );
	if ( in_array( $host, $hire_hosts, true ) ) {
		$cached = true;
		return true;
	}
	if ( function_exists( 'wrrapd_wrapstars_is_portal_host' ) && wrrapd_wrapstars_is_portal_host() ) {
		$cached = true;
		return true;
	}
	if ( function_exists( 'wrrapd_drivers_is_portal_host' ) && wrrapd_drivers_is_portal_host() ) {
		$cached = true;
		return true;
	}
	if ( function_exists( 'wrrapd_wrapriders_is_portal_host' ) && wrrapd_wrapriders_is_portal_host() ) {
		$cached = true;
		return true;
	}
	$cached = false;
	return false;
}

/**
 * Front-end fingerprint so SiteGround deploys are verifiable in view-source.
 */
function wrrapd_output_mu_build_comment() {
	if ( is_admin() ) {
		return;
	}
	echo '<!-- WRRAPD_MU_BUILD ' . esc_html( WRRAPD_MU_BUILD ) . ' -->' . "\n";
	if ( wrrapd_is_hire_portal_host() ) {
		echo '<!-- wrrapd-hire-portal-host: shopper ticker/wheels suppressed -->' . "\n";
	}
}
add_action( 'wp_head', 'wrrapd_output_mu_build_comment', 0 );

/**
 * Nuclear CSS: if any shopper chrome still leaks onto hire hosts, hide it.
 */
function wrrapd_output_hire_portal_shopper_chrome_kill() {
	if ( is_admin() || ! wrrapd_is_hire_portal_host() ) {
		return;
	}
	echo '<style id="wrrapd-hire-no-shopper-chrome">';
	echo '#wrrapd-retailer-wheels-row,.wrrapd-retailer-wheels-row,#wrrapd-retailer-wheels-strip,.wrrapd-retailer-wheels,';
	echo '.occasion-ticker-shell,#occasionTickerShell,#occasionTickerContainer,.occasion-ticker-panel,.occasion-ticker,';
	echo '.wrrapd-hot-gifts-rail,.wrrapd-hot-gifts-rail--below-ticker,.wrrapd-hot-gifts-rail--in-ticker-shell,';
	echo '.elementor-location-header{display:none!important;visibility:hidden!important;height:0!important;max-height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;border:0!important;}';
	echo '</style>';
}
add_action( 'wp_head', 'wrrapd_output_hire_portal_shopper_chrome_kill', 1 );

$wrrapd_seasonal = dirname( __FILE__ ) . '/wrrapd-seasonal-campaigns.php';
if ( is_readable( $wrrapd_seasonal ) ) {
	require_once $wrrapd_seasonal;
} elseif ( ! is_admin() ) {
	add_action(
		'wp_footer',
		static function () {
			if ( is_front_page() || is_home() ) {
				echo '<!-- wrrapd-seasonal-campaigns.php MISSING from wp-content/mu-plugins/ -->';
			}
		},
		1
	);
}

$wrrapd_gift_popup = dirname( __FILE__ ) . '/wrrapd-gift-wrap-popup.php';
if ( is_readable( $wrrapd_gift_popup ) ) {
	require_once $wrrapd_gift_popup;
}

$wrrapd_sitemap_status = dirname( __FILE__ ) . '/wrrapd-sitemap-status.php';
if ( is_readable( $wrrapd_sitemap_status ) ) {
	require_once $wrrapd_sitemap_status;
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
 * Matches: "07. My Orders", "07.My Orders", "7. My", "13b Register" — avoids "3.14 Pi" (no space after dot, single digit before dot).
 */
function wrrapd_strip_leading_title_sort_prefix( $title ) {
	if ( is_admin() || ! is_string( $title ) || $title === '' ) {
		return $title;
	}
	$out = preg_replace( '/^(?:(?:\d{2,}\.)|(?:\d+\.\s+)|(?:\d+[a-zA-Z]\s+))\s*/u', '', $title );
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
 * Canonical URL for the logged-in “Your orders” header button and account links.
 */
function wrrapd_orders_page_url() {
	if ( defined( 'WRRAPD_ORDERS_PAGE_URL' ) && is_string( WRRAPD_ORDERS_PAGE_URL ) && WRRAPD_ORDERS_PAGE_URL !== '' ) {
		return esc_url( WRRAPD_ORDERS_PAGE_URL );
	}
	return home_url( '/my-orders/' );
}

/**
 * Body classes for account / about / orders styling hooks.
 *
 * @param list<string> $classes Existing classes.
 * @return list<string>
 */
function wrrapd_body_class_site_pages( $classes ) {
	if ( is_page( array( 4621, 5284 ) ) || is_page( array( 'my-account-2', 'account' ) ) ) {
		$classes[] = 'wrrapd-account-page';
	}
	if ( is_page( 4548 ) || is_page( 'about-us' ) ) {
		$classes[] = 'wrrapd-about-polish';
	}
	if ( is_page( 131 ) || is_page( 'contact' ) ) {
		$classes[] = 'wrrapd-contact-page';
	}
	if ( is_page( 'my-orders' ) ) {
		$classes[] = 'wrrapd-orders-page';
	}
	if ( wrrapd_is_auth_page() ) {
		$classes[] = 'wrrapd-auth-page';
	}
	return $classes;
}
add_filter( 'body_class', 'wrrapd_body_class_site_pages' );

/**
 * Public URL for the red-W / gold-bow favicon pack in mu-plugins/icons/favicon/.
 *
 * @param string $file Filename inside that folder.
 * @return string
 */
function wrrapd_brand_favicon_url( $file = 'icon-192.png' ) {
	$file  = ltrim( (string) $file, '/' );
	$local = dirname( __FILE__ ) . '/icons/favicon/' . $file;
	if ( is_readable( $local ) ) {
		return content_url( 'mu-plugins/icons/favicon/' . $file );
	}
	return 'https://wrrapd.com/wp-content/mu-plugins/icons/favicon/' . $file;
}

/**
 * Public URL for a file in mu-plugins/icons/ (career role marks, etc.).
 *
 * @param string $file Filename in that folder.
 * @return string
 */
function wrrapd_mu_icon_url( $file ) {
	$file  = ltrim( (string) $file, '/' );
	$local = dirname( __FILE__ ) . '/icons/' . $file;
	if ( is_readable( $local ) ) {
		return content_url( 'mu-plugins/icons/' . $file );
	}
	return 'https://wrrapd.com/wp-content/mu-plugins/icons/' . $file;
}

/**
 * Prefer an inline data URI so career icons never 404 on hosts without /icons.
 *
 * @param string $file Filename in wordpress/icons/.
 * @return string
 */
function wrrapd_mu_icon_src( $file ) {
	$file  = ltrim( (string) $file, '/' );
	$local = dirname( __FILE__ ) . '/icons/' . $file;
	if ( is_readable( $local ) ) {
		return 'data:image/png;base64,' . base64_encode( (string) file_get_contents( $local ) );
	}
	return wrrapd_mu_icon_url( $file );
}

/**
 * Shopper-site tab icons. Hire hosts print their own links in wrapstars.php.
 */
function wrrapd_output_site_favicons() {
	if ( is_admin() ) {
		return;
	}
	if ( function_exists( 'wrrapd_wrapstars_is_portal_host' ) && wrrapd_wrapstars_is_portal_host() ) {
		return;
	}
	if ( ! is_readable( dirname( __FILE__ ) . '/icons/favicon/favicon.ico' ) ) {
		return;
	}
	// Kill core Site Icon tags so old Media Library / floating-W uploads cannot win.
	remove_action( 'wp_head', 'wp_site_icon', 99 );
	$ico = wrrapd_brand_favicon_url( 'favicon.ico' );
	$p32 = wrrapd_brand_favicon_url( 'icon-32.png' );
	$p192 = wrrapd_brand_favicon_url( 'icon-192.png' );
	$p180 = wrrapd_brand_favicon_url( 'icon-180.png' );
	echo '<link rel="icon" href="' . esc_url( $ico ) . '" sizes="any" />' . "\n";
	echo '<link rel="icon" type="image/png" href="' . esc_url( $p32 ) . '" sizes="32x32" />' . "\n";
	echo '<link rel="icon" type="image/png" href="' . esc_url( $p192 ) . '" sizes="192x192" />' . "\n";
	echo '<link rel="apple-touch-icon" href="' . esc_url( $p180 ) . '" />' . "\n";
}
add_action( 'wp_head', 'wrrapd_output_site_favicons', 2 );

/**
 * Point WordPress Site Icon (admin bar, apple-touch fallback) at the new pack.
 *
 * @param string $url  Current icon URL.
 * @param int    $size Requested pixel size.
 * @return string
 */
function wrrapd_filter_site_icon_url( $url, $size ) {
	if ( ! is_readable( dirname( __FILE__ ) . '/icons/favicon/icon-192.png' ) ) {
		return $url;
	}
	$size = (int) $size;
	if ( $size > 0 && $size <= 32 ) {
		return wrrapd_brand_favicon_url( 'icon-32.png' );
	}
	if ( $size > 0 && $size <= 192 ) {
		return wrrapd_brand_favicon_url( 'icon-192.png' );
	}
	return wrrapd_brand_favicon_url( 'icon-512.png' );
}
add_filter( 'get_site_icon_url', 'wrrapd_filter_site_icon_url', 20, 2 );

/**
 * Compact header + logged-in member cluster (overrides legacy inline greeting styles).
 */
function wrrapd_output_header_member_css() {
	if ( is_admin() ) {
		return;
	}
	echo '<style id="wrrapd-header-member-css">';
	echo 'body.logged-in .elementor-location-header .greeting-container{margin:0!important;margin-left:0!important;text-align:right!important;width:auto!important;}';
	echo 'body.logged-in .elementor-location-header [data-id="69de726e"],body.logged-in .elementor-location-header [data-id="2ca99876"]{display:none!important;}';
	echo '.wrrapd-header-member{display:flex;flex-direction:column;align-items:flex-end;gap:.2rem;width:100%;max-width:11.75rem;margin-left:auto;}';
	echo '.wrrapd-header-member-top{width:100%;}.wrrapd-header-member-top .elementor-nav-menu--main ul{display:flex!important;flex-direction:row!important;justify-content:flex-end!important;gap:.65rem!important;margin:0!important;padding:0!important;}';
	echo '.wrrapd-header-member-top .elementor-item{font-size:clamp(.8rem,2vmin,.875rem)!important;font-weight:700!important;padding:0!important;line-height:1.25!important;}';
	echo '.wrrapd-header-member-greet .greeting-text,.elementor-location-header .greeting-text{margin:0!important;font-size:clamp(.82rem,2.1vmin,.9rem)!important;font-weight:600!important;text-align:right!important;color:' . WRRAPD_LOGO_GOLD . '!important;}';
	echo '.wrrapd-header-user-actions{display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;gap:.28rem!important;justify-content:flex-end!important;align-items:center!important;margin:0!important;width:100%!important;}';
	echo '.wrrapd-header-user-actions .gift-ideas-button{display:inline-block!important;width:auto!important;min-width:0!important;flex:1 1 auto;max-width:5.75rem;font-family:Helvetica,Arial,sans-serif!important;font-size:.68rem!important;font-weight:700!important;color:#0f0351!important;background-color:' . WRRAPD_LOGO_GOLD . '!important;border:.0625rem solid #0f0351!important;padding:.22rem .45rem!important;border-radius:1.25rem!important;text-decoration:none!important;text-align:center!important;white-space:nowrap!important;margin:0!important;line-height:1.2!important;box-sizing:border-box!important;}';
	echo '.wrrapd-header-user-actions .gift-ideas-button:hover{filter:brightness(1.05);}';
	echo '@media(max-width:393px){body.logged-in .wrrapd-header-member{max-width:100%!important;gap:.06rem!important;}body.logged-in .wrrapd-header-member-top .elementor-item{font-size:.46rem!important;padding:0!important;line-height:1.1!important;}body.logged-in .greeting-text{font-size:.44rem!important;line-height:1.1!important;}body.logged-in .wrrapd-header-user-actions{gap:.15rem!important;}body.logged-in .wrrapd-header-user-actions .gift-ideas-button{font-size:.4rem!important;padding:.08rem .18rem!important;max-width:3.85rem!important;border-radius:.65rem!important;}}';
	echo '</style>';
}
add_action( 'wp_head', 'wrrapd_output_header_member_css', 99 );

/**
 * Logged-in header: stack Account / greeting / pills; inject “Your orders” beside Hot Gifts.
 */
function wrrapd_output_header_member_polish_script() {
	if ( is_admin() ) {
		return;
	}
	$url_json = wp_json_encode( wrrapd_orders_page_url() );
	echo '<script id="wrrapd-header-member-polish">';
	echo '(function(){var U=' . $url_json . ';function hideDupAccountTitles(){if(!document.body.classList.contains("wrrapd-account-page"))return;document.querySelectorAll("h1.elementor-heading-title,h2.elementor-heading-title,.entry-title").forEach(function(h){if(/^Account\\s*$/i.test((h.textContent||"").trim()))h.style.display="none";});}function firstName(){var i=document.getElementById("wrrapd-user-first-name");return i&&i.value?i.value:"User";}function polish(){hideDupAccountTitles();if(!document.body.classList.contains("logged-in"))return;var header=document.querySelector(".elementor-location-header");if(!header)return;var rightCol=header.querySelector(\'[data-id="693b4ea7"]\');var nav=header.querySelector(\'[data-id="1112277b"]\');var greeting=header.querySelector("#greeting-message")||header.querySelector(".greeting-container");if(!rightCol||!nav||!greeting)return;greeting.style.display="block";greeting.style.margin="0";greeting.style.marginLeft="0";greeting.style.textAlign="right";greeting.style.width="auto";var nameEl=document.getElementById("user-first-name");if(nameEl)nameEl.textContent=firstName();var panel=header.querySelector(".wrrapd-header-member");if(!panel){panel=document.createElement("div");panel.className="wrrapd-header-member";rightCol.insertBefore(panel,rightCol.firstChild);var top=document.createElement("div");top.className="wrrapd-header-member-top";top.appendChild(nav);panel.appendChild(top);var greetRow=document.createElement("div");greetRow.className="wrrapd-header-member-greet";var hello=greeting.querySelector(".greeting-text");if(hello)greetRow.appendChild(hello);panel.appendChild(greetRow);var pills=document.createElement("div");pills.className="wrrapd-header-user-actions";var hot=greeting.querySelector(".gift-ideas-button:not(.wrrapd-your-orders-button)");if(hot){hot.style.display="";hot.style.marginTop="0";hot.style.width="auto";pills.appendChild(hot);}panel.appendChild(pills);}var pillsRow=panel.querySelector(".wrrapd-header-user-actions");if(pillsRow){var hotBtn=pillsRow.querySelector(".gift-ideas-button:not(.wrrapd-your-orders-button)");if(hotBtn){hotBtn.style.width="auto";hotBtn.style.marginTop="0";}if(!panel.querySelector(".wrrapd-your-orders-button")){var a=document.createElement("a");a.href=U;a.className="gift-ideas-button wrrapd-your-orders-button";a.textContent="Your orders";pillsRow.appendChild(a);}}var loginStack=header.querySelector(\'[data-id="2b05a213"]\');if(loginStack){loginStack.style.display="";var g=loginStack.querySelector(\'[data-id="69de726e"]\');var am=loginStack.querySelector(\'[data-id="2ca99876"]\');if(g)g.style.display="none";if(am)am.style.display="none";}header.dataset.wrrapdMemberPolished="1";}function run(){polish();}document.addEventListener("DOMContentLoaded",run);window.addEventListener("load",run);setTimeout(run,400);setTimeout(run,1200);})();';
	echo '</script>';
}
add_action( 'wp_footer', 'wrrapd_output_header_member_polish_script', 22 );

/**
 * Header "Delivering to" — reliable geolocation with Jacksonville fallback.
 * Elementor HTML widget still renders #wrrapd-location / #location-text; this MU script
 * runs in the footer (after the header DOM exists) and fixes stuck "Loading..." when ipapi fails.
 */
function wrrapd_output_header_location_script() {
	if ( is_admin() ) {
		return;
	}
	$fallback = wp_json_encode( 'Jacksonville, FL 32218' );
	echo '<script id="wrrapd-header-location">';
	echo '(function(){';
	echo 'var FALLBACK=' . $fallback . ';';
	echo 'function target(){return document.querySelector("#location-text strong");}';
	echo 'function paint(text){var el=target();if(!el)return false;el.textContent=text;el.style.color="#FFFFFF";return true;}';
	echo 'function fromIp(){if(typeof fetch!=="function"){paint(FALLBACK);return;}fetch("https://ipapi.co/json/",{credentials:"omit"}).then(function(r){return r.ok?r.json():null;}).then(function(d){if(d&&d.city&&d.region_code){var zip=d.postal||"";paint(d.city+", "+d.region_code+(zip?" "+zip:""));return;}paint(FALLBACK);}).catch(function(){paint(FALLBACK);});}';
	echo 'function resolve(){var el=target();if(!el)return;var cur=(el.textContent||"").trim();if(cur&&cur!=="Loading..."&&cur!=="Loading…")return;if(typeof fetch!=="function"){fromIp();return;}fetch("/get-user-address",{credentials:"same-origin"}).then(function(r){return r.ok?r.json():null;}).then(function(d){if(d&&d.address){paint(d.address);return;}fromIp();}).catch(function(){fromIp();});}';
	echo 'function run(){resolve();}document.addEventListener("DOMContentLoaded",run);window.addEventListener("load",function(){run();setTimeout(run,600);setTimeout(run,1800);});';
	echo '})();';
	echo '</script>';
}
add_action( 'wp_footer', 'wrrapd_output_header_location_script', 19 );

/**
 * My Account page: hero fallback + hide duplicate plugin “Account” headings.
 */
function wrrapd_output_account_page_polish_script() {
	if ( is_admin() || ! is_page( array( 4621, 5284, 'my-account-2', 'account' ) ) ) {
		return;
	}
	$orders_url = wp_json_encode( wrrapd_orders_page_url() );
	echo '<script id="wrrapd-account-page-polish">';
	echo '(function(){var U=' . $orders_url . ';function polishAccount(){if(!document.body.classList.contains("wrrapd-account-page"))return;var root=document.querySelector(".user-registration-MyAccount");if(!root)return;if(!document.querySelector(".wrrapd-account-hero")){var hero=document.createElement("div");hero.className="wrrapd-account-hero-injected";hero.innerHTML=\'<p class="wrrapd-page-eyebrow">Signed in</p><h1>Your profile</h1><p class="wrrapd-page-lede">Update your name and login details below. Use the menu for password and privacy settings—or jump to <a href="\'+U+\'">your orders</a> anytime.</p>\';var anchor=root.closest(".wrrapd-account-layout")||root.parentElement;if(anchor)anchor.insertBefore(hero,root);}document.querySelectorAll(".user-registration-MyAccount-content h1,.user-registration-MyAccount-content h2,.user-registration-MyAccount-content h3,.user-registration-MyAccount-content header,.user-registration-MyAccount-content .ur-form-title").forEach(function(h){var t=(h.textContent||"").replace(/\\s+/g," ").trim();if(/^account$/i.test(t))h.style.display="none";});document.querySelectorAll("h1.elementor-heading-title,h2.elementor-heading-title,.entry-title").forEach(function(h){if(/^Account\\s*$/i.test((h.textContent||"").trim()))h.style.display="none";});}document.addEventListener("DOMContentLoaded",polishAccount);window.addEventListener("load",polishAccount);})();';
	echo '</script>';
}
add_action( 'wp_footer', 'wrrapd_output_account_page_polish_script', 21 );

/**
 * Whether the current request is the User Registration My Account page.
 */
function wrrapd_is_account_page() {
	return ! is_admin() && is_page( array( 4621, 5284, 'my-account-2', 'account' ) );
}

/**
 * My Account: critical CSS in footer (loads AFTER User Registration plugin styles).
 */
function wrrapd_output_account_page_critical_css() {
	if ( ! wrrapd_is_account_page() ) {
		return;
	}
	echo '<link rel="preconnect" href="https://fonts.googleapis.com" />';
	echo '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />';
	echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560&amp;family=Source+Sans+3:wght@400;600;700;800&amp;display=swap" />';
	$path = dirname( __FILE__ ) . '/wrrapd-account-critical.css';
	$css  = is_readable( $path ) ? file_get_contents( $path ) : '';
	if ( ! is_string( $css ) || $css === '' ) {
		echo '<!-- wrrapd-account-critical.css MISSING — upload wordpress/wrrapd-account-critical.css to wp-content/mu-plugins/ -->';
		echo '<!-- ' . esc_html( WRRAPD_MU_BUILD ) . ' -->';
		return;
	}
	echo '<style id="wrrapd-account-critical-css">' . $css . '</style>';
	echo '<!-- ' . esc_html( WRRAPD_MU_BUILD ) . ' -->';
}
add_action( 'wp_footer', 'wrrapd_output_account_page_critical_css', 9999 );

/**
 * Login / register / password-reset / welcome / verification / SMS consent pages.
 *
 * @return array{ids:list<int>,slugs:list<string>}
 */
function wrrapd_auth_page_refs() {
	return array(
		'ids'   => array( 5280, 5281, 5285, 5234, 5576, 6202 ),
		'slugs' => array( 'login', 'register', 'password-reset', '06-email_verification', 'welcome', 'sms-consent' ),
	);
}

/**
 * Whether the current request is a front-end auth/onboarding page (Fraunces typography).
 */
function wrrapd_is_auth_page() {
	if ( is_admin() ) {
		return false;
	}
	$refs = wrrapd_auth_page_refs();
	return is_page( $refs['ids'] ) || is_page( $refs['slugs'] );
}

/**
 * Auth flow pages: Fraunces typography (footer load wins over UM + Elementor defaults).
 */
function wrrapd_output_auth_page_critical_css() {
	if ( ! wrrapd_is_auth_page() ) {
		return;
	}
	echo '<link rel="preconnect" href="https://fonts.googleapis.com" />';
	echo '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />';
	echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,560;1,9..144,560&amp;display=swap" />';
	$path = dirname( __FILE__ ) . '/wrrapd-auth-critical.css';
	$css  = is_readable( $path ) ? file_get_contents( $path ) : '';
	if ( ! is_string( $css ) || $css === '' ) {
		echo '<!-- wrrapd-auth-critical.css MISSING — upload wordpress/wrrapd-auth-critical.css to wp-content/mu-plugins/ -->';
		echo '<!-- ' . esc_html( WRRAPD_MU_BUILD ) . ' -->';
		return;
	}
	echo '<style id="wrrapd-auth-critical-css">' . $css . '</style>';
	echo '<!-- ' . esc_html( WRRAPD_MU_BUILD ) . ' -->';
}
add_action( 'wp_footer', 'wrrapd_output_auth_page_critical_css', 9999 );

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
	$dir = wrrapd_mu_logos_dir();
	$path = $dir . '/' . $slug . '.png';
	if ( is_readable( $path ) ) {
		return plugin_dir_url( __FILE__ ) . 'logos/' . $slug . '.png';
	}
	return 'https://www.google.com/s2/favicons?domain=' . rawurlencode( (string) $favicon_domain ) . '&sz=64';
}

/**
 * Allowed slugs for /go/{slug}/ affiliate hop (must match wheel + wp-config constants).
 *
 * @return list<string>
 */
function wrrapd_affiliate_go_allowed_slugs() {
	return array(
		'ulta',
		'lego',
		'target',
		'amazon',
		'walmart',
		'nordstrom',
		'kohls',
		'sephora',
		'etsy',
		'bestbuy',
		'giftcards',
		'booksamillion',
		'russellstover',
		'freshroastedcoffee',
		'zchocolat',
		'gearup',
		'vyjewelry',
		'peetscoffee',
	);
}

/**
 * wp-config constant name for optional Impact / network deep link (HTTPS URL only).
 *
 * @param string $slug Lowercase slug.
 */
function wrrapd_affiliate_go_constant_for_slug( $slug ) {
	$map = array(
		'ulta'      => 'WRRAPD_AFFILIATE_REDIRECT_ULTA',
		'lego'      => 'WRRAPD_AFFILIATE_REDIRECT_LEGO',
		'target'    => 'WRRAPD_AFFILIATE_REDIRECT_TARGET',
		'amazon'    => 'WRRAPD_AFFILIATE_REDIRECT_AMAZON',
		'walmart'   => 'WRRAPD_AFFILIATE_REDIRECT_WALMART',
		'nordstrom' => 'WRRAPD_AFFILIATE_REDIRECT_NORDSTROM',
		'kohls'     => 'WRRAPD_AFFILIATE_REDIRECT_KOHLS',
		'sephora'   => 'WRRAPD_AFFILIATE_REDIRECT_SEPHORA',
		'etsy'           => 'WRRAPD_AFFILIATE_REDIRECT_ETSY',
		'bestbuy'        => 'WRRAPD_AFFILIATE_REDIRECT_BESTBUY',
		'giftcards'      => 'WRRAPD_AFFILIATE_REDIRECT_GIFTCARDS',
		'booksamillion'  => 'WRRAPD_AFFILIATE_REDIRECT_BOOKSAMILLION',
		'russellstover'  => 'WRRAPD_AFFILIATE_REDIRECT_RUSSELLSTOVER',
		'freshroastedcoffee' => 'WRRAPD_AFFILIATE_REDIRECT_FRESHROASTEDCOFFEE',
		'zchocolat'      => 'WRRAPD_AFFILIATE_REDIRECT_ZCHOCOLAT',
		'gearup'         => 'WRRAPD_AFFILIATE_REDIRECT_GEARUP',
		'vyjewelry'      => 'WRRAPD_AFFILIATE_REDIRECT_VYJEWELRY',
		'peetscoffee'    => 'WRRAPD_AFFILIATE_REDIRECT_PEETSCOFFEE',
	);
	$slug = strtolower( (string) $slug );
	return isset( $map[ $slug ] ) ? $map[ $slug ] : null;
}

/**
 * Public storefront URL when no affiliate constant is set (honest fallback, no cookie injection).
 *
 * @param string $slug Lowercase slug.
 */
function wrrapd_affiliate_fallback_public_url( $slug ) {
	$map = array(
		'ulta'      => 'https://www.ulta.com/shop/gifts',
		'lego'      => 'https://www.lego.com/en-us/gifts',
		'target'    => 'https://www.target.com/gift-ideas',
		'amazon'    => 'https://www.amazon.com/gp/most-gifted',
		'walmart'   => 'https://www.walmart.com/shop/gifts',
		'nordstrom' => 'https://www.nordstrom.com/browse/gifts',
		'kohls'     => 'https://www.kohls.com/catalog/gift-ideas.jsp?CN=Feature:Gift%20Ideas',
		'sephora'   => 'https://www.sephora.com/shop/gifts',
		'etsy'            => 'https://www.etsy.com/c/gifts',
		'bestbuy'         => 'https://www.bestbuy.com/site/electronics/gift-ideas/abcat0010000.c?id=abcat0010000',
		'giftcards'       => 'https://www.giftcards.com/',
		'booksamillion'   => 'https://www.booksamillion.com/gifts',
		'russellstover'   => 'https://www.russellstover.com/shop/gifts',
		'freshroastedcoffee' => 'https://www.freshroastedcoffee.com/',
		'zchocolat'       => 'https://www.zchocolat.com/',
		'gearup'          => 'https://www.gearupbooster.com/',
		'vyjewelry'       => 'https://vyjewelry.shop/',
		'peetscoffee'     => 'https://www.peets.com/gifts',
	);
	$slug = strtolower( (string) $slug );
	return isset( $map[ $slug ] ) ? $map[ $slug ] : home_url( '/' );
}

/**
 * Hostname → /go/{slug}/ rules for sitewide affiliate link upgrades (JS + content filters).
 *
 * @return list<array{host:string,slug:string}>
 */
function wrrapd_affiliate_domain_slug_rules() {
	$rules = array();
	foreach ( wrrapd_home_retailer_wheel_brands() as $b ) {
		$rules[] = array(
			'host' => preg_replace( '#^www\.#', '', strtolower( (string) $b['domain'] ) ),
			'slug' => (string) $b['slug'],
		);
	}
	$extra = array(
		array( 'host' => 'giftcards.com', 'slug' => 'giftcards' ),
		array( 'host' => 'booksamillion.com', 'slug' => 'booksamillion' ),
		array( 'host' => 'russellstover.com', 'slug' => 'russellstover' ),
		array( 'host' => 'freshroastedcoffee.com', 'slug' => 'freshroastedcoffee' ),
		array( 'host' => 'zchocolat.com', 'slug' => 'zchocolat' ),
		array( 'host' => 'zchocolates.com', 'slug' => 'zchocolat' ),
		array( 'host' => 'gearupbooster.com', 'slug' => 'gearup' ),
		array( 'host' => 'vyjewelry.shop', 'slug' => 'vyjewelry' ),
		array( 'host' => 'vyjewelry.com', 'slug' => 'vyjewelry' ),
		array( 'host' => 'peets.com', 'slug' => 'peetscoffee' ),
		array( 'host' => 'amzn.com', 'slug' => 'amazon' ),
		array( 'host' => 'amzn.to', 'slug' => 'amazon' ),
	);
	foreach ( $extra as $row ) {
		$seen = false;
		foreach ( $rules as $r ) {
			if ( $r['host'] === $row['host'] ) {
				$seen = true;
				break;
			}
		}
		if ( ! $seen ) {
			$rules[] = $row;
		}
	}
	return $rules;
}

/**
 * Resolve slug for a retailer hostname (etsy.com, www.target.com, …).
 *
 * @param string $hostname Lowercase hostname.
 */
function wrrapd_affiliate_slug_for_hostname( $hostname ) {
	$hostname = strtolower( preg_replace( '#^www\.#', '', (string) $hostname ) );
	if ( $hostname === '' ) {
		return '';
	}
	foreach ( wrrapd_affiliate_domain_slug_rules() as $rule ) {
		$host = (string) $rule['host'];
		if ( $hostname === $host || substr( $hostname, - ( strlen( $host ) + 1 ) ) === '.' . $host ) {
			return (string) $rule['slug'];
		}
	}
	return '';
}

/**
 * Build /go/{slug}/ hop URL (optional deep link via ?to=).
 *
 * @param string $slug Retailer slug.
 * @param string $to   Optional destination URL.
 */
function wrrapd_affiliate_go_url( $slug, $to = '' ) {
	$slug = preg_replace( '/[^a-z0-9-]/', '', strtolower( (string) $slug ) );
	if ( $slug === '' ) {
		return home_url( '/' );
	}
	$url = home_url( '/go/' . rawurlencode( $slug ) . '/' );
	$to  = trim( (string) $to );
	if ( $to !== '' && preg_match( '#^https://#i', $to ) ) {
		$url = add_query_arg( 'to', $to, $url );
	}
	return $url;
}

/**
 * Upgrade bare https://retailer.com/… hrefs in HTML to /go/{slug}/?to=… hops.
 *
 * @param string $html Raw HTML fragment.
 */
function wrrapd_affiliate_upgrade_html_hrefs( $html ) {
	if ( ! is_string( $html ) || $html === '' || stripos( $html, 'href=' ) === false ) {
		return $html;
	}
	$site_host = wp_parse_url( home_url( '/' ), PHP_URL_HOST );
	$site_host = is_string( $site_host ) ? strtolower( $site_host ) : '';
	return (string) preg_replace_callback(
		'#href=(["\'])(https?://[^"\']+)\1#i',
		static function ( $m ) use ( $site_host ) {
			$quote = $m[1];
			$href  = html_entity_decode( (string) $m[2], ENT_QUOTES, 'UTF-8' );
			if ( stripos( $href, '/go/' ) !== false ) {
				return $m[0];
			}
			$parts = wp_parse_url( $href );
			if ( ! is_array( $parts ) || empty( $parts['host'] ) ) {
				return $m[0];
			}
			$host = strtolower( (string) $parts['host'] );
			if ( $site_host !== '' && ( $host === $site_host || $host === 'www.' . $site_host ) ) {
				return $m[0];
			}
			$slug = wrrapd_affiliate_slug_for_hostname( $host );
			if ( $slug === '' ) {
				return $m[0];
			}
			$new = wrrapd_affiliate_go_url( $slug, $href );
			return 'href=' . $quote . esc_url( $new ) . $quote;
		},
		$html
	);
}

/**
 * @param string $content Post / widget HTML.
 */
function wrrapd_affiliate_filter_content_links( $content ) {
	if ( is_admin() || ! is_string( $content ) || $content === '' ) {
		return $content;
	}
	return wrrapd_affiliate_upgrade_html_hrefs( $content );
}

add_filter( 'the_content', 'wrrapd_affiliate_filter_content_links', 25 );
add_filter( 'widget_text', 'wrrapd_affiliate_filter_content_links', 25 );
add_filter( 'widget_text_content', 'wrrapd_affiliate_filter_content_links', 25 );
add_filter( 'elementor/widget/render_content', 'wrrapd_affiliate_filter_content_links', 25 );

/**
 * CJ advertiser id for /go/{slug}/ when wp-config has WRRAPD_CJ_PUBLISHER_SITE_ID.
 *
 * @param string $slug Lowercase slug.
 */
function wrrapd_affiliate_cj_advertiser_id_for_slug( $slug ) {
	$map = array(
		'booksamillion'      => '129899',
		'russellstover'      => '5124217',
		'freshroastedcoffee' => '5778639',
		'zchocolat'          => '1124214',
		'vyjewelry'          => '7455697',
	);
	$slug = strtolower( (string) $slug );
	return isset( $map[ $slug ] ) ? $map[ $slug ] : '';
}

/**
 * Read wp-config affiliate constant when set to a real HTTPS URL (skip placeholders).
 *
 * @param string $slug Retailer slug.
 */
function wrrapd_affiliate_go_constant_value( $slug ) {
	$cname = wrrapd_affiliate_go_constant_for_slug( $slug );
	if ( ! $cname || ! defined( $cname ) ) {
		return '';
	}
	$dest = trim( (string) constant( $cname ) );
	if ( $dest === '' || ! preg_match( '#^https://#i', $dest ) ) {
		return '';
	}
	if ( preg_match( '/YOUR_WEBSITE_ID|YOUR[_-]?SITE[_-]?ID|XXXX|example\.com/i', $dest ) ) {
		return '';
	}
	return $dest;
}

/**
 * Rewrite legacy tkqlhce.com CJ URLs to WRRAPD_CJ_CLICK_DOMAIN.
 * Leaves other CJ hosts untouched (e.g. jdoqocy.com for website 101807253 vs anrdoezrs.net for 100845347).
 *
 * @param string $url Affiliate hop URL.
 */
function wrrapd_affiliate_cj_normalize_click_url( $url ) {
	if ( ! is_string( $url ) || $url === '' || ! wrrapd_affiliate_is_cj_click_url( $url ) ) {
		return $url;
	}
	$host = wp_parse_url( $url, PHP_URL_HOST );
	if ( ! is_string( $host ) || $host === '' || stripos( $host, 'tkqlhce.com' ) === false ) {
		return $url;
	}
	$domain = wrrapd_affiliate_cj_click_domain();
	return preg_replace(
		'#^https://[^/]+(/click-[0-9]+-[0-9]+(?:[/?]|$))#i',
		'https://' . $domain . '$1',
		$url
	);
}

/**
 * CJ click domain from wp-config (falls back to tkqlhce.com).
 */
function wrrapd_affiliate_cj_click_domain() {
	if ( defined( 'WRRAPD_CJ_CLICK_DOMAIN' ) ) {
		$domain = preg_replace( '#^https?://#', '', trim( (string) constant( 'WRRAPD_CJ_CLICK_DOMAIN' ) ) );
		$domain = untrailingslashit( $domain );
		if ( $domain !== '' ) {
			return $domain;
		}
	}
	foreach ( wrrapd_affiliate_go_allowed_slugs() as $slug ) {
		$dest = wrrapd_affiliate_go_constant_value( $slug );
		if ( $dest !== '' && wrrapd_affiliate_is_cj_click_url( $dest ) ) {
			$host = wp_parse_url( $dest, PHP_URL_HOST );
			if ( is_string( $host ) && $host !== '' ) {
				return $host;
			}
		}
	}
	return 'www.tkqlhce.com';
}

/**
 * Append query args with rawurlencode (CJ deep links need encoded destination URLs).
 *
 * @param string $url  Base URL.
 * @param array<string, string> $params Query params.
 */
function wrrapd_affiliate_url_with_params( $url, array $params ) {
	foreach ( $params as $key => $value ) {
		if ( $value === '' ) {
			continue;
		}
		$sep  = ( strpos( $url, '?' ) !== false ) ? '&' : '?';
		$url .= $sep . rawurlencode( (string) $key ) . '=' . rawurlencode( (string) $value );
	}
	return $url;
}

/**
 * CJ website property id per slug (legacy partners vs newer Wrrapd property).
 *
 * @param string $slug Retailer slug.
 */
function wrrapd_affiliate_cj_publisher_site_id_for_slug( $slug ) {
	$slug = strtolower( (string) $slug );
	$const = 'WRRAPD_CJ_SITE_ID_' . strtoupper( str_replace( '-', '_', $slug ) );
	if ( defined( $const ) ) {
		$id = preg_replace( '/\D/', '', (string) constant( $const ) );
		if ( $id !== '' ) {
			return $id;
		}
	}
	$legacy = array( 'booksamillion', 'russellstover', 'freshroastedcoffee', 'zchocolat', 'vyjewelry' );
	if ( in_array( $slug, $legacy, true ) ) {
		if ( defined( 'WRRAPD_CJ_PUBLISHER_SITE_ID' ) ) {
			return preg_replace( '/\D/', '', (string) constant( 'WRRAPD_CJ_PUBLISHER_SITE_ID' ) );
		}
		return '101807253';
	}
	if ( defined( 'WRRAPD_CJ_PUBLISHER_SITE_ID' ) ) {
		return preg_replace( '/\D/', '', (string) constant( 'WRRAPD_CJ_PUBLISHER_SITE_ID' ) );
	}
	return '';
}

/**
 * CJ click host for a slug (must match website id in pasted Get link URLs).
 *
 * @param string $slug Retailer slug.
 */
function wrrapd_affiliate_cj_click_domain_for_slug( $slug ) {
	$slug = strtolower( (string) $slug );
	$const = wrrapd_affiliate_go_constant_value( $slug );
	if ( $const !== '' && wrrapd_affiliate_is_cj_click_url( $const ) ) {
		$host = wp_parse_url( $const, PHP_URL_HOST );
		if ( is_string( $host ) && $host !== '' ) {
			return $host;
		}
	}
	$site = wrrapd_affiliate_cj_publisher_site_id_for_slug( $slug );
	if ( $site === '101807253' ) {
		return 'www.jdoqocy.com';
	}
	if ( $site === '100845347' ) {
		return 'www.anrdoezrs.net';
	}
	return wrrapd_affiliate_cj_click_domain();
}

/**
 * Skip redundant CJ ?url= when destination is the retailer homepage (breaks some CJ hops).
 *
 * @param string $slug Retailer slug.
 * @param string $to   Requested deep-link destination.
 */
function wrrapd_affiliate_cj_effective_deep_link_to( $slug, $to ) {
	$to = trim( (string) $to );
	if ( $to === '' ) {
		return '';
	}
	$fallback = wrrapd_affiliate_fallback_public_url( $slug );
	if ( $fallback !== '' && untrailingslashit( strtolower( $to ) ) === untrailingslashit( strtolower( $fallback ) ) ) {
		return '';
	}
	return $to;
}

/**
 * Build a CJ click URL from publisher site id + advertiser id (Commission Junction).
 *
 * @param string $slug   Retailer slug (selects website id + click host).
 * @param string $to     Optional destination for deep link.
 * @param string $subid  Optional sid/subid for reporting.
 */
function wrrapd_affiliate_cj_build_click_url( $slug, $to = '', $subid = '' ) {
	$slug = strtolower( (string) $slug );
	$adv  = wrrapd_affiliate_cj_advertiser_id_for_slug( $slug );
	$site = wrrapd_affiliate_cj_publisher_site_id_for_slug( $slug );
	$adv  = preg_replace( '/\D/', '', (string) $adv );
	if ( $site === '' || $adv === '' ) {
		return '';
	}
	$url = sprintf(
		'https://%s/click-%s-%s',
		wrrapd_affiliate_cj_click_domain_for_slug( $slug ),
		$site,
		$adv
	);
	$to = wrrapd_affiliate_cj_effective_deep_link_to( $slug, $to );
	if ( $to !== '' ) {
		$url = wrrapd_affiliate_url_with_params( $url, array( 'url' => $to ) );
	}
	if ( $subid !== '' ) {
		$url = wrrapd_affiliate_url_with_params( $url, array( 'sid' => $subid ) );
	}
	return $url;
}

/**
 * @param string $url URL to test.
 */
function wrrapd_affiliate_is_cj_click_url( $url ) {
	return is_string( $url ) && preg_match(
		'#^https://(www\.)?(tkqlhce|jdoqocy|anrdoezrs|dpbolvw|emjcd|kjqlkc|kqzyfj)\.(com|net)/click-[0-9]+-[0-9]+#i',
		$url
	) === 1;
}

/**
 * Append or replace deep-link destination on a CJ tracking URL.
 *
 * @param string $dest  CJ click URL from dashboard or builder.
 * @param string $to    Retailer page URL.
 * @param string $subid Optional sid.
 */
function wrrapd_affiliate_cj_apply_deep_link( $dest, $to, $subid = '' ) {
	$dest = wrrapd_affiliate_cj_normalize_click_url( $dest );
	if ( $to === '' ) {
		if ( $subid !== '' ) {
			return wrrapd_affiliate_url_with_params( $dest, array( 'sid' => $subid ) );
		}
		return $dest;
	}
	if ( preg_match( '/([?&]url=)[^&]*/', $dest ) ) {
		$dest = preg_replace( '/([?&]url=)[^&]*/', '$1' . rawurlencode( $to ), $dest );
	} else {
		$dest = wrrapd_affiliate_url_with_params( $dest, array( 'url' => $to ) );
	}
	if ( $subid !== '' ) {
		$dest = wrrapd_affiliate_url_with_params( $dest, array( 'sid' => $subid ) );
	}
	return $dest;
}

/**
 * Books-A-Million CJ hop (advertiser-level 129899 / 1298894 expired — use Get link id 13986208).
 */
function wrrapd_affiliate_cj_bam_click_url() {
	if ( defined( 'WRRAPD_AFFILIATE_REDIRECT_BOOKSAMILLION' ) ) {
		$u = trim( (string) constant( 'WRRAPD_AFFILIATE_REDIRECT_BOOKSAMILLION' ) );
		if ( preg_match( '#^https://#i', $u ) && ! preg_match( '/click-101807253-(129899|1298894)(\?|$)/i', $u ) ) {
			return $u;
		}
	}
	return 'https://www.dpbolvw.net/click-101807253-13986208';
}

/**
 * Peet's CJ banner hops (advertiser-level 2346375 404s — use Get link banner ids).
 */
function wrrapd_affiliate_cj_peets_shop_click_url() {
	if ( defined( 'WRRAPD_AFFILIATE_REDIRECT_PEETSCOFFEE' ) ) {
		$u = trim( (string) constant( 'WRRAPD_AFFILIATE_REDIRECT_PEETSCOFFEE' ) );
		if ( preg_match( '#^https://#i', $u ) && ! preg_match( '/click-101807253-2346375(\?|$)/i', $u ) ) {
			return $u;
		}
	}
	return 'https://www.dpbolvw.net/click-101807253-13426123';
}

/**
 * @return string Coffee-finder banner hop (CJ link id 13588852).
 */
function wrrapd_affiliate_cj_peets_finder_click_url() {
	if ( defined( 'WRRAPD_AFFILIATE_REDIRECT_PEETSCOFFEE_FINDER' ) ) {
		$u = trim( (string) constant( 'WRRAPD_AFFILIATE_REDIRECT_PEETSCOFFEE_FINDER' ) );
		if ( preg_match( '#^https://#i', $u ) ) {
			return $u;
		}
	}
	return 'https://www.jdoqocy.com/click-101807253-13588852';
}

/**
 * Fix known-bad CJ click URLs still present in older wp-config.php copies.
 *
 * @param string $url  CJ hop URL.
 * @param string $slug Retailer slug.
 */
function wrrapd_affiliate_cj_repair_click_url( $url, $slug ) {
	$url  = (string) $url;
	$slug = strtolower( (string) $slug );
	if ( $url === '' ) {
		return $url;
	}
	if ( $slug === 'booksamillion' && preg_match( '/click-101807253-(1298894|129899)(\?|$)/i', $url ) ) {
		return wrrapd_affiliate_cj_bam_click_url();
	}
	if ( $slug === 'peetscoffee' && preg_match( '/click-101807253-2346375(\?|$)/i', $url ) ) {
		return wrrapd_affiliate_cj_peets_shop_click_url();
	}
	return $url;
}

/**
 * Pick CJ hop base for ?to= deep links (Peet's finder vs shop banners).
 *
 * @param string $slug Retailer slug.
 * @param string $to   Requested retailer destination.
 */
function wrrapd_affiliate_cj_click_base_for_to( $slug, $to ) {
	$slug = strtolower( (string) $slug );
	$to   = trim( (string) $to );
	if ( $slug === 'peetscoffee' && $to !== '' && preg_match( '#/pages/coffee-finder#i', $to ) ) {
		return wrrapd_affiliate_cj_peets_finder_click_url();
	}
	return '';
}

/**
 * Correct legacy Rakuten publisher ids / offer ids from older wp-config snippets.
 *
 * @param string $url Linksynergy click URL.
 */
function wrrapd_affiliate_rakuten_repair_click_url( $url ) {
	$url = (string) $url;
	if ( $url === '' || stripos( $url, 'linksynergy.com' ) === false ) {
		return $url;
	}
	$url = str_replace(
		array( 'B%2fdH8Lik5M0', 'B/dH8Lik5M0' ),
		array( 'b%2fdhBLlk5M0', 'b/dhBLlk5M0' ),
		$url
	);
	if ( preg_match( '/offerid=2037571\.9995/i', $url ) ) {
		$url = preg_replace( '/offerid=2037571\.9995/i', 'offerid=2037571.963', $url );
	}
	if ( preg_match( '/[?&]type=3(?=&|$)/i', $url ) && preg_match( '/offerid=2037571/i', $url ) ) {
		$url = preg_replace( '/([?&])type=3(?=&|$)/i', '${1}type=4', $url );
	}
	return $url;
}

/**
 * Resolve affiliate hop destination: wp-config constant, CJ builder, or public fallback.
 *
 * @param string $slug Retailer slug.
 * @param string $to   Optional /go/{slug}/?to= destination (Peet's banner selection).
 */
function wrrapd_affiliate_go_base_dest( $slug, $to = '' ) {
	$alt = wrrapd_affiliate_cj_click_base_for_to( $slug, $to );
	if ( $alt !== '' ) {
		return wrrapd_affiliate_cj_normalize_click_url( $alt );
	}
	$dest = wrrapd_affiliate_go_constant_value( $slug );
	if ( $dest !== '' ) {
		$dest = wrrapd_affiliate_rakuten_repair_click_url( $dest );
		$dest = wrrapd_affiliate_cj_repair_click_url( $dest, $slug );
		$dest = wrrapd_affiliate_cj_normalize_click_url( $dest );
	}
	if ( $dest === '' ) {
		$adv = wrrapd_affiliate_cj_advertiser_id_for_slug( $slug );
		if ( $adv !== '' ) {
			$dest = wrrapd_affiliate_cj_build_click_url( $slug );
		}
	}
	if ( $dest === '' || ! preg_match( '#^https://#i', $dest ) ) {
		if ( $slug === 'peetscoffee' ) {
			$dest = wrrapd_affiliate_cj_peets_shop_click_url();
		} elseif ( $slug === 'booksamillion' ) {
			$dest = wrrapd_affiliate_cj_bam_click_url();
		} else {
			$dest = wrrapd_affiliate_fallback_public_url( $slug );
		}
	}
	return $dest;
}

/**
 * Sub-id from /go/{slug}/?subid=… for affiliate network reporting (Rakuten u1/subid, etc.).
 */
function wrrapd_affiliate_go_subid_from_request() {
	foreach ( array( 'subid', 'src', 'u1' ) as $key ) {
		if ( ! isset( $_GET[ $key ] ) || ! is_string( $_GET[ $key ] ) ) {
			continue;
		}
		$val = sanitize_key( wp_unslash( $_GET[ $key ] ) );
		if ( $val !== '' ) {
			return $val;
		}
	}
	return '';
}

/**
 * Parse Rakuten / Linksynergy click URL for publisher id + merchant id.
 *
 * @return array{id:string,mid:string}
 */
function wrrapd_affiliate_rakuten_parse_click_url( $url ) {
	$out = array(
		'id'  => '',
		'mid' => '',
	);
	if ( ! is_string( $url ) || $url === '' ) {
		return $out;
	}
	$query = wp_parse_url( $url, PHP_URL_QUERY );
	if ( ! is_string( $query ) || $query === '' ) {
		return $out;
	}
	$q = array();
	parse_str( $query, $q );
	if ( ! empty( $q['id'] ) && is_string( $q['id'] ) ) {
		$out['id'] = rawurldecode( $q['id'] );
	}
	if ( ! empty( $q['mid'] ) && is_string( $q['mid'] ) ) {
		$out['mid'] = preg_replace( '/\D/', '', $q['mid'] );
	}
	if ( defined( 'WRRAPD_AFFILIATE_RAKUTEN_ETSY_MID' ) ) {
		$override = preg_replace( '/\D/', '', (string) constant( 'WRRAPD_AFFILIATE_RAKUTEN_ETSY_MID' ) );
		if ( $override !== '' ) {
			$out['mid'] = $override;
		}
	}
	return $out;
}

/**
 * Build Rakuten fs-bin deep link (type=10 + RD_PARM1) from a banner click URL.
 *
 * @param string $click_url Banner click URL from Rakuten (type=4).
 * @param string $to        Etsy / retailer destination.
 * @param string $subid     Optional placement id.
 */
function wrrapd_affiliate_rakuten_fsbin_deep_link( $click_url, $to, $subid = '' ) {
	if ( ! is_string( $click_url ) || $click_url === '' || $to === '' ) {
		return $click_url;
	}
	$query = wp_parse_url( $click_url, PHP_URL_QUERY );
	if ( ! is_string( $query ) || $query === '' ) {
		return $click_url;
	}
	$q = array();
	parse_str( $query, $q );
	if ( empty( $q['id'] ) || empty( $q['offerid'] ) ) {
		return $click_url;
	}
	$args = array(
		'id'       => rawurldecode( (string) $q['id'] ),
		'offerid'  => (string) $q['offerid'],
		'type'     => '10',
		'subid'    => $subid !== '' ? $subid : ( isset( $q['subid'] ) ? (string) $q['subid'] : '0' ),
		'RD_PARM1' => $to,
	);
	if ( ! empty( $q['tmpid'] ) ) {
		$args['tmpid'] = (string) $q['tmpid'];
	}
	if ( $subid !== '' ) {
		$args['u1'] = $subid;
	}
	return add_query_arg( $args, 'https://click.linksynergy.com/fs-bin/click' );
}

/**
 * Rakuten merchant id for /deeplink (offerid from banners is not the mid).
 *
 * @param string $slug Retailer slug.
 */
function wrrapd_affiliate_rakuten_mid_for_slug( $slug ) {
	$slug = strtolower( (string) $slug );
	$map  = array(
		'giftcards' => '44432',
		'etsy'      => '54027',
	);
	if ( isset( $map[ $slug ] ) ) {
		return $map[ $slug ];
	}
	$const = 'WRRAPD_AFFILIATE_RAKUTEN_' . strtoupper( str_replace( '-', '_', $slug ) ) . '_MID';
	if ( defined( $const ) ) {
		$mid = preg_replace( '/\D/', '', (string) constant( $const ) );
		if ( $mid !== '' ) {
			return $mid;
		}
	}
	return '';
}

/**
 * Build a Rakuten /deeplink URL (preferred for product deep links).
 *
 * @param string $affiliate_id Publisher id from Rakuten dashboard.
 * @param string $mid          Advertiser merchant id.
 * @param string $to           Final retailer URL.
 * @param string $subid        Optional placement id.
 */
function wrrapd_affiliate_rakuten_build_deeplink( $affiliate_id, $mid, $to, $subid = '' ) {
	if ( $affiliate_id === '' || $mid === '' || $to === '' ) {
		return '';
	}
	$params = array(
		'id'   => $affiliate_id,
		'mid'  => $mid,
		'murl' => $to,
	);
	if ( $subid !== '' ) {
		$params['u1']    = $subid;
		$params['subid'] = $subid;
	}
	return wrrapd_affiliate_url_with_params( 'https://click.linksynergy.com/deeplink', $params );
}

/**
 * Build a Rakuten /deeplink URL (fallback when fs-bin offer id is unavailable).
 *
 * @param string $click_url Banner or deeplink base from Rakuten dashboard.
 * @param string $to        Final retailer URL.
 * @param string $subid     Optional placement id for Rakuten reports.
 * @param string $slug      Optional retailer slug for mid lookup.
 */
function wrrapd_affiliate_rakuten_deep_link( $click_url, $to, $subid = '', $slug = '' ) {
	$parts = wrrapd_affiliate_rakuten_parse_click_url( $click_url );
	$mid   = $parts['mid'];
	if ( $mid === '' && $slug !== '' ) {
		$mid = wrrapd_affiliate_rakuten_mid_for_slug( $slug );
	}
	if ( $mid === '' && defined( 'WRRAPD_AFFILIATE_RAKUTEN_ETSY_MID' ) ) {
		$mid = preg_replace( '/\D/', '', (string) constant( 'WRRAPD_AFFILIATE_RAKUTEN_ETSY_MID' ) );
	}
	if ( $mid === '' ) {
		$mid = '54027';
	}
	if ( $parts['id'] === '' || $to === '' ) {
		return $click_url;
	}
	return wrrapd_affiliate_rakuten_build_deeplink( $parts['id'], $mid, $to, $subid );
}

/**
 * Allowed retailer destination patterns for /go/{slug}/?to=… validation.
 *
 * @return array<string, string>
 */
function wrrapd_affiliate_retailer_url_patterns() {
	return array(
		'etsy'               => '#^https://(www\.)?etsy\.com/#i',
		'target'             => '#^https://(www\.)?target\.com/#i',
		'amazon'             => '#^https://(www\.)?amazon\.com/#i',
		'walmart'            => '#^https://(www\.)?walmart\.com/#i',
		'nordstrom'          => '#^https://(www\.)?nordstrom\.com/#i',
		'kohls'              => '#^https://(www\.)?kohls\.com/#i',
		'sephora'            => '#^https://(www\.)?sephora\.com/#i',
		'ulta'               => '#^https://(www\.)?ulta\.com/#i',
		'lego'               => '#^https://(www\.)?lego\.com/#i',
		'bestbuy'            => '#^https://(www\.)?bestbuy\.com/#i',
		'giftcards'          => '#^https://(www\.)?giftcards\.com/#i',
		'booksamillion'      => '#^https://(www\.)?booksamillion\.com/#i',
		'russellstover'      => '#^https://(www\.)?russellstover\.com/#i',
		'freshroastedcoffee' => '#^https://(www\.)?freshroastedcoffee\.com/#i',
		'zchocolat'          => '#^https://(www\.)?(zchocolat|zchocolates)\.com/#i',
		'gearup'             => '#^https://(www\.)?gearupbooster\.com/#i',
		'vyjewelry'          => '#^https://(www\.)?(vyjewelry\.shop|vyjewelry\.com)/#i',
		'peetscoffee'        => '#^https://(www\.)?peets\.com/#i',
	);
}

/**
 * @param string $slug Retailer slug.
 * @param string $to   Destination URL.
 */
function wrrapd_affiliate_to_matches_slug( $slug, $to ) {
	$slug     = strtolower( (string) $slug );
	$patterns = wrrapd_affiliate_retailer_url_patterns();
	if ( $to === '' || ! isset( $patterns[ $slug ] ) ) {
		return false;
	}
	return preg_match( $patterns[ $slug ], $to ) === 1;
}

/**
 * Parse ?to= from the request (handles nested ? in product URLs when not fully encoded).
 */
function wrrapd_affiliate_go_to_from_request() {
	$raw = '';
	if ( isset( $_GET['to'] ) && is_string( $_GET['to'] ) ) {
		$raw = trim( wp_unslash( $_GET['to'] ) );
	}
	$qs = isset( $_SERVER['QUERY_STRING'] ) ? (string) wp_unslash( $_SERVER['QUERY_STRING'] ) : '';
	if ( $qs !== '' && preg_match( '/(?:^|&)to=([^#&]*)/', $qs, $m ) ) {
		$candidate = rawurldecode( $m[1] );
		if ( strlen( $candidate ) > strlen( $raw ) ) {
			$raw = $candidate;
		}
	}
	if ( $raw === '' ) {
		return '';
	}
	if ( preg_match( '#^//[^/]#', $raw ) ) {
		$raw = 'https:' . $raw;
	}
	return esc_url_raw( $raw );
}

/**
 * Optional deep link for /go/{slug}/?to=https://retailer.com/… (Etsy listing, etc.).
 *
 * @param string $slug Affiliate slug.
 * @param string $dest Base redirect from wp-config or fallback.
 */
function wrrapd_affiliate_go_apply_deep_link( $slug, $dest ) {
	$to    = wrrapd_affiliate_go_to_from_request();
	$subid = wrrapd_affiliate_go_subid_from_request();
	$dest  = wrrapd_affiliate_rakuten_repair_click_url( $dest );
	$dest  = wrrapd_affiliate_cj_repair_click_url( $dest, $slug );
	$alt   = wrrapd_affiliate_cj_click_base_for_to( $slug, $to );
	if ( $alt !== '' ) {
		$dest = $alt;
	}
	if ( preg_match( '#linksynergy\.com#i', $dest ) ) {
		if ( $to !== '' ) {
			if ( preg_match( '/([?&]murl=)[^&]*/', $dest ) ) {
				return preg_replace( '/([?&]murl=)[^&]*/', '$1' . rawurlencode( $to ), $dest );
			}
			if ( preg_match( '/([?&]RD_PARM1=)[^&]*/', $dest ) ) {
				return preg_replace( '/([?&]RD_PARM1=)[^&]*/', '$1' . rawurlencode( $to ), $dest );
			}
			$parts   = wrrapd_affiliate_rakuten_parse_click_url( $dest );
			$mid     = wrrapd_affiliate_rakuten_mid_for_slug( $slug );
			$fsbin_ok = ! in_array( $slug, array( 'giftcards' ), true );
			if ( $mid !== '' && $parts['id'] !== '' ) {
				$deeplink = wrrapd_affiliate_rakuten_build_deeplink( $parts['id'], $mid, $to, $subid );
				if ( $deeplink !== '' ) {
					return $deeplink;
				}
			}
			if ( $fsbin_ok && preg_match( '/offerid=/i', $dest ) ) {
				return wrrapd_affiliate_rakuten_fsbin_deep_link( $dest, $to, $subid );
			}
			return wrrapd_affiliate_rakuten_deep_link( $dest, $to, $subid, $slug );
		}
		if ( $subid !== '' ) {
			return add_query_arg(
				array(
					'subid' => $subid,
					'u1'    => $subid,
				),
				$dest
			);
		}
		return $dest;
	}
	if ( wrrapd_affiliate_is_cj_click_url( $dest ) ) {
		$to = wrrapd_affiliate_cj_effective_deep_link_to( $slug, $to );
		if ( $slug === 'peetscoffee' && preg_match( '#/pages/coffee-finder#i', (string) wrrapd_affiliate_go_to_from_request() ) ) {
			$to = '';
		}
		return wrrapd_affiliate_cj_apply_deep_link( $dest, $to, $subid );
	}
	if ( $to === '' ) {
		return $dest;
	}
	$patterns = wrrapd_affiliate_retailer_url_patterns();
	if ( ! isset( $patterns[ $slug ] ) || ! preg_match( $patterns[ $slug ], $to ) ) {
		return $dest;
	}
	if ( preg_match( '/([?&]u=)[^&]*/', $dest ) ) {
		return preg_replace( '/([?&]u=)[^&]*/', '$1' . rawurlencode( $to ), $dest );
	}
	if ( substr( $dest, -1 ) === '=' ) {
		return $dest . rawurlencode( $to );
	}
	if ( preg_match( '#impactradius|7eer|sjv\.io|go\.redirectingat|awin1\.com#i', $dest ) ) {
		return add_query_arg( 'u', $to, $dest );
	}
	return $to;
}

/**
 * Optional server-side click log (no purchase data — Rakuten reports conversions).
 *
 * @param string $slug  Retailer slug.
 * @param string $to    Deep-link destination when present.
 * @param string $subid Placement sub-id when present.
 * @param string $dest  Final redirect URL.
 */
function wrrapd_affiliate_go_log_click( $slug, $to, $subid, $dest ) {
	do_action( 'wrrapd_affiliate_go_click', $slug, $to, $subid, $dest );
	if ( ! defined( 'WRRAPD_AFFILIATE_LOG_CLICKS' ) || ! WRRAPD_AFFILIATE_LOG_CLICKS ) {
		return;
	}
	error_log(
		sprintf(
			'[wrrapd-affiliate] slug=%s subid=%s to=%s dest=%s',
			$slug,
			$subid !== '' ? $subid : '-',
			$to !== '' ? $to : '-',
			$dest
		)
	);
}

/**
 * 302 to an external affiliate / retailer URL.
 * wp_safe_redirect() rejects off-site hosts and falls back to wp-admin — never use it here.
 *
 * @param string $url    Destination (https only).
 * @param int    $status HTTP status code.
 */
function wrrapd_affiliate_redirect_out( $url, $status = 302 ) {
	$url = esc_url_raw( (string) $url );
	if ( $url === '' || ! preg_match( '#^https://#i', $url ) ) {
		status_header( 404 );
		nocache_headers();
		echo esc_html__( 'Not found.', 'wrrapd' );
		exit;
	}
	wp_redirect( $url, $status );
	exit;
}

/**
 * 302 from /go/{slug}/ to Impact (or other) tracking URL from wp-config, else retailer homepage.
 * Affiliate credit is established by the network redirect + retailer cookie — not by setting cookies from wrrapd.com.
 * Pass ?to=https://www.etsy.com/listing/… to deep-link a product while keeping the Impact hop.
 */
function wrrapd_handle_go_affiliate_redirect() {
	if ( is_admin() ) {
		return;
	}
	$req = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '';
	$path = wp_parse_url( $req, PHP_URL_PATH );
	$path = is_string( $path ) ? $path : '';
	$home_path = wp_parse_url( home_url( '/' ), PHP_URL_PATH );
	$home_path = is_string( $home_path ) ? untrailingslashit( $home_path ) : '';
	if ( $home_path !== '' && $path !== '' && strpos( $path, $home_path ) === 0 ) {
		$path = substr( $path, strlen( $home_path ) );
		$path = '/' . ltrim( (string) $path, '/' );
	}
	if ( $path === '' ) {
		return;
	}
	if ( preg_match( '#^/go/([a-z0-9-]+)/?$#i', $path, $m ) !== 1 ) {
		return;
	}
	$slug = strtolower( (string) $m[1] );
	if ( ! in_array( $slug, wrrapd_affiliate_go_allowed_slugs(), true ) ) {
		status_header( 404 );
		nocache_headers();
		echo esc_html__( 'Not found.', 'wrrapd' );
		exit;
	}
	if ( ! defined( 'DONOTCACHEPAGE' ) ) {
		define( 'DONOTCACHEPAGE', true );
	}
	nocache_headers();
	if ( ! headers_sent() ) {
		header( 'Cache-Control: no-store, no-cache, must-revalidate, max-age=0' );
		header( 'Pragma: no-cache' );
		header( 'Vary: User-Agent', false );
	}
	$to    = wrrapd_affiliate_go_to_from_request();
	$subid = wrrapd_affiliate_go_subid_from_request();
	$dest  = wrrapd_affiliate_go_base_dest( $slug, $to );
	$dest  = wrrapd_affiliate_go_apply_deep_link( $slug, $dest );
	$dest = esc_url_raw( $dest );
	if ( $dest === '' ) {
		$dest = esc_url_raw( wrrapd_affiliate_fallback_public_url( $slug ) );
	}
	wrrapd_affiliate_go_log_click( $slug, $to, $subid, $dest );
	wrrapd_affiliate_redirect_out( $dest, 302 );
}

add_action( 'template_redirect', 'wrrapd_handle_go_affiliate_redirect', 0 );

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
 * Retailers shown on the home-page wheel (logos from mu-plugins/logos/{slug}.png when present, else favicon).
 *
 * @return list<array{slug:string,label:string,domain:string}>
 */
function wrrapd_home_retailer_wheel_brands() {
	return array(
		array( 'slug' => 'ulta', 'label' => __( 'Ulta', 'wrrapd' ), 'domain' => 'ulta.com' ),
		array( 'slug' => 'lego', 'label' => __( 'LEGO', 'wrrapd' ), 'domain' => 'lego.com' ),
		array( 'slug' => 'target', 'label' => __( 'Target', 'wrrapd' ), 'domain' => 'target.com' ),
		array( 'slug' => 'amazon', 'label' => __( 'Amazon', 'wrrapd' ), 'domain' => 'amazon.com' ),
		array( 'slug' => 'walmart', 'label' => __( 'Walmart', 'wrrapd' ), 'domain' => 'walmart.com' ),
		array( 'slug' => 'nordstrom', 'label' => __( 'Nordstrom', 'wrrapd' ), 'domain' => 'nordstrom.com' ),
		array( 'slug' => 'kohls', 'label' => __( 'Kohl’s', 'wrrapd' ), 'domain' => 'kohls.com' ),
		array( 'slug' => 'sephora', 'label' => __( 'Sephora', 'wrrapd' ), 'domain' => 'sephora.com' ),
		array( 'slug' => 'etsy', 'label' => __( 'Etsy', 'wrrapd' ), 'domain' => 'etsy.com' ),
		array( 'slug' => 'bestbuy', 'label' => __( 'Best Buy', 'wrrapd' ), 'domain' => 'bestbuy.com' ),
	);
}

/**
 * Chrome Web Store — gift-wrap promo links here.
 */
function wrrapd_chrome_extension_install_url() {
	return 'https://chromewebstore.google.com/detail/wrrapd/' . WRRAPD_CHROME_EXTENSION_ID;
}

/**
 * Retailers where the Wrrapd Chrome extension adds gift-wrap at checkout (homepage wheel set).
 *
 * @return list<string>
 */
function wrrapd_extension_retailer_slugs() {
	static $slugs = null;
	if ( $slugs === null ) {
		$slugs = array();
		foreach ( wrrapd_home_retailer_wheel_brands() as $b ) {
			$slugs[] = (string) $b['slug'];
		}
	}
	return $slugs;
}

/**
 * @return array<string, string> slug => display label
 */
function wrrapd_extension_retailer_label_map() {
	$map = array();
	foreach ( wrrapd_home_retailer_wheel_brands() as $b ) {
		$map[ (string) $b['slug'] ] = (string) $b['label'];
	}
	return $map;
}

/**
 * @param string $slug Retailer slug.
 */
function wrrapd_is_extension_retailer_slug( $slug ) {
	return in_array( strtolower( (string) $slug ), wrrapd_extension_retailer_slugs(), true );
}

/**
 * Extension feature bullets — right-side wrap promo (desktop) + mobile strip.
 *
 * @return list<string>
 */
function wrrapd_wrap_promo_feature_bullets() {
	return array(
		__( 'Customize wrapping designs', 'wrrapd' ),
		__( 'Add flowers', 'wrrapd' ),
		__( 'Multi-retailer gift-combo', 'wrrapd' ),
		__( 'Seamless integration / Checkout', 'wrrapd' ),
	);
}

/**
 * Blinking gift-wrap callout beside Ulta (left) or Best Buy (right); arrow stays static.
 *
 * @param 'ulta'|'bestbuy' $side
 */
function wrrapd_render_retailer_wheel_wrap_promo( $side ) {
	$side  = (string) $side;
	$href  = esc_url( wrrapd_chrome_extension_install_url() );
	$label = esc_attr__( 'Premium gift-wrapping — install the free Wrrapd Chrome extension', 'wrrapd' );
	if ( $side === 'ulta' ) {
		echo '<a class="wrrapd-wrap-promo wrrapd-wrap-promo--ulta" href="' . $href . '" target="_blank" rel="noopener noreferrer" aria-label="' . $label . '">';
		echo '<div class="wrrapd-wrap-promo__copy wrrapd-wrap-promo__copy--right">';
		echo '<span class="wrrapd-wrap-promo__line wrrapd-wrap-promo__line--blink wrrapd-wrap-promo__line--premium">' . esc_html__( 'Premium', 'wrrapd' ) . '</span>';
		echo '<span class="wrrapd-wrap-promo__line wrrapd-wrap-promo__line--blink wrrapd-wrap-promo__line--mid">' . esc_html__( 'gift-wrapping', 'wrrapd' ) . '</span>';
		echo '<span class="wrrapd-wrap-promo__line wrrapd-wrap-promo__line--blink wrrapd-wrap-promo__line--for">' . esc_html__( 'now available for:', 'wrrapd' ) . '</span>';
		echo '</div>';
		echo '<span class="wrrapd-wrap-promo__arrow wrrapd-wrap-promo__arrow--right" aria-hidden="true"></span>';
		echo '</a>';
		return;
	}
	if ( $side === 'bestbuy' ) {
		echo '<a class="wrrapd-wrap-promo wrrapd-wrap-promo--bestbuy" href="' . $href . '" target="_blank" rel="noopener noreferrer" aria-label="' . esc_attr__( 'Wrrapd gift-wrapping features — install the Chrome extension', 'wrrapd' ) . '">';
		echo '<div class="wrrapd-wrap-promo__copy wrrapd-wrap-promo__copy--left wrrapd-wrap-promo__copy--features">';
		echo '<ul class="wrrapd-wrap-promo__bullets" aria-label="' . esc_attr__( 'Wrrapd extension features', 'wrrapd' ) . '">';
		foreach ( wrrapd_wrap_promo_feature_bullets() as $bullet ) {
			echo '<li class="wrrapd-wrap-promo__bullet">' . esc_html( $bullet ) . '</li>';
		}
		echo '</ul></div>';
		echo '</a>';
	}
}

/**
 * Home page: retailer wheels — each logo links to /go/{slug}/ (302 to Impact URL from wp-config when set).
 */
function wrrapd_output_retailer_wheel_strip() {
	static $printed = false;
	if ( $printed ) {
		return;
	}
	if ( is_admin() || is_paged() ) {
		return;
	}
	// Hire / onboarding hosts must never get the shopper retailer strip.
	if ( function_exists( 'wrrapd_is_hire_portal_host' ) && wrrapd_is_hire_portal_host() ) {
		return;
	}
	if ( ! is_front_page() && ! is_home() ) {
		return;
	}
	$printed = true;
	$brands  = wrrapd_home_retailer_wheel_brands();
	$ext_url = esc_url( wrrapd_chrome_extension_install_url() );
	echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Great+Vibes&amp;family=Pacifico&amp;display=swap" />';
	echo '<style id="wrrapd-retailer-wheels-css">';
	echo '@keyframes wrrapd-wheel-in{0%{transform:translateX(min(38vw,240px)) rotate(-540deg);opacity:0}100%{transform:translateX(0) rotate(0);opacity:1}}';
	echo '@keyframes wrrapd-wrap-blink{0%,100%{opacity:1}45%{opacity:.22}55%{opacity:.22}}';
	echo '#wrrapd-retailer-wheels-row{width:100%;box-sizing:border-box;background:linear-gradient(180deg,rgba(248,250,252,.97) 0%,rgba(241,245,249,.98) 100%);border-bottom:1px solid rgba(15,23,42,.08);}';
	echo '.wrrapd-wrap-promo-mobile{display:none;width:100%;box-sizing:border-box;padding:.25rem clamp(.5rem,2vw,1rem) .1rem;text-align:center;text-decoration:none!important;color:inherit;}';
	echo '.wrrapd-wheel-mobile-stack{display:contents;}';
	echo '.wrrapd-wrap-promo-mobile__inner{display:inline-flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:.15rem .35rem;font-family:"Great Vibes",Pacifico,"Segoe Script","Brush Script MT",cursive;font-weight:400;font-size:clamp(1.15rem,3.2vw,1.65rem);line-height:1.1;}';
	echo '.wrrapd-wrap-promo-mobile__blink{animation:wrrapd-wrap-blink 1.85s ease-in-out infinite;}';
	echo '.wrrapd-wrap-promo-mobile__premium{color:#b22234;font-size:clamp(1.12rem,3vw,1.5rem);}';
	echo '.wrrapd-wrap-promo-mobile__mid{color:#162a52;}';
	echo '.wrrapd-wrap-promo-mobile__at{color:#0a3161;font-size:clamp(1rem,2.6vw,1.35rem);}';
	echo '.wrrapd-wrap-promo-mobile__arrow{color:#c9a227;font-size:1.15em;line-height:1;}';
	echo '.wrrapd-wrap-promo-mobile__features{width:100%;margin:.35rem 0 0;padding:0 clamp(.5rem,2vw,1rem);list-style:none;text-align:center;}';
	echo '.wrrapd-wrap-promo-mobile__features li{display:inline-block;margin:.12rem .28rem;font-family:"Great Vibes",Pacifico,"Segoe Script","Brush Script MT",cursive;font-size:clamp(.96rem,2.45vw,1.14rem);font-weight:700;color:#000;line-height:1.2;text-shadow:0 .5px 0 #000,0 1px 2px rgba(255,255,255,.92);-webkit-font-smoothing:antialiased;}';
	echo '.wrrapd-wrap-promo-mobile__features li::before{content:"• ";color:#c9a227;font-weight:700;}';
	echo '.wrrapd-wrap-promo-mobile__features.wrrapd-wrap-promo-mobile__features--stack{display:none!important;}';
	echo '.wrrapd-wrap-promo-mobile:hover .wrrapd-wrap-promo-mobile__blink,.wrrapd-wrap-promo-mobile:focus-visible .wrrapd-wrap-promo-mobile__blink{animation-play-state:paused;opacity:1!important;}';
	echo '#wrrapd-retailer-wheels-row .wrrapd-retailer-wheels{display:flex;flex-direction:row;flex-wrap:nowrap;justify-content:center;align-items:flex-start;gap:clamp(.4rem,1.4vw,.95rem);padding:.55rem clamp(.5rem,2vw,1.25rem) .75rem;max-width:100%;margin:0 auto;box-sizing:border-box;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:thin;}';
	echo '.wrrapd-retailer-wheels__item{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:.28rem;max-width:4.85rem;text-decoration:none;color:#0f172a;outline-offset:4px;animation:wrrapd-wheel-in 1.15s cubic-bezier(.2,.85,.15,1) forwards;opacity:0;}';
	echo '.wrrapd-retailer-wheels__item:focus-visible{outline:2px solid #f5c518;}';
	echo '.wrrapd-retailer-wheels__badge{width:42px;height:42px;border-radius:50%;overflow:hidden;box-shadow:0 2px 10px rgba(15,23,42,.12);background:transparent;flex-shrink:0;}';
	echo '@media(min-width:640px){.wrrapd-retailer-wheels__badge{width:54px;height:54px}}';
	echo '@media(min-width:900px){.wrrapd-retailer-wheels__badge{width:62px;height:62px}}';
	echo '.wrrapd-retailer-wheels__badge img{display:block;width:100%;height:100%;object-fit:cover;object-position:center;box-sizing:border-box;}';
	echo '.wrrapd-retailer-wheels__title{font-size:.68rem;line-height:1.15;text-align:center;font-weight:600;color:#334155;letter-spacing:.01em;}';
	echo '@media(min-width:640px){.wrrapd-retailer-wheels__title{font-size:.74rem}}';
	echo '.wrrapd-wrap-promo{flex:0 0 auto;display:flex;align-items:center;gap:.45rem;max-width:min(11.5rem,28vw);padding:.1rem 0;text-decoration:none!important;color:inherit;cursor:pointer;}';
	echo '.wrrapd-wrap-promo--bestbuy{max-width:min(14.5rem,34vw);align-items:flex-start;padding-top:.12rem;}';
	echo '.wrrapd-wrap-promo--ulta{margin-right:.15rem;}';
	echo '.wrrapd-wrap-promo--bestbuy{margin-left:.15rem;}';
	echo '.wrrapd-wrap-promo:hover .wrrapd-wrap-promo__line--blink,.wrrapd-wrap-promo:focus-visible .wrrapd-wrap-promo__line--blink{animation-play-state:paused;opacity:1!important;}';
	echo '.wrrapd-wrap-promo__copy{display:flex;flex-direction:column;gap:.02rem;}';
	echo '.wrrapd-wrap-promo__copy--right{text-align:right;align-items:flex-end;}';
	echo '.wrrapd-wrap-promo__copy--left{text-align:left;align-items:flex-start;}';
	echo '.wrrapd-wrap-promo__line{display:block;font-family:"Great Vibes",Pacifico,"Segoe Script","Brush Script MT",cursive;font-weight:400;font-size:clamp(1.05rem,2.6vw,1.55rem);line-height:1.05;letter-spacing:.01em;white-space:nowrap;}';
	echo '.wrrapd-wrap-promo__line--premium{font-size:clamp(1.25rem,3.1vw,1.85rem);color:#b22234;}';
	echo '.wrrapd-wrap-promo__line--mid{color:#162a52;font-size:clamp(1.15rem,2.85vw,1.65rem);}';
	echo '.wrrapd-wrap-promo__line--for{color:#0a3161;font-size:clamp(1rem,2.45vw,1.35rem);}';
	echo '.wrrapd-wrap-promo__copy--features{padding-top:.05rem;}';
	echo '.wrrapd-wrap-promo__bullets{margin:0;padding:0;list-style:none;}';
	echo '.wrrapd-wrap-promo__bullet{font-family:"Great Vibes",Pacifico,"Segoe Script","Brush Script MT",cursive!important;font-size:clamp(.92rem,2.2vw,1.12rem)!important;font-weight:700!important;line-height:1.18!important;color:#000!important;white-space:normal;margin:.06rem 0;letter-spacing:.015em;text-shadow:0 .5px 0 #000,0 1px 2px rgba(255,255,255,.92)!important;-webkit-font-smoothing:antialiased!important;}';
	echo '.wrrapd-wrap-promo__bullet::before{content:"• ";color:#c9a227;font-weight:700;}';
	echo '.wrrapd-wrap-promo--bestbuy .wrrapd-wrap-promo__bullet{animation:none!important;opacity:1!important;}';
	echo '.wrrapd-wrap-promo__line--blink{animation:wrrapd-wrap-blink 1.85s ease-in-out infinite;}';
	echo '.wrrapd-wrap-promo__arrow{flex:0 0 auto;width:1.55rem;height:1.55rem;position:relative;}';
	echo '.wrrapd-wrap-promo__arrow--right::before,.wrrapd-wrap-promo__arrow--left::before{content:"";position:absolute;top:50%;left:50%;width:100%;height:2.5px;background:linear-gradient(90deg,#c9a227,#162a52);border-radius:2px;transform:translate(-50%,-50%);}';
	echo '.wrrapd-wrap-promo__arrow--right::after{content:"";position:absolute;top:50%;right:0;width:.5rem;height:.5rem;border-top:2.5px solid #162a52;border-right:2.5px solid #162a52;transform:translateY(-50%) rotate(45deg);}';
	echo '.wrrapd-wrap-promo__arrow--left::before{background:linear-gradient(90deg,#162a52,#c9a227);}';
	echo '.wrrapd-wrap-promo__arrow--left::after{content:"";position:absolute;top:50%;left:0;width:.5rem;height:.5rem;border-bottom:2.5px solid #162a52;border-left:2.5px solid #162a52;transform:translateY(-50%) rotate(45deg);}';
	echo '@media(max-width:960px),(hover:none) and (pointer:coarse){.wrrapd-wrap-promo-mobile,.wrrapd-wrap-promo-mobile--tagline,.wrrapd-wrap-promo-mobile__features--stack{display:none!important;}.wrrapd-wheel-mobile-stack{display:block;width:100%;}.wrrapd-wrap-promo{display:flex!important;}.wrrapd-wrap-promo--ulta{flex:0 0 auto;max-width:min(5.5rem,22vw)!important;margin:0!important;align-items:center!important;}.wrrapd-wrap-promo--bestbuy{flex:0 0 auto;max-width:min(6.25rem,26vw)!important;margin:0!important;align-items:flex-start!important;}.wrrapd-wrap-promo__line{font-size:clamp(.52rem,2.4vw,.68rem)!important;white-space:normal!important;line-height:1.05!important;}.wrrapd-wrap-promo__line--premium{font-size:clamp(.58rem,2.6vw,.74rem)!important;}.wrrapd-wrap-promo__line--mid,.wrrapd-wrap-promo__line--for{font-size:clamp(.5rem,2.2vw,.64rem)!important;}.wrrapd-wrap-promo__arrow{width:.85rem!important;height:.85rem!important;flex-shrink:0!important;}.wrrapd-wrap-promo__bullet{font-size:clamp(.44rem,2vw,.54rem)!important;line-height:1.12!important;margin:.04rem 0!important;}.wrrapd-wrap-promo__copy--right{text-align:right!important;}#wrrapd-retailer-wheels-row .wrrapd-retailer-wheels{display:flex!important;flex-wrap:nowrap!important;align-items:center!important;justify-content:space-between!important;overflow-x:hidden!important;gap:.1rem!important;padding:.35rem!important;}.wrrapd-retailer-wheels__item{flex:1 1 0!important;min-width:0!important;max-width:none!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:.06rem!important;}.wrrapd-retailer-wheels__badge{width:1.12rem!important;height:1.12rem!important;}.wrrapd-retailer-wheels__title{display:block!important;font-size:.42rem!important;line-height:1.1!important;text-align:center!important;font-weight:600!important;color:#334155!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;max-width:100%!important;}}';
	echo '@media(max-width:393px){.wrrapd-wrap-promo--bestbuy{display:none!important;}.wrrapd-wrap-promo-mobile__features.wrrapd-wrap-promo-mobile__features--stack{display:none!important;height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;}}';
	echo '@media(prefers-reduced-motion:reduce){.wrrapd-wrap-promo__line--blink,.wrrapd-wrap-promo-mobile__blink{animation:none!important;opacity:1!important;}.wrrapd-retailer-wheels__item{animation:none;opacity:1;}}';
	echo '</style>';
	echo '<div id="wrrapd-retailer-wheels-row" class="wrrapd-retailer-wheels-row">';
	echo '<div class="wrrapd-wheel-mobile-stack">';
	echo '<a class="wrrapd-wrap-promo-mobile wrrapd-wrap-promo-mobile--tagline" href="' . $ext_url . '" target="_blank" rel="noopener noreferrer" aria-label="' . esc_attr__( 'Premium gift-wrapping — install the free Wrrapd Chrome extension', 'wrrapd' ) . '">';
	echo '<span class="wrrapd-wrap-promo-mobile__inner">';
	echo '<span class="wrrapd-wrap-promo-mobile__blink wrrapd-wrap-promo-mobile__premium">' . esc_html__( 'Premium', 'wrrapd' ) . '</span>';
	echo '<span class="wrrapd-wrap-promo-mobile__blink wrrapd-wrap-promo-mobile__mid">' . esc_html__( 'gift-wrapping', 'wrrapd' ) . '</span>';
	echo '<span class="wrrapd-wrap-promo-mobile__blink wrrapd-wrap-promo-mobile__at">' . esc_html__( 'now available for:', 'wrrapd' ) . '</span>';
	echo '<span class="wrrapd-wrap-promo-mobile__arrow" aria-hidden="true">→</span>';
	echo '</span></a>';
	echo '<div id="wrrapd-retailer-wheels-strip" class="wrrapd-retailer-wheels" role="region" aria-label="' . esc_attr__( 'Shop at partner stores', 'wrrapd' ) . '">';
	$idx   = 0;
	$total = count( $brands );
	foreach ( $brands as $b ) {
		if ( $idx === 0 ) {
			wrrapd_render_retailer_wheel_wrap_promo( 'ulta' );
		}
		$delay = 0.06 + ( $idx * 0.11 );
		$go    = esc_url( wrrapd_affiliate_go_url( $b['slug'] ) );
		$src   = esc_url( wrrapd_mu_logo_url_for_slug( $b['slug'], $b['domain'] ) );
		$fb    = 'https://www.google.com/s2/favicons?domain=' . rawurlencode( $b['domain'] ) . '&sz=128';
		$label = $b['label'];
		echo '<a class="wrrapd-retailer-wheels__item" href="' . $go . '" target="_blank" rel="sponsored noopener noreferrer" style="animation-delay:' . esc_attr( (string) $delay ) . 's">';
		echo '<span class="wrrapd-retailer-wheels__badge">';
		echo '<img src="' . $src . '" data-fallback="' . esc_url( $fb ) . '" width="156" height="156" alt="' . esc_attr( $label ) . '" loading="lazy" decoding="async" onerror="var u=this.dataset.fallback;if(u){this.onerror=null;this.src=u;}" />';
		echo '</span>';
		echo '<span class="wrrapd-retailer-wheels__title">' . esc_html( $label ) . '</span>';
		echo '</a>';
		if ( $idx === $total - 1 ) {
			wrrapd_render_retailer_wheel_wrap_promo( 'bestbuy' );
		}
		++$idx;
	}
	echo '</div>';
	echo '<ul class="wrrapd-wrap-promo-mobile__features wrrapd-wrap-promo-mobile__features--stack" aria-label="' . esc_attr__( 'Wrrapd extension features', 'wrrapd' ) . '">';
	foreach ( wrrapd_wrap_promo_feature_bullets() as $bullet ) {
		echo '<li>' . esc_html( $bullet ) . '</li>';
	}
	echo '</ul></div></div>';
	echo '<script>';
	echo 'document.addEventListener("DOMContentLoaded",function(){var row=document.getElementById("wrrapd-retailer-wheels-row");if(!row||!row.parentNode)return;var h=document.querySelector("[data-elementor-type=\\"header\\"]")||document.querySelector("body>header")||document.getElementById("masthead")||document.querySelector("header.site-header")||document.querySelector("header");if(h&&h.parentNode){h.insertAdjacentElement("afterend",row);}});';
	echo '</script>';
}

add_action( 'wp_body_open', 'wrrapd_output_retailer_wheel_strip', 5 );
/** Same callback, run-once guard: outputs here if the active theme never calls `wp_body_open`. */
add_action( 'wp_footer', 'wrrapd_output_retailer_wheel_strip', 1 );

/**
 * Retailer, /go/, and Chrome Web Store links open in a new tab (belt-and-suspenders for Elementor HTML).
 */
function wrrapd_output_external_retailer_links_new_tab_script() {
	if ( is_admin() ) {
		return;
	}
	echo '<script id="wrrapd-ext-links-new-tab">';
	echo '(function(){var sel=[".wrrapd-retailer-wheels__item",".wrrapd-wrap-promo",".wrrapd-wrap-promo-mobile",".wrrapd-gift-guides__cta",".wrrapd-gift-guides__card-logo",".wrrapd-gift-guides a.wrrapd-ext-cta",".wrrapd-top-gifts__card-cta",".wrrapd-hot-gifts-rail__card","a[href*=\\"chromewebstore.google.com\\"]"];';
	echo 'function wrrapdApplyExtNewTab(){var mobile=window.matchMedia("(max-width:720px),(pointer:coarse)").matches;sel.forEach(function(s){document.querySelectorAll(s).forEach(function(a){var href=a.getAttribute("href")||"";var isGo=href.indexOf("/go/")>=0;a.target=(isGo&&mobile)?"_self":"_blank";var r=(a.getAttribute("rel")||"").split(/\\s+/).filter(Boolean);["noopener","noreferrer"].forEach(function(x){if(r.indexOf(x)<0)r.push(x);});if(isGo&&r.indexOf("sponsored")<0)r.unshift("sponsored");a.rel=r.join(" ");});});}';
	echo 'document.addEventListener("DOMContentLoaded",wrrapdApplyExtNewTab);window.addEventListener("load",wrrapdApplyExtNewTab);})();';
	echo '</script>';
}

add_action( 'wp_footer', 'wrrapd_output_external_retailer_links_new_tab_script', 25 );

/**
 * Probe for installed Wrrapd Chrome extension (requires 2.0.16+ ping handler).
 * When detected: hide install CTAs sitewide (CSS + hideInstallCopy).
 *
 * IMPORTANT: never hide CTAs from a stale sessionStorage marker alone — that made the
 * header (7f1bdc1) + body (eb0b235) install buttons "disappear" for shoppers who once
 * had the extension (or a sticky marker) even when it is not installed now. Only a live
 * chrome.runtime ping may hide them.
 */
function wrrapd_output_extension_detection_script() {
	if ( is_admin() ) {
		return;
	}
	$cws             = wrrapd_chrome_extension_install_url();
	$ext_id          = WRRAPD_CHROME_EXTENSION_ID;
	$latest_version  = '3.0.10';

	echo '<style id="wrrapd-ext-detected-css">';
	echo 'html.wrrapd-ext-installed .elementor-element-7f1bdc1,html.wrrapd-ext-installed .elementor-element-eb0b235,html.wrrapd-ext-installed .elementor-location-header a.elementor-button[href*="chromewebstore"]{display:none!important;}';
	echo 'html.wrrapd-ext-installed .wrrapd-wrap-promo,html.wrrapd-ext-installed .wrrapd-wrap-promo-mobile,html.wrrapd-ext-installed .wrrapd-ext-cta{display:none!important;}';
	echo 'html.wrrapd-ext-outdated .wrrapd-ext-update-nudge{display:flex!important;}';
	echo '.wrrapd-ext-update-nudge{display:none;position:fixed;bottom:1rem;right:1rem;z-index:100040;max-width:min(100%,22rem);padding:.85rem 1rem;border-radius:.75rem;background:#fff8ed;border:1px solid rgba(178,34,52,.25);box-shadow:0 12px 32px rgba(12,18,34,.14);font-family:system-ui,sans-serif;font-size:.88rem;line-height:1.35;color:#0c1222;align-items:flex-start;gap:.65rem;}';
	echo '.wrrapd-ext-update-nudge a{color:#b22234;font-weight:700;}';
	echo '.wrrapd-ext-update-nudge__dismiss{margin-left:auto;padding:0;border:0;background:transparent;color:#64748b;cursor:pointer;font-size:1.1rem;line-height:1;}';
	echo '</style>';

	echo '<div id="wrrapd-ext-update-nudge" class="wrrapd-ext-update-nudge" hidden role="status" aria-live="polite">';
	echo esc_html__( 'A newer Wrrapd extension is available.', 'wrrapd' );
	echo ' <a href="' . esc_url( $cws ) . '" target="_blank" rel="noopener noreferrer">' . esc_html__( 'Update', 'wrrapd' ) . '</a>';
	echo '<button type="button" class="wrrapd-ext-update-nudge__dismiss" id="wrrapd-ext-update-dismiss" aria-label="' . esc_attr__( 'Dismiss', 'wrrapd' ) . '">&times;</button>';
	echo '</div>';

	echo '<script id="wrrapd-ext-detect-js">';
	echo '(function(){';
	echo 'var EXT_ID=' . wp_json_encode( $ext_id ) . ',LATEST=' . wp_json_encode( $latest_version ) . ',cws=' . wp_json_encode( $cws ) . ',MARKER="wrrapd_ext_detected",OUTDATED="wrrapd_ext_outdated_dismissed";';
	echo 'var extInstalled=false,extVersion="";';
	echo 'function parseVersion(v){return(v||"").split(".").map(function(n){return parseInt(n,10)||0;});}';
	echo 'function versionLt(a,b){var x=parseVersion(a),y=parseVersion(b),i;for(i=0;i<Math.max(x.length,y.length);i++){var d=(x[i]||0)-(y[i]||0);if(d!==0)return d<0;}return false;}';
	echo 'function showCtas(){extInstalled=false;document.documentElement.classList.remove("wrrapd-ext-installed");try{sessionStorage.removeItem(MARKER);}catch(e){}}';
	echo 'function markInstalled(ver){extInstalled=true;extVersion=ver||"";document.documentElement.classList.add("wrrapd-ext-installed");try{sessionStorage.setItem(MARKER,"1");if(ver)sessionStorage.setItem("wrrapd_ext_version",ver);}catch(e){}}';
	echo 'function hideInstallCopy(){if(!extInstalled)return;var re=/add\\s+your\\s+free\\s+chrome\\s+extension\\s+today/i;document.querySelectorAll("a,button,.elementor-button,.elementor-heading-title").forEach(function(el){var t=(el.textContent||"").replace(/\\s+/g," ").trim();if(!re.test(t))return;var wrap=el.closest(".elementor-element,section,div")||el;wrap.style.display="none";});}';
	echo 'function showUpdateNudge(){if(!extVersion||!versionLt(extVersion,LATEST))return;try{if(sessionStorage.getItem(OUTDATED)==="1")return;}catch(e){}var n=document.getElementById("wrrapd-ext-update-nudge");if(!n)return;n.hidden=false;document.documentElement.classList.add("wrrapd-ext-outdated");}';
	echo 'function onDetected(resp){var ver=resp&&resp.version?String(resp.version):"";markInstalled(ver);hideInstallCopy();showUpdateNudge();}';
	echo 'function rewriteCwsLinks(){var re=/chromewebstore\\.google\\.com\\/detail\\/wrrapd\\/[a-z]{32}/i;document.querySelectorAll("a[href*=\\"chromewebstore.google.com/detail/wrrapd/\\"]").forEach(function(a){var h=a.getAttribute("href")||"";if(re.test(h)&&h.indexOf(EXT_ID)<0)a.setAttribute("href",cws);});}';
	echo 'function probe(){showCtas();rewriteCwsLinks();try{if(window.chrome&&chrome.runtime&&chrome.runtime.sendMessage){chrome.runtime.sendMessage(EXT_ID,{type:"WRRAPD_PING"},function(resp){if(chrome.runtime.lastError){showCtas();return;}if(resp&&(resp.ok||resp.wrrapd))onDetected(resp);else showCtas();});}}catch(e){showCtas();}}';
	echo 'var dismiss=document.getElementById("wrrapd-ext-update-dismiss");if(dismiss){dismiss.addEventListener("click",function(){var n=document.getElementById("wrrapd-ext-update-nudge");if(n)n.hidden=true;document.documentElement.classList.remove("wrrapd-ext-outdated");try{sessionStorage.setItem(OUTDATED,"1");}catch(e){}});}';
	echo 'window.wrrapdExtIsInstalled=function(){return extInstalled;};';
	echo 'rewriteCwsLinks();probe();window.addEventListener("pageshow",probe);document.addEventListener("DOMContentLoaded",rewriteCwsLinks);';
	echo '})();';
	echo '</script>';
}
add_action( 'wp_footer', 'wrrapd_output_extension_detection_script', 20 );

/**
 * Upgrade bare retailer URLs to /go/{slug}/?to=… hops (affiliate cookie on wrrapd.com).
 */
function wrrapd_output_affiliate_link_upgrader_script() {
	if ( is_admin() ) {
		return;
	}
	$hop   = esc_url( home_url( '/go/' ) );
	$rules = array();
	foreach ( wrrapd_affiliate_domain_slug_rules() as $rule ) {
		$rules[] = array(
			'h' => (string) $rule['host'],
			's' => (string) $rule['slug'],
		);
	}
	echo '<script id="wrrapd-affiliate-link-upgrader">';
	echo '(function(){var hop=' . wp_json_encode( $hop ) . ',rules=' . wp_json_encode( $rules ) . ',siteHost=' . wp_json_encode( wp_parse_url( home_url( '/' ), PHP_URL_HOST ) ) . ';';
	echo 'function slugForHost(h){h=(h||"").toLowerCase().replace(/^www\\./,"");for(var i=0;i<rules.length;i++){var x=rules[i].h;if(h===x||h.slice(-(x.length+1))==="."+x)return rules[i].s;}return"";}';
	echo 'function hopUrl(href,slug){return hop+slug+"/?to="+encodeURIComponent(href);}';
	echo 'function markAffiliate(a){var href=a.getAttribute("href")||"";var mobile=window.matchMedia("(max-width:720px),(pointer:coarse)").matches;var isGo=href.indexOf("/go/")>=0;a.target=(isGo&&mobile)?"_self":"_blank";var r=(a.getAttribute("rel")||"").split(/\\s+/).filter(Boolean);["noopener","noreferrer"].forEach(function(x){if(r.indexOf(x)<0)r.push(x);});if(isGo&&r.indexOf("sponsored")<0)r.unshift("sponsored");a.rel=r.join(" ");}';
	echo 'function upgradeHref(href){if(!href||href.indexOf("/go/")>=0)return href;var u;try{u=new URL(href,window.location.href);}catch(e){return href;}';
	echo 'if(u.protocol!=="http:"&&u.protocol!=="https:")return href;var sh=(siteHost||"").toLowerCase().replace(/^www\\./,"");var uh=u.hostname.toLowerCase().replace(/^www\\./,"");if(sh&&uh===sh)return href;';
	echo 'var slug=slugForHost(u.hostname);return slug?hopUrl(u.href,slug):href;}';
	echo 'function up(a){if(!a||!a.href)return;var next=upgradeHref(a.href);if(next!==a.href){a.href=next;markAffiliate(a);}}';
	echo 'function run(root){(root||document).querySelectorAll("a[href]").forEach(up);}';
	echo 'document.addEventListener("click",function(e){var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;up(a);},true);';
	echo 'document.addEventListener("DOMContentLoaded",function(){run(document);if(window.MutationObserver){var mo=new MutationObserver(function(m){m.forEach(function(x){x.addedNodes&&x.addedNodes.forEach(function(n){if(n.nodeType===1)run(n);});});});mo.observe(document.body,{childList:true,subtree:true});}});';
	echo 'window.addEventListener("load",function(){run(document);});})();';
	echo '</script>';
}

add_action( 'wp_footer', 'wrrapd_output_affiliate_link_upgrader_script', 26 );

/**
 * Homepage top fold only: hero → ticker → hot-gifts rail (does not touch lower sections).
 */
function wrrapd_output_home_section_tighten_css() {
	if ( is_admin() || is_paged() ) {
		return;
	}
	if ( function_exists( 'wrrapd_is_hire_portal_host' ) && wrrapd_is_hire_portal_host() ) {
		return;
	}
	if ( ! is_front_page() && ! is_home() ) {
		return;
	}
	echo '<style id="wrrapd-home-top-tighten">';
	echo '.elementor-4857 .elementor-element-df1501e>.elementor-container{gap:clamp(0.35rem,1.2vw,0.65rem)!important;}';
	echo '.elementor-4857 .elementor-element-6466f5b h1,.elementor-4857 .elementor-element-6466f5b h1 strong,.elementor-4857 .elementor-element-6466f5b.wrrapd-season-headline-injected h1,.elementor-4857 .elementor-element-6466f5b.wrrapd-season-headline-injected h1 strong{margin-bottom:0.2rem!important;color:#C40410!important;}';
	echo '.elementor-4857 .wrrapd-season-hero-body,.elementor-4857 .wrrapd-season-hero-body span{margin-bottom:0.25rem!important;}';
	echo '#wrrapd-retailer-wheels-row{margin-bottom:0!important;padding-bottom:0!important;border-bottom:none!important;}';
	echo '#wrrapd-retailer-wheels-row .wrrapd-retailer-wheels{padding-top:.28rem!important;padding-bottom:0!important;}';
	echo '.wrrapd-wrap-promo-mobile__features--stack{display:none!important;margin:0!important;padding:0!important;height:0!important;overflow:hidden!important;}';
	/* Empty Elementor divider box 7a8bd00 was leaving a white band between retailer logos and the ticker. */
	echo '.elementor-4857 .elementor-element-7a8bd00{display:none!important;height:0!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;}';
	echo '.elementor-4857 .elementor-element-0a7e92b{padding-top:0!important;margin-top:0!important;}';
	echo '.occasion-ticker-shell{margin-top:0!important;margin-bottom:0!important;}';
	echo '.occasion-ticker-bar{padding-top:0.1rem!important;padding-bottom:0.1rem!important;gap:.28rem!important;}';
	echo '.occasion-ticker-panel .ticker-container{padding-top:0.06rem!important;padding-bottom:0.06rem!important;}';
	echo '.wrrapd-hot-gifts-rail,.wrrapd-hot-gifts-rail--below-ticker,.wrrapd-hot-gifts-rail--in-ticker-shell{margin-top:0!important;margin-bottom:0!important;padding-top:0!important;padding-bottom:0!important;}';
	echo '.wrrapd-hot-gifts-rail__head{margin-bottom:0.08rem!important;}';
	echo '.elementor-4857 .elementor-element-5601b5d{margin-top:0.15rem!important;margin-bottom:0.15rem!important;}';
	/* Text only — never set font on the whole homepage container (that can collapse image widgets). */
	echo 'body.home .elementor-4857 .elementor-heading-title,body.page-id-4857 .elementor-4857 .elementor-heading-title,body.home .elementor-4857 p,body.page-id-4857 .elementor-4857 p,body.home .elementor-widget-html .wrrapd-top-gifts p,body.page-id-4857 .elementor-widget-html .wrrapd-top-gifts p,body.home .elementor-widget-html .wrrapd-top-gifts a,body.page-id-4857 .elementor-widget-html .wrrapd-top-gifts a,body.home .elementor-widget-html .wrrapd-gift-guides h2,body.page-id-4857 .elementor-widget-html .wrrapd-gift-guides h2,body.home .elementor-widget-html .wrrapd-gift-guides h3,body.page-id-4857 .elementor-widget-html .wrrapd-gift-guides h3,body.home .elementor-widget-html .wrrapd-gift-guides p,body.page-id-4857 .elementor-widget-html .wrrapd-gift-guides p,body.home .wrrapd-hot-gifts-rail__title,body.page-id-4857 .wrrapd-hot-gifts-rail__title,body.home .occasion-ticker-bar,body.page-id-4857 .occasion-ticker-bar,body.home .wrrapd-howto-kicker,body.page-id-4857 .wrrapd-howto-kicker,body.home .wrrapd-howto-stepheading,body.page-id-4857 .wrrapd-howto-stepheading,body.home .wrrapd-howto-copy p,body.page-id-4857 .wrrapd-howto-copy p,body.home .wrrapd-howto-copy,body.page-id-4857 .wrrapd-howto-copy{font-family:Fraunces,Georgia,"Times New Roman",serif!important;}';
	echo '</style>';
}

add_action( 'wp_head', 'wrrapd_output_home_section_tighten_css', 99 );

/**
 * Sitewide mobile / touch layout (rem-based). See wrrapd-mobile-responsive.css in mu-plugins/.
 */
function wrrapd_output_mobile_responsive_css() {
	if ( is_admin() ) {
		return;
	}
	$path = dirname( __FILE__ ) . '/wrrapd-mobile-responsive.css';
	if ( ! is_readable( $path ) ) {
		return;
	}
	$css = file_get_contents( $path );
	if ( ! is_string( $css ) || $css === '' ) {
		return;
	}
	echo '<style id="wrrapd-mobile-responsive-css">' . $css . '</style>';
}

add_action( 'wp_head', 'wrrapd_output_mobile_responsive_css', 100 );

/**
 * Header layout — single source (desktop + mobile). Do not duplicate in formup CSS.
 */
function wrrapd_output_header_layout_css() {
	if ( is_admin() ) {
		return;
	}
	echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560;9..144,700&amp;display=swap" />';
	echo '<style id="wrrapd-header-layout-css">';
	/* Header chrome navy — every structural surface, including Register/Login.
	   Elementor still stores leftover #0f0351 on 1112277b .elementor-widget-container;
	   this token always wins so auth chrome cannot drift from the header. */
	echo '.elementor-location-header,.elementor-location-header .elementor-section,.elementor-location-header [data-elementor-type="header"],.elementor-location-header .e-con,.elementor-location-header .elementor-element-6835e730{background:' . WRRAPD_NAVY_DEEP . '!important;background-color:' . WRRAPD_NAVY_DEEP . '!important;}';
	echo '.elementor-location-header .elementor-element,.elementor-location-header .elementor-widget,.elementor-location-header .elementor-widget-container,.elementor-location-header .elementor-nav-menu--main,.elementor-location-header .elementor-nav-menu--dropdown,.elementor-location-header .elementor-nav-menu,.elementor-location-header .elementor-nav-menu li,.elementor-location-header .elementor-nav-menu .elementor-item{background:' . WRRAPD_NAVY_DEEP . '!important;background-color:' . WRRAPD_NAVY_DEEP . '!important;}';
	echo '.elementor.elementor-location-header .elementor-element.elementor-element-1112277b,.elementor.elementor-location-header .elementor-element.elementor-element-1112277b>.elementor-widget-container,.elementor-location-header [data-id="1112277b"],.elementor-location-header [data-id="1112277b"] .elementor-widget-container,.elementor-location-header [data-id="1112277b"] .elementor-item{background:' . WRRAPD_NAVY_DEEP . '!important;background-color:' . WRRAPD_NAVY_DEEP . '!important;}';
	/* Keep branded header buttons — do not inherit chrome navy. */
	echo '.elementor-location-header [data-id="69de726e"] .elementor-widget-container,.elementor-location-header .elementor-element-69de726e .elementor-widget-container{background:transparent!important;background-color:transparent!important;}';
	echo '.elementor-location-header [data-id="69de726e"] .elementor-button,.elementor-location-header .elementor-element-69de726e .elementor-button{background:#fff!important;background-color:#fff!important;}';
	echo '.elementor-location-header [data-id="2ca99876"],.elementor-location-header .elementor-element-2ca99876,.elementor-location-header [data-id="2ca99876"] .elementor-widget-container,.elementor-location-header [data-id="2ca99876"] .elementor-button{background:#f9d027!important;background-color:#f9d027!important;}';
	echo '.elementor-location-header .elementor-element-7f1bdc1 .elementor-widget-container,.elementor-location-header .elementor-element-00ec9fc .elementor-widget-container{background:transparent!important;background-color:transparent!important;}';
	echo '.elementor-location-header .elementor-element-7f1bdc1 .elementor-button,.elementor-element-eb0b235 .elementor-button{background:linear-gradient(180deg,#e85d04,#d14900)!important;color:#fff!important;}';
	echo '.elementor-location-header .gift-ideas-button{background-color:' . WRRAPD_LOGO_GOLD . '!important;color:#0f0351!important;}';
	/* Row: brand | location | spacer | auth — CTA is page-centered (desktop) */
	echo '.elementor-location-header .elementor-section,.elementor-location-header [data-elementor-type="header"] .e-con{min-height:0!important;--min-height:0!important;padding-block:0!important;}';
	echo '.elementor-location-header .elementor-element-6835e730{position:relative!important;display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;align-items:stretch!important;justify-content:space-between!important;gap:0 .35rem!important;padding-block:clamp(.38rem,.9vmin,.62rem)!important;min-height:8.35rem!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;}';
	/* Brand LEFT — 22% keeps the wordmark tall without crowding the CTA. */
	echo '.elementor-location-header .elementor-element-6e478726{display:flex!important;flex-direction:column!important;align-items:flex-start!important;justify-content:center!important;align-self:stretch!important;flex:0 0 22%!important;max-width:22%!important;width:22%!important;min-width:0!important;gap:0!important;margin:0!important;padding:0!important;position:relative!important;z-index:3!important;}';
	echo '.elementor-location-header .elementor-element-6e478726>*{flex:0 0 auto!important;}';
	echo '.elementor-location-header .elementor-element-68a38868{margin:0!important;padding:0!important;line-height:0!important;}';
	echo '.elementor-location-header .elementor-element-68a38868 img{max-width:min(16.2rem,48vw)!important;height:auto!important;width:auto!important;margin:0!important;transform:translate(-.45rem,0)!important;object-position:left center!important;}';
	echo '.elementor-location-header .elementor-element-1c0d63ad{margin:-1.15rem 0 0!important;padding:0!important;line-height:0!important;transform:translate(-.3rem,0)!important;}';
	echo '.elementor-location-header .elementor-element-1c0d63ad img{display:block!important;max-width:min(13.8rem,42vw)!important;max-height:none!important;margin:0!important;transform:none!important;}';
	/* Customizer "Additional CSS" (wp-custom-css) still pins the guest-home logo to
	   min(13.5rem,42vw) at (0,4,2). Match its shape and add .elementor-widget so this
	   wins on specificity rather than on stylesheet order. */
	echo 'body.home:not(.logged-in) .elementor-location-header .elementor-element-68a38868.elementor-widget img,body.page-id-4857:not(.logged-in) .elementor-location-header .elementor-element-68a38868.elementor-widget img{max-height:none!important;max-width:min(19.2rem,54vw)!important;width:auto!important;height:auto!important;}';
	echo 'body.logged-in .elementor-location-header .elementor-element-68a38868.elementor-widget img{max-height:clamp(4.8rem,13vmin,6.6rem)!important;width:auto!important;height:auto!important;}';
	/* Location — sit to the right of the logo, stop before the centered CTA. */
	echo '.elementor-location-header .elementor-element-1913a20{flex:0 1 13.25rem!important;max-width:13.25rem!important;width:auto!important;min-width:0!important;align-self:center!important;margin:0 0 0 1.15rem!important;padding:0!important;transform:translateX(.85rem)!important;position:relative!important;z-index:1!important;overflow:visible!important;}';
	echo '.elementor-location-header #wrrapd-location,.elementor-location-header #location-text{max-width:100%!important;}';
	echo '.elementor-location-header #wrrapd-location,.elementor-location-header #location-text,.elementor-location-header #location-text strong{font-family:Fraunces,Georgia,"Times New Roman",serif!important;font-optical-sizing:auto!important;font-weight:560!important;font-size:clamp(.8rem,1.8vmin,.95rem)!important;line-height:1.25!important;}';
	/* Auth column = Register/Login + Google/Amazon + Careers (far right). CTA is NOT in this flex fight. */
	echo '.elementor-location-header .elementor-element-693b4ea7{flex:0 0 12.5rem!important;max-width:12.5rem!important;width:12.5rem!important;min-width:12.5rem!important;margin-left:auto!important;display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:stretch!important;align-self:stretch!important;padding:.08rem 0!important;gap:0!important;position:relative!important;z-index:4!important;background:transparent!important;}';
	echo '.elementor-location-header .elementor-element-2b05a213{display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:flex-end!important;width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;gap:0!important;min-height:0!important;}';
	/* Desktop: Chrome CTA truly page-centered on the header row (above Delivering-to). */
	echo '@media(min-width:1101px){';
	echo '.elementor-location-header .elementor-element-00ec9fc{position:absolute!important;left:56%!important;top:50%!important;transform:translate(-50%,-50%)!important;z-index:3!important;flex:0 0 auto!important;width:auto!important;max-width:none!important;display:flex!important;align-items:center!important;justify-content:center!important;margin:0!important;pointer-events:auto!important;}';
	echo '.elementor-location-header .elementor-element-7f1bdc1{width:auto!important;max-width:none!important;flex:0 0 auto!important;align-self:center!important;margin:0!important;}';
	echo '.elementor-location-header .elementor-element-7f1bdc1 .elementor-widget-container,.elementor-location-header .elementor-element-7f1bdc1 .elementor-button-wrapper{display:flex!important;align-items:center!important;justify-content:center!important;width:auto!important;max-width:none!important;overflow:visible!important;}';
	echo '.elementor-location-header .elementor-element-7f1bdc1 .elementor-button{display:inline-flex!important;align-items:center!important;justify-content:center!important;white-space:nowrap!important;width:auto!important;min-width:0!important;max-width:none!important;overflow:visible!important;font-size:clamp(.8rem,1.6vmin,.98rem)!important;line-height:1.15!important;padding:.55rem 1.55rem!important;min-height:2.55rem!important;height:auto!important;text-align:center!important;}';
	echo '.elementor-location-header .elementor-element-7f1bdc1 .elementor-button-text{white-space:nowrap!important;display:inline!important;overflow:visible!important;}';
	echo '}';
	/* Register/Login → Google → Amazon — always far right, above CTA if paths cross */
	echo '.elementor-location-header [data-id="5c54566"],.elementor-location-header .elementor-element-5c54566{display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:stretch!important;flex:0 0 12rem!important;width:12rem!important;max-width:12rem!important;gap:.45rem!important;margin:0!important;padding:0!important;position:relative!important;z-index:5!important;}';
	echo '.elementor-location-header [data-id="1112277b"],.elementor-location-header .elementor-element-1112277b{width:100%!important;max-width:12rem!important;margin:0!important;padding:0!important;}';
	echo '.elementor-location-header [data-id="1112277b"] .elementor-nav-menu--main ul,.elementor-location-header .elementor-element-1112277b .elementor-nav-menu--main ul{display:flex!important;flex-direction:row!important;justify-content:space-evenly!important;align-items:center!important;width:100%!important;gap:0!important;margin:0!important;padding:0!important;}';
	echo '.elementor-location-header [data-id="1112277b"] .elementor-item,.elementor-location-header .elementor-element-1112277b .elementor-nav-menu .elementor-item{font-size:clamp(.85rem,2.1vmin,1rem)!important;line-height:1.2!important;padding:0!important;margin:0!important;}';
	echo '.elementor-location-header [data-id="69de726e"],.elementor-location-header [data-id="2ca99876"]{width:100%!important;max-width:12rem!important;margin:0!important;padding:0!important;align-self:stretch!important;--container-widget-width:100%!important;}';
	echo '.elementor-location-header [data-id="69de726e"] .elementor-button,.elementor-location-header [data-id="2ca99876"] .elementor-button{display:inline-flex!important;width:100%!important;box-sizing:border-box!important;justify-content:center!important;align-items:center!important;margin:0!important;padding:.12rem 0!important;min-height:1.5rem!important;height:1.5rem!important;}';
	echo '.elementor-location-header [data-id="69de726e"] .elementor-button-content-wrapper,.elementor-location-header [data-id="2ca99876"] .elementor-button-content-wrapper{display:inline-flex!important;justify-content:center!important;align-items:center!important;gap:.35rem!important;width:auto!important;}';
	echo '.elementor-location-header [data-id="69de726e"] .elementor-button-text,.elementor-location-header [data-id="2ca99876"] .elementor-button-text,.elementor-location-header [data-id="69de726e"] .elementor-button-icon,.elementor-location-header [data-id="2ca99876"] .elementor-button-icon{flex-grow:0!important;flex-basis:auto!important;}';
	echo '.elementor-location-header .elementor-element-693b4ea7>[data-id="1112277b"],.elementor-location-header .elementor-element-693b4ea7>.elementor-element-1112277b{align-self:flex-end!important;width:12rem!important;max-width:12rem!important;margin:0 0 .2rem!important;}';
	/* Mobile / Samsung ~980 */
	echo '@media(max-width:1100px),(hover:none) and (pointer:coarse){';
	echo '.elementor-location-header .elementor-element-00ec9fc,.elementor-location-header .elementor-element-7f1bdc1{display:none!important;}';
	echo '.elementor-location-header .elementor-element-6835e730{gap:0 .35rem!important;padding:.1rem .35rem .08rem!important;align-items:center!important;}';
	/* Brand owns the logo width so location starts to its right, not on top of it. */
	echo '.elementor-location-header .elementor-element-6e478726{flex:0 0 auto!important;width:auto!important;max-width:min(42vw,10.8rem)!important;min-width:7.2rem!important;}';
	echo '.elementor-location-header .elementor-element-68a38868 img{max-width:100%!important;max-height:clamp(4.2rem,22vw,5.5rem)!important;width:auto!important;height:auto!important;transform:none!important;}';
	echo '.elementor-location-header .elementor-element-1c0d63ad{margin:-.55rem 0 0!important;transform:none!important;max-width:100%!important;}';
	echo '.elementor-location-header .elementor-element-1c0d63ad img{max-height:clamp(1.55rem,8vw,2.15rem)!important;max-width:100%!important;}';
	echo '.elementor-location-header .elementor-element-1913a20{flex:1 1 auto!important;width:auto!important;max-width:none!important;min-width:0!important;transform:none!important;margin:0 0 0 .15rem!important;padding:0 .15rem 0 0!important;align-self:center!important;z-index:2!important;}';
	echo '.elementor-location-header #wrrapd-location,.elementor-location-header #location-text{white-space:normal!important;text-align:left!important;max-width:100%!important;}';
	echo '.elementor-location-header #wrrapd-location,.elementor-location-header #location-text,.elementor-location-header #location-text strong{font-family:Fraunces,Georgia,"Times New Roman",serif!important;font-weight:560!important;font-size:clamp(.72rem,3.1vw,.95rem)!important;line-height:1.2!important;}';
	echo '.elementor-location-header .elementor-element-693b4ea7{flex:0 0 auto!important;width:auto!important;max-width:9.4rem!important;min-width:0!important;}';
	echo '.elementor-location-header [data-id="5c54566"],.elementor-location-header .elementor-element-5c54566{flex:0 0 auto!important;width:auto!important;max-width:9.4rem!important;gap:.42rem!important;margin:0 0 0 auto!important;}';
	echo '.elementor-location-header [data-id="1112277b"],.elementor-location-header .elementor-element-1112277b{max-width:9.4rem!important;}';
	echo '.elementor-location-header [data-id="1112277b"] .elementor-item,.elementor-location-header .elementor-element-1112277b .elementor-nav-menu .elementor-item{font-size:clamp(.85rem,3.6vw,1.02rem)!important;}';
	echo '.elementor-location-header [data-id="69de726e"],.elementor-location-header [data-id="2ca99876"]{max-width:9.4rem!important;}';
	echo '.elementor-location-header [data-id="69de726e"] .elementor-button,.elementor-location-header [data-id="2ca99876"] .elementor-button{font-size:clamp(.72rem,3.1vw,.88rem)!important;padding:.28rem .42rem!important;min-height:1.65rem!important;height:auto!important;}';
	echo 'body.home:not(.logged-in) .elementor-location-header .elementor-element-68a38868.elementor-widget img,body.page-id-4857:not(.logged-in) .elementor-location-header .elementor-element-68a38868.elementor-widget img,body.logged-in .elementor-location-header .elementor-element-68a38868.elementor-widget img{max-width:100%!important;max-height:clamp(4.2rem,22vw,5.5rem)!important;width:auto!important;height:auto!important;}';
	echo '}';
	echo '@media(max-width:393px){';
	echo 'body.logged-in .elementor-location-header .elementor-element-68a38868 img{max-height:3.6rem!important;height:auto!important;}';
	echo '}';
	echo '</style>';
}
add_action( 'wp_head', 'wrrapd_output_header_layout_css', 9997 );

/**
 * Occasion ticker + Hide dates — homepage and logged-in /welcome/.
 * Welcome still has the old Elementor ticker (no hide button); upgrade it in place.
 */
function wrrapd_output_occasion_ticker_ensure() {
	if ( is_admin() ) {
		return;
	}
	// Hire / onboarding hosts (apply / pros) — never inject shopper occasion ticker.
	if ( function_exists( 'wrrapd_is_hire_portal_host' ) && wrrapd_is_hire_portal_host() ) {
		return;
	}
	$on_home    = is_front_page() || is_home();
	$on_welcome = is_page( array( 5576, 'welcome' ) );
	if ( ! $on_home && ! $on_welcome ) {
		return;
	}
	echo '<style id="wrrapd-occasion-ticker-ensure-css">';
	echo 'body.logged-in .occasion-ticker-shell,body.page-id-5576 .occasion-ticker-shell,body.home .occasion-ticker-shell,body.page-id-4857 .occasion-ticker-shell{display:block!important;visibility:visible!important;height:auto!important;max-height:none!important;overflow:visible!important;margin:0!important;}';
	echo 'body.logged-in .occasion-ticker-shell.is-collapsed .occasion-ticker-panel,body.page-id-5576 .occasion-ticker-shell.is-collapsed .occasion-ticker-panel{display:none!important;}';
	echo 'body.page-id-5576 .ticker-message{display:none!important;}';
	echo '.occasion-ticker-bar{display:flex!important;align-items:center!important;justify-content:space-between!important;}';
	echo '.occasion-ticker-toggle{display:inline-flex!important;visibility:visible!important;}';
	echo '</style>';
	$js = <<<'JS'
(function(){
	var STORAGE='wrrapd-occasion-ticker-collapsed';
	var MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
	function sod(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
	function fmt(d){return d.getDate()+'-'+MONTHS[d.getMonth()]+'-'+String(d.getFullYear()).slice(-2);}
	var today=sod(new Date());
	function nthWeekday(year,month0,weekday,n){var c=0;for(var day=1;day<=31;day++){var dt=new Date(year,month0,day);if(dt.getMonth()!==month0)break;if(dt.getDay()===weekday){c++;if(c===n)return sod(dt);}}return null;}
	function easter(y){var a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;return sod(new Date(y,month-1,day));}
	function nextFixed(month0,day){return function(){for(var i=0;i<=30;i++){var d=sod(new Date(today.getFullYear()+i,month0,day));if(d>=today)return d;}};}
	function nextFromFn(fn){return function(){for(var i=0;i<=30;i++){var d=fn(today.getFullYear()+i);if(d&&d>=today)return d;}};}
	var CNY={2026:[1,17],2027:[1,6],2028:[0,26],2029:[1,13],2030:[1,3],2031:[0,23],2032:[1,11],2033:[0,31],2034:[1,19],2035:[1,8]};
	var HAN={2026:[11,4],2027:[11,23],2028:[11,12],2029:[11,2],2030:[11,20],2031:[11,9],2032:[11,27],2033:[11,16],2034:[11,5],2035:[11,23]};
	function mapYear(tbl){return function(y){var p=tbl[y];return p?sod(new Date(y,p[0],p[1])):null;};}
	var defs=[
		{name:'Chinese New Year',emoji:'🏮',url:'https://www.amazon.com/s?k=chinese+new+year+gift+ideas',next:nextFromFn(mapYear(CNY))},
		{name:"Valentine's Day",emoji:'💖',url:"https://www.amazon.com/s?k=valentine%27s+day+gifts",next:nextFixed(1,14)},
		{name:"St. Patrick's Day",emoji:'🎉',url:"https://www.amazon.com/s?k=st.+patrick%27s+day",next:nextFixed(2,17)},
		{name:'Easter',emoji:'🐣',url:'https://www.amazon.com/s?k=easter',next:nextFromFn(easter)},
		{name:"Mother's Day",emoji:'🌸',url:"https://www.amazon.com/s?k=birthday+for+mother%27s+day+gift+ideas",next:nextFromFn(function(y){return nthWeekday(y,4,0,2);})},
		{name:'Graduation',emoji:'🎓',url:'https://www.amazon.com/s?k=graduation+gift+ideas',next:null},
		{name:"Father's Day",emoji:'🎩',url:"https://www.amazon.com/s?k=birthday+for+father%27s+day+gift+ideas",next:nextFromFn(function(y){return nthWeekday(y,5,0,3);})},
		{name:'Fourth of July',emoji:'🇺🇸',url:'https://www.amazon.com/s?k=fourth+of+july+gifts',next:nextFixed(6,4)},
		{name:'Bridal Shower',emoji:'👰',url:'https://www.amazon.com/s?k=bridal+shower+gifts',next:null},
		{name:'Wedding',emoji:'💍',url:'https://www.amazon.com/s?k=wedding+gifts',next:null},
		{name:'Baby Shower',emoji:'🍼',url:'https://www.amazon.com/s?k=baby+shower+gifts',next:null},
		{name:"Kids' Birthday",emoji:'🎈',url:'https://www.amazon.com/s?k=birthday+for+kids+gift+ideas',next:null},
		{name:'Thanksgiving',emoji:'🦃',url:'https://www.amazon.com/s?k=thanksgiving+day+gifts',next:nextFromFn(function(y){return nthWeekday(y,10,4,4);})},
		{name:'Corporate Gifts',emoji:'🏢',url:'https://www.amazon.com/s?k=corporate+gift+ideas',next:null},
		{name:'Hanukkah',emoji:'🕎',url:'https://www.amazon.com/s?k=hannukah+gift+ideas',next:nextFromFn(mapYear(HAN))},
		{name:'Christmas',emoji:'🎄',url:'https://www.amazon.com/s?k=christmas+gift+ideas',next:nextFixed(11,25)},
		{name:"New Year's",emoji:'🎆',url:"https://www.amazon.com/s?k=new+year%27s+gift+ideas",next:nextFixed(0,1)}
	];
	function fill(el){if(!el||el.getAttribute('data-wrrapd-filled')||el.children.length)return;var html='';defs.forEach(function(occ){var dt=occ.next?occ.next():null;var dateStr=dt?fmt(dt):'';html+='<a href="'+occ.url+'" target="_blank" rel="noopener noreferrer">'+occ.emoji+' '+occ.name+'<br><span class="date '+(dateStr?'':'hide-date')+'">'+dateStr+'</span></a>';});el.innerHTML=html+html;el.setAttribute('data-wrrapd-filled','1');}
	function setCollapsed(shell,toggle,collapsed){if(!shell||!toggle)return;shell.classList.toggle('is-collapsed',collapsed);toggle.setAttribute('aria-expanded',collapsed?'false':'true');toggle.textContent=collapsed?'Show dates':'Hide dates';}
	function wire(shell){if(!shell||shell.getAttribute('data-wrrapd-ticker-wired'))return;var toggle=shell.querySelector('.occasion-ticker-toggle')||document.getElementById('occasionTickerToggle');if(!toggle)return;shell.setAttribute('data-wrrapd-ticker-wired','1');setCollapsed(shell,toggle,localStorage.getItem(STORAGE)==='1');toggle.addEventListener('click',function(){var collapsed=!shell.classList.contains('is-collapsed');setCollapsed(shell,toggle,collapsed);try{localStorage.setItem(STORAGE,collapsed?'1':'0');}catch(e){}});}
	function buildShell(){var shell=document.createElement('div');shell.className='occasion-ticker-shell';shell.id='occasionTickerShell';shell.innerHTML='<div class="occasion-ticker-bar"><span>Next gifting occasion...</span><button type="button" class="occasion-ticker-toggle" id="occasionTickerToggle" aria-expanded="true" aria-controls="occasionTickerPanel">Hide dates</button></div><div class="occasion-ticker-panel" id="occasionTickerPanel"><div class="ticker-container occasion-ticker" id="occasionTickerContainerLive"><div class="ticker-wrap"><div class="ticker" id="occasionTickerLive"></div></div></div></div>';return shell;}
	function reveal(el){if(!el)return;el.classList.remove('elementor-hidden','elementor-hidden-desktop','elementor-hidden-tablet','elementor-hidden-mobile');el.style.setProperty('display','block','important');el.style.setProperty('visibility','visible','important');el.style.setProperty('height','auto','important');}
	function place(){var shell=document.getElementById('occasionTickerShell');var old=document.getElementById('occasionTickerContainer');var msg=document.querySelector('.ticker-message');if(msg)msg.style.display='none';var built=false;if(!shell){built=true;shell=buildShell();if(old&&old.parentNode){old.style.display='none';old.parentNode.insertBefore(shell,old);}else{var wheels=document.getElementById('wrrapd-retailer-wheels-row');var hub=document.getElementById('wrrapd-welcome-hub');var header=document.querySelector('.elementor-location-header');if(wheels&&wheels.parentNode)wheels.insertAdjacentElement('afterend',shell);else if(hub&&hub.parentNode)hub.parentNode.insertBefore(shell,hub);else if(header&&header.parentNode)header.insertAdjacentElement('afterend',shell);else document.body.insertBefore(shell,document.body.firstChild);}}reveal(shell);reveal(shell.parentElement);['.elementor-element-1ffb475','.elementor-element-0a7e92b','.elementor-element-1ab723a','.elementor-element-cb1c231'].forEach(function(sel){reveal(document.querySelector(sel));});var bar=shell.querySelector('.occasion-ticker-bar span');if(bar&&/Gifting occasions/i.test(bar.textContent||''))bar.textContent='Next gifting occasion...';var ticker=shell.querySelector('#occasionTickerLive')||shell.querySelector('#occasionTicker')||shell.querySelector('.ticker');fill(ticker);if(built)wire(shell);else{var toggle=shell.querySelector('.occasion-ticker-toggle');if(toggle)toggle.style.display='inline-flex';}var wrap=shell.querySelector('.ticker-wrap');if(wrap&&!wrap.getAttribute('data-wrrapd-pause')){wrap.setAttribute('data-wrrapd-pause','1');wrap.addEventListener('mouseenter',function(){wrap.style.animationPlayState='paused';});wrap.addEventListener('mouseleave',function(){wrap.style.animationPlayState='running';});}}
	document.addEventListener('DOMContentLoaded',place);window.addEventListener('load',function(){place();setTimeout(place,400);setTimeout(place,1400);});
})();
JS;
	echo '<script id="wrrapd-occasion-ticker-ensure">' . $js . '</script>';
}
add_action( 'wp_footer', 'wrrapd_output_occasion_ticker_ensure', 22 );

/**
 * Keep Chrome CTA copy aligned when Elementor HTML still has the old sentence.
 */
function wrrapd_output_chrome_cta_copy_patch_script() {
	if ( is_admin() ) {
		return;
	}
	echo '<script id="wrrapd-chrome-cta-copy-patch">';
	echo '(function(){var want="Gift-wrap with your FREE Chrome extension today";function setText(el){if(!el)return;if(el.classList&&el.classList.contains("elementor-button")&&el.querySelector(".elementor-button-text")){el.querySelector(".elementor-button-text").textContent=want;return;}el.textContent=want;}function patch(){document.querySelectorAll(".elementor-element-eb0b235 .elementor-button-text,.elementor-element-eb0b235 .elementor-button,.wrrapd-footer__cta a").forEach(function(el){var t=(el.textContent||"").replace(/\\s+/g," ").trim();if(/Add your FREE Chrome extension today/i.test(t)||/^Add the free Chrome extension!?$/i.test(t))setText(el);});}document.addEventListener("DOMContentLoaded",patch);window.addEventListener("load",patch);})();';
	echo '</script>';
}
add_action( 'wp_footer', 'wrrapd_output_chrome_cta_copy_patch_script', 23 );

/**
 * Stamp header chrome (Register/Login widget-container, nav wrappers) with the
 * live header background so leftover Elementor #0f0351 cannot persist.
 */
function wrrapd_output_header_chrome_paint_script() {
	if ( is_admin() ) {
		return;
	}
	echo '<script id="wrrapd-header-chrome-paint">';
	echo '(function(){function paint(){var header=document.querySelector(".elementor-location-header");if(!header)return;var navy=getComputedStyle(header).backgroundColor;if(!navy||navy==="transparent"||navy==="rgba(0, 0, 0, 0)")return;var skip="[data-id=\\"69de726e\\"],.elementor-element-69de726e,[data-id=\\"2ca99876\\"],.elementor-element-2ca99876,.elementor-element-7f1bdc1,.elementor-element-00ec9fc,.gift-ideas-button,.wrrapd-careers,.wrrapd-careers__btn,.wrrapd-careers__menu";header.querySelectorAll(".elementor-widget-container,.elementor-nav-menu--main,.elementor-nav-menu li,.elementor-nav-menu .elementor-item").forEach(function(el){if(el.closest(skip))return;el.style.setProperty("background",navy,"important");el.style.setProperty("background-color",navy,"important");el.style.setProperty("background-image","none","important");});}document.addEventListener("DOMContentLoaded",paint);window.addEventListener("load",paint);setTimeout(paint,300);setTimeout(paint,1200);})();';
	echo '</script>';
}
add_action( 'wp_footer', 'wrrapd_output_header_chrome_paint_script', 24 );

/**
 * Desktop: reparent Chrome CTA onto the header row for true page centering.
 * Always: Register/Login above Google/Amazon in the right stack.
 */
function wrrapd_output_header_auth_stack_script() {
	if ( is_admin() ) {
		return;
	}
	echo '<script id="wrrapd-header-auth-stack">';
	echo '(function(){function place(){var header=document.querySelector(".elementor-location-header");if(!header)return;var main=header.querySelector(".elementor-element-6835e730")||header.querySelector(\'[data-id="6835e730"]\');var auth=header.querySelector(".elementor-element-693b4ea7")||header.querySelector(\'[data-id="693b4ea7"]\');var row=header.querySelector(".elementor-element-2b05a213")||header.querySelector(\'[data-id="2b05a213"]\');var cta=header.querySelector(".elementor-element-00ec9fc")||header.querySelector(\'[data-id="00ec9fc"]\');var stack=header.querySelector(\'[data-id="5c54566"]\')||header.querySelector(".elementor-element-5c54566");var desk=window.matchMedia("(min-width:1101px)").matches;if(cta&&main){if(desk){if(cta.parentElement!==main)main.appendChild(cta);}else if(row&&cta.parentElement!==row){row.insertBefore(cta,row.firstChild);}}if(stack&&auth){if(row&&stack.parentElement!==row)row.appendChild(stack);else if(!row&&stack.parentElement!==auth)auth.appendChild(stack);}if(document.body.classList.contains("logged-in"))return;var nav=header.querySelector(\'[data-id="1112277b"]\');if(nav&&stack&&nav.parentElement!==stack)stack.insertBefore(nav,stack.firstChild);}document.addEventListener("DOMContentLoaded",place);window.addEventListener("load",place);window.addEventListener("resize",place);})();';
	echo '</script>';
}
add_action( 'wp_footer', 'wrrapd_output_header_auth_stack_script', 21 );

/**
 * Career portal entry URLs for the header Careers menu.
 *
 * @return list<array{label:string,url:string}>
 */
function wrrapd_header_careers_links() {
	$wrapstar  = function_exists( 'wrrapd_wrapstars_apply_url' ) ? wrrapd_wrapstars_apply_url( '/' ) : 'https://apply.wrrapd.com/';
	$joyrider  = function_exists( 'wrrapd_drivers_apply_url' ) ? wrrapd_drivers_apply_url( '/drive/' ) : 'https://apply.wrrapd.com/drive/';
	$wraprider = function_exists( 'wrrapd_wrapriders_apply_url' ) ? wrrapd_wrapriders_apply_url( '/wraprider/' ) : 'https://apply.wrrapd.com/wraprider/';
	return array(
		array(
			'label' => __( 'WrapStar (Gift-Wrapper)', 'wrrapd' ),
			'url'   => $wrapstar,
			'icon'  => 'GiftWrap_001-32.png',
		),
		array(
			'label' => __( 'JoyRider (Delivery-Driver)', 'wrrapd' ),
			'url'   => $joyrider,
			'icon'  => 'DeliveryIcon_001-32-gold.png',
		),
		array(
			'label' => __( 'WrapRider (Hybrid)', 'wrrapd' ),
			'url'   => $wraprider,
			'icon'  => 'HybridRole_001-32.png',
		),
	);
}

/**
 * Careers control under Sign in with Amazon — hover (and tap) opens the three hire tracks.
 */
function wrrapd_output_header_careers_menu() {
	if ( is_admin() ) {
		return;
	}
	if ( function_exists( 'wrrapd_site_footer_is_suppressed' ) && wrrapd_site_footer_is_suppressed() ) {
		return;
	}

	$links = wrrapd_header_careers_links();
	echo '<style id="wrrapd-header-careers-css">';
	echo '.wrrapd-careers{position:relative;width:100%;max-width:12rem;margin:.35rem 0 0;z-index:6;}';
	echo '.wrrapd-careers__btn{display:inline-flex;align-items:center;justify-content:center;width:100%;box-sizing:border-box;min-height:1.7rem;padding:.28rem .55rem;border:1px solid ' . WRRAPD_LOGO_GOLD . ';border-radius:.4rem;background:' . WRRAPD_LOGO_GOLD . ';color:#0f0351;font-family:Fraunces,Georgia,serif;font-weight:700;font-size:.86rem;line-height:1.15;letter-spacing:.02em;cursor:pointer;text-decoration:none;}';
	echo '.wrrapd-careers__btn:hover,.wrrapd-careers__btn:focus-visible,.wrrapd-careers.is-open .wrrapd-careers__btn{background:linear-gradient(180deg,#e85d04,#d14900);color:#fff;border-color:#d14900;}';
	echo '.wrrapd-careers__menu{display:none;position:absolute;top:calc(100% + .28rem);right:0;left:auto;width:max-content;min-width:0;margin:0;padding:.35rem 0;list-style:none;background:#0f0351;border:1px solid rgba(255,255,255,.22);border-radius:.45rem;box-shadow:0 .55rem 1.25rem rgba(0,0,0,.35);z-index:20;}';
	echo '.wrrapd-careers:hover .wrrapd-careers__menu,.wrrapd-careers:focus-within .wrrapd-careers__menu,.wrrapd-careers.is-open .wrrapd-careers__menu{display:block;}';
	echo '.wrrapd-careers__menu a{display:flex;align-items:center;gap:.48rem;padding:.42rem .65rem;color:#fff;font-family:Fraunces,Georgia,serif;font-size:.78rem;font-weight:600;line-height:1.25;text-decoration:none;white-space:nowrap;width:auto;}';
	echo '.wrrapd-careers__icon{display:block;width:1.15rem;height:1.15rem;object-fit:contain;flex:0 0 1.15rem;}';
	echo '.wrrapd-careers__menu a:hover,.wrrapd-careers__menu a:focus-visible{background:rgba(246,185,51,.22);color:' . WRRAPD_LOGO_GOLD . ';}';
	echo '@media(max-width:1100px),(hover:none) and (pointer:coarse){';
	echo '.wrrapd-careers{max-width:9.4rem;margin-top:.28rem;}';
	echo '.wrrapd-careers__btn{font-size:clamp(.72rem,3.1vw,.86rem);min-height:1.65rem;padding:.28rem .42rem;}';
	echo '.wrrapd-careers__menu{left:auto;right:0;width:max-content;min-width:0;}';
	echo '.wrrapd-careers__menu a{white-space:normal;}';
	echo '}';
	echo '</style>';

	echo '<div id="wrrapd-careers-mount" hidden>';
	echo '<div class="wrrapd-careers" data-wrrapd-careers>';
	echo '<button type="button" class="wrrapd-careers__btn" aria-haspopup="true" aria-expanded="false">' . esc_html__( 'Careers', 'wrrapd' ) . '</button>';
	echo '<ul class="wrrapd-careers__menu" role="menu">';
	foreach ( $links as $link ) {
		$icon = ! empty( $link['icon'] ) ? wrrapd_mu_icon_src( (string) $link['icon'] ) : '';
		echo '<li role="none"><a role="menuitem" href="' . esc_url( (string) $link['url'] ) . '" target="_blank" rel="noopener">';
		if ( $icon !== '' ) {
			echo '<img class="wrrapd-careers__icon" src="' . esc_url( $icon ) . '" width="18" height="18" alt="" decoding="async" />';
		}
		echo '<span>' . esc_html( (string) $link['label'] ) . '</span></a></li>';
	}
	echo '</ul></div></div>';

	echo '<script id="wrrapd-header-careers-js">';
	echo '(function(){function place(){var mount=document.getElementById("wrrapd-careers-mount");if(!mount)return;var node=mount.querySelector("[data-wrrapd-careers]");if(!node)return;var header=document.querySelector(".elementor-location-header");if(!header)return;if(header.contains(node))return;var stack=header.querySelector(\'[data-id="5c54566"]\')||header.querySelector(".elementor-element-5c54566");var amazon=header.querySelector(\'[data-id="2ca99876"]\')||header.querySelector(".elementor-element-2ca99876");var auth=header.querySelector(".elementor-element-693b4ea7")||header.querySelector(\'[data-id="693b4ea7"]\');var host=stack||auth;if(!host)return;if(amazon&&amazon.parentElement===host){if(amazon.nextSibling)host.insertBefore(node,amazon.nextSibling);else host.appendChild(node);}else{host.appendChild(node);}mount.remove();}function wire(){var el=document.querySelector("[data-wrrapd-careers]");if(!el||el.getAttribute("data-wired"))return;el.setAttribute("data-wired","1");var btn=el.querySelector(".wrrapd-careers__btn");if(!btn)return;btn.addEventListener("click",function(e){e.preventDefault();var open=!el.classList.contains("is-open");el.classList.toggle("is-open",open);btn.setAttribute("aria-expanded",open?"true":"false");});document.addEventListener("click",function(e){if(!el.contains(e.target)){el.classList.remove("is-open");btn.setAttribute("aria-expanded","false");}});document.addEventListener("keydown",function(e){if(e.key==="Escape"){el.classList.remove("is-open");btn.setAttribute("aria-expanded","false");}});}function run(){place();wire();}document.addEventListener("DOMContentLoaded",run);window.addEventListener("load",run);window.addEventListener("resize",place);setTimeout(run,400);})();';
	echo '</script>';
}
add_action( 'wp_footer', 'wrrapd_output_header_careers_menu', 22 );

/**
 * Kill horizontal page squeeze on phones (Chrome shrink-to-fit from nowrap CTAs / tickers).
 */
function wrrapd_output_mobile_fullwidth_css() {
	if ( is_admin() ) {
		return;
	}
	echo '<style id="wrrapd-mobile-fullwidth-css">';
	echo 'html,body{width:100%!important;max-width:100%!important;overflow-x:clip!important;margin:0!important;padding:0!important;}';
	echo '.elementor,.elementor-4857,.elementor-location-header,.wrrapd-footer,#page,#content,.site,.site-content{width:100%!important;max-width:100%!important;overflow-x:clip!important;box-sizing:border-box!important;}';
	/* ONLY the outer header row — never every .e-con (that forces brand full-width and centers the logo). */
	echo '.elementor-location-header .elementor-element-6835e730{width:100%!important;max-width:100%!important;box-sizing:border-box!important;}';
	echo '.occasion-ticker-shell,.occasion-ticker-panel,.ticker-container,.occasion-ticker{max-width:100%!important;overflow-x:clip!important;box-sizing:border-box!important;}';
	echo '.ticker-wrap,.ticker{max-width:none!important;}';
	echo '.wrrapd-hot-gifts-rail,.wrrapd-hot-gifts-rail--below-ticker{max-width:100%!important;overflow-x:clip!important;box-sizing:border-box!important;}';
	echo 'a.wrrapd-ext-cta{max-width:100%!important;box-sizing:border-box!important;white-space:normal!important;}';
	echo '.wrrapd-gift-guides__lede .wrrapd-ext-cta{display:inline!important;white-space:normal!important;max-width:100%!important;padding:0!important;border:none!important;border-radius:0!important;background:none!important;box-shadow:none!important;color:#0b1780!important;animation:none!important;}';
	echo '@media(max-width:1024px),(hover:none) and (pointer:coarse){';
	echo 'body,body.home,body.page-id-4857{width:100%!important;max-width:100%!important;overflow-x:clip!important;}';
	echo '.elementor-4857 .elementor-element-d0991cd,.elementor-4857 .elementor-element-d0991cd .elementor-widget-container,.elementor-4857 .elementor-element-d0991cd p{max-width:100%!important;width:100%!important;white-space:normal!important;box-sizing:border-box!important;}';
	echo '.wrrapd-gift-guides,.wrrapd-gift-guides__lede{max-width:100%!important;overflow-x:clip!important;box-sizing:border-box!important;}';
	echo '.wrrapd-hot-gifts-rail__grid{display:flex!important;flex-wrap:wrap!important;overflow:visible!important;justify-content:center!important;gap:.28rem!important;padding:0 .35rem .1rem!important;}';
	echo '.wrrapd-hot-gifts-rail__card,.wrrapd-hot-gifts-rail__card--product{flex:0 0 calc((100% - 1.12rem)/5)!important;width:calc((100% - 1.12rem)/5)!important;min-width:0!important;max-width:calc((100% - 1.12rem)/5)!important;}';
	echo '.wrrapd-hot-gifts-rail__card--product .wrrapd-hot-gifts-rail__card-title{display:none!important;}';
	echo '.wrrapd-hot-gifts-rail__card:not(.wrrapd-hot-gifts-rail__card--product) .wrrapd-hot-gifts-rail__card-copy,.wrrapd-hot-gifts-rail__card:not(.wrrapd-hot-gifts-rail__card--product) .wrrapd-hot-gifts-rail__card-cta{display:none!important;}';
	echo '.wrrapd-hot-gifts-rail__shop-at,.wrrapd-hot-gifts-rail__occasion{font-size:.45rem!important;line-height:1.1!important;}';
	echo '}';
	echo '</style>';
}
add_action( 'wp_head', 'wrrapd_output_mobile_fullwidth_css', 9999 );


/**
 * Force homepage hero image + copy side-by-side (Samsung ~980px + phones).
 */
function wrrapd_output_hero_mobile_layout_script() {
	if ( is_admin() || ( ! is_front_page() && ! is_home() ) ) {
		return;
	}
	if ( function_exists( 'wrrapd_is_hire_portal_host' ) && wrrapd_is_hire_portal_host() ) {
		return;
	}
	echo '<script id="wrrapd-hero-mobile-layout">';
	echo '(function(){function matchHeights(imgCol,copyCol){if(!imgCol||!copyCol)return;var h=copyCol.getBoundingClientRect().height;if(h>0){imgCol.style.minHeight=h+"px";var img=imgCol.querySelector("img");if(img){img.style.height="100%";img.style.minHeight=h+"px";}}}function needLayout(){return window.matchMedia("(max-width:1100px), (hover: none) and (pointer: coarse)").matches;}function run(){var sec=document.querySelector(".elementor-element-df1501e");if(sec){var cont=sec.querySelector(".elementor-container");if(cont){cont.classList.add("wrrapd-hero-row-mobile");var imgCol=sec.querySelector(".elementor-element-efd024d");var copyCol=sec.querySelector(".elementor-element-2d48b08");if(imgCol)imgCol.classList.add("wrrapd-hero-photo-col");if(copyCol)copyCol.classList.add("wrrapd-hero-copy-col");if(needLayout())matchHeights(imgCol,copyCol);return;}}if(!needLayout())return;var row=document.querySelector(".elementor-element-f68c5e7");if(!row)return;var imgCol=null,copyCol=null;row.querySelectorAll(":scope > .e-con").forEach(function(c){if(c.querySelector(".elementor-widget-image"))imgCol=c;if(c.querySelector(".elementor-element-6466f5b"))copyCol=c;});if(!imgCol||!copyCol)return;row.classList.add("wrrapd-hero-row-mobile");imgCol.classList.add("wrrapd-hero-photo-col");copyCol.classList.add("wrrapd-hero-copy-col");matchHeights(imgCol,copyCol);}document.addEventListener("DOMContentLoaded",run);window.addEventListener("load",function(){run();setTimeout(run,500);setTimeout(run,1500);});window.addEventListener("resize",function(){setTimeout(run,100);});})();';
	echo '</script>';
}

add_action( 'wp_footer', 'wrrapd_output_hero_mobile_layout_script', 24 );

/**
 * Tidio chat — smaller icon-only bubble on phones (plugin: tidio.co).
 */
function wrrapd_output_tidio_mobile_compact_script() {
	if ( is_admin() ) {
		return;
	}
	echo '<script id="wrrapd-tidio-mobile-compact">';
	echo '(function(){function hideLabel(){var root=document.getElementById("tidio-chat");if(!root||!root.shadowRoot)return false;if(!root.shadowRoot.getElementById("wrrapd-tidio-mobile-shadow")){var st=document.createElement("style");st.id="wrrapd-tidio-mobile-shadow";st.textContent="button.widgetLabel{display:none !important;visibility:hidden !important;} #new-message{display:none !important;}";root.shadowRoot.appendChild(st);}return true;}function compact(){if(!window.matchMedia("(max-width:960px)").matches)return;var root=document.getElementById("tidio-chat");if(root){root.style.transform="scale(0.48)";root.style.transformOrigin="bottom right";}hideLabel();if(window.tidioChatApi&&typeof window.tidioChatApi.setButtonSize==="function"){try{window.tidioChatApi.setButtonSize("small");}catch(e){}}}function onReady(){compact();if(window.tidioChatApi){window.tidioChatApi.on("close",compact);}}document.addEventListener("tidioChat-ready",onReady);if(window.tidioChatApi)onReady();else{var n=0;var t=setInterval(function(){compact();if((window.tidioChatApi&&document.getElementById("tidio-chat"))||++n>60){clearInterval(t);onReady();}},500);}})();';
	echo '</script>';
}

add_action( 'wp_footer', 'wrrapd_output_tidio_mobile_compact_script', 26 );

/**
 * Home page: move Elementor gift-guides HTML widget below the hero (after Jacksonville + red divider).
 * Also removes the duplicate partner-logo strip inside the gift-guides block (header wheel is canonical).
 */
function wrrapd_output_home_gift_guides_reposition_script() {
	static $printed = false;
	if ( $printed ) {
		return;
	}
	if ( is_admin() || is_paged() ) {
		return;
	}
	if ( function_exists( 'wrrapd_is_hire_portal_host' ) && wrrapd_is_hire_portal_host() ) {
		return;
	}
	if ( ! is_front_page() && ! is_home() ) {
		return;
	}
	$printed = true;
	echo '<style id="wrrapd-gift-guides-hide-dup-strip">.wrrapd-gift-guides__stores-wrap{display:none!important}</style>';
	echo '<script id="wrrapd-gift-guides-reposition-js">';
	echo 'function wrrapdRemoveDupGiftGuideLogos(){var dup=document.querySelector(".wrrapd-gift-guides__stores-wrap");if(dup)dup.remove();}';
	echo 'function wrrapdFindGiftGuidesAnchor(){';
	echo 'var red=document.querySelector(".elementor-element-5601b5d");';
	echo 'if(red)return{mode:"after",el:red};';
	echo 'var gift=document.getElementById("giftWrapRow");';
	echo 'if(gift){var gw=gift.closest(".elementor-element");if(gw&&gw.parentNode)return{mode:"before",el:gw};}';
	echo 'var heads=document.querySelectorAll("h1,h2,h3,h4,.elementor-heading-title");';
	echo 'for(var h=0;h<heads.length;h++){var tx=(heads[h].textContent||"").trim();';
	echo 'if(/^how\\s+it\\s+works/i.test(tx)){var hw=heads[h].closest(".elementor-element");';
	echo 'if(hw&&hw.parentNode)return{mode:"before",el:hw};break;}}';
	echo 'var jack=document.querySelector(".elementor-element-de3f6bb");';
	echo 'if(!jack){var nodes=document.querySelectorAll("p,.elementor-widget-text-editor");';
	echo 'for(var i=0;i<nodes.length;i++){var t=(nodes[i].textContent||"");';
	echo 'if(/Jacksonville,\\s*Florida/i.test(t)&&/new cities being added soon/i.test(t)){';
	echo 'jack=nodes[i].closest(".elementor-element");break;}}}';
	echo 'if(!jack)return null;';
	echo 'var walk=jack;';
	echo 'for(var j=0;j<16;j++){walk=walk.nextElementSibling;if(!walk)break;';
	echo 'if(walk.classList&&(walk.classList.contains("elementor-widget-divider")||walk.classList.contains("elementor-widget-divider-separator")))return{mode:"after",el:walk};';
	echo 'if(walk.querySelector&&walk.querySelector(".elementor-divider,.elementor-widget-divider,.elementor-widget-divider-separator,hr"))return{mode:"after",el:walk};}';
	echo 'return{mode:"after",el:jack};}';
	echo 'function wrrapdInsertGiftGuides(move,anchor){';
	echo 'if(!anchor||!anchor.el||!anchor.el.parentNode)return;';
	echo 'if(anchor.mode==="before"){anchor.el.parentNode.insertBefore(move,anchor.el);return;}';
	echo 'anchor.el.insertAdjacentElement("afterend",move);}';
	echo 'function wrrapdGiftGuidesAlreadyPlaced(move,anchor){';
	echo 'if(!anchor||!anchor.el)return true;';
	echo 'if(anchor.mode==="before")return move.nextElementSibling===anchor.el;';
	echo 'return move.previousElementSibling===anchor.el;}';
	echo 'function wrrapdPatchGiftGuidesEyebrow(){var el=document.querySelector(".wrrapd-gift-guides__eyebrow");if(el)el.textContent="SEAMLESS GIFT-WRAPPING & DELIVERY OPTIONS FOR:";}';
	echo 'function wrrapdRepositionGiftGuides(){';
	echo 'wrrapdRemoveDupGiftGuideLogos();wrrapdPatchGiftGuidesEyebrow();';
	echo 'var guides=document.querySelector(".wrrapd-gift-guides");';
	echo 'if(!guides)return;';
	echo 'var widget=guides.closest(".elementor-element");';
	echo 'var move=widget||guides;';
	echo 'var anchor=wrrapdFindGiftGuidesAnchor();';
	echo 'if(!anchor||!anchor.el)return;';
	echo 'if(move===anchor.el||move.contains(anchor.el)||anchor.el.contains(move))return;';
	echo 'if(wrrapdGiftGuidesAlreadyPlaced(move,anchor))return;';
	echo 'wrrapdInsertGiftGuides(move,anchor);}';
	echo 'document.addEventListener("DOMContentLoaded",wrrapdRepositionGiftGuides);';
	echo 'window.addEventListener("load",function(){wrrapdRepositionGiftGuides();setTimeout(wrrapdRepositionGiftGuides,150);setTimeout(wrrapdRepositionGiftGuides,600);});';
	echo '</script>';
}

add_action( 'wp_footer', 'wrrapd_output_home_gift_guides_reposition_script', 20 );

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
 * Hide the extension CTA only for signed-in users who already have Wrrapd orders.
 * Orange blink animation lives in Customizer Additional CSS (wrrapd-cta-blink) — do not override here.
 */
function wrrapd_inject_header_cta_rules() {
	if ( is_admin() ) {
		return;
	}
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
 * The WrapStars and Drivers portals are separate hosts that render their own footers.
 *
 * @return bool
 */
function wrrapd_site_footer_is_suppressed() {
	if ( is_admin() ) {
		return true;
	}
	if ( function_exists( 'wrrapd_wrapstars_is_portal_host' ) && wrrapd_wrapstars_is_portal_host() ) {
		return true;
	}
	if ( function_exists( 'wrrapd_drivers_is_portal_host' ) && wrrapd_drivers_is_portal_host() ) {
		return true;
	}
	return false;
}

/**
 * Hello Elementor 404 dumps "Hello, User!" plus leftover homepage widgets.
 * Keep the real header/footer; replace the middle with a branded lost-page.
 */
function wrrapd_output_not_found_css() {
	if ( is_admin() || ! is_404() ) {
		return;
	}
	$path = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_parse_url( (string) $_SERVER['REQUEST_URI'], PHP_URL_PATH ) : '';
	if ( preg_match( '#^/(wraprider|drive|apply|onboarding|driver-onboarding|wraprider-onboarding|thank-you|wrapstar-login|driver)(/|$)#', $path ) ) {
		return;
	}
	echo '<style id="wrrapd-lost-page-css">';
	echo 'body.error404 #content,body.error404 #primary,body.error404 .site-main,body.error404 main.site-main,body.error404 .page-header,body.error404 .page-content,body.error404 .entry-header,body.error404 .entry-content,body.error404 .elementor-location-single,body.error404 .elementor-location-archive,body.error404 .elementor-4857,body.error404 #wrrapd-seasonal-campaign-root,body.error404 .wrrapd-hot-gifts-rail,body.error404 .wrrapd-season-hero{display:none!important;}';
	echo '.wrrapd-lost{background:linear-gradient(180deg,#faf8f4 0%,#fff 70%);padding:clamp(2.2rem,5vw,4.2rem) 1.25rem clamp(2.8rem,6vw,4.8rem);text-align:center;}';
	echo '.wrrapd-lost__inner{max-width:36rem;margin:0 auto;}';
	echo '.wrrapd-lost__stage{position:relative;width:8.5rem;height:7.6rem;margin:0 auto 1.35rem;}';
	echo '.wrrapd-lost__box{position:absolute;left:50%;bottom:0;width:5.6rem;height:4.1rem;margin-left:-2.8rem;background:#c9a227;border-radius:.35rem .35rem .45rem .45rem;box-shadow:0 .55rem 1.2rem rgba(26,39,68,.18);animation:wrrapd-lost-bob 2.4s ease-in-out infinite;}';
	echo '.wrrapd-lost__box:before{content:"";position:absolute;left:50%;top:0;bottom:0;width:.72rem;margin-left:-.36rem;background:#fff3a3;}';
	echo '.wrrapd-lost__lid{position:absolute;left:-.28rem;right:-.28rem;top:-.72rem;height:.85rem;background:#1a3d2e;border-radius:.3rem;animation:wrrapd-lost-lid .9s ease-in-out infinite alternate;}';
	echo '.wrrapd-lost__bow{position:absolute;left:50%;top:-1.55rem;width:1.7rem;height:1.15rem;margin-left:-.85rem;animation:wrrapd-lost-look 2.8s ease-in-out infinite;}';
	echo '.wrrapd-lost__bow:before,.wrrapd-lost__bow:after{content:"";position:absolute;top:0;width:.95rem;height:.95rem;background:#e11d48;border-radius:50% 50% 50% 0;transform:rotate(-45deg);}';
	echo '.wrrapd-lost__bow:before{left:0;}';
	echo '.wrrapd-lost__bow:after{right:0;transform:rotate(45deg);}';
	echo '.wrrapd-lost__sparkle{position:absolute;width:.38rem;height:.38rem;background:' . WRRAPD_LOGO_GOLD . ';transform:rotate(45deg);animation:wrrapd-lost-twinkle 1.6s ease-in-out infinite;}';
	echo '.wrrapd-lost__sparkle--a{top:.15rem;left:.4rem;animation-delay:.1s;}';
	echo '.wrrapd-lost__sparkle--b{top:.55rem;right:.2rem;animation-delay:.55s;}';
	echo '.wrrapd-lost__sparkle--c{bottom:1.1rem;left:.15rem;animation-delay:1s;}';
	echo '.wrrapd-lost h1{margin:0 0 .7rem;font-family:Fraunces,Georgia,serif;font-size:clamp(1.7rem,4.4vw,2.45rem);line-height:1.15;color:#0f172a;}';
	echo '.wrrapd-lost p{margin:0 auto;max-width:32rem;font-size:1.05rem;line-height:1.5;color:#334155;}';
	echo '.wrrapd-lost__actions{display:flex;flex-wrap:wrap;justify-content:center;gap:.7rem;margin:1.45rem 0 0;}';
	echo '.wrrapd-lost__actions a{display:inline-flex;align-items:center;justify-content:center;min-height:2.7rem;padding:.65rem 1.15rem;border-radius:999px;font-size:.95rem;font-weight:800;text-decoration:none;}';
	echo '.wrrapd-lost__actions a:first-child{background:#c9a227;color:#1a1a12;}';
	echo '.wrrapd-lost__actions a:not(:first-child){background:#0f0351;color:#fff;}';
	echo '@keyframes wrrapd-lost-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}';
	echo '@keyframes wrrapd-lost-lid{from{transform:translateY(0) rotate(-2deg)}to{transform:translateY(-5px) rotate(3deg)}}';
	echo '@keyframes wrrapd-lost-look{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(10deg)}}';
	echo '@keyframes wrrapd-lost-twinkle{0%,100%{opacity:.25;transform:rotate(45deg) scale(.7)}50%{opacity:1;transform:rotate(45deg) scale(1.15)}}';
	echo '@media(prefers-reduced-motion:reduce){.wrrapd-lost__box,.wrrapd-lost__lid,.wrrapd-lost__bow,.wrrapd-lost__sparkle{animation:none!important;}}';
	echo '</style>';
}
add_action( 'wp_head', 'wrrapd_output_not_found_css', 9998 );

function wrrapd_render_not_found_page() {
	if ( is_admin() || ! is_404() ) {
		return;
	}
	$path = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_parse_url( (string) $_SERVER['REQUEST_URI'], PHP_URL_PATH ) : '';
	if ( preg_match( '#^/(wraprider|drive|apply|onboarding|driver-onboarding|wraprider-onboarding|thank-you|wrapstar-login|driver)(/|$)#', $path ) ) {
		return;
	}
	$home    = home_url( '/' );
	$wrap    = 'https://apply.wrrapd.com/';
	$ride    = 'https://apply.wrrapd.com/drive/';
	$is_hire = ( function_exists( 'wrrapd_wrapstars_is_portal_host' ) && wrrapd_wrapstars_is_portal_host() )
		|| ( function_exists( 'wrrapd_drivers_is_portal_host' ) && wrrapd_drivers_is_portal_host() );
	echo '<section class="wrrapd-lost" role="region" aria-labelledby="wrrapd-lost-title">';
	echo '<div class="wrrapd-lost__inner">';
	echo '<div class="wrrapd-lost__stage" aria-hidden="true">';
	echo '<span class="wrrapd-lost__sparkle wrrapd-lost__sparkle--a"></span>';
	echo '<span class="wrrapd-lost__sparkle wrrapd-lost__sparkle--b"></span>';
	echo '<span class="wrrapd-lost__sparkle wrrapd-lost__sparkle--c"></span>';
	echo '<div class="wrrapd-lost__box"><span class="wrrapd-lost__lid"></span><span class="wrrapd-lost__bow"></span></div>';
	echo '</div>';
	echo '<h1 id="wrrapd-lost-title">' . esc_html__( 'This page isn’t wrapped yet', 'wrrapd' ) . '</h1>';
	echo '<p>' . esc_html__( 'That link doesn’t go anywhere. Let’s get you back to something lovely.', 'wrrapd' ) . '</p>';
	echo '<p class="wrrapd-lost__actions">';
	echo '<a href="' . esc_url( $home ) . '">' . esc_html__( 'Home', 'wrrapd' ) . '</a>';
	if ( ! $is_hire ) {
		echo '<a href="' . esc_url( $wrap ) . '">' . esc_html__( 'Become a WrapStar', 'wrrapd' ) . '</a>';
		echo '<a href="' . esc_url( $ride ) . '">' . esc_html__( 'Become a JoyRider', 'wrrapd' ) . '</a>';
	} else {
		echo '<a href="https://wrrapd.com/">' . esc_html__( 'Wrrapd.com', 'wrrapd' ) . '</a>';
	}
	echo '</p></div></section>';
}
add_action( 'wp_footer', 'wrrapd_render_not_found_page', 3 );

/**
 * Footer link groups. The account column follows the login state so members never
 * see "Create an account". Every URL here is a published page — do not add /faq,
 * which 404s.
 *
 * @return list<array{title:string,links:list<array{label:string,url:string,blank?:bool}>}>
 */
function wrrapd_site_footer_columns() {
	$account = is_user_logged_in()
		? array(
			array( 'label' => __( 'Your gift journal', 'wrrapd' ), 'url' => home_url( '/welcome/' ) ),
			array( 'label' => __( 'My orders', 'wrrapd' ), 'url' => home_url( '/my-orders/' ) ),
			array( 'label' => __( 'Account settings', 'wrrapd' ), 'url' => home_url( '/account/' ) ),
		)
		: array(
			array( 'label' => __( 'Create an account', 'wrrapd' ), 'url' => home_url( '/register/' ) ),
			array( 'label' => __( 'Log in', 'wrrapd' ), 'url' => home_url( '/login/' ) ),
		);

	return array(
		array(
			'title' => __( 'Gifting', 'wrrapd' ),
			'links' => array(
				array( 'label' => __( 'Top gifting choices', 'wrrapd' ), 'url' => home_url( '/top-gifting-choices/' ) ),
				array( 'label' => __( 'Stores we wrap for', 'wrrapd' ), 'url' => home_url( '/#wrrapd-retailer-wheels-row' ) ),
			),
		),
		array(
			'title' => __( 'Your account', 'wrrapd' ),
			'links' => $account,
		),
		array(
			'title' => __( 'Company', 'wrrapd' ),
			'links' => array(
				array( 'label' => __( 'About us', 'wrrapd' ), 'url' => home_url( '/about-us/' ) ),
				array( 'label' => __( 'Contact us', 'wrrapd' ), 'url' => home_url( '/contact/' ) ),
			),
		),
		array(
			'title' => __( 'Policies', 'wrrapd' ),
			'links' => array(
				array( 'label' => __( 'Terms of use', 'wrrapd' ), 'url' => home_url( '/terms/' ) ),
				array( 'label' => __( 'Privacy & data', 'wrrapd' ), 'url' => home_url( '/privacy/' ) ),
				array( 'label' => __( 'Affiliate disclosure', 'wrrapd' ), 'url' => home_url( '/affiliate-disclosure/' ) ),
				array( 'label' => __( 'Electronic communications', 'wrrapd' ), 'url' => home_url( '/ecomms-policy/' ) ),
				array( 'label' => __( 'SMS consent', 'wrrapd' ), 'url' => home_url( '/sms-consent/' ) ),
			),
		),
	);
}

/**
 * Replaces the Elementor 6447 footer template, which could not hold a mission
 * statement or this many link groups. Styling lives in wrrapd_output_site_footer_css.
 */
function wrrapd_render_site_footer() {
	static $done = false;
	if ( $done || wrrapd_site_footer_is_suppressed() ) {
		return;
	}
	$done = true;

	$socials = array(
		array(
			'label' => __( 'Wrrapd on Facebook', 'wrrapd' ),
			'url'   => 'https://www.facebook.com/wrrapd',
			'path'  => 'M504 256C504 119 393 8 256 8S8 119 8 256c0 123.78 90.69 226.38 209.25 245V327.69h-63V256h63v-54.64c0-62.15 37-96.48 93.67-96.48 27.14 0 55.52 4.84 55.52 4.84v61h-31.28c-30.8 0-40.41 19.12-40.41 38.73V256h68.78l-11 71.69h-57.78V501C413.31 482.38 504 379.78 504 256z',
		),
		array(
			'label' => __( 'Wrrapd on X', 'wrrapd' ),
			'url'   => 'https://www.x.com/wrrapd',
			'path'  => 'M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z',
		),
	);

	echo '<footer class="wrrapd-footer" role="contentinfo">';
	echo '<div class="wrrapd-footer__inner">';

	echo '<div class="wrrapd-footer__top">';
	echo '<div class="wrrapd-footer__lead">';
	echo '<div class="wrrapd-footer__intro">';
	echo '<div class="wrrapd-footer__brand-stack">';
	echo '<a class="wrrapd-footer__brand" href="' . esc_url( home_url( '/' ) ) . '" rel="home">';
	echo '<img src="https://wrrapd.com/wp-content/uploads/2025/03/Wrrapd_f-Logo-800-x-458-px.png" width="800" height="458" alt="' . esc_attr__( 'Wrrapd', 'wrrapd' ) . '" loading="lazy" decoding="async" />';
	echo '</a>';
	echo '<img class="wrrapd-footer__tagline" src="https://wrrapd.com/wp-content/uploads/2025/03/WrappingHappiness-2.png" width="344" height="65" alt="' . esc_attr__( 'Wrapping Happiness', 'wrrapd' ) . '" loading="lazy" decoding="async" />';
	echo '</div>';
	echo '<p class="wrrapd-footer__mission">' . esc_html__( 'We strive to deliver bigger smiles and surprises!', 'wrrapd' ) . '</p>';
	echo '</div>';
	echo '<p class="wrrapd-footer__cta"><a href="' . esc_url( wrrapd_chrome_extension_install_url() ) . '" target="_blank" rel="noopener">' . esc_html__( 'Gift-wrap with your FREE Chrome extension today', 'wrrapd' ) . '</a></p>';
	echo '</div>';

	echo '<nav class="wrrapd-footer__nav" aria-label="' . esc_attr__( 'Footer', 'wrrapd' ) . '">';
	foreach ( wrrapd_site_footer_columns() as $col ) {
		echo '<div class="wrrapd-footer__col">';
		echo '<h2 class="wrrapd-footer__heading">' . esc_html( (string) $col['title'] ) . '</h2>';
		echo '<ul class="wrrapd-footer__list">';
		foreach ( $col['links'] as $link ) {
			$blank = ! empty( $link['blank'] ) ? ' target="_blank" rel="noopener"' : '';
			echo '<li><a href="' . esc_url( (string) $link['url'] ) . '"' . $blank . '>' . esc_html( (string) $link['label'] ) . '</a></li>';
		}
		echo '</ul>';
		echo '</div>';
	}
	echo '</nav>';
	echo '</div>';

	echo '<div class="wrrapd-footer__bar">';
	echo '<ul class="wrrapd-footer__social">';
	foreach ( $socials as $s ) {
		echo '<li><a href="' . esc_url( (string) $s['url'] ) . '" target="_blank" rel="noopener" aria-label="' . esc_attr( (string) $s['label'] ) . '">';
		echo '<svg viewBox="0 0 512 512" aria-hidden="true" focusable="false"><path d="' . esc_attr( (string) $s['path'] ) . '"/></svg>';
		echo '</a></li>';
	}
	echo '</ul>';
	echo '<p class="wrrapd-footer__copy">© ' . esc_html( (string) gmdate( 'Y' ) ) . ' ' . esc_html__( 'Wrrapd Inc.; all rights reserved. Patent pending.', 'wrrapd' ) . '</p>';
	echo '</div>';

	echo '</div>';
	echo '</footer>';
}
add_action( 'wp_footer', 'wrrapd_render_site_footer', 5 );

/**
 * Footer layout — single source. Also retires the Elementor 6447 template, whose
 * markup wrrapd_render_site_footer replaces.
 */
function wrrapd_output_site_footer_css() {
	if ( wrrapd_site_footer_is_suppressed() ) {
		return;
	}
	/* Same URL the seasonal plugin uses, so the browser serves one request either way. */
	echo '<link rel="preconnect" href="https://fonts.googleapis.com" />';
	echo '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />';
	echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560;9..144,700&amp;display=swap" />';

	echo '<style id="wrrapd-site-footer-css">';
	echo '.elementor-location-footer,[data-elementor-type="footer"]{display:none!important;}';
	echo '.wrrapd-footer{--wf-ink:#fff;--wf-gold:' . WRRAPD_LOGO_GOLD . ';background:' . WRRAPD_NAVY_DEEP . ';color:var(--wf-ink);margin-top:auto;width:100%;box-sizing:border-box;font-family:Fraunces,Georgia,"Times New Roman",serif;}';
	echo '.wrrapd-footer *{box-sizing:border-box;}';
	echo '.wrrapd-footer__inner{max-width:78rem;margin:0 auto;padding:clamp(1.45rem,2.8vw,2.1rem) clamp(1.25rem,4vw,3rem) 2.35rem;}';
	echo '.wrrapd-footer__top{display:grid;grid-template-columns:minmax(22rem,1.35fr) minmax(0,2.1fr);align-items:stretch;gap:clamp(1.25rem,3vw,2.25rem);margin:0 0 .7rem;}';
	/* Lead stretches with the link columns so the CTA sits on the SMS Consent baseline. */
	echo '.wrrapd-footer__lead{display:flex;flex-direction:column;align-items:flex-start;margin:0;min-height:100%;}';
	echo '.wrrapd-footer__intro{display:flex;flex-direction:row;align-items:flex-end;gap:clamp(.7rem,1.6vw,1.15rem);width:100%;}';
	echo '.wrrapd-footer__brand-stack{flex:0 0 auto;}';
	echo '.wrrapd-footer__brand{display:inline-block;line-height:0;margin:0;}';
	echo '.wrrapd-footer__brand img{display:block;width:auto;height:auto;max-height:clamp(4.6rem,9vw,6.4rem);max-width:100%;}';
	echo '.wrrapd-footer__tagline{display:block;width:auto;height:auto;max-height:clamp(1.45rem,3.4vw,2.1rem);max-width:min(14rem,68vw);margin:-1.35rem 0 0;object-fit:contain;object-position:left center;}';
	echo '.wrrapd-footer__mission{margin:0;font-family:inherit;font-weight:700;font-size:clamp(1.05rem,2.1vw,1.35rem);line-height:1.18;letter-spacing:-.015em;color:var(--wf-ink);max-width:16ch;text-wrap:balance;}';
	echo '.wrrapd-footer__nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(1.15rem,2.4vw,1.75rem);margin:0;}';
	echo '.wrrapd-footer__heading{margin:0 0 .95rem;font-family:inherit;font-size:.95rem;font-weight:800;line-height:1.2;color:var(--wf-gold);text-transform:none;}';
	echo '.wrrapd-footer__list{list-style:none;margin:0;padding:0;}';
	echo '.wrrapd-footer__list li{margin:0 0 .62rem;}';
	echo '.wrrapd-footer__list li:last-child{margin-bottom:0;}';
	echo '.wrrapd-footer__list a{display:inline-block;color:var(--wf-ink);font-family:inherit;font-size:.93rem;font-weight:600;line-height:1.35;text-decoration:none;border-bottom:1px solid transparent;transition:color .15s ease,border-color .15s ease;}';
	echo '.wrrapd-footer__list a:hover,.wrrapd-footer__list a:focus-visible{color:var(--wf-gold);border-bottom-color:var(--wf-gold);}';
	echo '.wrrapd-footer__cta{margin:auto 0 0;padding-top:.85rem;width:100%;}';
	echo '.wrrapd-footer__cta a{display:flex;align-items:center;justify-content:center;width:100%;box-sizing:border-box;gap:.5rem;background:linear-gradient(180deg,#e85d04,#d14900);color:#fff;font-family:inherit;font-size:.86rem;font-weight:800;line-height:1.2;text-align:center;text-decoration:none;white-space:nowrap;padding:.78rem 1.1rem;border-radius:999px;transition:transform .15s ease,box-shadow .15s ease;}';
	echo '.wrrapd-footer__cta a:hover,.wrrapd-footer__cta a:focus-visible{transform:translateY(-1px);box-shadow:0 .5rem 1.1rem rgba(0,0,0,.28);}';
	echo 'html.wrrapd-ext-installed .wrrapd-footer__cta{display:none!important;}';
	echo '.wrrapd-footer__list a[href*="chromewebstore.google.com"]{display:none!important;}';
	echo '.wrrapd-footer__bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.65rem 1.5rem;border-top:1px solid rgba(255,255,255,.18);padding-top:.7rem;}';
	echo '.wrrapd-footer__social{display:flex;align-items:center;gap:.55rem;list-style:none;margin:0;padding:0;}';
	echo '.wrrapd-footer__social a{display:inline-flex;align-items:center;justify-content:center;width:2.15rem;height:2.15rem;border-radius:50%;background:rgba(255,255,255,.12);color:var(--wf-ink);transition:background .15s ease,color .15s ease;}';
	echo '.wrrapd-footer__social a:hover,.wrrapd-footer__social a:focus-visible{background:var(--wf-gold);color:#0f0351;}';
	echo '.wrrapd-footer__social svg{width:1.02rem;height:1.02rem;fill:currentColor;}';
	echo '.wrrapd-footer__copy{margin:0;font-family:inherit;font-size:.82rem;font-weight:600;line-height:1.4;color:rgba(255,255,255,.72);}';
	echo '@media(max-width:900px){';
	echo '.wrrapd-footer__top{grid-template-columns:1fr;gap:1.15rem;}';
	echo '.wrrapd-footer__intro{flex-direction:column;align-items:flex-start;}';
	echo '.wrrapd-footer__cta{margin-top:.75rem;padding-top:0;}';
	echo '.wrrapd-footer__cta a{white-space:normal;}';
	echo '.wrrapd-footer__nav{grid-template-columns:repeat(2,minmax(0,1fr));gap:1.5rem 1.75rem;}';
	echo '}';
	echo '@media(max-width:560px){';
	echo '.wrrapd-footer__inner{padding:1.55rem 1.15rem 1.85rem;}';
	echo '.wrrapd-footer__tagline{margin-top:-1.4rem;}';
	echo '.wrrapd-footer__mission{font-size:1.42rem;max-width:26ch;}';
	echo '.wrrapd-footer__nav{gap:1.35rem 1.1rem;}';
	echo '.wrrapd-footer__heading{font-size:.88rem;margin-bottom:.7rem;}';
	echo '.wrrapd-footer__list a{font-size:.86rem;}';
	echo '.wrrapd-footer__list li{margin-bottom:.5rem;}';
	echo '.wrrapd-footer__cta a{width:100%;justify-content:center;}';
	echo '.wrrapd-footer__bar{justify-content:center;text-align:center;padding-top:.55rem;}';
	echo '.wrrapd-footer__copy{width:100%;text-align:center;}';
	echo '}';
	echo '@media(prefers-reduced-motion:reduce){';
	echo '.wrrapd-footer__cta a,.wrrapd-footer__list a,.wrrapd-footer__social a{transition:none;}';
	echo '.wrrapd-footer__cta a:hover{transform:none;}';
	echo '}';
	echo '</style>';
}
add_action( 'wp_head', 'wrrapd_output_site_footer_css', 9998 );

/**
 * Shopper legal pages — Terms, Privacy, Affiliate Disclosure, e-comms, SMS consent.
 *
 * @return array{ids:list<int>,slugs:list<string>}
 */
function wrrapd_legal_page_refs() {
	return array(
		'ids'   => array( 5209, 6772, 6930, 6889, 6202 ),
		'slugs' => array( 'terms', 'privacy', 'affiliate-disclosure', 'ecomms-policy', 'sms-consent' ),
	);
}

/**
 * Whether the current request is a published legal/policy page.
 */
function wrrapd_is_legal_page() {
	if ( is_admin() ) {
		return false;
	}
	$refs = wrrapd_legal_page_refs();
	return is_page( $refs['ids'] ) || is_page( $refs['slugs'] );
}

/**
 * Fraunces on legal page body copy (wins over Elementor / Customizer Source Sans).
 */
function wrrapd_output_legal_page_css() {
	if ( ! wrrapd_is_legal_page() ) {
		return;
	}
	echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,560;0,9..144,700;1,9..144,560&amp;display=swap" />';
	echo '<style id="wrrapd-legal-fraunces">';
	echo 'body.page-id-5209,body.page-id-6772,body.page-id-6930,body.page-id-6889,body.page-id-6202,';
	echo 'body.page-id-5209 .elementor-widget-text-editor,body.page-id-6772 .elementor-widget-text-editor,body.page-id-6930 .elementor-widget-text-editor,body.page-id-6889 .elementor-widget-text-editor,body.page-id-6202 .elementor-widget-text-editor,';
	echo 'body.page-id-5209 .elementor-heading-title,body.page-id-6772 .elementor-heading-title,body.page-id-6930 .elementor-heading-title,body.page-id-6889 .elementor-heading-title,body.page-id-6202 .elementor-heading-title,';
	echo 'body.page-id-5209 h1,body.page-id-6772 h1,body.page-id-6930 h1,body.page-id-6889 h1,body.page-id-6202 h1,';
	echo 'body.page-id-5209 h2,body.page-id-6772 h2,body.page-id-6930 h2,body.page-id-6889 h2,body.page-id-6202 h2,';
	echo 'body.page-id-5209 h3,body.page-id-6772 h3,body.page-id-6930 h3,body.page-id-6889 h3,body.page-id-6202 h3,';
	echo 'body.page-id-5209 p,body.page-id-6772 p,body.page-id-6930 p,body.page-id-6889 p,body.page-id-6202 p,';
	echo 'body.page-id-5209 li,body.page-id-6772 li,body.page-id-6930 li,body.page-id-6889 li,body.page-id-6202 li,';
	echo 'body.page-id-5209 a,body.page-id-6772 a,body.page-id-6930 a,body.page-id-6889 a,body.page-id-6202 a,';
	echo 'body.page-id-5209 .wrrapd-page-shell,body.page-id-6772 .wrrapd-page-shell,body.page-id-6930 .wrrapd-page-shell,body.page-id-6889 .wrrapd-page-shell,body.page-id-6202 .wrrapd-page-shell,';
	echo 'body.page-id-5209 .wrrapd-legal-card,body.page-id-6772 .wrrapd-legal-card,body.page-id-6930 .wrrapd-legal-card,body.page-id-6889 .wrrapd-legal-card,body.page-id-6202 .wrrapd-legal-card';
	echo '{font-family:Fraunces,Georgia,"Times New Roman",serif!important;}';
	echo '</style>';
	echo '<!-- ' . esc_html( WRRAPD_MU_BUILD ) . ' -->';
}
add_action( 'wp_footer', 'wrrapd_output_legal_page_css', 9999 );

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
 * Parse a stored gift date into annual month/day (year is ignored).
 *
 * @return array{0:int,1:int} Month 1–12 and day 1–31, or 0/0 if empty.
 */
function wrrapd_parse_annual_md( $gift_date ) {
	$raw = trim( (string) $gift_date );
	$m   = 0;
	$d   = 0;
	if ( preg_match( '/^(?:\d{4}-)?(\d{1,2})-(\d{1,2})$/', $raw, $mm ) ) {
		$m = (int) $mm[1];
		$d = (int) $mm[2];
	}
	if ( $m < 1 || $m > 12 ) {
		$m = 0;
	}
	if ( $d < 1 || $d > 31 ) {
		$d = 0;
	}
	return array( $m, $d );
}

/**
 * Month + day dropdowns for an annual reminder (no year).
 *
 * @param string $gift_date Stored YYYY-MM-DD or MM-DD.
 * @param string $month_id
 * @param string $day_id
 * @param string $month_class
 * @param string $day_class
 */
function wrrapd_render_annual_md_selects( $gift_date, $month_id, $day_id, $month_class, $day_class ) {
	list( $m, $d ) = wrrapd_parse_annual_md( $gift_date );
	$months        = array(
		1  => __( 'January', 'wrrapd' ),
		2  => __( 'February', 'wrrapd' ),
		3  => __( 'March', 'wrrapd' ),
		4  => __( 'April', 'wrrapd' ),
		5  => __( 'May', 'wrrapd' ),
		6  => __( 'June', 'wrrapd' ),
		7  => __( 'July', 'wrrapd' ),
		8  => __( 'August', 'wrrapd' ),
		9  => __( 'September', 'wrrapd' ),
		10 => __( 'October', 'wrrapd' ),
		11 => __( 'November', 'wrrapd' ),
		12 => __( 'December', 'wrrapd' ),
	);
	echo '<div class="wrrapd-annual-md">';
	echo '<select class="' . esc_attr( $month_class ) . '" id="' . esc_attr( $month_id ) . '" aria-label="' . esc_attr__( 'Month', 'wrrapd' ) . '">';
	echo '<option value="">' . esc_html__( 'Month', 'wrrapd' ) . '</option>';
	foreach ( $months as $n => $lab ) {
		echo '<option value="' . (int) $n . '"' . selected( $m, $n, false ) . '>' . esc_html( $lab ) . '</option>';
	}
	echo '</select>';
	echo '<select class="' . esc_attr( $day_class ) . '" id="' . esc_attr( $day_id ) . '" aria-label="' . esc_attr__( 'Day', 'wrrapd' ) . '">';
	echo '<option value="">' . esc_html__( 'Day', 'wrrapd' ) . '</option>';
	for ( $i = 1; $i <= 31; $i++ ) {
		echo '<option value="' . (int) $i . '"' . selected( $d, $i, false ) . '>' . esc_html( (string) $i ) . '</option>';
	}
	echo '</select></div>';
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
	echo '<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560;9..144,700&amp;family=Source+Sans+3:wght@400;600;700&amp;display=swap" />';
	echo '<div id="' . esc_attr( $wrap_id ) . '" class="wrrapd-legacy-cards-root" data-ajax-url="' . esc_url( $ajax ) . '" data-nonce="' . esc_attr( $nonce ) . '">';
	echo '<style>
.wrrapd-legacy-cards-root{--wr-amber:#ea580c;--wr-amber-deep:#c2410c;--wr-navy:#162a52;--wr-display:Fraunces,Georgia,serif;font-family:"Source Sans 3",system-ui,sans-serif;font-size:.875rem;max-width:100%;padding:.85rem;box-sizing:border-box;color:#1a1a1a;line-height:1.35;}
.wrrapd-legacy-cards-root *,.wrrapd-legacy-cards-root *::before,.wrrapd-legacy-cards-root *::after{box-sizing:border-box;}
.wrrapd-legacy-cards-root h2{font-family:var(--wr-display);font-size:1.35rem;margin:0 0 1.1rem;font-weight:700;letter-spacing:-.015em;color:#162a52;}
.wrrapd-legacy-cards-root .order-card{display:flex;flex-direction:column;border:1px solid #c5c5c5;padding:.85rem 1rem;border-radius:.65rem;box-shadow:0 .12rem .35rem rgba(0,0,0,.06);margin-bottom:1.15rem;background:#fff;font-family:var(--wr-display);}
.wrrapd-legacy-cards-root .order-content{display:grid;grid-template-columns:minmax(0,1fr) minmax(15.5rem,20rem);gap:1.15rem;align-items:start;}
.wrrapd-legacy-cards-root .wrrapd-legacy-paired-main{min-width:0;display:flex;flex-direction:column;gap:.75rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-pair{display:grid;grid-template-columns:minmax(12rem,.7fr) minmax(22.5rem,1.3fr);gap:.85rem;align-items:start;padding:.72rem;border:1px solid #e2e8f0;border-radius:.72rem;background:linear-gradient(180deg,#fff,#f8fafc);box-shadow:0 2px 8px rgba(15,23,42,.05);}
.wrrapd-legacy-cards-root .order-details{min-width:0;}
.wrrapd-legacy-cards-root .order-meta{margin-bottom:.65rem;font-size:.8rem;color:#333;}
.wrrapd-legacy-cards-root .order-meta strong{display:block;font-family:var(--wr-display);font-weight:700;margin-bottom:.15rem;font-size:.95rem;color:#162a52;}
.wrrapd-legacy-cards-root .order-items{display:flex;flex-direction:column;gap:.65rem;}
.wrrapd-legacy-cards-root .order-item{display:grid;grid-template-columns:4.5rem minmax(0,1fr);gap:.7rem;padding:.55rem 0;border-bottom:1px solid #eee;align-items:start;}
.wrrapd-legacy-cards-root .order-item.has-wrap{grid-template-columns:4.5rem 2.35rem minmax(0,1fr);}
.wrrapd-legacy-cards-root .order-item:last-child{border-bottom:none;}
.wrrapd-legacy-cards-root .order-item > img.wrrapd-legacy-item-photo{width:4.5rem;height:4.5rem;object-fit:cover;border-radius:.55rem;border:1px solid #d6dbe3;background:#fff;box-shadow:0 1px 4px rgba(15,23,42,.08);}
.wrrapd-legacy-cards-root .order-item .wrrapd-legacy-wrap-preview{width:2.35rem;height:2.35rem;object-fit:cover;border-radius:.4rem;border:1px solid #d6dbe3;background:#fff;}
.wrrapd-legacy-cards-root .item-details{flex:1;min-width:0;font-size:.8rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-retail-row{display:flex;align-items:center;gap:.32rem;font-weight:700;color:#0f172a;margin-bottom:.1rem;font-family:var(--wr-display);}
.wrrapd-legacy-cards-root .wrrapd-legacy-item-id{font-size:.72rem;color:#334155;font-weight:700;line-height:1.2;margin-bottom:.08rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-item-title{font-family:var(--wr-display);font-size:.86rem;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:.1rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-design-choice{font-size:.74rem;font-weight:700;color:#0f172a;line-height:1.22;margin-bottom:.08rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-flowers-line{font-size:.74rem;line-height:1.22;margin-bottom:.06rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-msg-line{font-size:.74rem;line-height:1.28;color:#1f2937;}
.wrrapd-legacy-cards-root .legacy-forms{width:100%;min-width:0;max-width:none;display:flex;flex-direction:column;gap:.85rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-line{width:100%;min-width:0;border:1px solid #d6dbe3;border-radius:.58rem;padding:.65rem .75rem;background:#fff;}
.wrrapd-legacy-cards-root .info-box{background:transparent;padding:0;border-radius:0;border:none;margin-bottom:.38rem;}
.wrrapd-legacy-cards-root .info-box label{display:block;margin-bottom:.35rem;font-size:.72rem;font-weight:600;color:#333;}
.wrrapd-legacy-cards-root .info-box input[type=text],.wrrapd-legacy-cards-root .info-box input[type=date]{width:100%;padding:.32rem .4rem;font-size:.78rem;border:1px solid #bbb;border-radius:.3rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-giftee-readonly{width:100%;padding:.38rem .52rem;border-radius:6px;background:linear-gradient(180deg,#7f1d1d,#5c1a2e);color:#fff5f5;font-family:var(--wr-display);font-weight:700;font-size:.86rem;line-height:1.35;box-shadow:inset 0 1px 0 rgba(255,255,255,.12);}
.wrrapd-legacy-cards-root select,.wrrapd-legacy-cards-root input,.wrrapd-legacy-cards-root button{font-family:var(--wr-display);}
.wrrapd-legacy-cards-root .wrrapd-legacy-orange-select select{display:block;width:100%;max-width:100%;min-width:0;height:2.15rem;padding:.32rem 2rem .32rem .55rem;font-family:var(--wr-display);font-size:.78rem;border-radius:6px;border:2px solid var(--wr-navy);background:linear-gradient(180deg,var(--wr-amber),var(--wr-amber-deep));color:#fff7ed;line-height:1.25;box-shadow:inset 0 1px 0 rgba(255,255,255,.2);cursor:pointer;text-overflow:ellipsis;}
.wrrapd-legacy-cards-root .wrrapd-legacy-orange-select select:focus{outline:2px solid #f5c518;outline-offset:1px;}
.wrrapd-legacy-cards-root .wrrapd-legacy-orange-select select option{background:#fff;color:#0f172a;}
.wrrapd-legacy-cards-root .wrrapd-legacy-rem-date-box{background:transparent;padding:0;}
.wrrapd-legacy-cards-root .wrrapd-legacy-rem-date-row{display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:.4rem;margin-top:.05rem;min-width:0;width:100%;}
.wrrapd-legacy-cards-root .wrrapd-legacy-date-block{width:auto;flex:0 0 auto;min-width:0;}
.wrrapd-legacy-cards-root .wrrapd-annual-md{display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:.3rem;width:auto;}
.wrrapd-legacy-cards-root .wrrapd-annual-md select{display:block;width:auto!important;max-width:none!important;min-width:0;height:2rem;padding:.22rem 1.35rem .22rem .4rem!important;font-family:var(--wr-display)!important;font-size:.72rem!important;border:1px solid #94a3b8!important;border-radius:.4rem!important;background:#fff!important;line-height:1.25;text-overflow:ellipsis;}
.wrrapd-legacy-cards-root .wrrapd-legacy-month{width:7.6rem!important;flex:0 0 7.6rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-day{width:3.35rem!important;flex:0 0 3.35rem;}
.wrrapd-legacy-cards-root .wrrapd-legacy-rem-block{flex:1 1 auto;min-width:0;display:inline-flex;flex-wrap:nowrap;align-items:center;gap:.28rem .36rem;font-family:var(--wr-display);font-size:.68rem;white-space:nowrap;}
.wrrapd-legacy-cards-root .wrrapd-legacy-rem-block > label{display:inline-flex;align-items:center;gap:.28rem;margin:0!important;font-weight:600;white-space:nowrap;text-transform:none!important;letter-spacing:0!important;font-size:.68rem!important;font-family:var(--wr-display)!important;color:#0f172a!important;}
.wrrapd-legacy-cards-root .wrrapd-legacy-rem-block input[type=checkbox]{width:14px!important;height:14px!important;margin:0;accent-color:var(--wr-amber-deep);flex:0 0 auto;}
.wrrapd-legacy-cards-root .wrrapd-legacy-days-inline{display:inline-flex;align-items:center;gap:.22rem;flex-wrap:nowrap;white-space:nowrap;}
.wrrapd-legacy-cards-root .wrrapd-legacy-rem-days{width:auto!important;min-width:2.35rem!important;max-width:2.6rem!important;height:1.85rem;padding:.12rem .18rem!important;font-size:.68rem!important;border-radius:4px!important;border:1px solid #64748b!important;font-weight:600!important;font-family:var(--wr-display)!important;background:#fff!important;color:#0f172a!important;}
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
.wrrapd-legacy-cards-root .wrrapd-legacy-order-foot{position:sticky;top:.75rem;margin-top:0;padding-top:0;border-top:none;min-width:0;font-family:var(--wr-display);}
.wrrapd-legacy-cards-root .wrrapd-legacy-order-foot .wrrapd-amz-summary{width:100%;font-family:var(--wr-display);font-size:.86rem;padding:.7rem .8rem;border:1px solid #d6dbe3;border-radius:.72rem;background:#fff;box-shadow:0 2px 8px rgba(15,23,42,.06);}
.wrrapd-legacy-cards-root .wrrapd-legacy-order-foot .wrrapd-amz-inv-list{width:100%;}
.wrrapd-legacy-cards-root .wrrapd-legacy-order-foot .wrrapd-amz-inv-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;gap:.75rem;width:100%;font-family:var(--wr-display);font-size:.82rem;line-height:1.35;padding:.24rem 0;border-bottom:1px solid #e2e8f0;}
.wrrapd-legacy-cards-root .wrrapd-legacy-order-foot .wrrapd-amz-inv-lab{min-width:0;text-align:left;font-family:var(--wr-display);}
.wrrapd-legacy-cards-root .wrrapd-legacy-order-foot .wrrapd-amz-inv-amt{text-align:right;white-space:nowrap;font-family:var(--wr-display);font-variant-numeric:tabular-nums;}
.wrrapd-legacy-cards-root .wrrapd-legacy-order-foot .wrrapd-amz-inv-row--grand{margin-top:.28rem;padding-top:.38rem;border-top:2px solid var(--wr-navy);border-bottom:0;font-size:.96rem;font-weight:700;}
.wrrapd-legacy-cards-root .wrrapd-legacy-order-foot .wrrapd-amz-inv-sub{font-size:.74rem;}
.wrrapd-legacy-cards-root .wrrapd-amz-inv-lab .wrrapd-retailer-brand,.wrrapd-legacy-cards-root .wrrapd-legacy-retail-row .wrrapd-retailer-brand{display:inline-flex;align-items:center;gap:.32rem;vertical-align:middle;}
.wrrapd-legacy-cards-root .wrrapd-retailer-logo{flex:0 0 auto;display:block;width:1.35rem!important;height:1.35rem!important;border-radius:50%;object-fit:cover;box-shadow:0 1px 3px rgba(15,23,42,.16);}
.wrrapd-legacy-cards-root .wrrapd-retailer-name{font-weight:700;font-family:var(--wr-display);}
@media(max-width:980px){.wrrapd-legacy-cards-root .order-content{grid-template-columns:1fr;}.wrrapd-legacy-cards-root .wrrapd-legacy-order-foot{position:static;}.wrrapd-legacy-cards-root .wrrapd-legacy-pair{grid-template-columns:minmax(11rem,.7fr) minmax(21rem,1.3fr);}}
@media(max-width:680px){.wrrapd-legacy-cards-root{padding:.45rem;}.wrrapd-legacy-cards-root .order-card{padding:.65rem;}.wrrapd-legacy-cards-root .wrrapd-legacy-pair{grid-template-columns:1fr;padding:.6rem;}.wrrapd-legacy-cards-root .order-item{border-bottom:1px solid #e2e8f0;padding-bottom:.65rem;}.wrrapd-legacy-cards-root .wrrapd-legacy-rem-date-row{flex-wrap:wrap;}}
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

			echo '<div class="order-item' . ( $wrap_u !== '' ? ' has-wrap' : '' ) . '">';
			echo '<img class="wrrapd-legacy-item-photo" src="' . esc_url( $img_u ) . '" alt="" loading="lazy" decoding="async" />';
			if ( $wrap_u !== '' ) {
				echo '<img class="wrrapd-legacy-wrap-preview" src="' . esc_url( $wrap_u ) . '" alt="" loading="lazy" decoding="async" />';
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
			wrrapd_render_annual_md_selects( $gdate, $wrap_id . '-mo-' . $id_sfx, $wrap_id . '-dy-' . $id_sfx, 'wrrapd-legacy-month', 'wrrapd-legacy-day' );
			echo '</div>';
			echo '<div class="wrrapd-legacy-rem-block">';
			echo '<label for="' . esc_attr( $wrap_id . '-m-' . $id_sfx ) . '"><input type="checkbox" class="wrrapd-legacy-rem" id="' . esc_attr( $wrap_id . '-m-' . $id_sfx ) . '"' . ( $rem ? ' checked' : '' ) . ' /> ';
			echo '<span>' . esc_html__( 'Set annual reminder', 'wrrapd' ) . '</span></label>';
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
	echo '<script>(function(){var root=document.getElementById(' . $wrap_json . ');if(!root)return;var ajax=root.getAttribute("data-ajax-url");var nonce=root.getAttribute("data-nonce");root.querySelectorAll(".order-content").forEach(function(content){var details=content.querySelector(":scope > .order-details");var forms=content.querySelector(":scope > .legacy-forms");var foot=content.querySelector(":scope > .wrrapd-legacy-order-foot");if(!details||!forms||!foot)return;var meta=details.querySelector(".order-meta");var items=Array.from(details.querySelectorAll(".order-item"));var lines=Array.from(forms.querySelectorAll(".wrrapd-legacy-line"));var main=document.createElement("div");main.className="wrrapd-legacy-paired-main";if(meta)main.appendChild(meta);var count=Math.max(items.length,lines.length);for(var i=0;i<count;i++){var pair=document.createElement("section");pair.className="wrrapd-legacy-pair";pair.setAttribute("aria-label","Order item "+String(i+1));if(items[i])pair.appendChild(items[i]);if(lines[i])pair.appendChild(lines[i]);main.appendChild(pair);}content.insertBefore(main,foot);details.remove();forms.remove();});root.querySelectorAll(".wrrapd-legacy-rem").forEach(function(cb){var line=cb.closest(".wrrapd-legacy-line");if(!line)return;var sd=line.querySelector(".wrrapd-legacy-rem-days");function sync(){if(sd)sd.disabled=!cb.checked;}sync();cb.addEventListener("change",sync);});root.querySelectorAll(".wrrapd-legacy-save").forEach(function(btn){btn.addEventListener("click",function(){var line=btn.closest(".wrrapd-legacy-line");if(!line)return;var fd=new FormData();fd.append("action","wrrapd_save_order_line_overlay");fd.append("nonce",nonce);fd.append("orderNumber",line.getAttribute("data-order")||"");fd.append("lineIndex",line.getAttribute("data-line")||"0");var g=line.querySelector(".wrrapd-legacy-giftee");fd.append("giftee",g?g.value:"");var rel=line.querySelector(".wrrapd-legacy-rel");fd.append("relationship",rel?rel.value:"");var occ=line.querySelector(".wrrapd-legacy-occ");fd.append("occasion_pick",occ?occ.value:"");var mo=line.querySelector(".wrrapd-legacy-month");var dy=line.querySelector(".wrrapd-legacy-day");var mv=mo?parseInt(mo.value,10)||0:0;var dv=dy?parseInt(dy.value,10)||0:0;fd.append("gift_date",(mv&&dv)?("2000-"+String(mv).padStart(2,"0")+"-"+String(dv).padStart(2,"0")):"");var rcb=line.querySelector(".wrrapd-legacy-rem");var ron=rcb&&rcb.checked;fd.append("reminder_next_year",ron?"1":"");var rdp=line.querySelector(".wrrapd-legacy-rem-days");fd.append("reminder_days_prior",ron&&rdp&&!rdp.disabled?(rdp.value||"1"):"");var cm=line.querySelector(".wrrapd-legacy-comment");fd.append("comment",cm?cm.value:"");btn.disabled=true;fetch(ajax,{method:"POST",body:fd,credentials:"same-origin"}).then(function(r){return r.json();}).then(function(j){btn.disabled=false;if(j&&j.success){btn.style.boxShadow="0 0 0 2px rgba(34,197,94,.6)";window.setTimeout(function(){btn.style.boxShadow="";},650);}else{btn.style.opacity="0.65";window.setTimeout(function(){btn.style.opacity="";},800);}}).catch(function(){btn.disabled=false;});});});})();</script>';
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
			. '<img class="wrrapd-retailer-logo" src="' . $src . '" width="22" height="22" decoding="async" alt="' . esc_attr( $row['label'] ) . '" />'
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
.wrrapd-amz-inv-lab .wrrapd-retailer-brand{display:inline-flex;align-items:center;gap:.32rem;vertical-align:middle;}
.wrrapd-retailer-logo{flex:0 0 auto;display:block;width:1.35rem;height:1.35rem;border-radius:50%;object-fit:cover;box-shadow:0 1px 3px rgba(15,23,42,.16);}
.wrrapd-retailer-name{font-weight:700;font-family:var(--wr-display);}
.wrrapd-amz-inv-sub{display:block;margin-top:.06rem;font-size:.56rem;color:#475569;font-weight:500;line-height:1.3;word-break:break-word;}
.wrrapd-amz-inv-amt{flex:0 0 auto;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;color:#0f172a;font-weight:600;}
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
.wrrapd-amz-occ-date-row .wrrapd-amz-f-datewrap{flex:0 1 46%;min-width:8.4rem;max-width:none;}
.wrrapd-amz-f-datewrap{margin:0;text-align:left;}
.wrrapd-amz-root .wrrapd-annual-md{display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:.22rem;width:100%;}
.wrrapd-amz-root .wrrapd-annual-md select{flex:1 1 auto;min-width:0;min-height:1.35rem;padding:.12rem .2rem;border-radius:6px;border:2px solid var(--bx);font-size:.58rem;font-family:var(--wr-font);background:#fff;color:var(--ink);}
.wrrapd-amz-root .wrrapd-amz-f-month{flex:1.4 1 auto;}
.wrrapd-amz-root .wrrapd-amz-f-day{flex:0 1 4.2rem;}
.wrrapd-amz-rem-inline-row{display:flex;flex-direction:row;align-items:center;flex-wrap:wrap;gap:.16rem .22rem;width:100%;max-width:min(100%,13.5rem);margin-left:auto;margin-right:0;padding:.12rem 0 .08rem;color:#0f172a;}
.wrrapd-amz-rem-inline-row .wrrapd-amz-f-rem-days{flex:0 0 auto;width:auto;min-width:1.75rem;max-width:2.2rem;padding:.08rem .16rem;border-radius:5px;border:2px solid #334155;font-size:.58rem;font-family:var(--wr-font);background:#fff;color:#0f172a;line-height:1.25;font-weight:700;}
.wrrapd-amz-f-rem-days:disabled{opacity:.45;cursor:not-allowed;}
.wrrapd-amz-f label{display:block;font-size:.48rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--wr-navy);margin-bottom:.05rem;font-family:var(--wr-font);width:100%;text-align:left;}
.wrrapd-amz-f input[type=text],.wrrapd-amz-f select:not(.wrrapd-amz-f-rem-days):not(.wrrapd-amz-f-month):not(.wrrapd-amz-f-day){width:100%;max-width:100%;min-height:1.35rem;padding:.14rem .32rem;border-radius:6px;border:2px solid var(--bx);font-size:.62rem;font-family:var(--wr-font);background:linear-gradient(180deg,var(--wr-field-hi),var(--wr-field));line-height:1.25;color:var(--wr-field-ink);box-shadow:inset 0 1px 0 rgba(255,255,255,.2),inset 0 -1px 0 rgba(0,0,0,.12);transition:border-color .15s ease,box-shadow .15s ease;}
.wrrapd-amz-f--select select{color:var(--ink);}
.wrrapd-amz-f--select select option{color:var(--ink);background:#fff;}
.wrrapd-amz-f input[type=text]::placeholder{color:rgba(255,247,237,.78);}
.wrrapd-amz-f select:not(.wrrapd-amz-f-rem-days){cursor:pointer;accent-color:var(--wr-gold-deep);}
.wrrapd-amz-f select option{background:#fff;color:var(--ink);}
.wrrapd-amz-f select:not(.wrrapd-amz-f-rem-days):focus,.wrrapd-amz-f input[type=text]:focus{outline:none;border-color:var(--wr-gold-deep);box-shadow:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -1px 0 rgba(0,0,0,.1),0 0 0 3px rgba(245,197,24,.35);}
.wrrapd-amz-root .wrrapd-annual-md select:focus{outline:none;border-color:var(--wr-gold-deep);box-shadow:0 0 0 3px rgba(245,197,24,.3);}
.wrrapd-amz-f-hint{font-size:.5rem;color:var(--muted);margin-top:.04rem;line-height:1.2;max-width:100%;text-align:left;}
.wrrapd-amz-giftee-readonly{width:100%;padding:.2rem .42rem;border-radius:6px;background:linear-gradient(180deg,#7f1d1d,#5c1a2e);color:#fff5f5;font-family:var(--wr-display);font-weight:700;font-size:.78rem;line-height:1.35;box-shadow:inset 0 1px 0 rgba(255,255,255,.12);}
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
			wrrapd_render_annual_md_selects( $gdate, $wrap_id . '-mo-' . $id_sfx, $wrap_id . '-dy-' . $id_sfx, 'wrrapd-amz-f-month', 'wrrapd-amz-f-day' );
			echo '</div></div>';

			if ( $gm_show !== '' ) {
				echo '<div class="wrrapd-amz-giftmsg"><span class="wrrapd-amz-giftmsg-lbl">' . esc_html__( 'Gift message', 'wrrapd' ) . '</span>';
				echo '<span class="wrrapd-amz-giftmsg-txt">' . esc_html( $gm_show ) . '</span></div>';
			}

			echo '<div class="wrrapd-amz-rem-inline-row">';
			echo '<label class="wrrapd-amz-rowcheck wrrapd-amz-rowcheck--rem" for="' . esc_attr( $wrap_id . '-m-' . $id_sfx ) . '">';
			echo '<input type="checkbox" class="wrrapd-amz-f-rem" id="' . esc_attr( $wrap_id . '-m-' . $id_sfx ) . '"' . ( $rem ? ' checked' : '' ) . ' />';
			echo '<span>' . esc_html__( 'Set annual reminder', 'wrrapd' ) . '</span></label>';
			echo '<select class="wrrapd-amz-f-rem-days" id="' . esc_attr( $wrap_id . '-md-' . $id_sfx ) . '" aria-label="' . esc_attr__( 'Days before the date', 'wrrapd' ) . '"' . ( $rem ? '' : ' disabled' ) . '>';
			for ( $rd = 1; $rd <= 7; $rd++ ) {
				echo '<option value="' . (int) $rd . '"' . selected( $rem_prior, $rd, false ) . '>' . esc_html( (string) (int) $rd ) . '</option>';
			}
			echo '</select>';
			echo '<span class="wrrapd-amz-rem-tail">' . esc_html__( 'days prior.', 'wrrapd' ) . '</span>';
			echo '</div>';

			if ( $prod_lb_src !== '' ) {
				echo '<div class="wrrapd-amz-prod-after-rem">';
				echo '<button type="button" class="wrrapd-amz-prod-thumb" data-wrrapd-lb-type="img" data-wrrapd-lb-src="' . esc_attr( $prod_lb_src ) . '" aria-label="' . esc_attr__( 'Enlarge item image', 'wrrapd' ) . '"><img src="' . $img . '" alt="" loading="lazy" decoding="async" /></button>';
				echo '</div>';
			}

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
	echo '<script>(function(){var root=document.getElementById(' . $wrap_json . ');if(!root)return;function wrrapdHideNoOrderMsg(el){if(!el||el===document.body)return;el.style.display="none";el.style.visibility="hidden";el.style.height="0";el.style.maxHeight="0";el.style.overflow="hidden";el.style.margin="0";el.style.padding="0";el.style.border="none";el.setAttribute("aria-hidden","true");}function wrrapdRmNoOrderFiles(){var re=/no\\s+order\\s+files?\\s*found\\.?/i;var strip=function(t){return t.replace(/no\\s+order\\s+files?\\s*found\\.?/gi,"").replace(/[\\s\\u00a0.,;…·\\-–—]+/g,"").trim();};var sels=".elementor-widget,.elementor-element,.elementor-widget-wrap,.e-con,.e-con-inner,.jet-listing-grid,.elementor-section,.elementor-widget-text-editor,.elementor-widget-heading,.widget,.wp-block-column,.wp-block-group";try{document.querySelectorAll(sels).forEach(function(el){var t=(el.textContent||"").replace(/\\s+/g," ").trim();if(!re.test(t))return;if(strip(t).length>80)return;wrrapdHideNoOrderMsg(el);});}catch(e){}try{var tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null,false);var tn;while(tn=tw.nextNode()){if(!re.test(tn.nodeValue||""))continue;var p=tn.parentElement;while(p&&p!==document.body){var pt=(p.textContent||"").replace(/\\s+/g," ").trim();if(re.test(pt)&&strip(pt).length<=2){wrrapdHideNoOrderMsg(p);break;}p=p.parentElement;}}}catch(e){}}if(!window.__wrrapdNoOrdObs){var _tmo;window.__wrrapdNoOrdObs=new MutationObserver(function(){clearTimeout(_tmo);_tmo=setTimeout(function(){wrrapdRmNoOrderFiles();},90);});try{window.__wrrapdNoOrdObs.observe(document.body,{childList:true,subtree:true});}catch(e){}}wrrapdRmNoOrderFiles();window.addEventListener("load",function(){wrrapdRmNoOrderFiles();});[80,200,500,1200,2400,4800,9000].forEach(function(ms){setTimeout(wrrapdRmNoOrderFiles,ms);});var lb=document.getElementById(' . $lb_json . ');var q=document.getElementById(' . $search_json . ');function norm(s){return(s||"").toLowerCase().trim();}function filterOrders(){var needle=norm(q?q.value:"");root.querySelectorAll(".wrrapd-amz-order").forEach(function(ord){if(!needle){ord.style.display="";return;}var hay=norm(ord.getAttribute("data-wrrapd-search"));var hit=hay.indexOf(needle)!==-1;if(!hit){ord.querySelectorAll(".wrrapd-amz-line").forEach(function(ln){if(norm(ln.getAttribute("data-wrrapd-search")).indexOf(needle)!==-1)hit=true;});}ord.style.display=hit?"":"none";});}if(q){q.addEventListener("input",filterOrders);q.addEventListener("search",filterOrders);}function openLb(t,src){if(!lb)return;var inner=lb.querySelector(".wrrapd-amz-lb-inner");inner.innerHTML="";if(t==="img"&&src){var im=document.createElement("img");im.src=src;im.alt="";im.decoding="async";inner.appendChild(im);}else{var d=document.createElement("div");d.className="wrrapd-amz-lb-paper";inner.appendChild(d);}lb.classList.add("wrrapd-amz-lightbox--open");lb.setAttribute("aria-hidden","false");}function closeLb(){if(!lb)return;lb.classList.remove("wrrapd-amz-lightbox--open");lb.setAttribute("aria-hidden","true");}root.addEventListener("click",function(e){var b=e.target.closest(".wrrapd-amz-wrap-thumb,.wrrapd-amz-prod-thumb");if(b){openLb(b.getAttribute("data-wrrapd-lb-type")||"paper",b.getAttribute("data-wrrapd-lb-src")||"");return;}if(!lb||!lb.classList.contains("wrrapd-amz-lightbox--open"))return;if(e.target.classList.contains("wrrapd-amz-lb-close")||e.target===lb)closeLb();});document.addEventListener("keydown",function(e){if(e.key!=="Escape"||!lb||!lb.classList.contains("wrrapd-amz-lightbox--open"))return;closeLb();});var ajax=root.getAttribute("data-ajax-url");var nonce=root.getAttribute("data-nonce");root.querySelectorAll(".wrrapd-amz-f-rem").forEach(function(cb){function snc(){var ln=cb.closest(".wrrapd-amz-line");if(!ln)return;var sd=ln.querySelector(".wrrapd-amz-f-rem-days");if(sd)sd.disabled=!cb.checked;}cb.addEventListener("change",snc);snc();});root.querySelectorAll(".wrrapd-amz-save").forEach(function(btn){btn.addEventListener("click",function(){var line=btn.closest(".wrrapd-amz-line");if(!line)return;var fd=new FormData();fd.append("action","wrrapd_save_order_line_overlay");fd.append("nonce",nonce);fd.append("orderNumber",line.getAttribute("data-order")||"");fd.append("lineIndex",line.getAttribute("data-line")||"0");fd.append("giftee",line.querySelector(".wrrapd-amz-f-giftee")?line.querySelector(".wrrapd-amz-f-giftee").value:"");fd.append("relationship",line.querySelector(".wrrapd-amz-f-rel")?line.querySelector(".wrrapd-amz-f-rel").value:"");fd.append("occasion_pick",line.querySelector(".wrrapd-amz-f-occ")?line.querySelector(".wrrapd-amz-f-occ").value:"");var mo=line.querySelector(".wrrapd-amz-f-month");var dy=line.querySelector(".wrrapd-amz-f-day");var mv=mo?parseInt(mo.value,10)||0:0;var dv=dy?parseInt(dy.value,10)||0:0;fd.append("gift_date",(mv&&dv)?("2000-"+String(mv).padStart(2,"0")+"-"+String(dv).padStart(2,"0")):"");var rcb=line.querySelector(".wrrapd-amz-f-rem");var ron=rcb&&rcb.checked;fd.append("reminder_next_year",ron?"1":"");var rdp=line.querySelector(".wrrapd-amz-f-rem-days");fd.append("reminder_days_prior",ron&&rdp&&!rdp.disabled?(rdp.value||"1"):"");fd.append("comment",line.querySelector(".wrrapd-amz-f-comment")?line.querySelector(".wrrapd-amz-f-comment").value:"");btn.disabled=true;fetch(ajax,{method:"POST",body:fd,credentials:"same-origin"}).then(function(r){return r.json();}).then(function(j){btn.disabled=false;if(j&&j.success){btn.style.boxShadow="0 0 0 2px rgba(107,114,128,.85)";window.setTimeout(function(){btn.style.boxShadow="";},650);}else{btn.style.opacity="0.65";window.setTimeout(function(){btn.style.opacity="";},900);}}).catch(function(){btn.disabled=false;});});});})();</script>';

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
	if ( $gift_date !== '' && preg_match( '/^(\d{2})-(\d{2})$/', $gift_date, $gmd ) ) {
		$gift_date = '2000-' . $gmd[1] . '-' . $gmd[2];
	}
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
