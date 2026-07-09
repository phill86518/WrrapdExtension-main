<?php
/**
 * Copy these defines into SiteGround wp-config.php (above “That's all, stop editing!”).
 * Website: Wrrapd — 101807253 (from CJ Get link dropdown).
 * Paste the exact href from each CJ Get link; hosts (kqzyfj, jdoqocy, tkqlhce, …) vary by creative.
 *
 * Do NOT commit live tokenized URLs to a public Git repo if CJ adds session params.
 */

define( 'WRRAPD_CJ_PUBLISHER_SITE_ID', '101807253' );

// Rakuten (not CJ) — publisher id is b/dhBLlk5M0 for both Etsy + GiftCards.com
define( 'WRRAPD_AFFILIATE_REDIRECT_ETSY', 'https://click.linksynergy.com/fs-bin/click?id=b%2fdhBLlk5M0&offerid=2023405.3&subid=0&type=4' );
define( 'WRRAPD_AFFILIATE_REDIRECT_GIFTCARDS', 'https://click.linksynergy.com/fs-bin/click?id=b%2fdhBLlk5M0&offerid=2037571.963&subid=0&type=4' );
define( 'WRRAPD_AFFILIATE_RAKUTEN_ETSY_MID', '54027' );
define( 'WRRAPD_AFFILIATE_RAKUTEN_GIFTCARDS_MID', '44432' );

// CJ — from your Get link screenshots (website 101807253)
define( 'WRRAPD_AFFILIATE_REDIRECT_RUSSELLSTOVER', 'https://www.kqzyfj.com/click-101807253-12180504' );
define( 'WRRAPD_AFFILIATE_REDIRECT_BOOKSAMILLION', 'https://www.dpbolvw.net/click-101807253-13986208' ); // CJ link id 13986208 (15% coupon text link) — advertiser ids 129899/1298894 expired
define( 'WRRAPD_AFFILIATE_REDIRECT_FRESHROASTEDCOFFEE', 'https://www.tkqlhce.com/click-101807253-17313544' );
define( 'WRRAPD_AFFILIATE_REDIRECT_ZCHOCOLAT', 'https://www.anrdoezrs.net/click-101807253-12189399' );
define( 'WRRAPD_AFFILIATE_REDIRECT_VYJEWELRY', 'https://www.dpbolvw.net/click-101807253-17056490' );
define( 'WRRAPD_AFFILIATE_REDIRECT_GEARUP', 'https://www.jdoqocy.com/click-101807253-17235974' );

// Peet's Coffee — banner hops (advertiser-level 2346375 404s in CJ)
define( 'WRRAPD_AFFILIATE_REDIRECT_PEETSCOFFEE', 'https://www.dpbolvw.net/click-101807253-13426123' ); // shop-all / gifts
define( 'WRRAPD_AFFILIATE_REDIRECT_PEETSCOFFEE_FINDER', 'https://www.jdoqocy.com/click-101807253-13588852' ); // coffee finder page

// Optional: log /go/ outbound hops to PHP error_log
// define( 'WRRAPD_AFFILIATE_LOG_CLICKS', true );
