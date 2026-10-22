# Wrrapd website golden — October 2026

Recorded **Thursday, 22 October 2026** on the GCP VM (`/home/phill/wrrapd-GCP`) after the shopper header and footer wordmarks were restored, then pushed to `origin/main`.

This is **WEBSITE LATEST GOLDEN VERSION**. Extension and Command Center stay on the 19 September 2026 tags until someone names a newer one for those.

| Spoken name | Git tag | What it freezes |
|---|---|---|
| **WEBSITE LATEST GOLDEN VERSION** | `golden-website-2026-10-22` | wrrapd.com after the 22 Oct logo restore |
| Extension (unchanged) | `golden-extension-2026-09-19` | Chrome extension 3.0.10 |
| Admin (unchanged) | `golden-admin-2026-09-19` | Tracking Command Center |

Older website tag `golden-website-2026-09-19` is historical. Use it only if someone asks for 19 September.

## What “restored” means

- Header and footer use `https://wrrapd.com/wp-content/uploads/2025/03/Wrrapd_f-Logo-800-x-458-px.png`.
- Live homepage view-source includes `WRRAPD_MU_BUILD 2026-10-20-shopify-legal`.
- `wordpress/wrrapd-x-card-force.php` may set social `og:image` tags. It must not rewrite visible logo URLs. Hire posts paste a banner instead. See `docs/SOCIAL-SHARE-CARDS.md`.

## Restore the website (GCP VM — never `git pull`)

```bash
cd /home/phill/wrrapd-GCP
git fetch origin --tags
git checkout golden-website-2026-10-22 -- wordpress/ docs/SOCIAL-SHARE-CARDS.md docs/WORDPRESS-SITE-EDITS-LOG.md .cursor/rules/wrrapd-social-banners-only.mdc .cursor/rules/wrrapd-latest-golden-versions.mdc GOLDEN-VERSIONS-2026-10-22.md
```

Then paste any changed MU PHP to SiteGround `mu-plugins/` and flush Speed → Caching. Do not `git pull` on this VM.
