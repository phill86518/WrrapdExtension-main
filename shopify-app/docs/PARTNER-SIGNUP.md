# Shopify Partner account — Wrrapd Inc.

Register under **Wrrapd Inc.** only. Use **admin@wrrapd.com**. Do not put any personal name on the Partner account, app listing, or support fields.

## 1. Create the Partner organization

1. Open [https://partners.shopify.com/signup](https://partners.shopify.com/signup).
2. Sign up with **admin@wrrapd.com** (Google Workspace or Shopify account for that mailbox).
3. Organization / business name: **Wrrapd Inc.**
4. Country: **United States**.
5. When Shopify asks for a contact name, use a role title only if a person field is required (e.g. **App Support**), never a personal legal name. Prefer leaving display name as **Wrrapd Inc.** wherever the form allows.
6. Accept the Partner Program Agreement.

## 2. Organization profile (stealth checklist)

In Partner Dashboard → Settings → Organization:

| Field | Value |
|---|---|
| Organization name | Wrrapd Inc. |
| Email | admin@wrrapd.com |
| Phone | Wrrapd main line (same as wrrapd.com) |
| Address | 7901 4th St N, Ste 300 |
| City | St. Petersburg |
| State | FL |
| ZIP | 33702 |
| Country | United States |

Confirm no personal name appears in “Developer name,” “Contact,” or invoice contact fields.

## 3. Create the app

1. Partner Dashboard → **Apps** → **Create app**.
2. Choose **Create app manually** (or start from this repo with Shopify CLI — see `../README.md`).
3. App name: **Wrrapd Gift Wrap & Delivery**.
4. App URL / redirect URLs: filled by CLI when you run `shopify app dev` / deploy (see build plan).
5. App type: **Public** (App Store) when ready for review; keep **Custom** only for a pilot store.

## 4. App listing contact (before submit)

| Field | Value |
|---|---|
| Developer name | Wrrapd Inc. |
| Support email | help@wrrapd.com |
| Support phone | Wrrapd main line |
| Privacy policy URL | https://wrrapd.com/privacy-policy/ |
| Homepage | https://wrrapd.com/ |
| Support / FAQ | https://wrrapd.com/ (or dedicated help page when live) |

## 5. After Partner signup

1. Install Shopify CLI on the GCP VM or a secure workstation.
2. `cd /home/phill/wrrapd-GCP/shopify-app && shopify app config link` (link to the Partner app).
3. Follow [BUILD-PLAN.md](./BUILD-PLAN.md) for scopes, extensions, and App Store review.

## Do not

- Register with a personal Gmail or personal legal name as developer.
- Put contractor pay, WrapStar/JoyRider rates, or internal ops language in any Partner or App Store field.
- Share Partner login credentials outside Wrrapd Inc. admin accounts.
