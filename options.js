// Copilot PRU Tracker – Options page script

const tokenInput        = document.getElementById('token-input');
const btnSave           = document.getElementById('btn-save');
const btnTest           = document.getElementById('btn-test');
const btnClear          = document.getElementById('btn-clear');
const btnToggleVis      = document.getElementById('btn-toggle-visibility');
const iconEye           = document.getElementById('icon-eye');
const iconEyeClosed     = document.getElementById('icon-eye-closed');
const feedbackEl        = document.getElementById('feedback');

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Load saved token (show masked placeholder if present)
  chrome.storage.local.get(['githubToken'], (result) => {
    if (result.githubToken) {
      tokenInput.value = result.githubToken;
    }
  });

  btnSave.addEventListener('click', saveToken);
  btnTest.addEventListener('click', testToken);
  btnClear.addEventListener('click', clearToken);
  btnToggleVis.addEventListener('click', toggleVisibility);

  // Allow save via Enter key
  tokenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveToken();
  });
});

// ── Visibility toggle ──────────────────────────────────────
function toggleVisibility() {
  const isPassword = tokenInput.type === 'password';
  tokenInput.type = isPassword ? 'text' : 'password';
  iconEye.hidden = isPassword;
  iconEyeClosed.hidden = !isPassword;
  btnToggleVis.setAttribute('aria-label', isPassword ? 'Hide token' : 'Show token');
}

// ── Save token ─────────────────────────────────────────────
function saveToken() {
  const token = tokenInput.value.trim();

  if (!token) {
    showFeedback('error', 'Please enter a Personal Access Token before saving.');
    return;
  }

  if (!token.startsWith('ghp_') && !token.startsWith('github_pat_') && !token.startsWith('gho_') && token.length < 20) {
    showFeedback('error', 'This doesn\'t look like a valid GitHub token. Tokens usually start with "ghp_".');
    return;
  }

  setButtonsDisabled(true);

  chrome.storage.local.set({ githubToken: token }, () => {
    // Also clear any cached usage so the next popup load fetches fresh data
    chrome.storage.local.remove(['cachedUsage', 'cacheTimestamp'], () => {
      setButtonsDisabled(false);
      showFeedback('success', '✓ Token saved successfully. Cached data cleared.');
    });
  });
}

// ── Test connection ────────────────────────────────────────
function testToken() {
  const token = tokenInput.value.trim();

  if (!token) {
    showFeedback('error', 'Please enter a token first.');
    return;
  }

  setButtonsDisabled(true);
  showFeedback('info', 'Testing connection…');

  chrome.runtime.sendMessage({ type: 'VALIDATE_TOKEN', token }, (response) => {
    setButtonsDisabled(false);

    if (!response) {
      showFeedback('error', 'No response from background service. Try reloading the extension.');
      return;
    }

    if (response.valid) {
      showFeedback('success', `✓ Connection successful! Authenticated as @${response.login}.`);
    } else {
      const msg = humaniseError(response.error);
      showFeedback('error', `✗ Connection failed: ${msg}`);
    }
  });
}

// ── Clear token ────────────────────────────────────────────
function clearToken() {
  if (!confirm('Are you sure you want to remove the saved token? You will need to re-enter it to use the extension.')) {
    return;
  }

  chrome.storage.local.remove(['githubToken', 'cachedUsage', 'cacheTimestamp'], () => {
    tokenInput.value = '';
    showFeedback('success', '✓ Token and cached data cleared.');
  });
}

// ── Helpers ────────────────────────────────────────────────
function showFeedback(type, message) {
  feedbackEl.textContent = message;
  feedbackEl.className = `feedback feedback-${type}`;
  feedbackEl.hidden = false;

  // Auto-hide success messages after 5 seconds
  if (type === 'success') {
    setTimeout(() => {
      if (feedbackEl.classList.contains('feedback-success')) {
        feedbackEl.hidden = true;
      }
    }, 5000);
  }
}

function setButtonsDisabled(disabled) {
  btnSave.disabled  = disabled;
  btnTest.disabled  = disabled;
  btnClear.disabled = disabled;
}

function humaniseError(err) {
  if (!err) return 'Unknown error.';
  if (/401/.test(err)) return 'Invalid or expired token.';
  if (/403/.test(err)) return 'Access forbidden – check token scopes.';
  if (/404/.test(err)) return 'Endpoint not found.';
  if (/rate limit/i.test(err)) return 'GitHub API rate limit reached.';
  if (/network|fetch/i.test(err)) return 'Network error – check your connection.';
  return err;
}
