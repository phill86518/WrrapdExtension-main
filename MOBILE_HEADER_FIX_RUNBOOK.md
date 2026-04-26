# Wrrapd Mobile Header Fix — Full Runbook
**Date fixed:** 2026-04-26  
**Fixed by:** Cursor AI agent session  
**Symptoms fixed:**
- Hamburger menu showing on mobile instead of nav links
- Google/Amazon sign-in buttons still visible after logging in
- Account/Logout not showing after login
- Footer sitting halfway up the page on `/welcome/` and `/my-orders/`

---

## Root Causes (all three had to be fixed together)

### 1. Missing hidden input fields for login-status JS
The active Elementor header template (`post ID 6078`, "Elementor Header #6078") contains an HTML widget with JavaScript that reads two hidden `<input>` fields to decide whether to show or hide Google/Amazon sign-in buttons:

```html
<input type="hidden" id="wrrapd-user-login-status" value="1">
<input type="hidden" id="wrrapd-user-first-name" value="John">
```

**Nothing was outputting these inputs server-side.** Without them, the JS always fell through to the "show login buttons" branch — so Google/Amazon buttons appeared even after login.

### 2. Elementor nav-menu widget missing `dropdown:none` setting
The nav-menu widget in the header template had no `dropdown` setting, so Elementor defaulted to `"tablet"` — collapsing the nav to a hamburger on all screens narrower than the tablet breakpoint. CSS overrides could not reliably fight this because Elementor's own JavaScript re-applied the hamburger state after page load.

### 3. Elementor CSS was file-cached (`status:file`)
Elementor was storing the generated CSS for post 6078 as a file on disk (not inline). This meant any CSS changes to the theme custom CSS or the template were ignored — the old cached CSS file was always served. This made it look like CSS fixes had no effect for hours.

---

## The Fix — Three Components

### Component 1: Plugin `wrrapd-member-header` (active)
**Location:** `wp-content/plugins/wrrapd-member-header/wrrapd-member-header.php`  
**Version at time of fix:** 2.1.0

This plugin does four things:

**a) Outputs the hidden login-status inputs on every page** (via `wp_body_open`, priority 1):
```php
add_action('wp_body_open', function () {
    $logged_in = is_user_logged_in() ? '1' : '0';
    $first_name = '';
    if (is_user_logged_in()) {
        $user = wp_get_current_user();
        $first_name = esc_attr($user->first_name ?: $user->display_name ?: $user->user_login);
    }
    echo '<input type="hidden" id="wrrapd-user-login-status" value="' . $logged_in . '">';
    echo '<input type="hidden" id="wrrapd-user-first-name" value="' . $first_name . '">';
}, 1);
```

**b) Fixes footer on welcome + my-orders pages** (page IDs 5576 and 6276):
```css
body.page-id-5576,
body.page-id-6276 {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}
body.page-id-5576 #page, body.page-id-6276 #page,
body.page-id-5576 .site, body.page-id-6276 .site,
body.page-id-5576 #content, body.page-id-6276 #content,
body.page-id-5576 main, body.page-id-6276 main {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
}
body.page-id-5576 .elementor-location-footer,
body.page-id-6276 .elementor-location-footer {
  margin-top: auto !important;
}
```

**c) Hides hamburger on mobile:**
```css
@media (max-width: 900px) {
  .elementor-location-header .elementor-menu-toggle {
    display: none !important;
  }
}
```

**d) Hides Google/Amazon buttons when logged in** (both by URL attribute and by Elementor data-id):
```css
body.logged-in .elementor-location-header a[href*="loginSocial=google"],
body.logged-in .elementor-location-header a[href*="amazon.com/ap/oa"],
body.logged-in .elementor-location-header a[href*="/auth/amazon/callback"] {
  display: none !important;
}
body.logged-in div[data-id="69de726e"],
body.logged-in div[data-id="2ca99876"] {
  display: none !important;
}
```
- `data-id="69de726e"` = Google sign-in button widget
- `data-id="2ca99876"` = Amazon sign-in button widget

---

### Component 2: `dropdown:none` in Elementor header template JSON
**Table:** `dfy_postmeta`  
**post_id:** `6078`  
**meta_key:** `_elementor_data`

