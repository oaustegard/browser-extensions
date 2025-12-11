/* Bookmarklet Runner - Options Script */
/* Manages repository configuration settings */

(function() {
  'use strict';

  const CONFIG_KEY = 'repo_config';

  /* Default configuration - pre-configured with demo bookmarklets */
  const DEFAULTS = {
    repoOwner: 'oaustegard',
    repoName: 'bookmarklet-runner-extension',
    folderPath: 'demo-bookmarklets'
  };

  /* DOM elements */
  const form = document.getElementById('options-form');
  const repoOwnerInput = document.getElementById('repo-owner');
  const repoNameInput = document.getElementById('repo-name');
  const folderPathInput = document.getElementById('folder-path');
  const resetBtn = document.getElementById('reset-btn');
  const statusEl = document.getElementById('status');

  /* Initialize */
  init();

  async function init() {
    console.log('Bookmarklet Runner Options: Initializing');

    /* Load saved settings */
    await loadSettings();

    /* Event listeners */
    form.addEventListener('submit', handleSave);
    resetBtn.addEventListener('click', handleReset);
  }

  /* Load settings from storage */
  async function loadSettings() {
    try {
      const data = await chrome.storage.local.get(CONFIG_KEY);
      const config = data[CONFIG_KEY] || DEFAULTS;

      repoOwnerInput.value = config.repoOwner || DEFAULTS.repoOwner;
      repoNameInput.value = config.repoName || DEFAULTS.repoName;
      folderPathInput.value = config.folderPath || '';

      console.log('Bookmarklet Runner Options: Loaded config', config);
    } catch (err) {
      console.error('Bookmarklet Runner Options: Failed to load settings', err);
      showStatus('Failed to load settings', 'error');
    }
  }

  /* Save settings */
  async function handleSave(e) {
    e.preventDefault();

    const config = {
      repoOwner: repoOwnerInput.value.trim(),
      repoName: repoNameInput.value.trim(),
      folderPath: folderPathInput.value.trim()
    };

    /* Validate */
    if (!config.repoOwner || !config.repoName) {
      showStatus('GitHub Owner and Repository Name are required', 'error');
      return;
    }

    try {
      /* Save to storage */
      await chrome.storage.local.set({ [CONFIG_KEY]: config });

      /* Clear cache to force refresh with new settings */
      await chrome.storage.local.remove('bookmarklet_cache');

      console.log('Bookmarklet Runner Options: Saved config', config);
      showStatus('✓ Settings saved! The extension will reload bookmarklets from the new repository.', 'success');

    } catch (err) {
      console.error('Bookmarklet Runner Options: Failed to save settings', err);
      showStatus('Failed to save settings: ' + err.message, 'error');
    }
  }

  /* Reset to defaults */
  async function handleReset(e) {
    e.preventDefault();

    if (!confirm('Reset to default settings? This will point back to the demo bookmarklets.')) {
      return;
    }

    try {
      /* Save defaults */
      await chrome.storage.local.set({ [CONFIG_KEY]: DEFAULTS });

      /* Clear cache */
      await chrome.storage.local.remove('bookmarklet_cache');

      /* Update UI */
      repoOwnerInput.value = DEFAULTS.repoOwner;
      repoNameInput.value = DEFAULTS.repoName;
      folderPathInput.value = DEFAULTS.folderPath;

      console.log('Bookmarklet Runner Options: Reset to defaults');
      showStatus('✓ Reset to default settings', 'success');

    } catch (err) {
      console.error('Bookmarklet Runner Options: Failed to reset settings', err);
      showStatus('Failed to reset settings: ' + err.message, 'error');
    }
  }

  /* Show status message */
  function showStatus(message, type = '') {
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
    statusEl.classList.remove('hidden');

    if (type === 'success') {
      setTimeout(() => {
        statusEl.classList.add('hidden');
      }, 3000);
    }
  }

})();
