# Retailer wheel logos — high-resolution sources

The homepage wheel reads **`wp-content/mu-plugins/logos/{slug}.png`** (512×512 circular PNG).

Low-quality favicon fallbacks are **not** good enough for an elegant site. Download **official brand assets**, then rebuild.

## What to do (copy-paste workflow)

1. **Download** PNG or SVG from each brand’s media / press page below (save with a clear name).
2. **Rename** to `{slug}.png` and drop into **`wordpress/logos/sources/`**  
   Example: `sources/target.png`, `sources/walmart.png`, …
3. **On the GCP VM** (or locally with Pillow/ImageMagick):

   ```bash
   cd /home/phill/wrrapd-GCP/wordpress/logos
   chmod +x build-logos.sh to_circle.py
   ./build-logos.sh
   ```

   The build script fills each circular PNG with the logo’s own background color (Walmart blue, Etsy orange, Kohl’s burgundy, etc.) so square brand assets don’t sit on a white disc.

4. **Upload** everything in `wordpress/logos/` to SiteGround:  
   **`public_html/wp-content/mu-plugins/logos/`**  
   (All `{slug}.png` outputs — `sources/` is optional and not deployed.)

5. **Purge** W3 Total Cache → hard-refresh homepage.

## Official / high-quality download starting points

| Slug | Where to get proper artwork |
|------|-----------------------------|
| **amazon** | [Amazon Advertising brand](https://advertising.amazon.com/resources/ad-specs/brand-usage) — save as `sources/amazon.png` |
| **target** | [Target newsroom / brand assets](https://corporate.target.com/press) — bullseye only |
| **walmart** | [Walmart Brand Center](https://brandcenter.walmart.com/) (partner login) or press kit |
| **ulta** | [Ulta Beauty press](https://www.ulta.com/investors/news-events/press-releases) — request media kit |
| **lego** | [LEGO brand guidelines](https://www.lego.com/en-us/aboutus/lego-group/media-library) |
| **nordstrom** | Nordstrom press / investor media requests |
| **kohls** | [Kohl’s corporate media](https://corporate.kohls.com/news/media-resources/) |
| **sephora** | Sephora / LVMH press assets (media kit) |
| **etsy** | [Etsy press / brand](https://www.etsy.com/press) |
| **bestbuy** | [Best Buy newsroom](https://corporate.bestbuy.com/news-and-insights/) |

**Wikimedia Commons** (quick interim, check each file’s license):

- Target: https://commons.wikimedia.org/wiki/File:Target_Corporation_logo.svg  
- Walmart: https://commons.wikimedia.org/wiki/File:Walmart_spark_(2025).svg  
- LEGO: https://commons.wikimedia.org/wiki/File:Lego_logo.svg  

Export SVG → **512×512 PNG with transparent background** before placing in `sources/`.

## Do not use WordPress Media Library

The MU-plugin only loads from **`mu-plugins/logos/`**, not Media Library URLs.

## Trademark

Logos are trademarks of their owners. Use only for referral / partner presentation per each brand’s guidelines.
