// Copilot PRU Tracker – Popup script

// ── DOM helpers ────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// State elements
const stateLoading = $('state-loading');
const stateNoToken = $('state-no-token');
const stateError   = $('state-error');
const stateNoData  = $('state-no-data');
const content      = $('content');

// Buttons
const btnRefresh    = $('btn-refresh');
const btnSettings   = $('btn-settings');
const btnGoSettings = $('btn-go-settings');
const btnRetry      = $('btn-retry');
const btnRetryNodata= $('btn-retry-nodata');

// Stats
const statQuota     = $('stat-quota');
const statUsed      = $('stat-used');
const statRemaining = $('stat-remaining');

// Progress
const progressBar   = $('progress-bar');
const progressFill  = $('progress-fill');
const progressPct   = $('progress-pct');
const cacheLabel    = $('cache-label');

// Billing period
const billingPeriod = $('billing-period');

// Sections
const sectionModels = $('section-models');
const modelList     = $('model-list');
const sectionDaily  = $('section-daily');
const dailyChart    = $('daily-chart');

// ── State visibility ───────────────────────────────────────
function showOnly(el) {
  [stateLoading, stateNoToken, stateError, stateNoData, content].forEach(e => {
    if (e) e.hidden = (e !== el);
  });
}

// ── Main load ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadData();

  btnRefresh.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, () => loadData());
  });

  btnSettings.addEventListener('click', openSettings);
  btnGoSettings.addEventListener('click', openSettings);
  btnRetry.addEventListener('click', loadData);
  btnRetryNodata.addEventListener('click', loadData);
});

function openSettings() {
  chrome.runtime.openOptionsPage();
}

function loadData() {
  showOnly(stateLoading);
  chrome.runtime.sendMessage({ type: 'FETCH_USAGE' }, handleResponse);
}

// ── Response handling ──────────────────────────────────────
function handleResponse(response) {
  if (!response) {
    showError('No response from background service. Try reloading the extension.');
    return;
  }

  if (response.error === 'NO_TOKEN') {
    showOnly(stateNoToken);
    return;
  }

  if (response.error) {
    showError(humaniseError(response.error));
    return;
  }

  const data = response.data;

  if (!data || data.noData) {
    showOnly(stateNoData);
    return;
  }

  renderContent(data, response.cached);
}

function showError(msg) {
  $('error-msg').textContent = msg;
  showOnly(stateError);
}

function humaniseError(err) {
  if (/401/.test(err)) return 'Invalid or expired token. Please update your token in Settings.';
  if (/403/.test(err)) return 'Access forbidden. Ensure your token has the required scopes (read:user, copilot).';
  if (/404/.test(err)) return 'Copilot usage data not found. Your account may not have PRU tracking enabled.';
  if (/rate limit/i.test(err)) return 'GitHub API rate limit hit. Please wait a few minutes and try again.';
  if (/network/i.test(err) || /fetch/i.test(err)) return 'Network error. Check your internet connection.';
  return err || 'An unexpected error occurred.';
}

// ── Render ─────────────────────────────────────────────────
function renderContent(data, cached) {
  // Billing period
  if (data.billingCycle) {
    const fmt = (iso) => {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    };
    billingPeriod.textContent = `Billing period: ${fmt(data.billingCycle.start)} – ${fmt(data.billingCycle.end)}`;
  } else {
    billingPeriod.textContent = formatCurrentPeriod();
  }

  // Stats
  const consumed  = data.consumed  ?? null;
  const quota     = data.totalQuota ?? null;
  const remaining = data.remaining  ?? (quota !== null && consumed !== null ? quota - consumed : null);

  statQuota.textContent     = quota     !== null ? quota.toLocaleString()     : '—';
  statUsed.textContent      = consumed  !== null ? consumed.toLocaleString()  : '—';
  statRemaining.textContent = remaining !== null ? remaining.toLocaleString() : '—';

  // Progress bar
  const pct = (quota && consumed !== null) ? Math.min(100, Math.round((consumed / quota) * 100)) : null;
  if (pct !== null) {
    progressFill.style.width = `${pct}%`;
    progressBar.setAttribute('aria-valuenow', pct);
    progressPct.textContent = `${pct}%`;
    progressFill.classList.remove('progress-yellow', 'progress-red');
    if (pct >= 80) {
      progressFill.classList.add('progress-red');
    } else if (pct >= 50) {
      progressFill.classList.add('progress-yellow');
    }
  } else if (consumed !== null) {
    // We have consumed but not quota – show indeterminate bar
    progressFill.style.width = '100%';
    progressPct.textContent = consumed.toLocaleString() + ' used';
  } else {
    progressFill.style.width = '0%';
    progressPct.textContent = 'N/A';
  }

  // Cache label
  cacheLabel.textContent = cached ? '(cached)' : '';

  // Model breakdown
  if (data.modelBreakdown && data.modelBreakdown.length > 0) {
    renderModelBreakdown(data.modelBreakdown);
    sectionModels.hidden = false;
  } else {
    sectionModels.hidden = true;
  }

  // Daily breakdown
  if (data.dailyBreakdown && data.dailyBreakdown.length > 0) {
    renderDailyChart(data.dailyBreakdown);
    sectionDaily.hidden = false;
  } else {
    sectionDaily.hidden = true;
  }

  showOnly(content);
}

function formatCurrentPeriod() {
  const now = new Date();
  const month = now.toLocaleString(undefined, { month: 'long' });
  return `Billing period: ${month} ${now.getFullYear()}`;
}

// ── Model breakdown ────────────────────────────────────────
function renderModelBreakdown(models) {
  modelList.innerHTML = '';

  const sorted = [...models].sort((a, b) => b.count - a.count);
  const maxCount = sorted[0]?.count || 1;

  for (const m of sorted) {
    const pct = Math.round((m.count / maxCount) * 100);

    const li = document.createElement('li');
    li.innerHTML = `
      <span class="model-name" title="${escapeHtml(m.model)}">${escapeHtml(m.model)}</span>
      <div class="model-bar-track" aria-hidden="true">
        <div class="model-bar-fill" style="width:${pct}%"></div>
      </div>
      <span class="model-count">${m.count.toLocaleString()}</span>
    `;
    modelList.appendChild(li);
  }
}

// ── Daily chart ────────────────────────────────────────────
function renderDailyChart(daily) {
  dailyChart.innerHTML = '';

  const maxCount = Math.max(...daily.map(d => d.count), 1);
  const chartHeight = 44; // px reserved for bars

  for (const d of daily) {
    const barHeight = Math.max(2, Math.round((d.count / maxCount) * chartHeight));
    const label = formatDayLabel(d.date);

    const wrap = document.createElement('div');
    wrap.className = 'day-bar-wrap';

    const bar = document.createElement('div');
    bar.className = 'day-bar';
    bar.style.height = `${barHeight}px`;
    bar.title = `${d.date}: ${d.count} PRU${d.count !== 1 ? 's' : ''}`;

    const dayLbl = document.createElement('div');
    dayLbl.className = 'day-label';
    dayLbl.textContent = label;

    wrap.appendChild(bar);
    wrap.appendChild(dayLbl);
    dailyChart.appendChild(wrap);
  }
}

function formatDayLabel(dateStr) {
  try {
    // dateStr is typically "YYYY-MM-DD"
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const month = parseInt(parts[1], 10);
      const day   = parseInt(parts[2], 10);
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${months[month - 1]} ${day}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

// ── Utility ────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
