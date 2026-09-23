<?php
/**
 * Plugin Name: Wrrapd Contact Hub
 * Description: Renders /contact/ and /about-us/ — CSS, form, and JS live here so WordPress cannot dump them as page text.
 * Version: 1.2.1
 *
 * Live copy is installed on SiteGround as plugins/wrrapd-contact-hub/wrrapd-contact-hub.php.
 * Repo mirror for source control — deploy by copying this file to that path.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Contact page on wrrapd.com (ID 131, slug contact).
 */
function wrrapd_contact_hub_is_page() {
	return ! is_admin() && ( is_page( 131 ) || is_page( 'contact' ) );
}

function wrrapd_about_hub_is_page() {
	return ! is_admin() && ( is_page( 4548 ) || is_page( 'about-us' ) );
}

/**
 * One-time: strip the dumped CSS/JS out of the editor so a cache miss cannot show source again.
 */
add_action( 'init', 'wrrapd_contact_hub_maybe_clean_editor', 20 );
function wrrapd_contact_hub_maybe_clean_editor() {
	if ( get_option( 'wrrapd_contact_hub_deployed_v4' ) === '1' ) {
		return;
	}
	$placeholder = '<!-- wrrapd-contact-hub: rendered by plugin -->';
	$elementor   = wp_json_encode(
		array(
			array(
				'id'       => 'ea100b5',
				'elType'   => 'container',
				'settings' => array(),
				'elements' => array(
					array(
						'id'         => 'c4ba33f',
						'elType'     => 'widget',
						'settings'   => array(
							'html'         => $placeholder,
							'_css_classes' => 'wrrapd-contact-polish',
						),
						'elements'   => array(),
						'widgetType' => 'html',
					),
				),
				'isInner'  => false,
			),
		)
	);
	wp_update_post(
		array(
			'ID'           => 131,
			'post_content' => $placeholder,
		)
	);
	update_post_meta( 131, '_elementor_edit_mode', 'builder' );
	update_post_meta( 131, '_elementor_template_type', 'wp-post' );
	update_post_meta( 131, '_elementor_data', $elementor );
	$settings = get_post_meta( 131, '_elementor_page_settings', true );
	if ( ! is_array( $settings ) ) {
		$settings = array();
	}
	$settings['hide_title'] = 'yes';
	update_post_meta( 131, '_elementor_page_settings', $settings );
	delete_post_meta( 131, '_elementor_css' );
	delete_option( 'wrrapd_tmp_contact_b64' );
	update_option( 'wrrapd_contact_hub_deployed_v4', '1', false );
	if ( function_exists( 'wp_cache_flush' ) ) {
		wp_cache_flush();
	}
}

add_filter( 'the_content', 'wrrapd_contact_hub_filter_content', 999 );
add_filter( 'elementor/frontend/the_content', 'wrrapd_contact_hub_filter_content', 999 );
function wrrapd_contact_hub_filter_content( $content ) {
	if ( ! wrrapd_contact_hub_is_page() ) {
		return $content;
	}
	if ( class_exists( '\Elementor\Plugin' ) ) {
		$doc = \Elementor\Plugin::$instance->documents->get_current();
		if ( $doc && method_exists( $doc, 'get_main_id' ) ) {
			$doc_id = (int) $doc->get_main_id();
			if ( $doc_id && 131 !== $doc_id ) {
				return $content;
			}
		}
	}
	if ( doing_filter( 'the_content' ) && ( ! in_the_loop() || ! is_main_query() ) ) {
		return $content;
	}
	static $sent = false;
	if ( $sent ) {
		return ( is_string( $content ) && strpos( $content, 'id="wrrapd-contact"' ) !== false ) ? $content : '';
	}
	$sent = true;
	return wrrapd_contact_hub_html();
}

add_filter( 'body_class', 'wrrapd_contact_hub_body_class' );
function wrrapd_contact_hub_body_class( $classes ) {
	if ( wrrapd_contact_hub_is_page() ) {
		$classes[] = 'wrrapd-contact-page';
	}
	if ( wrrapd_about_hub_is_page() ) {
		$classes[] = 'wrrapd-about-page';
		$classes[] = 'wrrapd-about-polish';
	}
	return $classes;
}

