# Wrrapd website golden — November 2026

Recorded **Thursday, 19 November 2026** on the GCP VM (`/home/phill/wrrapd-GCP`) after the SiteGround disk cleanup (Updraft kept May 5 only; All-in-One backups cleared) and with the shopper site stable at the Oct 25 birthday / contact / landings state. Pushed to `origin/main`.

This is **WEBSITE LATEST GOLDEN VERSION**. Extension and Command Center stay on the 19 September 2026 tags until someone names a newer one for those.

| Spoken name | Git tag | What it freezes |
|---|---|---|
| **WEBSITE LATEST GOLDEN VERSION** | `golden-website-2026-11-19` | wrrapd.com as of 19 Nov 2026 (birthday picks, contact 1.2.2, post-outage stable) |
| Extension (unchanged) | `golden-extension-2026-09-19` | Chrome extension 3.0.10 |
| Admin (unchanged) | `golden-admin-2026-09-19` | Tracking Command Center |

Older website tags `golden-website-2026-10-22` and `golden-website-2026-09-19` are historical. Use them only if someone asks for those dates.

## What this freeze covers

- **Header / footer wordmarks** stay `uploads/2025/03/Wrrapd_f-Logo-800-x-458-px.png`. Social banners are copy-paste only (`docs/SOCIAL-SHARE-CARDS.md`). Never rewrite live logos.
- **MU build (view-source):** `WRRAPD_MU_BUILD 2026-10-20-shopify-legal`.
- **Landings build:** `WRRAPD_LANDINGS_BUILD 2026-10-25-landings-v46-bday` — idea cards with store logos; Top Gifting Choices lede follows the active occasion (birthdays → toys / electronics / gaming).
- **Seasonal / hot gifts:** `wrrapd-campaigns.json` + `wrrapd-seasonal-campaigns.php` prefer occasion categories and stay on the theme pool when it has enough real product photos; weekly rotation.
- **Contact Hub 1.2.2** — live `plugins/wrrapd-contact-hub/wrrapd-contact-hub.php` (repo `wordpress/wrrapd-contact-hub-plugin.php`): flat navy Fraunces hero, Pros pills, homepage-matched header logo sizing.
- **X cards:** `wrrapd-x-card-force.php` **force-13** / v2.4.0 — humans untouched; bots get OG cards. Do not reactivate one-shot purge plugins (`wrrapd-cache-purge-once`, `wrrapd-xcard-safe-once`).
- **Chrome extension on main (not a new extension golden tag):** `3.0.15`, CWS item `lobngnjcjeimefihnobdmocicopikoip`. Site nudge `$latest_version` remains **3.0.14** until 3.0.15 is approved on that same item.
- **SiteGround StartUp (10 GB):** after Nov 19 cleanup, web space ~**3.5 GB / 35%**. Keep one Updraft set (`backup_2026-05-05-…`); leave `ai1wm-backups` empty of `.wpress` files.
- **Code freeze commit:** `d423d48` *Match the repo Contact Hub to the approved live page and log Oct 25 deploys.* plus this documentation commit.

## Outage note (do not regress)

Oct 24–25 2026: live-only plugin `wrrapd-xcard-safe-once` called `w3tc_flush_all()` on `plugins_loaded` and took down every uncached page. Never add a plugin that flushes caches on every load. See `docs/WORDPRESS-SITE-EDITS-LOG.md` (2026-10-25).

## Restore the website (GCP VM — never `git pull`)

```bash
cd /home/phill/wrrapd-GCP
git fetch origin --tags
git checkout golden-website-2026-11-19 -- \
  wordpress/ \
  docs/SOCIAL-SHARE-CARDS.md \
  docs/WORDPRESS-SITE-EDITS-LOG.md \
  .cursor/rules/wrrapd-social-banners-only.mdc \
  .cursor/rules/wrrapd-latest-golden-versions.mdc \
  .cursor/rules/wrrapd-edit-existing-not-new-files.mdc \
  GOLDEN-VERSIONS-2026-11-19.md
```

Then paste any changed MU / Contact Hub PHP to SiteGround and flush Speed → Caching. Confirm view-source has `2026-10-20-shopify-legal` and landings `2026-10-25-landings-v46-bday`. Do not `git pull` on this VM.
