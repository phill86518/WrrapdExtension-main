# Retailer wheel logos (100×100 circular PNGs)

These files are served from the same directory as the MU-plugin on the VM:

- Copy this entire `logos/` folder next to `wrrapd-orders-bridge.php` under `wp-content/mu-plugins/logos/`.

Regenerate from public favicon endpoints (requires `curl` and either ImageMagick `convert` **or** `python3` with Pillow — see `to_circle.py`):

```bash
cd /path/to/wrrapd-GCP/wordpress/logos
chmod +x build-logos.sh to_circle.py
./build-logos.sh
```

The bridge uses `*.png` (512×512 circular) for these slugs when present: `amazon`, `target`, `ulta`, `lego`, `walmart`, `nordstrom`, `kohls`, `sephora`, `etsy`, `bestbuy`. Drop hi-res art in **`sources/{slug}.{png,jpg,webp}`** and run `./build-logos.sh`. See **`LOGOS-SOURCES.md`** for brand download links. Otherwise it falls back to Google’s favicon CDN.

Trademark notice: logos are trademarks of their owners. Use only in accordance with each brand’s guidelines.
