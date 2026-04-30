# Alternative: External Gift Flow (wrrapd.com hosted)

**Purpose:** Backup strategy if Amazon (or other retailers) challenge DOM injection.  
All heavy logic — AI generation, uploads, payments, address collection, T&Cs — lives on Wrrapd's own domain. The Chrome extension becomes a lightweight trigger only.

---

## Why This Approach

- **Lower risk** of retailer interference or extension takedown.
- **Full control** — analytics, upsells, branding, A/B testing.
- **Easier to extend** — saved designs, order tracking, multi-retailer support.
- **Still very convenient** — many shoppers already tab-switch during purchases.
- **Trade-off:** one extra tab click vs. the current fully in-Amazon modal.

---

## Recommended Flow

### 1 — Extension Trigger (light and non-intrusive)

On Amazon product page or cart, show a clean optional banner or floating button:

> *"Want professional gift wrapping + flowers instead of a basic bag?"*

User clicks → Extension opens `wrrapd.com/gift` in a new tab **or** injects a large centered overlay/iframe on the retailer page (still hosted on Wrrapd's domain).

URL params pre-populate the experience instantly:

```
https://wrrapd.com/gift?asin=B0ABC123&title=...&image=...&price=...
```

### 2 — Full Experience on wrrapd.com

Make this page look and feel like Amazon's gift options + the current customization modal combined.

| Section | Content |
|---------|---------|
| Header | Amazon-style nav bar with "Back to Amazon" button |
| Product preview | Auto-loaded from ASIN via URL params |
| Customization | AI design, upload, flower add-ons — identical to current modal |
| Shipping instructions | "Ship to Wrrapd Hub" address pre-filled, one-click copy |
| Payment | Stripe checkout for wrapping/flowers fee (separate from Amazon order) |
| CTA | "Continue to Amazon to Complete Purchase" |

### 3 — Making it feel the same

- **Design:** Amazon's colour palette (orange accents, clean sans-serif, card layouts, progress indicators).
- **Language:** Mirror Amazon's wording — "Choose gift options", "Add your message", "Review shipping".
- **Speed:** Pre-load from extension via URL params; skeleton screens; progressive loading.
- **Persistent pill:** "Continue Shopping on Amazon" always visible.

---

## Technical Options

| Option | Notes |
|--------|-------|
| New tab | Simplest and safest — works reliably across all retailers |
| Injected overlay/iframe | Load `wrrapd.com` inside a styled dialog on the Amazon page — more "in-place" but use sparingly |
| PWA | Make `wrrapd.com` installable for repeat customers |

---

## Page Wireframe & UI Copy

### Browser tab / header
```
Wrrapd – Professional Gift Wrapping + Flowers
```
*(Amazon orange accent used sparingly)*

---

### Top Navigation Bar
```
[Wrrapd logo]  Jacksonville • Dallas    [Search: "Search your Amazon order or ASIN"]    [Back to Amazon ▶]  [Account]
```

---

### Step 1 — Your Item
```
[Large product image — auto-loaded from ASIN]
Product Title (pulled from Amazon)
Price: $XX.XX
Quantity: 1
★ "You're upgrading from Amazon's basic gift bag"  ← small badge
```

---

### Step 2 — Choose Your Wrapping *(mirrors Amazon gift options)*

Grid of thumbnails (4–6 visible):

| Option | Detail |
|--------|--------|
| **AI Magic Wrap** | "Generate with AI" → side panel: *"Birthday for mom, elegant florals…"* |
| **Upload Your Design** | Drag & drop or file button |
| **Premium Patterns** | Pre-made elegant options with previews |
| **Luxury Paper + Ribbon** | +$X upgrade |

**Gift message textarea** (exactly like Amazon's):
```
"Write your message here (max 500 characters)"
[Preview box — shows how it will look on the card]
```

---

### Step 3 — Add Flowers *(Amazon "Frequently bought together" style)*

```
Add Fresh Flowers?

[Roses & Lilies — $29.99]   [Sunflowers & Greenery — $24.99]   [Luxury Orchids — $39.99]
        ☐ Add                         ☐ Add                              ☐ Add
```

---

### Step 4 — Shipping to Wrrapd Hub

```
Ship your Amazon order to our gift hub

  Wrrapd Jacksonville Hub
  1234 Gift Lane, Suite 200
  Jacksonville, FL 32256

  [📋 Copy Address]  ← big orange button

Instructions:
  1. Complete your purchase on Amazon.
  2. Use the address above at Amazon checkout.
  3. Forward your Amazon order confirmation to orders@wrrapd.com
     (or paste your order # in the box below).
```

---

### Step 5 — Review & Pay Wrrapd

```
Your Wrrapd Service Total
─────────────────────────
Professional Wrapping     $14.99
Flowers                   $29.99
─────────────────────────
Total                     $44.98

[Stripe payment form — card / Apple Pay / Google Pay]

╔══════════════════════════════════════════════════╗
║   Pay Wrrapd & Get Ready on Amazon  →            ║  ← big orange button
╚══════════════════════════════════════════════════╝
```

---

### After Payment — Success Screen

```
✅ Thank you! Your gift is reserved.
Order Reference: WR-XXXXXX

Next steps:
  1. Finish purchase on Amazon using our hub address
         [ Go to Amazon → ]        ← opens amazon.com in new tab
  2. Forward order confirmation to orders@wrrapd.com
  3. We'll wrap + deliver within 48 hrs of receiving the package

[ Track My Gift ]
```

---

### Footer / Trust Elements

- "Secure checkout powered by Stripe"
- Amazon Associate disclosure (when affiliate links are added)
- Privacy & Terms link

---

## Extension Integration Detail

When user clicks the trigger on Amazon, open with URL params:

```js
const params = new URLSearchParams({
  asin:  detectedAsin,
  title: productTitle,
  image: productImageUrl,
  price: productPrice,
  qty:   quantity,
  src:   'amz-extension',
});
window.open(`https://wrrapd.com/gift?${params}`, '_blank');
```

Floating persistent element injected on Amazon while the gift tab is open:

```
[ ↩ Back to your Wrrapd gift order ]   [ Minimize ]
```

---

## Current Status

This is a **documented contingency plan** — the current in-page modal flow is live and working.  
Implement this path if:
- Amazon pushes back on DOM injection or Manifest V3 restrictions tighten.
- Extension store review flags the in-page overlay approach.
- A retailer (Target, LEGO, Ulta) blocks content-script interaction.

*Saved: 2026-04-30*
