// Options page script for Fraktur Toggle

const STORAGE_KEY = 'autoApplySites';

// Load and display saved sites
async function loadSites() {
  const result = await chrome.storage.sync.get([STORAGE_KEY]);
  const sites = result[STORAGE_KEY] || [];
  displaySites(sites);
}

// Display sites in the list
function displaySites(sites) {
  const sitesList = document.getElementById('sitesList');

  if (sites.length === 0) {
    sitesList.innerHTML = '<div class="empty-state">No sites configured yet</div>';
    return;
  }

  sitesList.innerHTML = sites
    .sort()
    .map(site => `
      <div class="site-item">
        <span class="site-name">${escapeHtml(site)}</span>
        <button class="remove-btn" data-site="${escapeHtml(site)}">Remove</button>
      </div>
    `)
    .join('');

  // Add event listeners to remove buttons
  sitesList.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => removeSite(btn.dataset.site));
  });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Add a new site
async function addSite() {
  const input = document.getElementById('siteInput');
  let hostname = input.value.trim().toLowerCase();

  if (!hostname) {
    return;
  }

  // Remove protocol if user included it
  hostname = hostname.replace(/^https?:\/\//, '');

  // Remove trailing slash and path
  hostname = hostname.split('/')[0];

  // Basic validation
  if (!hostname || hostname.includes(' ')) {
    alert('Please enter a valid hostname (e.g., example.com)');
    return;
  }

  // Get current sites
  const result = await chrome.storage.sync.get([STORAGE_KEY]);
  const sites = result[STORAGE_KEY] || [];

  // Check if already exists
  if (sites.includes(hostname)) {
    alert('This site is already in the list');
    return;
  }

  // Add new site
  sites.push(hostname);
  await chrome.storage.sync.set({ [STORAGE_KEY]: sites });

  // Clear input and reload display
  input.value = '';
  loadSites();
  showStatus();
}

// Remove a site
async function removeSite(hostname) {
  const result = await chrome.storage.sync.get([STORAGE_KEY]);
  const sites = result[STORAGE_KEY] || [];

  const filteredSites = sites.filter(site => site !== hostname);
  await chrome.storage.sync.set({ [STORAGE_KEY]: filteredSites });

  loadSites();
  showStatus();
}

// Show save confirmation
function showStatus() {
  const status = document.getElementById('status');
  status.classList.add('show');
  setTimeout(() => {
    status.classList.remove('show');
  }, 2000);
}

// Event listeners
document.getElementById('addButton').addEventListener('click', addSite);
document.getElementById('siteInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addSite();
  }
});

// Load sites on page load
loadSites();
