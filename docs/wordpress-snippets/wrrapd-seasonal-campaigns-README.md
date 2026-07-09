# Wrrapd seasonal campaigns

Auto-themed homepage hero + **Hot gifts** rail. Dates follow the **occasion ticker** (`wrrapd-occasion-ticker.html`). Core Elementor copy about gift wrapping & flowers is unchanged.

## Rules (important)

| Rule | Behavior |
|------|----------|
| **Lead time** | Holiday theme starts **21 days before** the holiday |
| **Grace period** | Theme stays **4 days after** the holiday (late gifters) |
| **Next holiday** | Cannot start until the **previous holiday’s grace period ends** (e.g. Fourth of July waits until **June 26** in 2026, not mid-June) |
| **Christmas** | Starts **November 12** (day after Veterans Day)—not 21 days before Dec 25 |
| **Overlap priority** | **Christian** holidays beat **American**, then **other** (Hanukkah, Chinese New Year). Example: Christmas beats Thanksgiving when both windows overlap |
| **Gap periods** | After grace, if the **next** holiday is **more than 21 days away**: generic theme — **Jul–Sep:** weddings/anniversaries; else alternating **birthdays** / **corporate gifting** |

## Homepage layout

| What | Where |
|------|--------|
| Seasonal **first line only** | Replaces Elementor **`6466f5b`** — below red divider, right of flower photo |
| Old second promo line | **`936189a`** hidden |
| Hot gifts | Grid under headline, same column as **`6466f5b`** |
| Gift wrap + flowers | **`5f358ea`** / **`4b29ae5`** unchanged |

Typography: **Fraunces** throughout (matches existing seasonal promo CSS).

## 2026 example (Father’s Day → Fourth of July)

| Dates | Theme |
|-------|--------|
| May 31 – **Jun 25** | Father’s Day (holiday Jun 21 + 4-day grace) |
| **Jun 26** – Jul 8 | Fourth of July |
| Jul 9 – Aug 16 | Generic **weddings** (summer gap) |
| Aug 17 – Sep 11 | Labor Day |
| Nov 5 – Nov 11 | Thanksgiving only |
| **Nov 12** – Dec 29 | **Christmas** (overrides overlapping Thanksgiving) |

## Files (upload to `wp-content/mu-plugins/`)

- `wrrapd-campaigns.json` — copy + hot gifts per `holiday_key`
- `wrrapd-seasonal-campaigns.php` — calendar engine
- `wrrapd-seasonal-campaigns.css` — themes (July 4 red/white/blue)
- `wrrapd-orders-bridge.php` — loader

## Edit copy

Edit **`wrrapd-campaigns.json`** — match `holiday_key` to the calendar (`fathers-day`, `july-fourth`, `christmas`, `generic-weddings`, etc.). No fixed `starts`/`ends` in JSON anymore; PHP computes windows.

## Admin email

15 days before the **next window start** → `admin@wrrapd.com` with suggested copy from JSON.

## Verify

View source → `2026-06-20-seasonal-hero-fix-v3`. Headline should appear inside widget **6466f5b**, not above the red line.
