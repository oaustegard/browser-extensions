const fromInput = document.getElementById('from');
const toInput = document.getElementById('to');
const addButton = document.getElementById('add');
const redirectsList = document.getElementById('redirects');
const statusDiv = document.getElementById('status');

// Normalize domain: strip protocol, www, trailing slashes
function normalizeDomain(input) {
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, '');
  domain = domain.replace(/^www\./, '');
  domain = domain.replace(/\/.*$/, '');
  return domain;
}

function showStatus(message, isError = false) {
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + (isError ? 'error' : 'success');
  if (!isError) {
    setTimeout(() => { statusDiv.className = 'status'; }, 3000);
  }
}

async function loadRedirects() {
  const { redirects = [] } = await chrome.storage.sync.get('redirects');
  renderRedirects(redirects);
}

function renderRedirects(redirects) {
  if (redirects.length === 0) {
    redirectsList.innerHTML = '<li class="empty">No redirects configured</li>';
    return;
  }
  
  redirectsList.innerHTML = redirects.map((r, i) => `
    <li>
      <span class="domains">
        ${r.from} <span class="arrow">→</span> ${r.to}
      </span>
      <button class="remove" data-index="${i}" title="Remove">×</button>
    </li>
  `).join('');
  
  // Attach remove handlers
  redirectsList.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', () => removeRedirect(parseInt(btn.dataset.index)));
  });
}

async function addRedirect() {
  const from = normalizeDomain(fromInput.value);
  const to = normalizeDomain(toInput.value);
  
  if (!from || !to) {
    showStatus('Please enter both domains', true);
    return;
  }
  
  if (from === to) {
    showStatus('From and To domains must be different', true);
    return;
  }
  
  // Request host permission for the source domain
  const permissions = {
    origins: [`*://${from}/*`, `*://www.${from}/*`]
  };
  
  let granted;
  try {
    granted = await chrome.permissions.request(permissions);
  } catch (e) {
    showStatus(`Permission error: ${e.message}`, true);
    return;
  }
  
  if (!granted) {
    showStatus('Permission denied — redirect not added', true);
    return;
  }
  
  // Add to storage
  const { redirects = [] } = await chrome.storage.sync.get('redirects');
  
  // Check for duplicate
  if (redirects.some(r => r.from === from)) {
    showStatus(`Redirect for ${from} already exists`, true);
    return;
  }
  
  redirects.push({ from, to });
  await chrome.storage.sync.set({ redirects });
  
  fromInput.value = '';
  toInput.value = '';
  showStatus(`Added redirect: ${from} → ${to}`);
  renderRedirects(redirects);
}

async function removeRedirect(index) {
  const { redirects = [] } = await chrome.storage.sync.get('redirects');
  const removed = redirects.splice(index, 1)[0];
  await chrome.storage.sync.set({ redirects });
  
  // Optionally revoke permission (commented out — user may want to keep it)
  // await chrome.permissions.remove({ origins: [`*://${removed.from}/*`, `*://www.${removed.from}/*`] });
  
  showStatus(`Removed redirect: ${removed.from}`);
  renderRedirects(redirects);
}

addButton.addEventListener('click', addRedirect);

// Allow Enter key to submit
[fromInput, toInput].forEach(input => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addRedirect();
  });
});

// Initial load
loadRedirects();
