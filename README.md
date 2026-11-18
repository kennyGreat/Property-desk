# Property Desk — Global Real Estate Workspace

A lightweight, installable, mobile-first property operations app built with plain HTML, CSS and JavaScript.

## Current capabilities

- Opens on an operational overview with quick access to inventory, demand, matching, leads, marketing and tasks; there is no login or registration screen.
- Property listings for sale and rent, with free-text description extraction and editable details.
- Nigeria-wide location entry, including suggestions for all 36 states and the FCT.
- International country selection covering 196 country names, plus free-text city/area entry.
- Currency selection using the browser's supported ISO currency list (with a fallback list).
- Buyer and tenant request import from pasted messages or TXT/CSV files.
- Expanded rule-based matching using location, country, property type, bedrooms, bathrooms, toilets, budget, building/land size, parking, furnishing, condition, title-document type and feature overlap where both sides provide the data.
- Currency-aware matching: budgets are not compared when the request and listing use different currencies.
- Imported requests show an **Available as at** timestamp.
- Full property editing with preserved original descriptions, expanded specifications, data-completeness checks, lead tracking, follow-up dates, commission estimates, WhatsApp messages, Facebook search/post preparation, printable flyers/signboards, QR enquiry links, daily action plan and JSON backup/restore.
- Private Cloudflare R2 media storage for multiple property photos, walkthrough videos and PDF documents when connected to the cloud API; legacy Base64 photos are migrated to R2 during the first cloud upload.
- Cloudflare D1 state sync with owner-key protection, explicit initial pull/upload, automatic cloud save after the local dataset is established, and revision-conflict protection.
- PWA install support and offline shell caching.

## Data and privacy mode

Property Desk remains a no-login app: the dashboard opens without user registration. Records are saved locally first. In **Settings → Cloud storage and device access**, connect with the private `OWNER_KEY` and make the first explicit pull or upload. After that, edits are automatically saved to D1 while the connected session is active. On a fresh browser/device, connect and pull cloud before editing. Revision conflicts pause cloud writes rather than silently overwriting a newer copy. A pull replaces the current device's app state, so the app downloads a local JSON backup first.

When connected, newly selected property photos upload to the private Cloudflare R2 bucket. Existing Base64 listing photos are migrated to R2 during the next explicit cloud upload, and the D1 state stores their media keys rather than embedded image data. Private photos are fetched through the authenticated Worker; the bucket must remain private. Keep a separate JSON backup before the first migration and verify the records and photos on a second device.

The previous Supabase account sync and notification-ingestion workflow were removed. Automatic notification capture is not enabled. Users can still paste or upload WhatsApp, Facebook, SMS or other enquiry text in **Match → Import requests**.

Because there is no per-user sign-in, anyone with access to the device/browser profile may be able to open locally saved data. The shared owner key grants access to the whole cloud dataset; do not put it in public source code or share it with untrusted people.

## International-market limitations

The app now accepts property locations in Nigeria and internationally and supports multiple currencies. It does **not** provide live foreign-exchange conversion, country-specific legal/tax calculations, global property-feed integrations, geocoding, or verified market-price data. Cross-currency budgets are deliberately excluded from the matching score rather than being compared as if they were the same currency.

Text extraction and matching are heuristic JavaScript rules, not an AI model. Scores use only criteria that are present in both the request and listing; missing data is not treated as a match. Review imported details and match reasons before contacting clients or making commercial decisions. Marketing tools create complete share-ready copy and track when you mark it as shared; Facebook and other external platforms are not automatically posted to or scraped.

## Run locally / deploy

Serve this folder from any static HTTPS host (GitHub Pages, Netlify, Cloudflare Pages, etc.). The PWA service worker requires HTTPS or localhost. Keep index.html, manifest.webmanifest, sw.js, icon-192.png and icon-512.png together in the same deployment folder.

## Android APK

This repository contains the web app/PWA source, not a compiled APK. To distribute an APK, wrap the hosted app or local web assets in an Android WebView/TWA project, then build and test the APK on real Android devices. Validate offline behaviour, local storage persistence, authenticated R2 photo upload and retrieval, 90 MB Worker upload cap, file import/export and print/share flows before release.

## Main files

- index.html — app UI and application logic.
- manifest.webmanifest — install metadata.
- sw.js — offline shell cache and update strategy.
- icon-192.png, icon-512.png — PWA icons.