add_shortcode( 'wrrapd_contact_hub', 'wrrapd_contact_hub_html' );
add_shortcode( 'wrrapd_about_hub', 'wrrapd_about_hub_html' );

add_filter( 'the_content', 'wrrapd_about_hub_filter_content', 999 );
add_filter( 'elementor/frontend/the_content', 'wrrapd_about_hub_filter_content', 999 );
function wrrapd_about_hub_filter_content( $content ) {
	if ( ! wrrapd_about_hub_is_page() ) {
		return $content;
	}
	if ( class_exists( '\Elementor\Plugin' ) ) {
		$doc = \Elementor\Plugin::$instance->documents->get_current();
		if ( $doc && method_exists( $doc, 'get_main_id' ) ) {
			$doc_id = (int) $doc->get_main_id();
			if ( $doc_id && 4548 !== $doc_id ) {
				return $content;
			}
		}
	}
	if ( doing_filter( 'the_content' ) && ( ! in_the_loop() || ! is_main_query() ) ) {
		return $content;
	}
	static $sent = false;
	if ( $sent ) {
		return ( is_string( $content ) && strpos( $content, 'id="wrrapd-about"' ) !== false ) ? $content : '';
	}
	$sent = true;
	return wrrapd_about_hub_html();
}

add_action( 'wp_enqueue_scripts', 'wrrapd_contact_hub_enqueue', 20 );
function wrrapd_contact_hub_enqueue() {
	if ( ! wrrapd_contact_hub_is_page() && ! wrrapd_about_hub_is_page() ) {
		return;
	}
	wp_enqueue_style(
		'wrrapd-contact-hub-fonts',
		'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,560;9..144,700&display=swap',
		array(),
		null
	);
}

add_action( 'wp_head', 'wrrapd_contact_hub_css', 40 );
function wrrapd_contact_hub_css() {
	if ( wrrapd_contact_hub_is_page() ) {
		echo '<style id="wrrapd-contact-hub-css">';
		echo 'body.wrrapd-contact-page .page-header,body.wrrapd-contact-page .entry-header,body.wrrapd-contact-page .entry-title{display:none!important;}';
		echo 'body.wrrapd-contact-page .site-main{padding:0!important;margin:0!important;max-width:none!important;}';
		echo wrrapd_contact_hub_css_text();
		echo '</style>';
	}
	if ( wrrapd_about_hub_is_page() ) {
		echo '<style id="wrrapd-about-hub-css">';
		echo 'body.wrrapd-about-page .page-header,body.wrrapd-about-page .entry-header,body.wrrapd-about-page .entry-title{display:none!important;}';
		echo 'body.wrrapd-about-page .site-main{padding:0!important;margin:0!important;max-width:none!important;}';
		echo wrrapd_about_hub_css_text();
		echo '</style>';
	}
}

add_action( 'wp_footer', 'wrrapd_contact_hub_js', 20 );
function wrrapd_contact_hub_js() {
	if ( ! wrrapd_contact_hub_is_page() ) {
		return;
	}
	echo '<script id="wrrapd-contact-note-js">';
	echo '(function(){var form=document.getElementById("wrrapd-contact-note");if(!form)return;form.addEventListener("submit",function(e){e.preventDefault();var who=(document.getElementById("wrrapd-ch-who")||{}).value||"";var name=(document.getElementById("wrrapd-ch-name")||{}).value||"";var email=(document.getElementById("wrrapd-ch-email")||{}).value||"";var msg=(document.getElementById("wrrapd-ch-msg")||{}).value||"";var subject=encodeURIComponent("Wrrapd contact — "+who+(name?" — "+name:""));var body=encodeURIComponent("Who: "+who+"\\nName: "+name+"\\nReply-to: "+email+"\\n\\n"+msg);window.location.href="mailto:help@wrrapd.com?subject="+subject+"&body="+body;});})();';
	echo '</script>';
}

/**
 * Hub markup — never stored in post_content (WP/Elementor strip style/form/script).
 */
