# Copilot PRU Tracker

> Track your GitHub Copilot Premium Request Usage (PRU) directly from your browser toolbar.

A lightweight Chrome Extension (Manifest V3) that fetches your Copilot usage statistics from the GitHub API and displays them in a clean, GitHub-inspired dark-theme popup.

## Screenshot

_Click the extension icon in your browser toolbar to see your Copilot PRU usage at a glance._

<!-- Add a screenshot here once the extension is loaded in Chrome -->

---

## Features

- **Quota / Used / Remaining** summary cards for the current billing period
- **Visual progress bar** — green below 50 %, yellow 50–80 %, red above 80 %
- **Per-model breakdown** (e.g. GPT-4.5, Claude Opus) when available
- **Daily usage bar chart** for the current billing period
- **5-minute API response cache** to avoid excessive GitHub API calls
- **Refresh button** to force a fresh fetch
- **Settings page** for storing your GitHub PAT securely in `chrome.storage.local`
- **Test Connection** button to validate your token before saving
- GitHub-inspired dark theme (#0d1117 background, GitHub colour palette)

---

## Installation

1. **Clone or download** this repository:
   ```bash
   git clone https://github.com/HarvirChima/copilot-pru-extension.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`.

3. Enable **Developer Mode** (toggle in the top-right corner).

4. Click **Load unpacked** and select the `copilot-pru-extension/` directory (the folder that contains `manifest.json`).

5. The **Copilot PRU Tracker** icon will appear in your toolbar. Pin it for easy access.

---

## Setup

### Generate a GitHub Personal Access Token (PAT)

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens) (or **Settings → Developer settings → Personal access tokens**).
2. Click **Generate new token (classic)**.
3. Give it a descriptive name, e.g. _"Copilot PRU Tracker"_.
4. Select the following scopes:
   - `read:user` — read your user profile
   - `copilot` — access Copilot usage data (if available for your plan)
5. Click **Generate token** and copy the value immediately.

### Configure the extension

1. Click the **Copilot PRU Tracker** icon in the toolbar.
2. Click the ⚙️ **Settings** button (top-right of the popup).
3. Paste your GitHub PAT into the **Personal Access Token** field.
4. Click **Save Token** (optionally click **Test Connection** first to validate).
5. Close the settings tab and click the extension icon again — your usage data will load.

---

## How it works

The background service worker (`background.js`) makes authenticated requests to the GitHub REST API using your PAT. It tries the following endpoints in order:

| Priority | Endpoint | Description |
|----------|----------|-------------|
| 1 | `GET /user/copilot` | User-level Copilot plan & PRU data |
| 2 | `GET /copilot/usage` | General Copilot usage (enterprise/org) |
| 3 | `GET /user/copilot/billing/premium-requests` | Billing-level PRU data |

All requests include the standard GitHub API headers:
```
Authorization: Bearer <PAT>
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
```

Responses are cached in `chrome.storage.local` for **5 minutes** to prevent hitting GitHub's API rate limits. Click the **refresh** button (↻) to force an immediate re-fetch.

> **Note:** PRU data availability depends on your Copilot plan. Some plans may not yet expose per-user PRU statistics through the GitHub REST API. If the connection test succeeds but the popup shows "No data available", this is expected behaviour for those plans.

---

## Privacy

- Your GitHub PAT is stored **only in your browser's local storage** (`chrome.storage.local`).
- The token is **never sent to any third-party server** — it is used exclusively to authenticate requests to `api.github.com`.
- No telemetry or analytics of any kind is collected.

---

## File structure

```
copilot-pru-extension/
├── manifest.json      # Chrome Extension Manifest V3
├── popup.html         # Main popup UI
├── popup.js           # Popup logic
├── popup.css          # Popup styles (GitHub dark theme)
├── options.html       # Settings page
├── options.js         # Settings logic
├── options.css        # Settings styles
├── background.js      # Service worker – GitHub API calls & caching
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── README.md
└── LICENSE
```

---

## License

This project is licensed under the [MIT License](LICENSE).

