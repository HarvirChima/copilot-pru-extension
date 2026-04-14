// Background Service Worker for Copilot PRU Tracker
// Handles GitHub API calls with 5-minute response caching

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const GITHUB_API_BASE = 'https://api.github.com';

// Standard GitHub REST API headers required for all requests.
// X-GitHub-Api-Version pins the API schema to the 2022-11-28 release, which is the
// current stable version. Update this when GitHub releases a newer stable API version.
const DEFAULT_HEADERS = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28'
});

/**
 * Fetch with GitHub auth headers and return parsed JSON or throw an error.
 */
async function ghFetch(url, token) {
  const response = await fetch(url, { headers: DEFAULT_HEADERS(token) });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GitHub API error ${response.status}: ${text || response.statusText}`);
  }
  return response.json();
}

/**
 * Attempt to fetch Copilot usage data from the various known endpoints.
 * Returns a normalised object:
 * {
 *   billingCycle: { start, end },   // ISO date strings
 *   totalQuota: number | null,
 *   consumed: number,
 *   remaining: number | null,
 *   dailyBreakdown: [{ date, count }],
 *   modelBreakdown: [{ model, count }]
 * }
 */
async function fetchCopilotUsage(token) {
  // Try primary endpoint: /copilot/usage (organisation/enterprise only via /orgs or /enterprises,
  // but the user-level alias worth trying first)
  let data = null;

  // 1) Try the user-level Copilot billing endpoint
  try {
    data = await ghFetch(`${GITHUB_API_BASE}/user/copilot`, token);
    if (data) {
      return normaliseCopilotUserData(data);
    }
  } catch (_) {
    // fall through
  }

  // 2) Try /copilot/usage (may work for some enterprise accounts)
  try {
    const usage = await ghFetch(`${GITHUB_API_BASE}/copilot/usage`, token);
    if (usage) {
      return normaliseGenericUsage(usage);
    }
  } catch (_) {
    // fall through
  }

  // 3) Try /user/copilot/billing/premium-requests
  try {
    const billing = await ghFetch(`${GITHUB_API_BASE}/user/copilot/billing/premium-requests`, token);
    if (billing) {
      return normaliseBillingData(billing);
    }
  } catch (_) {
    // fall through
  }

  // 4) If nothing worked, return a "no data" structure so the popup can show the empty state
  return {
    billingCycle: null,
    totalQuota: null,
    consumed: null,
    remaining: null,
    dailyBreakdown: [],
    modelBreakdown: [],
    noData: true
  };
}

/**
 * Normalise the /user/copilot response shape.
 * GitHub docs shape (as of 2024):
 * {
 *   copilot_plan: "business"|"individual"|"enterprise",
 *   public_code_suggestions: "...",
 *   billing_cycle: { start_date, end_date },
 *   premium_requests: { quota, used, remaining, ... },
 *   ...
 * }
 */
function normaliseCopilotUserData(data) {
  const pr = data.premium_requests || {};
  const cycle = data.billing_cycle || {};

  const consumed = pr.used ?? pr.total_used ?? null;
  const totalQuota = pr.quota ?? pr.total ?? null;
  const remaining = pr.remaining ?? (totalQuota !== null && consumed !== null ? totalQuota - consumed : null);

  // Per-day & per-model breakdown (may not be present on this endpoint)
  const dailyBreakdown = buildDailyBreakdown(pr.daily_breakdown || data.daily_breakdown || []);
  const modelBreakdown = buildModelBreakdown(pr.model_breakdown || data.model_breakdown || []);

  return {
    billingCycle: cycle.start_date
      ? { start: cycle.start_date, end: cycle.end_date }
      : null,
    totalQuota,
    consumed,
    remaining,
    dailyBreakdown,
    modelBreakdown,
    noData: consumed === null && totalQuota === null
  };
}

/**
 * Normalise a generic /copilot/usage array response.
 * The array contains daily objects like { date, total_suggestions_count, ... }
 */
function normaliseGenericUsage(usageArray) {
  if (!Array.isArray(usageArray) || usageArray.length === 0) {
    return { billingCycle: null, totalQuota: null, consumed: null, remaining: null, dailyBreakdown: [], modelBreakdown: [], noData: true };
  }

  const dailyBreakdown = usageArray.map(day => ({
    date: day.day || day.date || '',
    count: day.total_chat_turns
      || day.total_suggestions_count
      || day.premium_requests_count
      || 0
  })).filter(d => d.date);

  const consumed = dailyBreakdown.reduce((sum, d) => sum + d.count, 0);

  // Aggregate model breakdown across days if present
  const modelMap = {};
  for (const day of usageArray) {
    const models = day.breakdown || day.models || [];
    for (const m of models) {
      const name = m.model || m.name || 'Unknown';
      modelMap[name] = (modelMap[name] || 0) + (m.total || m.count || m.premium_requests || 0);
    }
  }
  const modelBreakdown = Object.entries(modelMap).map(([model, count]) => ({ model, count }));

  const firstDate = dailyBreakdown[0]?.date;
  const lastDate = dailyBreakdown[dailyBreakdown.length - 1]?.date;

  return {
    billingCycle: firstDate ? { start: firstDate, end: lastDate } : null,
    totalQuota: null,
    consumed,
    remaining: null,
    dailyBreakdown,
    modelBreakdown,
    noData: false
  };
}

/**
 * Normalise /user/copilot/billing/premium-requests response.
 */
function normaliseBillingData(data) {
  const consumed = data.used ?? data.total_used ?? null;
  const totalQuota = data.quota ?? data.total ?? null;
  const remaining = data.remaining ?? (totalQuota !== null && consumed !== null ? totalQuota - consumed : null);

  return {
    billingCycle: data.billing_cycle
      ? { start: data.billing_cycle.start_date || data.billing_cycle.start, end: data.billing_cycle.end_date || data.billing_cycle.end }
      : null,
    totalQuota,
    consumed,
    remaining,
    dailyBreakdown: buildDailyBreakdown(data.daily_breakdown || []),
    modelBreakdown: buildModelBreakdown(data.model_breakdown || []),
    noData: consumed === null && totalQuota === null
  };
}

function buildDailyBreakdown(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(d => ({
    date: d.date || d.day || '',
    count: d.count || d.used || d.premium_requests || 0
  })).filter(d => d.date);
}

function buildModelBreakdown(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(m => ({
    model: m.model || m.name || 'Unknown',
    count: m.count || m.used || m.total || 0
  }));
}

/**
 * Validate a PAT by calling /user endpoint.
 * Returns { valid: true, login: '...' } or { valid: false, error: '...' }
 */
async function validateToken(token) {
  try {
    const user = await ghFetch(`${GITHUB_API_BASE}/user`, token);
    return { valid: true, login: user.login };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'FETCH_USAGE') {
    handleFetchUsage(sendResponse);
    return true; // keep channel open for async response
  }

  if (message.type === 'VALIDATE_TOKEN') {
    handleValidateToken(message.token, sendResponse);
    return true;
  }

  if (message.type === 'CLEAR_CACHE') {
    chrome.storage.local.remove(['cachedUsage', 'cacheTimestamp'], () => {
      sendResponse({ ok: true });
    });
    return true;
  }
});

async function handleFetchUsage(sendResponse) {
  try {
    const stored = await storageGet(['githubToken', 'cachedUsage', 'cacheTimestamp']);
    const token = stored.githubToken;

    if (!token) {
      sendResponse({ error: 'NO_TOKEN' });
      return;
    }

    const now = Date.now();
    if (stored.cachedUsage && stored.cacheTimestamp && (now - stored.cacheTimestamp) < CACHE_DURATION_MS) {
      sendResponse({ data: stored.cachedUsage, cached: true });
      return;
    }

    const data = await fetchCopilotUsage(token);
    await storageSet({ cachedUsage: data, cacheTimestamp: now });
    sendResponse({ data, cached: false });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

async function handleValidateToken(token, sendResponse) {
  const result = await validateToken(token);
  sendResponse(result);
}

// ---------------------------------------------------------------------------
// Promisified chrome.storage helpers
// ---------------------------------------------------------------------------

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve));
}