function wrrapd_contact_hub_html() {
	$home    = home_url( '/' );
	$orders  = home_url( '/my-orders/' );
	$about   = home_url( '/about-us/' );
	$apply   = 'https://apply.wrrapd.com/';
	$wrap    = 'https://apply.wrrapd.com/apply/';
	$rider   = 'https://apply.wrrapd.com/wraprider/';
	$joy     = 'https://apply.wrrapd.com/drive/';
	$fb      = 'https://www.facebook.com/wrrapd';
	$x       = 'https://www.x.com/wrrapd';

	ob_start();
	?>
<main class="wrrapd-contact-hub" id="wrrapd-contact">
	<header class="wrrapd-ch-hero">
		<div class="wrrapd-ch-hero-inner">
			<p class="wrrapd-ch-eyebrow"><?php esc_html_e( 'Support & contact', 'wrrapd' ); ?></p>
			<h1><?php esc_html_e( 'How can we help?', 'wrrapd' ); ?></h1>
			<p class="wrrapd-ch-lede"><?php esc_html_e( 'Pick the path that fits you — gift orders, joining the wrapping team, or company questions. We’ll point you to the fastest next step.', 'wrrapd' ); ?></p>
		</div>
	</header>

	<div class="wrrapd-ch-body">
		<h2 class="wrrapd-ch-section-title"><?php esc_html_e( 'I need help with…', 'wrrapd' ); ?></h2>
		<p class="wrrapd-ch-section-sub"><?php esc_html_e( 'Start with who you are, then jump straight to the right place.', 'wrrapd' ); ?></p>

		<div class="wrrapd-ch-grid" role="list">
			<a class="wrrapd-ch-card" href="<?php echo esc_url( $orders ); ?>" role="listitem">
				<p class="wrrapd-ch-kicker"><?php esc_html_e( 'Shoppers', 'wrrapd' ); ?></p>
				<h2><?php esc_html_e( 'My gift order', 'wrrapd' ); ?></h2>
				<p><?php esc_html_e( 'Track wrapping, delivery updates, or something that didn’t look right on a gift you already placed.', 'wrrapd' ); ?></p>
				<span class="wrrapd-ch-card-cta"><?php esc_html_e( 'Open Your orders →', 'wrrapd' ); ?></span>
			</a>

			<a class="wrrapd-ch-card" href="<?php echo esc_url( $home ); ?>" role="listitem">
				<p class="wrrapd-ch-kicker"><?php esc_html_e( 'Shoppers', 'wrrapd' ); ?></p>
				<h2><?php esc_html_e( 'Getting started', 'wrrapd' ); ?></h2>
				<p><?php esc_html_e( 'Install the free Chrome extension, pick a gift, and wrap it before checkout — we’ll guide the flow on the homepage.', 'wrrapd' ); ?></p>
				<span class="wrrapd-ch-card-cta"><?php esc_html_e( 'Go to Wrrapd home →', 'wrrapd' ); ?></span>
			</a>

			<a class="wrrapd-ch-card" href="<?php echo esc_url( $apply ); ?>" role="listitem">
				<h2><?php esc_html_e( 'Join the team', 'wrrapd' ); ?></h2>
				<p><?php esc_html_e( 'Apply to wrap gifts, deliver finished wraps, or do both — choose the track that fits how you like to work.', 'wrrapd' ); ?></p>
				<span class="wrrapd-ch-card-cta"><?php esc_html_e( 'Visit apply.wrrapd.com →', 'wrrapd' ); ?></span>
			</a>
		</div>

		<div class="wrrapd-ch-pills" aria-label="<?php esc_attr_e( 'Application tracks', 'wrrapd' ); ?>">
			<a href="<?php echo esc_url( $wrap ); ?>"><?php esc_html_e( 'WrapStar apply', 'wrrapd' ); ?></a>
			<a href="<?php echo esc_url( $rider ); ?>"><?php esc_html_e( 'WrapRider apply', 'wrrapd' ); ?></a>
			<a href="<?php echo esc_url( $joy ); ?>"><?php esc_html_e( 'JoyRider apply', 'wrrapd' ); ?></a>
		</div>

		<h2 class="wrrapd-ch-section-title"><?php esc_html_e( 'Reach us directly', 'wrrapd' ); ?></h2>
		<p class="wrrapd-ch-section-sub"><?php esc_html_e( 'The fastest ways to reach us.', 'wrrapd' ); ?></p>

		<div class="wrrapd-ch-channels">
			<div class="wrrapd-ch-channel">
				<h3><?php esc_html_e( 'Email', 'wrrapd' ); ?></h3>
				<p><a href="mailto:help@wrrapd.com">help@wrrapd.com</a><br /><?php esc_html_e( 'Best for order inquiries and status.', 'wrrapd' ); ?></p>
			</div>
			<div class="wrrapd-ch-channel">
				<h3><?php esc_html_e( 'Phone', 'wrrapd' ); ?></h3>
				<p><a href="tel:+18446385484">(844) 638-5484</a></p>
			</div>
			<div class="wrrapd-ch-channel">
				<h3><?php esc_html_e( 'Mail', 'wrrapd' ); ?></h3>
				<p>Wrrapd Inc.<br />7901 4th St N, Ste 300<br />St. Petersburg, FL 33702</p>
			</div>
		</div>

		<div class="wrrapd-ch-note">
			<div class="wrrapd-ch-note-copy">
				<h2><?php esc_html_e( 'Press, partners & everything else', 'wrrapd' ); ?></h2>
				<p><?php esc_html_e( 'Media, retail partnerships, and general company mail go to', 'wrrapd' ); ?> <a href="mailto:info@wrrapd.com" style="color:#f6b933;">info@wrrapd.com</a>. <?php esc_html_e( 'For policies, see Terms and Privacy in the footer. Follow along on Facebook and X @wrrapd.', 'wrrapd' ); ?></p>
				<div class="wrrapd-ch-pills" style="margin-top:1.1rem;">
					<a href="<?php echo esc_url( $fb ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'Facebook', 'wrrapd' ); ?></a>
					<a href="<?php echo esc_url( $x ); ?>" target="_blank" rel="noopener">X</a>
					<a href="<?php echo esc_url( $about ); ?>"><?php esc_html_e( 'About us', 'wrrapd' ); ?></a>
				</div>
			</div>

			<div class="wrrapd-ch-form">
				<h2><?php esc_html_e( 'Send a short note', 'wrrapd' ); ?></h2>
				<form id="wrrapd-contact-note" action="mailto:help@wrrapd.com" method="get">
					<div class="field">
						<label for="wrrapd-ch-who"><?php esc_html_e( 'I am', 'wrrapd' ); ?></label>
						<select id="wrrapd-ch-who" name="who" required>
							<option value="Shopper"><?php esc_html_e( 'a shopper', 'wrrapd' ); ?></option>
							<option value="Press / partner"><?php esc_html_e( 'press or partner', 'wrrapd' ); ?></option>
							<option value="Other"><?php esc_html_e( 'someone else', 'wrrapd' ); ?></option>
						</select>
					</div>
					<div class="field">
						<label for="wrrapd-ch-name"><?php esc_html_e( 'Name', 'wrrapd' ); ?></label>
						<input id="wrrapd-ch-name" name="name" type="text" autocomplete="name" required />
					</div>
					<div class="field">
						<label for="wrrapd-ch-email"><?php esc_html_e( 'Email', 'wrrapd' ); ?></label>
						<input id="wrrapd-ch-email" name="email" type="email" autocomplete="email" required />
					</div>
					<div class="field">
						<label for="wrrapd-ch-msg"><?php esc_html_e( 'Message', 'wrrapd' ); ?></label>
						<textarea id="wrrapd-ch-msg" name="message" required placeholder="<?php esc_attr_e( 'Order # helps a lot if you have one.', 'wrrapd' ); ?>"></textarea>
					</div>
					<button type="submit"><?php esc_html_e( 'Send email to help@wrrapd.com', 'wrrapd' ); ?></button>
				</form>
			</div>
		</div>

		<p class="wrrapd-ch-foot"><?php esc_html_e( 'We wrap happiness. Thanks for writing — we read every note.', 'wrrapd' ); ?></p>
	</div>
</main>
	<?php
	return (string) ob_get_clean();
}

