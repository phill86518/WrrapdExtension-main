# Wrrapd Project - Overall Development Workflow

**Monorepo:** One Git repository (e.g. [`phill86518/WrrapdExtension-main`](https://github.com/phill86518/WrrapdExtension-main/)) contains both `extension/` and `backend/`. Clone once; commit/push from the repo root on GCP.

This is a full-stack project with two main parts:

## 1. Chrome Extension (`extension/` folder on GCP + local Windows copy)
- Manifest V3 Chrome Extension.
- `content.js` is the large monolithic file (~579 KB) we are actively refactoring.
- The **live testable version** is on the user's **Windows PC** (loaded as "Load unpacked" in Chrome).
- Files on Windows are used for real-time testing on Amazon.com.

## 2. Python Backend (`backend/` folder on GCP)
- Real, production Flask server (`app.py` and related files).
- This is the live backend that the Chrome Extension calls.

## Development Workflow Rules (Very Important)
- Refactoring and new code development happens primarily on **GCP**.
- After making changes on GCP (especially to `extension/`), the user will:
  1. Commit and push to GitHub from GCP.
  2. Pull the changes on their **Windows PC**.
  3. Test the updated extension in Chrome.
- GCP will become "bulkier" with new modules, API endpoints, and helper files.
- The Windows PC version must remain functional for live testing at all times.
- Never suggest changes to files inside `extension/` on GCP that would break the Windows testing version.

When suggesting refactors:
- Always specify which folder you are editing.
- Prefer moving logic from `content.js` into clean backend API endpoints.
- Keep the Windows extension functional after each sync.

You are working in a combined workspace with full visibility of both sides.