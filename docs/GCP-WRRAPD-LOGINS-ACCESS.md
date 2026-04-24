# GCP: `wrrapd-logins` vs `wrrapd-chrome-extension` — grouping and access

## Facts (read once)

1. **A GCP project cannot live “inside” another project.** Projects are siblings. What you *can* do is put both under the same **Organization** → **Folder** (looks like a group in the console), or **merge work** by moving OAuth clients / APIs into one project (manual migration).
2. **Same Google identity (`admin@wrrapd.com`)** can have **Owner** on both projects today—that already gives *you* full console access to both. “Giving the AI full access” really means: **whatever machine runs agents** (`gcloud`, deploy scripts, Cursor terminal) must use credentials that **IAM allows** on `wrrapd-logins`.
3. **Never commit** service account JSON keys or paste private keys into chat. Use **Workload Identity** where possible; otherwise a **local key** path that is **gitignored**.

---

## Option A — You only need *your* laptop / VM to manage both projects

Do this once per machine.

1. Install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (`gcloud`).
2. In a terminal:
   ```bash
   gcloud auth login
   ```
   Complete the browser flow as **`admin@wrrapd.com`**.
3. List projects you can see:
   ```bash
   gcloud projects list
   ```
   Confirm **`wrrapd-logins`** and **`wrrapd-chrome-extension`** appear.
4. Switch active project for commands:
   ```bash
   gcloud config set project wrrapd-logins
   ```
5. Sanity check:
   ```bash
   gcloud projects describe wrrapd-logins
   ```

**Optional — two configs (recommended so you don’t confuse projects):**

```bash
gcloud config configurations create wrrapd-logins --no-activate
gcloud config configurations activate wrrapd-logins
gcloud config set project wrrapd-logins
gcloud config set account admin@wrrapd.com

gcloud config configurations create wrrapd-chrome-extension --no-activate
gcloud config configurations activate wrrapd-chrome-extension
gcloud config set project wrrapd-chrome-extension
```

Switch anytime: `gcloud config configurations activate wrrapd-logins`.

---

## Option B — “Group” the two projects in the console (Organization folder)

Requires a **Google Cloud Organization** (often tied to Google Workspace). If you only have “No organization,” this section may be unavailable until you enable an org.

1. In GCP Console: **IAM & Admin** → **Manage resources** (or **Cloud Resource Manager**).
2. **Create folder** (e.g. `Wrrapd`).
3. **Move** both projects into that folder (drag/drop or **Migrate** per Google’s UI).

This does **not** merge IAM or billing automatically; it is **navigation and policy** grouping.

---

## Option C — Give a **service account** from `wrrapd-chrome-extension` access to `wrrapd-logins`

Use this when automation (VM, GitHub Actions, Cloud Build) should touch **Logins** APIs without using your personal password.

### C1 — Create the service account (in the *extension* project or in *logins*)

Example: create in **`wrrapd-chrome-extension`**:

1. Console → select project **`wrrapd-chrome-extension`**.
2. **IAM & Admin** → **Service Accounts** → **Create service account**.
3. Name: e.g. `wrrapd-cross-project-automation`; copy the **email**, e.g.  
   `wrrapd-cross-project-automation@wrrapd-chrome-extension.iam.gserviceaccount.com`.

### C2 — Grant that SA access on `wrrapd-logins`

1. Switch console project to **`wrrapd-logins`** (project picker).
2. **IAM & Admin** → **IAM** → **Grant access**.
3. **New principals**: paste the **service account email** from C1.
4. **Role**: start with what you actually need, e.g.:
   - **`Editor`** — broad write access to most resources (common for small teams).
   - For “read-only audits”: **`Viewer`** + specific roles (e.g. `roles/iam.serviceAccountViewer`).
   - **Avoid `Owner`** for automation unless you truly need IAM and billing control from that SA.

5. Save.

### C3 — Use the SA on the VM (key-based last resort)

