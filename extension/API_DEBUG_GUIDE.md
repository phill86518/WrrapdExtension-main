# API Debugging Guide - generate-ideas Endpoint

> **Note:** This file is a **focused debugging note** for the generate-ideas / AI flow. It is not the canonical deploy or architecture spec. For shipping and ops, use the monorepo **[DEPLOYMENT.md](../DEPLOYMENT.md)** and **[README.md](../README.md)**.

## Current Issue
The `/generate-ideas` endpoint is returning a 500 Internal Server Error, likely due to incorrect or missing request payload fields.

## What Was Changed

### 1. Enhanced Request Payload
The API call now includes:
- `occasion` (required) - The gifting occasion text
- `product` (optional) - Product information:
  - `title` - Product title
  - `asin` - Amazon ASIN
  - `imageUrl` - Product image URL
  - `selectedFile` - If a file was selected:
    - `name` - File name
    - `type` - File MIME type

### 2. Enhanced Logging
The code now logs:
- Full request payload (formatted JSON) to console
- Request payload keys
- Response status and headers
- Raw response data

## How to Debug

### Method 1: Browser Console
1. Open Chrome DevTools (F12)
2. Go to the **Console** tab
3. Trigger the error by clicking "Generate Designs"
4. Look for logs starting with `[AI Design Generation]`
5. Find the log: `[AI Design Generation] Full request payload:` - this shows exactly what JSON is being sent

### Method 2: Network Tab (Recommended)
1. Open Chrome DevTools (F12)
2. Go to the **Network** tab
3. Filter by "generate-ideas" or "wrrapd"
4. Trigger the error by clicking "Generate Designs"
5. Click on the failed request (it will show in red with status 500)
6. Click on the **Payload** or **Request** tab to see:
   - **Request Payload** - The exact JSON being sent
   - **Request Headers** - Headers being sent
   - **Response** - The error response from server

### Method 3: Check Server-Side Code
To see what fields the server expects:

1. **If you have access to the server code:**
   - Look for the `/generate-ideas` endpoint handler
   - Check what fields it's trying to access from `req.body`
   - Common locations:
     - `server.js`, `app.js`, `index.js`
     - `routes/generate-ideas.js` or similar
     - `controllers/generateIdeasController.js` or similar

2. **If you have access to server logs:**
   - Check the server error logs when the 500 error occurs
   - Look for stack traces or error messages that indicate missing fields

3. **If you have API documentation:**
   - Check the API docs for the expected request schema
   - Compare with what's being sent

## Current Payload Structure

```json
{
  "occasion": "V-Day",
  "product": {
    "title": "Product Title",
    "asin": "B0FQCSXQL1",
    "imageUrl": "https://...",
    "selectedFile": {
      "name": "filename.jpg",
      "type": "image/jpeg"
    }
  }
}
```

## Next Steps

1. **Check the Network tab** to see the exact payload being sent
2. **Compare with server expectations** - check server code/logs to see what fields are required
3. **Update the payload** if additional fields are needed
4. **Test again** after making changes

## Common Issues

- **Missing required fields**: Server might expect fields like `userId`, `sessionId`, `apiKey`, etc.
- **Wrong field names**: Server might expect `occasion` but named differently, or camelCase vs snake_case
- **Data type mismatches**: Server might expect arrays, objects, or specific formats
- **Authentication**: Server might require authentication headers or tokens

