# CHROME EXTENSION RULES (Manifest V3)

You are working in the Chrome Extension folder (`extension/`).

Important facts:
- This is the Chrome Extension codebase (Manifest V3).
- `content.js` is the large monolithic file we are refactoring and migrating pieces from.
- Files like `app.py`, `check_server_logs.sh`, etc. inside this folder are **REFERENCE COPIES ONLY** for information purposes.
- They are **NOT** the live/production versions.
- The real, functional backend code lives in the `backend/` folder.

When the user asks you to refactor or modify backend-related code:
- Always work in the `backend/` folder.
- Never suggest changes to `app.py` or similar files inside the `extension/` folder.
- The `extension/` folder's Python files are for reference only.

Be very clear when answering: specify which folder you are referring to.

There are no such redundancies on the GCP backend folder structure since they are production level files.