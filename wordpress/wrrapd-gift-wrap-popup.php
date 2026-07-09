<?php
/**
 * Homepage gift-wrap retailer popup — cycling “Gift-wrap anything on {retailer}” hero.
 *
 * Loaded by wrrapd-orders-bridge.php on wrrapd.com front page only.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WRRAPD_GIFT_POPUP_BUILD', '2026-07-08-gift-wrap-banner-v4-amazon' );

/**
 * Typography + accent color per retailer slug (logos come from mu-plugins/logos/).
 *
 * @param string $slug Retailer slug.
 * @return array{color:string,font:string}
 */
function wrrapd_gift_wrap_popup_style_for_slug( $slug ) {
	$map = array(
		'etsy'       => array(
			'color' => '#F56400',
			'font'  => "'Playfair Display', Georgia, serif",
		),
		'amazon'     => array(
			'color' => '#131921',
			'font'  => "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
		),
		'target'     => array(
			'color' => '#E4002B',
			'font'  => "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
		),
		'walmart'    => array(
			'color' => '#0071CE',
			'font'  => "'Montserrat', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
		),
		'ulta'       => array(
			'color' => '#5E2B7E',
			'font'  => "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
		),
		'lego'       => array(
			'color' => '#D40511',
			'font'  => "'Anton', Impact, Haettenschweiler, 'Arial Black', sans-serif",
		),
		'nordstrom'  => array(
			'color' => '#222222',
			'font'  => "'Playfair Display', Georgia, serif",
		),
		'kohls'      => array(
			'color' => '#002D62',
			'font'  => "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
		),
		'sephora'    => array(
			'color' => '#222222',
			'font'  => "'Montserrat', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
		),
		'bestbuy'    => array(
			'color' => '#003B64',
			'font'  => "'Montserrat', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
		),
	);
	$slug = strtolower( (string) $slug );
	if ( isset( $map[ $slug ] ) ) {
		return $map[ $slug ];
	}
	return array(
		'color' => '#0f172a',
		'font'  => "'Inter', system-ui, sans-serif",
	);
}

/**
 * Display name for the popup ticker (uppercase with sensible exceptions).
 *
 * @param string $label Wheel label.
 */
function wrrapd_gift_wrap_popup_display_name( $label ) {
	$label = trim( (string) $label );
	if ( $label === '' ) {
		return '';
	}
	if ( preg_match( '/^LEGO$/i', $label ) ) {
		return 'LEGO';
	}
	return function_exists( 'mb_strtoupper' )
		? mb_strtoupper( $label, 'UTF-8' )
		: strtoupper( $label );
}

/**
 * Retailers for the popup — Etsy first, then the homepage wheel set with real logos.
 *
 * @return list<array{slug:string,label:string,display:string,logo:string,color:string,font:string}>
 */
function wrrapd_gift_wrap_popup_retailers() {
	if ( ! function_exists( 'wrrapd_home_retailer_wheel_brands' ) || ! function_exists( 'wrrapd_mu_logo_url_for_slug' ) ) {
		return array();
	}

	$brands = wrrapd_home_retailer_wheel_brands();
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
		$style = wrrapd_gift_wrap_popup_style_for_slug( $slug );
		$label = ! empty( $b['label'] ) ? (string) $b['label'] : ucfirst( $slug );
		$out[] = array(
			'slug'    => $slug,
			'label'   => $label,
			'display' => wrrapd_gift_wrap_popup_display_name( $label ),
			'logo'    => wrrapd_mu_logo_url_for_slug( $slug, ! empty( $b['domain'] ) ? (string) $b['domain'] : $slug . '.com' ),
			'color'   => $style['color'],
			'font'    => $style['font'],
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
		'https://fonts.googleapis.com/css2?family=Pacifico&family=Playfair+Display:wght@700&family=Montserrat:wght@700&family=Anton&family=Inter:wght@600;700&display=swap',
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

	$first = $retailers[0];
	?>
	<div id="wrrapd-gift-popup" class="wrrapd-gift-popup" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="wrrapd-gift-popup-title">
		<div class="wrrapd-gift-popup__panel">
			<div class="wrrapd-gift-popup__sparkles" aria-hidden="true">
				<span></span><span></span><span></span><span></span><span></span><span></span>
			</div>
			<button type="button" class="wrrapd-gift-popup__close" id="wrrapd-gift-popup-close" aria-label="<?php esc_attr_e( 'Close', 'wrrapd' ); ?>">&times;</button>

			<div class="wrrapd-gift-popup__hero-fit">
				<div class="wrrapd-gift-popup__hero" id="wrrapd-gift-popup-title">
				<span class="wrrapd-gift-popup__static">
					<?php esc_html_e( 'Gift-wrap', 'wrrapd' ); ?>
					<span class="wrrapd-gift-popup__handwrite" id="wrrapd-gift-popup-anything" aria-label="<?php esc_attr_e( 'anything', 'wrrapd' ); ?>"><?php esc_html_e( 'anything', 'wrrapd' ); ?></span>
					<?php esc_html_e( 'on', 'wrrapd' ); ?>
				</span>
				<span class="wrrapd-gift-popup__retailer-slot">
					<span
						id="wrrapd-gift-popup-name"
						class="wrrapd-gift-popup__name"
						style="color:<?php echo esc_attr( $first['color'] ); ?>;font-family:<?php echo esc_attr( $first['font'] ); ?>;"
					><?php echo esc_html( $first['display'] ); ?></span>
					<span id="wrrapd-gift-popup-logo" class="wrrapd-gift-popup__logo">
						<img src="<?php echo esc_url( $first['logo'] ); ?>" width="72" height="72" alt="<?php echo esc_attr( $first['label'] ); ?>" decoding="async" />
					</span>
				</span>
			</div>
			</div>
		</div>
	</div>
	<?php
}
add_action( 'wp_footer', 'wrrapd_gift_wrap_popup_render', 18 );