The nav-menu widget settings JSON had `"sticky_parent":"yes"}` with no dropdown key.  
**Changed to:** `"sticky_parent":"yes","dropdown":"none"}`

This tells Elementor Pro's nav-menu widget to **never collapse to hamburger on any screen size.** It is a native Elementor setting, so it takes effect before any CSS or JS runs.

**SQL to re-apply if lost:**
```sql
UPDATE dfy_postmeta
SET meta_value = REPLACE(
  meta_value,
  '"sticky_parent":"yes"},"elements":[],"widgetType":"nav-menu"',
  '"sticky_parent":"yes","dropdown":"none"},"elements":[],"widgetType":"nav-menu"'
)
WHERE post_id=6078 AND meta_key='_elementor_data';
```

**Then delete the CSS cache:**
```sql
DELETE FROM dfy_postmeta WHERE post_id=6078 AND meta_key='_elementor_css';
```

---

### Component 3: Delete Elementor file-based CSS cache
Elementor's `_elementor_css` for post 6078 had `"status":"file"` — meaning it was serving a cached CSS file from disk, ignoring all DB changes.

**SQL that cleared it:**
```sql
DELETE FROM dfy_postmeta WHERE post_id=6078 AND meta_key='_elementor_css';
```

After this, Elementor regenerates CSS fresh on the next page load, picking up the `dropdown:none` setting.

---

## Current State Snapshot (2026-04-26)

| Item | Value |
|---|---|
| Active theme | `hello-elementor` |
| Theme custom CSS post | ID `6064` |
| Active Elementor header template | ID `6078` ("Elementor Header #6078") |
| Nav-menu widget `dropdown` setting | `none` |
| Google button Elementor widget `data-id` | `69de726e` |
| Amazon button Elementor widget `data-id` | `2ca99876` |
| Hidden input JS reads | `#wrrapd-user-login-status`, `#wrrapd-user-first-name` |
| Welcome page ID | `5576` |
| My-orders page ID | `6276` |
| Plugin providing the fix | `wrrapd-member-header` v2.1.0 (must be active) |

---

## Recovery Checklist (if it breaks again)

### Symptom: Google/Amazon buttons show after login
1. Go to **WP Admin → Plugins** — confirm `wrrapd-member-header` is **Active**. If not, activate it.
2. If active but still broken: view page source and search for `wrrapd-user-login-status`. If missing, the `wp_body_open` hook is not firing — check theme supports it (`hello-elementor` does).

### Symptom: Hamburger menu reappears on mobile
1. First check: is `wrrapd-member-header` active? It contains the hamburger CSS hide.
2. If yes and hamburger is still there: the `dropdown:none` was likely overwritten by someone saving the header template in Elementor editor. Re-run the SQL above.
3. After SQL: run `DELETE FROM dfy_postmeta WHERE post_id=6078 AND meta_key='_elementor_css';` then purge W3 Total Cache.

### Symptom: CSS changes have no visible effect
Elementor regenerated a file-based CSS cache. Run:
```sql
DELETE FROM dfy_postmeta WHERE post_id=6078 AND meta_key='_elementor_css';
```
Then purge W3 Total Cache.

### Symptom: Footer halfway up on /welcome/ or /my-orders/
Check `wrrapd-member-header` is active — it contains the footer flex fix. If active and still broken, the page IDs may have changed. Check with:
```sql
SELECT ID, post_name FROM dfy_posts WHERE post_name IN ('welcome','my-orders');
```
Update the CSS in the plugin file to match the correct IDs.

---

## What NOT to do
- **Do not edit header template `6078` in the Elementor visual editor** without immediately re-running the `dropdown:none` SQL afterward. The editor will reset it to `"tablet"`.
- **Do not deactivate `wrrapd-member-header`** — it provides the hidden inputs, footer fix, hamburger hide, and social-button hide all at once.
- **Do not add large JS/CSS blocks to `ihaf_insert_header`** (Insert Headers and Footers plugin) — this caused a full site outage earlier.
- **Do not run `git pull` on the GCP VM** per existing repo rules.