1. **IAM & Admin** → **Service Accounts** → select the SA → **Keys** → **Add key** → JSON.
2. Store the file on the server **outside the git repo**, e.g. `/home/phill/.config/gcloud/sa-wrrapd-logins.json`, mode `600`.
3. For `gcloud`:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/home/phill/.config/gcloud/sa-wrrapd-logins.json"
   gcloud auth activate-service-account --key-file="$GOOGLE_APPLICATION_CREDENTIALS"
   gcloud config set project wrrapd-logins
   ```

Prefer **Workload Identity Federation** over long-lived keys when you outgrow this.

---

## Option D — Give **another human** full access to `wrrapd-logins`

1. Project picker → **`wrrapd-logins`**.
2. **IAM & Admin** → **IAM** → **Grant access**.
3. Add their **Google account email**.
4. Role: **`Owner`** (full) or **`Editor`** (almost full; cannot change IAM/billing the same way).  
   Use **Owner** only for people you trust with billing and IAM.

---

## What “full access for Cursor” actually means

- **Cursor / Copilot does not sign into GCP by itself.** The agent uses **your** environment: repo files, terminal, MCP tools you configured.
- So you either:
  - Run **`gcloud auth login`** as `admin@wrrapd.com` on the machine where Cursor runs (Option A), or  
  - Provide a **service account** with IAM on `wrrapd-logins` and `GOOGLE_APPLICATION_CREDENTIALS` in that environment (Option C).

Do **not** put service account keys in the GitHub repo.

---

## Bridging `wrrapd-chrome-extension` (main) with `wrrapd-logins`

You do **not** merge GCP projects. You **link** them in one or more of these ways.

### Step 1 — Same billing (optional but common)

1. Console → **Billing** → **My billing account** → **Account management**.
2. Confirm **both** projects **`wrrapd-chrome-extension`** and **`wrrapd-logins`** appear under the same billing account (or link them).  
   This is only for **who pays**; it does not move OAuth clients.

### Step 2 — Same human owner (you already have this)

1. Project picker → **`wrrapd-chrome-extension`** → **IAM & Admin** → **IAM** → confirm **`admin@wrrapd.com`** is **Owner** (or **Editor**).
2. Repeat for **`wrrapd-logins`**.

### Step 3 — Keep OAuth in `wrrapd-logins` (recommended default)

Leave **Google OAuth client IDs** (and consent screen) in **`wrrapd-logins`**. Your **main** app (WordPress on the VM, etc.) only needs the **Client ID** and **Client secret** pasted into **Nextend** (or whatever plugin). No VM is required in `wrrapd-logins`.  
That is already a valid “bridge”: **main app ↔ Google** using credentials **stored** in the Logins project.

### Step 4 — Let the *main* project’s automation touch the *Logins* project (optional)

Use this if a **service account** in **`wrrapd-chrome-extension`** must run `gcloud` or APIs against **`wrrapd-logins`** (CI, VM script, etc.).

1. Console → **`wrrapd-chrome-extension`** → **IAM & Admin** → **Service accounts** → **Create** (e.g. `wrrapd-cross-project`).
2. Copy the full **service account email** (ends in `...iam.gserviceaccount.com`).
3. Project picker → **`wrrapd-logins`** → **IAM & Admin** → **IAM** → **Grant access**.
4. **New principals** = that service account email. Role = **`Editor`** (tighten later to specific roles if you prefer).
5. On the machine that runs automation: authenticate as that SA (key file **outside git**, or Workload Identity Federation).

#### Step 4 expanded — when you need it, and what it actually does

**You can skip Step 4 entirely if:**

- Only **humans** (`admin@wrrapd.com`) manage GCP in the browser, and  
- **WordPress / Nextend** only needs the **OAuth Web Client ID + secret** from `wrrapd-logins` (pasted in the plugin).  

That flow does **not** require a service account or Step 4.

**You need Step 4 when something automated** must act on **`wrrapd-logins`** without a person logging in—for example:

- A **script on the Wrrapd VM** that runs `gcloud` to rotate secrets, list APIs, or deploy something **into** the Logins project.  
- **GitHub Actions** or another CI that calls Google APIs against Logins.  
- A **Node** or **Python** job that uses the Google client libraries with **application default credentials** tied to a service account.

**Why a “service account” instead of your email?**

- Your Google account is for **people**.  
- A **service account** is a robot identity like `something@wrrapd-chrome-extension.iam.gserviceaccount.com`.  
- By default, that robot only has permissions **inside** the project where it was created (`wrrapd-chrome-extension`).  
- **Step 4 adds that same robot as a member of `wrrapd-logins`**, so Google knows: “this identity is allowed to do X in the Logins project too.”

That is the real “bridge” for automation: **cross-project IAM**, not billing (you already linked billing).

**Detailed click path — Part A (create the robot in the main project)**

1. Project picker → **`wrrapd-chrome-extension`**.  
2. Left menu → **IAM & Admin** → **Service accounts**.  
3. Top: **+ Create service account**.  
4. **Service account name:** e.g. `wrrapd-logins-automation` (any name you like).  
5. **Service account ID** auto-fills; optional description: “Cross-project access for Logins.”  
6. **Create and continue** → **Grant this service account access to the project** (optional): you can add a role **here** only for the *chrome-extension* project, or skip and finish—what matters for Logins is Part B.  
7. **Done**. Open the new row → copy the **email** (full string ending in `iam.gserviceaccount.com`).

**Detailed click path — Part B (allow that robot on the Logins project)**

1. Project picker → **`wrrapd-logins`**.  
2. **IAM & Admin** → **IAM**.  
3. **Grant access** (or **+ Add**).  
4. **New principals:** paste the **service account email** from Part A (not `admin@wrrapd.com`).  
5. **Select a role:** start with **Editor** on a small team (broad write access except billing/IAM ownership). For tighter security later, replace with only what you need (e.g. `roles/secretmanager.admin` if the script only touches Secret Manager).  
6. **Save**.

**Part C — use the robot on a machine (only when you actually run automation)**

- **Preferred long-term:** [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation) (no JSON key on disk).  
- **Common short-term:** **IAM & Admin** → **Service accounts** → open the SA → **Keys** → **Add key** → **JSON**. Store the file on the server **outside the repo**, `chmod 600`, never commit. Set `GOOGLE_APPLICATION_CREDENTIALS` to that path, or run `gcloud auth activate-service-account --key-file=...`, then `gcloud config set project wrrapd-logins` for commands that target Logins.

**Summary:** Step 4 is **optional cross-project permission for automated jobs**. Same billing and same human Owner do **not** replace this; the **service account** is a separate principal until you grant it access on `wrrapd-logins`.

### Step 5 — Optional: one folder in an Organization (cosmetic + policy)

If you have a **Google Cloud Organization**: **Manage resources** → create a folder **Wrrapd** → **move** both projects into it. They stay two projects; the console groups them.

### Step 6 — Optional: move OAuth into the main project (only if you insist on “one project only”)

1. In **`wrrapd-chrome-extension`**: **APIs & Services** → **Credentials** → **Create OAuth client ID** (same type as today: Web application).
2. Copy **Authorized JavaScript origins** and **Authorized redirect URIs** from the **old** client in **`wrrapd-logins`** (Nextend’s settings page lists the redirect URI exactly).
3. Paste those URIs into the **new** client; create; copy new Client ID + secret into **WordPress → Nextend → Google** (save).
4. Test Google login. When stable, **disable or delete** the old client in **`wrrapd-logins`** to avoid confusion.

Do not delete the old client until the new one works.

---

## Related

- [INTEGRATION-MAP.md](INTEGRATION-MAP.md) — how OAuth / WordPress / extension relate conceptually.
