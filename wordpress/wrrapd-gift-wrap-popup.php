<?php
/**
 * Homepage gift-wrap popup — Fraunces, retailer cycle, hub shipping line + extension CTA.
 *
 * Loaded by wrrapd-orders-bridge.php on wrrapd.com front page only.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WRRAPD_GIFT_POPUP_BUILD', '2026-09-19-fraunces-hub' );

/**
 * Accent color per retailer slug (logos come from mu-plugins/logos/).
 *
 * @param string $slug Retailer slug.
 * @return string Hex color.
 */
function wrrapd_gift_wrap_popup_color_for_slug( $slug ) {
	$map = array(
		'etsy'      => '#F56400',
		'amazon'    => '#f6b933',
		'target'    => '#E4002B',
		'walmart'   => '#0071CE',
		'ulta'      => '#5E2B7E',
		'lego'      => '#D40511',
		'nordstrom' => '#f6b933',
		'kohls'     => '#7eb0e0',
		'sephora'   => '#f6b933',
		'bestbuy'   => '#0046BE',
	);
	$slug = strtolower( (string) $slug );
	return isset( $map[ $slug ] ) ? $map[ $slug ] : '#f6b933';
}

/**
 * Retailers for the popup — homepage wheel set with real logos.
 *
 * @return list<array{slug:string,label:string,display:string,logo:string,color:string}>
 */
function wrrapd_gift_wrap_popup_retailers() {
	if ( ! function_exists( 'wrrapd_home_retailer_wheel_brands' ) || ! function_exists( 'wrrapd_mu_logo_url_for_slug' ) ) {
		return array();
	}

	$brands  = wrrapd_home_retailer_wheel_brands();
	$by_slug = array();
	foreach ( $brands as $b ) {
		if ( empty( $b['slug'] ) ) {
			continue;
		}
		$by_slug[ (string) $b['slug'] ] = $b;
	}

	$order = array( 'etsy', 'amazon', 'target', 'walmart', 'ulta', 'lego', 'nordstrom', 'kohls', 'sephora', 'bestbuy' );
	$out   = array();

	foreach ( $order as $slug ) {
		if ( ! isset( $by_slug[ $slug ] ) ) {
			continue;
		}
		$b     = $by_slug[ $slug ];
		$label = ! empty( $b['label'] ) ? (string) $b['label'] : ucfirst( $slug );
		$out[] = array(
			'slug'    => $slug,
			'label'   => $label,
			'display' => $label,
			'logo'    => wrrapd_mu_logo_url_for_slug( $slug, ! empty( $b['domain'] ) ? (string) $b['domain'] : $slug . '.com' ),
			'color'   => wrrapd_gift_wrap_popup_color_for_slug( $slug ),
		);
	}

	return $out;
}

/**
 * @return bool
 */
function wrrapd_should_show_gift_wrap_popup() {
	if ( is_admin() || is_paged() ) {
		return false;
	}
	return is_front_page() || is_home();
}

/**
 * Enqueue popup assets on the homepage.
 */
function wrrapd_gift_wrap_popup_enqueue_assets() {
	if ( ! wrrapd_should_show_gift_wrap_popup() ) {
		return;
	}

	$dir = dirname( __FILE__ );
	$url = plugin_dir_url( __FILE__ );

	wp_enqueue_style(
		'wrrapd-gift-wrap-popup-fonts',
		'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,560;0,9..144,700;1,9..144,560&display=swap',
		array(),
		null
	);

	$css_path = $dir . '/wrrapd-gift-wrap-popup.css';
	if ( is_readable( $css_path ) ) {
		wp_enqueue_style(
			'wrrapd-gift-wrap-popup',
			$url . 'wrrapd-gift-wrap-popup.css',
			array( 'wrrapd-gift-wrap-popup-fonts' ),
			WRRAPD_GIFT_POPUP_BUILD
		);
	}

	$js_path = $dir . '/wrrapd-gift-wrap-popup.js';
	if ( is_readable( $js_path ) ) {
		wp_enqueue_script(
			'wrrapd-gift-wrap-popup',
			$url . 'wrrapd-gift-wrap-popup.js',
			array(),
			WRRAPD_GIFT_POPUP_BUILD,
			true
		);
		wp_localize_script(
			'wrrapd-gift-wrap-popup',
			'wrrapdGiftPopup',
			array(
				'retailers' => wrrapd_gift_wrap_popup_retailers(),
				'build'     => WRRAPD_GIFT_POPUP_BUILD,
				'storeUrl'  => function_exists( 'wrrapd_chrome_extension_install_url' ) ? wrrapd_chrome_extension_install_url() : 'https://chromewebstore.google.com/detail/wrrapd/kdfcahdcgpaoohpgagpmpbgcmkdbocbg',
			)
		);
	}
}
add_action( 'wp_enqueue_scripts', 'wrrapd_gift_wrap_popup_enqueue_assets', 30 );

/**
 * Popup markup in footer (homepage only).
 */
function wrrapd_gift_wrap_popup_render() {
	if ( ! wrrapd_should_show_gift_wrap_popup() ) {
		return;
	}

	$retailers = wrrapd_gift_wrap_popup_retailers();
	if ( ! $retailers ) {
		return;
	}

	$first    = $retailers[0];
	$store    = function_exists( 'wrrapd_chrome_extension_install_url' ) ? wrrapd_chrome_extension_install_url() : 'https://chromewebstore.google.com/detail/wrrapd/kdfcahdcgpaoohpgagpmpbgcmkdbocbg';
	?>
	<div id="wrrapd-gift-popup" class="wrrapd-gift-popup" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="wrrapd-gift-popup-title">
		<div class="wrrapd-gift-popup__panel">
			<button type="button" class="wrrapd-gift-popup__close" id="wrrapd-gift-popup-close" aria-label="<?php esc_attr_e( 'Close', 'wrrapd' ); ?>">&times;</button>

			<p class="wrrapd-gift-popup__eyebrow"><?php esc_html_e( 'Wrapping Happiness', 'wrrapd' ); ?></p>

			<div class="wrrapd-gift-popup__hero" id="wrrapd-gift-popup-title">
				<p class="wrrapd-gift-popup__static">
					<?php esc_html_e( 'Gift-wrap anything on', 'wrrapd' ); ?>
				</p>
				<div class="wrrapd-gift-popup__retailer-slot">
					<span id="wrrapd-gift-popup-logo" class="wrrapd-gift-popup__logo">
						<img src="<?php echo esc_url( $first['logo'] ); ?>" width="72" height="72" alt="<?php echo esc_attr( $first['label'] ); ?>" decoding="async" />
					</span>
					<span
						id="wrrapd-gift-popup-name"
						class="wrrapd-gift-popup__name"
						style="color:<?php echo esc_attr( $first['color'] ); ?>;"
					><?php echo esc_html( $first['display'] ); ?></span>
				</div>
			</div>

			<p class="wrrapd-gift-popup__lede"><?php esc_html_e( 'Confirm shipping to the Wrrapd hub', 'wrrapd' ); ?></p>

			<a class="wrrapd-gift-popup__cta" href="<?php echo esc_url( $store ); ?>" target="_blank" rel="noopener">
				<?php esc_html_e( 'Get the free Chrome extension', 'wrrapd' ); ?>
			</a>
		</div>
	</div>
	<?php
}
add_action( 'wp_footer', 'wrrapd_gift_wrap_popup_render', 18 );