/**
 * Contact hub CSS (same tokens as the designed page).
 */
function wrrapd_contact_hub_css_text() {
	return <<<'CSS'
.wrrapd-contact-hub{
  --ch-navy:#0c0638;
  --ch-navy-2:#0f0351;
  --ch-ink:#162a52;
  --ch-muted:#5a6b8a;
  --ch-gold:#f6b933;
  --ch-paper:#f7f4ee;
  --ch-card:#fff;
  --ch-line:rgba(12,6,56,.10);
  font-family:Fraunces,Georgia,serif;
  color:var(--ch-ink);
  background:
    radial-gradient(120% 80% at 100% -10%, rgba(246,185,51,.18), transparent 55%),
    radial-gradient(90% 70% at -10% 20%, rgba(12,6,56,.06), transparent 50%),
    linear-gradient(180deg, #fbfaf7 0%, var(--ch-paper) 42%, #efe8dc 100%);
  margin:0 calc(50% - 50vw);
  width:100vw;
  box-sizing:border-box;
  padding:0 0 clamp(2.5rem,6vw,4rem);
}
.wrrapd-contact-hub *,.wrrapd-contact-hub *::before,.wrrapd-contact-hub *::after{box-sizing:border-box;font-family:inherit;}
.wrrapd-contact-hub input,.wrrapd-contact-hub select,.wrrapd-contact-hub textarea,.wrrapd-contact-hub button{font-family:Fraunces,Georgia,serif;}
.wrrapd-contact-hub a{color:var(--ch-navy-2);font-weight:700;text-decoration-thickness:.08em;text-underline-offset:.18em;}
.wrrapd-contact-hub a:hover{color:#d14900;}
.wrrapd-ch-pills a,.wrrapd-ch-pills a:hover{color:var(--ch-navy-2)!important;text-decoration:none!important;}
.wrrapd-ch-hero{
  background:
    linear-gradient(125deg, rgba(246,185,51,.16) 0%, transparent 42%),
    linear-gradient(180deg, var(--ch-navy) 0%, #160a4a 100%);
  color:#fff;
  padding:clamp(2.4rem,6vw,3.6rem) clamp(1.15rem,4vw,2.5rem) clamp(2.6rem,6vw,3.8rem);
  position:relative;
  overflow:hidden;
}
.wrrapd-ch-hero::after{
  content:"";
  position:absolute;
  inset:auto -8% -40% 55%;
  height:120%;
  background:radial-gradient(circle at center, rgba(246,185,51,.22), transparent 62%);
  pointer-events:none;
}
.wrrapd-ch-hero-inner{max-width:72rem;margin:0 auto;position:relative;z-index:1;}
.wrrapd-ch-eyebrow{
  margin:0 0 .7rem;
  font-size:.78rem;
  font-weight:800;
  letter-spacing:.16em;
  text-transform:uppercase;
  color:var(--ch-gold);
}
.wrrapd-ch-hero h1{
  margin:0 0 .75rem;
  font-family:inherit;
  font-size:clamp(2.05rem,5.2vw,3.35rem);
  font-weight:700;
  line-height:1.05;
  letter-spacing:-.03em;
  color:#fff;
  max-width:16ch;
}
.wrrapd-ch-lede{
  margin:0;
  max-width:38rem;
  font-size:clamp(1.02rem,2.2vw,1.18rem);
  line-height:1.55;
  color:rgba(255,255,255,.86);
  font-weight:600;
}
.wrrapd-ch-body{max-width:72rem;margin:0 auto;padding:0 clamp(1.15rem,4vw,2.5rem);}
.wrrapd-ch-section-title{
  margin:clamp(1.75rem,4vw,2.4rem) 0 .85rem;
  font-family:inherit;
  font-size:clamp(1.35rem,3vw,1.7rem);
  font-weight:700;
  letter-spacing:-.02em;
  color:var(--ch-navy);
}
.wrrapd-ch-section-sub{
  margin:0 0 1.25rem;
  color:var(--ch-muted);
  font-size:1.02rem;
  line-height:1.5;
  max-width:40rem;
  font-weight:600;
}
.wrrapd-ch-grid{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:clamp(.85rem,2vw,1.15rem);
}
.wrrapd-ch-card{
  display:flex;
  flex-direction:column;
  gap:.55rem;
  background:var(--ch-card);
  border:1px solid var(--ch-line);
  border-radius:1.05rem;
  padding:clamp(1.15rem,2.4vw,1.45rem);
  box-shadow:0 14px 36px rgba(12,6,56,.07);
  text-decoration:none !important;
  color:inherit;
  transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease;
  min-height:100%;
}
a.wrrapd-ch-card{color:inherit;font-weight:inherit;}
.wrrapd-ch-card:hover,.wrrapd-ch-card:focus-visible{
  transform:translateY(-3px);
  border-color:rgba(246,185,51,.55);
  box-shadow:0 18px 42px rgba(12,6,56,.12);
  outline:none;
}
.wrrapd-ch-kicker{
  margin:0;
  font-size:.72rem;
  font-weight:800;
  letter-spacing:.12em;
  text-transform:uppercase;
  color:#b45309;
}
.wrrapd-ch-card h2{
  margin:0;
  font-family:inherit;
  font-size:clamp(1.2rem,2.4vw,1.4rem);
  font-weight:700;
  color:var(--ch-navy);
  letter-spacing:-.02em;
  line-height:1.15;
}
.wrrapd-ch-card p{
  margin:0;
  color:var(--ch-muted);
  font-size:.98rem;
  line-height:1.5;
  font-weight:600;
  flex:1;
}
.wrrapd-ch-card-cta{
  margin-top:.35rem;
  display:inline-flex;
  align-items:center;
  gap:.35rem;
  font-size:.92rem;
  font-weight:800;
  color:var(--ch-navy-2);
}
.wrrapd-ch-card:hover .wrrapd-ch-card-cta{color:#d14900;}
.wrrapd-ch-channels{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:clamp(.85rem,2vw,1.15rem);
  margin-top:.25rem;
}
.wrrapd-ch-channel{
  background:rgba(255,255,255,.88);
  border:1px solid var(--ch-line);
  border-radius:1rem;
  padding:1.15rem 1.2rem;
}
.wrrapd-ch-channel h3{
  margin:0 0 .35rem;
  font-family:inherit;
  font-size:1.08rem;
  font-weight:700;
  color:var(--ch-navy);
}
.wrrapd-ch-channel p{margin:0;color:var(--ch-muted);font-size:.95rem;line-height:1.45;font-weight:600;}
.wrrapd-ch-channel a{font-weight:800;}
.wrrapd-ch-note{
  margin-top:clamp(1.6rem,3.5vw,2.2rem);
  display:grid;
  grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);
  gap:clamp(1rem,2.5vw,1.5rem);
  align-items:stretch;
}
.wrrapd-ch-note-copy{
  background:linear-gradient(160deg, var(--ch-navy) 0%, #1a0b55 100%);
  color:#fff;
  border-radius:1.1rem;
  padding:clamp(1.35rem,3vw,1.8rem);
}
.wrrapd-ch-note-copy h2{
  margin:0 0 .55rem;
  font-family:inherit;
  font-size:clamp(1.35rem,3vw,1.7rem);
  font-weight:700;
  color:#fff;
  letter-spacing:-.02em;
}
.wrrapd-ch-note-copy p{margin:0;color:rgba(255,255,255,.84);font-size:1rem;line-height:1.55;font-weight:600;}
.wrrapd-ch-form{
  background:#fff;
  border:1px solid var(--ch-line);
  border-radius:1.1rem;
  padding:clamp(1.2rem,2.8vw,1.55rem);
  box-shadow:0 14px 36px rgba(12,6,56,.07);
}
.wrrapd-ch-form h2{
  margin:0 0 1rem;
  font-family:inherit;
  font-size:1.25rem;
  font-weight:700;
  color:var(--ch-navy);
}
.wrrapd-ch-form label{
  display:block;
  margin:0 0 .3rem;
  font-size:.86rem;
  font-weight:800;
  color:var(--ch-navy);
}
.wrrapd-ch-form .field{margin:0 0 .75rem;}
.wrrapd-ch-form input,
.wrrapd-ch-form select,
.wrrapd-ch-form textarea{
  width:100%;
  border:1px solid rgba(12,6,56,.16);
  border-radius:.7rem;
  padding:.7rem .8rem;
  font:inherit;
  font-weight:600;
  color:var(--ch-ink);
  background:#fff;
}
.wrrapd-ch-form textarea{min-height:7rem;resize:vertical;}
.wrrapd-ch-form button{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:100%;
  margin-top:.25rem;
  border:0;
  border-radius:999px;
  padding:.85rem 1.1rem;
  background:var(--ch-gold);
  color:var(--ch-navy-2);
  font:inherit;
  font-weight:800;
  cursor:pointer;
  transition:transform .15s ease, box-shadow .15s ease;
}
.wrrapd-ch-form button:hover{transform:translateY(-1px);box-shadow:0 .45rem 1rem rgba(12,6,56,.18);}
.wrrapd-ch-foot{
  margin:clamp(1.5rem,3vw,2rem) 0 0;
  text-align:center;
  color:var(--ch-muted);
  font-size:.9rem;
  font-weight:600;
}
.wrrapd-ch-pills{
  display:flex;
  flex-wrap:wrap;
  gap:.55rem;
  margin-top:.85rem;
}
.wrrapd-ch-pills a{
  display:inline-flex;
  align-items:center;
  padding:.45rem .85rem;
  border-radius:999px;
  background:var(--ch-gold);
  color:var(--ch-navy-2)!important;
  text-decoration:none;
  font-size:.86rem;
  font-weight:800;
  border:1px solid rgba(246,185,51,.9);
}
.wrrapd-ch-pills a:hover,.wrrapd-ch-pills a:focus-visible{background:#ffd056;color:var(--ch-navy-2)!important;box-shadow:0 .35rem .8rem rgba(12,6,56,.16);}
@media(max-width:900px){
  .wrrapd-ch-grid,.wrrapd-ch-channels,.wrrapd-ch-note{grid-template-columns:1fr;}
  .wrrapd-ch-hero h1{max-width:none;}
}
@media(prefers-reduced-motion:reduce){
  .wrrapd-ch-card,.wrrapd-ch-form button{transition:none;}
  .wrrapd-ch-card:hover,.wrrapd-ch-form button:hover{transform:none;}
}
CSS;
}

function wrrapd_about_hub_html() {
	$img = 'https://wrrapd.com/wp-content/uploads/2025/03/AboutUs-Image.webp';
	ob_start();
	?>
<main class="wrrapd-about-hub" id="wrrapd-about">
	<figure class="wrrapd-ab-hero">
		<img src="<?php echo esc_url( $img ); ?>" width="1792" height="1024" alt="<?php esc_attr_e( 'Wrrapd — wrapping happiness', 'wrrapd' ); ?>" decoding="async" />
	</figure>
	<div class="wrrapd-ab-body">
		<p class="wrrapd-ab-eyebrow"><?php esc_html_e( 'About us', 'wrrapd' ); ?></p>
		<h1><?php esc_html_e( 'We’re wrapping happiness', 'wrrapd' ); ?></h1>
		<p class="wrrapd-ab-lede"><?php esc_html_e( 'Personalized gift-wrapping that delivers smiles — every present as unique as the moment it celebrates.', 'wrrapd' ); ?></p>

		<section class="wrrapd-ab-block">
			<h2><?php esc_html_e( 'Our mission', 'wrrapd' ); ?></h2>
			<p><?php esc_html_e( 'We make gift-giving feel thoughtful and easy. Birthday, holiday, or just because — Wrrapd wraps it beautifully and gets it there.', 'wrrapd' ); ?></p>
		</section>

		<section class="wrrapd-ab-block">
			<h2><?php esc_html_e( 'What we do', 'wrrapd' ); ?></h2>
			<ul>
				<li><?php esc_html_e( 'Custom wrap designs for the person and the occasion', 'wrrapd' ); ?></li>
				<li><?php esc_html_e( 'Shop the stores you already love, then choose Wrrapd at checkout', 'wrrapd' ); ?></li>
				<li><?php esc_html_e( 'Optional flowers, then a wrapped delivery to the giftee', 'wrrapd' ); ?></li>
			</ul>
		</section>

		<section class="wrrapd-ab-block">
			<h2><?php esc_html_e( 'Why Wrrapd', 'wrrapd' ); ?></h2>
			<ul>
				<li><?php esc_html_e( 'Every wrap is one of a kind', 'wrrapd' ); ?></li>
				<li><?php esc_html_e( 'We handle the wrapping so you can enjoy the celebration', 'wrrapd' ); ?></li>
				<li><?php esc_html_e( 'Careful, timely, and ready for the big reveal', 'wrrapd' ); ?></li>
			</ul>
		</section>

		<section class="wrrapd-ab-block">
			<h2><?php esc_html_e( 'Our vision', 'wrrapd' ); ?></h2>
			<p><?php esc_html_e( 'Bigger smiles and surprises — one beautifully wrapped gift at a time.', 'wrrapd' ); ?></p>
			<p class="wrrapd-ab-signoff"><?php esc_html_e( 'Wrrapd it? Love it!', 'wrrapd' ); ?></p>
		</section>
	</div>
</main>
	<?php
	return (string) ob_get_clean();
}

function wrrapd_about_hub_css_text() {
	return <<<'CSS'
.wrrapd-about-hub{
  --ab-navy:#0c0638;
  --ab-navy-2:#0f0351;
  --ab-ink:#162a52;
  --ab-muted:#5a6b8a;
  --ab-gold:#f6b933;
  --ab-paper:#f7f4ee;
  font-family:Fraunces,Georgia,serif;
  color:var(--ab-ink);
  background:
    radial-gradient(120% 80% at 100% -10%, rgba(246,185,51,.16), transparent 55%),
    linear-gradient(180deg, #fbfaf7 0%, var(--ab-paper) 46%, #efe8dc 100%);
  margin:0 calc(50% - 50vw);
  width:100vw;
  box-sizing:border-box;
  padding:0 0 clamp(2.5rem,6vw,4rem);
}
.wrrapd-about-hub *,.wrrapd-about-hub *::before,.wrrapd-about-hub *::after{box-sizing:border-box;font-family:inherit;}
.wrrapd-ab-hero{margin:0;line-height:0;}
.wrrapd-ab-hero img{display:block;width:100%;height:auto;max-height:min(28rem,52vw);object-fit:cover;object-position:center;}
.wrrapd-ab-body{max-width:44rem;margin:0 auto;padding:clamp(1.8rem,4.5vw,2.8rem) clamp(1.15rem,4vw,2.5rem) 0;}
.wrrapd-ab-eyebrow{
  margin:0 0 .55rem;
  font-size:.78rem;
  font-weight:700;
  letter-spacing:.16em;
  text-transform:uppercase;
  color:#b45309;
}
.wrrapd-about-hub h1{
  margin:0 0 .75rem;
  font-size:clamp(2rem,5vw,3.1rem);
  font-weight:700;
  line-height:1.08;
  letter-spacing:-.03em;
  color:var(--ab-navy);
}
.wrrapd-ab-lede{
  margin:0 0 clamp(1.6rem,3.5vw,2.1rem);
  font-size:clamp(1.08rem,2.2vw,1.28rem);
  line-height:1.5;
  font-weight:560;
  color:var(--ab-ink);
}
.wrrapd-ab-block{margin:0 0 clamp(1.35rem,3vw,1.75rem);}
.wrrapd-about-hub h2{
  margin:0 0 .45rem;
  font-size:clamp(1.28rem,2.6vw,1.55rem);
  font-weight:700;
  letter-spacing:-.02em;
  color:var(--ab-navy);
}
.wrrapd-about-hub p,.wrrapd-about-hub li{
  margin:0;
  font-size:1.05rem;
  line-height:1.6;
  font-weight:560;
  color:var(--ab-muted);
}
.wrrapd-about-hub ul{margin:.35rem 0 0;padding:0 0 0 1.15rem;}
.wrrapd-about-hub li{margin:.28rem 0;}
.wrrapd-ab-signoff{
  margin:.85rem 0 0!important;
  font-weight:700!important;
  color:var(--ab-navy)!important;
  font-size:1.15rem!important;
}
body.wrrapd-about-polish .elementor-page-4548 .elementor-widget-heading,
body.wrrapd-about-polish .elementor-page-4548 .elementor-widget-text-editor,
body.wrrapd-about-polish .elementor-page-4548 .elementor-widget-heading *,
body.wrrapd-about-polish .elementor-page-4548 .elementor-widget-text-editor *{
  font-family:Fraunces,Georgia,serif!important;
}
CSS;
}

add_action( 'wp_footer', 'wrrapd_contact_hub_patent_pending', 99 );
function wrrapd_contact_hub_patent_pending() {
	echo '<script id="wrrapd-patent-pending">(function(){function p(){document.querySelectorAll(".wrrapd-footer__copy,.wrrapd-wrapstars-site-footer__copy").forEach(function(el){if(!el||/patent pending/i.test(el.textContent||""))return;var t=(el.textContent||"").trim();if(!t)return;el.textContent=t.replace(/\.?\s*$/,"")+" Patent pending.";});}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",p);else p();setTimeout(p,600);})();</script>';
}
