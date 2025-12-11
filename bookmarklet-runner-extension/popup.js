/* Bookmarklet Runner - Popup Script */
/* Fetches bookmarklets from GitHub and executes them on the current tab */

(function() {
  'use strict';

  /* Configuration - loaded from storage */
  let REPO_OWNER = 'oaustegard';
  let REPO_NAME = 'bookmarklets';
  let FOLDER_PATH = '';

  const CONFIG_KEY = 'repo_config';
  const GITHUB_API_BASE = 'https://api.github.com';
  const CACHE_KEY = 'bookmarklet_cache';
  const EXPANDED_KEY = 'expanded_groups';
  const CACHE_DURATION_MS = 60 * 60 * 1000; /* 1 hour cache */
  const GROUP_THRESHOLD = 2; /* Min items to form a group */

  /* DOM elements */
  const searchInput = document.getElementById('search');
  const refreshBtn = document.getElementById('refresh');
  const loadingEl = document.getElementById('loading');
  const statusEl = document.getElementById('status');
  const listEl = document.getElementById('bookmarklet-list');

  let allBookmarklets = [];
  let currentDomain = null;
  let focusedIndex = -1;
  let navigableItems = []; /* Can include both group headers and bookmarklet items */
  let expandedGroups = new Set(); /* Groups default to collapsed; this tracks explicitly expanded ones */

  /* Initialize on popup open */
  init();

  async function init() {
    console.log('Bookmarklet Runner: Initializing');

    /* Load repository configuration */
    await loadRepoConfig();

    /* Get current tab domain */
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) {
        const url = new URL(tab.url);
        currentDomain = url.hostname.replace(/^www\./, '');
        console.log('Bookmarklet Runner: Current domain:', currentDomain);
      }
    } catch (err) {
      console.log('Bookmarklet Runner: Could not get current domain', err);
    }

    /* Load expanded state */
    try {
      const data = await chrome.storage.local.get(EXPANDED_KEY);
      if (data[EXPANDED_KEY]) {
        expandedGroups = new Set(data[EXPANDED_KEY]);
      }
    } catch (err) { /* ignore */ }

    /* Event listeners */
    searchInput.addEventListener('input', debounce(handleFilterChange, 100));
    refreshBtn.addEventListener('click', () => loadBookmarklets(true));

    /* Global keyboard handler */
    document.addEventListener('keydown', handleKeydown);

    /* Focus search on open */
    searchInput.focus();

    await loadBookmarklets(false);
  }

  /* Load repository configuration from storage */
  async function loadRepoConfig() {
    try {
      const data = await chrome.storage.local.get(CONFIG_KEY);
      if (data[CONFIG_KEY]) {
        const config = data[CONFIG_KEY];
        REPO_OWNER = config.repoOwner || 'oaustegard';
        REPO_NAME = config.repoName || 'bookmarklets';
        FOLDER_PATH = config.folderPath || '';
        console.log('Bookmarklet Runner: Loaded config', { REPO_OWNER, REPO_NAME, FOLDER_PATH });
      } else {
        console.log('Bookmarklet Runner: Using default config');
      }
    } catch (err) {
      console.error('Bookmarklet Runner: Failed to load config', err);
    }
  }

  /* Global keyboard handler */
  function handleKeydown(e) {
    const inSearch = document.activeElement === searchInput;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (inSearch) {
        /* Move from search to first navigable item */
        if (navigableItems.length > 0) {
          focusedIndex = 0;
          searchInput.blur();
          updateFocus();
        }
      } else if (focusedIndex < navigableItems.length - 1) {
        focusedIndex++;
        updateFocus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!inSearch) {
        if (focusedIndex > 0) {
          focusedIndex--;
          updateFocus();
        } else if (focusedIndex === 0) {
          focusedIndex = -1;
          clearFocus();
          searchInput.focus();
        }
      }
    } else if (e.key === 'ArrowRight' && !inSearch && focusedIndex >= 0) {
      e.preventDefault();
      const item = navigableItems[focusedIndex];
      if (item.type === 'group' && !expandedGroups.has(item.groupName)) {
        toggleGroup(item.groupName);
      }
    } else if (e.key === 'ArrowLeft' && !inSearch && focusedIndex >= 0) {
      e.preventDefault();
      const item = navigableItems[focusedIndex];
      if (item.type === 'group' && expandedGroups.has(item.groupName)) {
        toggleGroup(item.groupName);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (inSearch) {
        /* Execute first visible bookmarklet */
        const firstBookmarklet = navigableItems.find(i => i.type === 'bookmarklet');
        if (firstBookmarklet) {
          executeBookmarklet(firstBookmarklet.bookmarklet);
        }
      } else if (focusedIndex >= 0) {
        const item = navigableItems[focusedIndex];
        if (item.type === 'group') {
          toggleGroup(item.groupName);
        } else {
          executeBookmarklet(item.bookmarklet);
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      focusedIndex = -1;
      clearFocus();
    } else if (!inSearch && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key.length === 1 || e.key === 'Backspace')) {
      /* Any printable character or backspace while not in search - redirect to search */
      focusedIndex = -1;
      clearFocus();
      searchInput.focus();
      /* Let the keypress go through to search naturally */
    }
  }

  /* Load bookmarklets from cache or GitHub */
  async function loadBookmarklets(forceRefresh = false) {
    console.log('Bookmarklet Runner: Loading bookmarklets, forceRefresh:', forceRefresh);
    
    showLoading(true);
    hideStatus();
    
    try {
      /* Check cache first */
      if (!forceRefresh) {
        const cached = await getCachedBookmarklets();
        if (cached) {
          console.log('Bookmarklet Runner: Using cached data');
          allBookmarklets = cached;
          renderBookmarklets();
          showLoading(false);
          return;
        }
      }
      
      /* Fetch from GitHub */
      console.log('Bookmarklet Runner: Fetching from GitHub');
      const files = await fetchRepoContents();
      const jsFiles = files.filter(f => f.name.endsWith('.js') && f.type === 'file');
      
      /* Build a set of README files for quick lookup */
      const readmeFiles = new Map();
      files.forEach(f => {
        if (f.name.toLowerCase().includes('readme') && f.name.endsWith('.md')) {
          /* Map base name to HTML URL: bsky_advanced_search_README.md -> bsky_advanced_search */
          const baseName = f.name.replace(/_?README\.md$/i, '').replace(/\.README\.md$/i, '');
          if (baseName) {
            readmeFiles.set(baseName.toLowerCase(), f.html_url);
          }
        }
      });
      
      console.log('Bookmarklet Runner: Found', jsFiles.length, 'JS files,', readmeFiles.size, 'READMEs');
      
      /* Fetch content for each file */
      const bookmarklets = await Promise.all(
        jsFiles.map(async (file) => {
          try {
            const content = await fetchFileContent(file.download_url);
            const metadata = parseMetadata(content, file.name);
            const baseName = file.name.replace('.js', '').toLowerCase();
            const readmeUrl = readmeFiles.get(baseName) || null;
            return {
              name: metadata.title,
              filename: file.name,
              description: metadata.description,
              domains: metadata.domains,
              prefix: extractPrefix(file.name),
              code: content,
              url: file.html_url,
              readmeUrl: readmeUrl
            };
          } catch (err) {
            console.error('Bookmarklet Runner: Failed to fetch', file.name, err);
            return null;
          }
        })
      );
      
      allBookmarklets = bookmarklets.filter(b => b !== null);
      allBookmarklets.sort((a, b) => a.name.localeCompare(b.name));
      
      /* Cache results */
      await cacheBookmarklets(allBookmarklets);
      
      renderBookmarklets();
      showLoading(false);
      
    } catch (err) {
      console.error('Bookmarklet Runner: Error loading bookmarklets', err);
      showLoading(false);
      showStatus('Failed to load bookmarklets: ' + err.message, 'error');
    }
  }

  /* Parse @title, @description, @domains from bookmarklet code */
  function parseMetadata(code, filename) {
    const result = {
      title: null,
      description: null,
      domains: []
    };

    /* Search first 10 lines for metadata tags - works with any code structure */
    const lines = code.split('\n').slice(0, 10);
    const searchArea = lines.join('\n');

    /* Parse @title */
    const titleMatch = searchArea.match(/@title[:\s]+([^\n*@]+)/i);
    if (titleMatch) {
      result.title = titleMatch[1].trim();
    }

    /* Parse @description */
    const descMatch = searchArea.match(/@description[:\s]+([^\n*@]+)/i);
    if (descMatch) {
      result.description = descMatch[1].trim();
    }

    /* Parse @domains - supports wildcards like *jira* */
    const domainsMatch = searchArea.match(/@domains?[:\s]+([^\n*@]+)/i);
    if (domainsMatch) {
      result.domains = domainsMatch[1]
        .split(/[,\s]+/)
        .map(d => d.trim().toLowerCase())
        .filter(d => d.length > 0);
    }

    /* Fallbacks if metadata not present */
    if (!result.title) {
      result.title = filename.replace('.js', '').replace(/[-_]/g, ' ');
    }

    if (!result.description) {
      /* Try to find any descriptive comment in either location */
      const blockMatch = searchArea.match(/\/\*\s*([\s\S]*?)\s*\*\//);
      if (blockMatch) {
        const lines = blockMatch[1].split('\n')
          .map(l => l.replace(/^\s*\*\s*/, '').trim())
          .filter(l => l && !l.startsWith('@'));
        if (lines.length > 0 && lines[0].length > 5 && lines[0].length < 200) {
          result.description = lines[0];
        }
      }
      if (!result.description) {
        result.description = `Run ${result.title}`;
      }
    }

    return result;
  }

  /* Extract prefix from filename (e.g., "bsky" from "bsky_advanced_search.js") */
  function extractPrefix(filename) {
    const name = filename.replace('.js', '');
    const underscoreIdx = name.indexOf('_');
    if (underscoreIdx > 0 && underscoreIdx < 20) {
      return name.substring(0, underscoreIdx).toLowerCase();
    }
    return null;
  }

  /* Check if bookmarklet matches current domain */
  function matchesDomain(bookmarklet, domain) {
    /* No domain restriction = show everywhere */
    if (!bookmarklet.domains || bookmarklet.domains.length === 0) return true;
    /* No current domain = only show bookmarklets with no domain restrictions */
    if (!domain) return false;

    return bookmarklet.domains.some(d => {
      /* Wildcard pattern (e.g., *jira*, jira*, *jira) */
      if (d.includes('*')) {
        /* Convert wildcard to regex: escape special chars, replace * with .* */
        const regexPattern = d
          .split('*')
          .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*');
        /* Add anchors if wildcard doesn't start/end with * */
        const pattern = '^' + regexPattern + '$';
        const regex = new RegExp(pattern, 'i');
        return regex.test(domain);
      }
      /* Exact match or subdomain match */
      return domain === d || domain.endsWith('.' + d);
    });
  }

  /* Filter and group bookmarklets */
  function getFilteredAndGrouped() {
    const query = searchInput.value.toLowerCase().trim();
    
    /* Filter by domain and search */
    let filtered = allBookmarklets.filter(bm => {
      /* Domain filter - automatic based on @domains */
      if (!matchesDomain(bm, currentDomain)) {
        return false;
      }
      /* Search filter */
      if (query) {
        return bm.name.toLowerCase().includes(query) ||
               bm.description.toLowerCase().includes(query) ||
               bm.filename.toLowerCase().includes(query);
      }
      return true;
    });
    
    /* Separate domain-specific (hoisted) from general */
    const hoisted = [];
    const general = [];
    
    filtered.forEach(bm => {
      if (bm.domains && bm.domains.length > 0) {
        hoisted.push(bm);
      } else {
        general.push(bm);
      }
    });
    
    /* Sort hoisted alphabetically */
    hoisted.sort((a, b) => a.name.localeCompare(b.name));
    
    /* Count prefixes for general (non-hoisted) bookmarklets only */
    const prefixCounts = {};
    general.forEach(bm => {
      if (bm.prefix) {
        prefixCounts[bm.prefix] = (prefixCounts[bm.prefix] || 0) + 1;
      }
    });
    
    /* Determine which prefixes get grouped */
    const groupedPrefixes = new Set(
      Object.entries(prefixCounts)
        .filter(([, count]) => count > GROUP_THRESHOLD)
        .map(([prefix]) => prefix)
    );
    
    /* Build groups from general bookmarklets */
    const groups = {};
    const ungrouped = [];
    
    general.forEach(bm => {
      if (bm.prefix && groupedPrefixes.has(bm.prefix)) {
        if (!groups[bm.prefix]) {
          groups[bm.prefix] = [];
        }
        groups[bm.prefix].push(bm);
      } else {
        ungrouped.push(bm);
      }
    });
    
    /* Sort groups alphabetically */
    const sortedGroupNames = Object.keys(groups).sort();
    
    return { hoisted, groups, sortedGroupNames, ungrouped };
  }

  /* Render bookmarklet list with groups */
  function renderBookmarklets() {
    listEl.innerHTML = '';
    navigableItems = [];
    focusedIndex = -1;
    
    const { hoisted, groups, sortedGroupNames, ungrouped } = getFilteredAndGrouped();
    const totalCount = hoisted.length + sortedGroupNames.reduce((sum, g) => sum + groups[g].length, 0) + ungrouped.length;
    
    if (totalCount === 0) {
      listEl.innerHTML = '<div class="no-results">No bookmarklets found</div>';
      return;
    }
    
    /* Render hoisted (domain-specific) first */
    if (hoisted.length > 0) {
      hoisted.forEach(bm => {
        const item = createBookmarkletItem(bm);
        listEl.appendChild(item);
        navigableItems.push({ type: 'bookmarklet', element: item, bookmarklet: bm });
      });
      
      /* Add subtle separator if there are more items below */
      if (sortedGroupNames.length > 0 || ungrouped.length > 0) {
        const separator = document.createElement('div');
        separator.className = 'separator';
        listEl.appendChild(separator);
      }
    }
    
    /* Render groups (collapsed by default) */
    sortedGroupNames.forEach(groupName => {
      const items = groups[groupName];
      /* Default to collapsed unless explicitly expanded in stored state */
      const isCollapsed = !expandedGroups.has(groupName);
      
      /* Group header - navigable */
      const header = document.createElement('div');
      header.className = 'group-header' + (isCollapsed ? ' collapsed' : '');
      header.innerHTML = `
        <span>${escapeHtml(groupName)} <span class="domain-badge">${items.length}</span></span>
        <span class="chevron">▼</span>
      `;
      header.addEventListener('click', () => toggleGroup(groupName));
      listEl.appendChild(header);
      
      /* Add header to navigable items */
      navigableItems.push({ type: 'group', element: header, groupName: groupName });
      
      /* Group content */
      const content = document.createElement('div');
      content.className = 'group-content' + (isCollapsed ? ' collapsed' : '');
      content.dataset.group = groupName;
      
      items.forEach(bm => {
        const item = createBookmarkletItem(bm);
        content.appendChild(item);
        if (!isCollapsed) {
          navigableItems.push({ type: 'bookmarklet', element: item, bookmarklet: bm });
        }
      });
      
      listEl.appendChild(content);
    });
    
    /* Render ungrouped */
    ungrouped.forEach(bm => {
      const item = createBookmarkletItem(bm);
      listEl.appendChild(item);
      navigableItems.push({ type: 'bookmarklet', element: item, bookmarklet: bm });
    });
  }

  /* Create a bookmarklet list item */
  function createBookmarkletItem(bm) {
    const item = document.createElement('div');
    item.className = 'bookmarklet-item';

    const readmeLink = bm.readmeUrl
      ? `<a href="${escapeHtml(bm.readmeUrl)}" target="_blank" class="readme-link" title="View README">📖</a>`
      : '';

    item.innerHTML = `
      <div class="bookmarklet-name">${escapeHtml(bm.name)}</div>
      <div class="bookmarklet-desc"><span class="bookmarklet-desc-text">${escapeHtml(bm.description)}</span>${readmeLink}</div>
    `;

    item.addEventListener('click', () => executeBookmarklet(bm));

    /* Attach event listener to readme link to prevent propagation */
    if (bm.readmeUrl) {
      const linkEl = item.querySelector('.readme-link');
      if (linkEl) {
        linkEl.addEventListener('click', (e) => e.stopPropagation());
      }
    }

    return item;
  }

  /* Toggle group collapse */
  async function toggleGroup(groupName) {
    if (expandedGroups.has(groupName)) {
      expandedGroups.delete(groupName);
    } else {
      expandedGroups.add(groupName);
    }
    
    /* Persist expanded state */
    try {
      await chrome.storage.local.set({ [EXPANDED_KEY]: Array.from(expandedGroups) });
    } catch (err) { /* ignore */ }
    
    /* Remember we want to refocus this group */
    const refocusGroup = groupName;
    
    renderBookmarklets();
    
    /* Restore focus to the same group header */
    const newIndex = navigableItems.findIndex(item => 
      item.type === 'group' && item.groupName === refocusGroup
    );
    if (newIndex >= 0) {
      focusedIndex = newIndex;
      updateFocus();
    }
  }

  /* Handle search input changes */
  function handleFilterChange() {
    renderBookmarklets();
    focusedIndex = -1;
  }

  /* Update visual focus */
  function updateFocus() {
    clearFocus();
    if (focusedIndex >= 0 && focusedIndex < navigableItems.length) {
      const item = navigableItems[focusedIndex];
      item.element.classList.add('focused');
      item.element.scrollIntoView({ block: 'nearest' });
    }
  }

  function clearFocus() {
    document.querySelectorAll('.focused').forEach(el => {
      el.classList.remove('focused');
    });
  }

  /* Execute bookmarklet on current tab */
  async function executeBookmarklet(bookmarklet) {
    console.log('Bookmarklet Runner: Executing', bookmarklet.name);
    
    try {
      /* Get current tab */
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        showStatus('No active tab found', 'error');
        return;
      }
      
      /* Check for restricted URLs */
      if (tab.url.startsWith('chrome://') || 
          tab.url.startsWith('chrome-extension://') ||
          tab.url.startsWith('edge://') ||
          tab.url.startsWith('about:')) {
        showStatus('Cannot run on browser pages', 'error');
        return;
      }
      
      /* Prepare the code - strip javascript: prefix if present */
      let code = bookmarklet.code.trim();
      if (code.startsWith('javascript:')) {
        code = code.substring(11);
      }
      
      /* URL decode if needed */
      if (code.includes('%20') || code.includes('%28')) {
        try {
          code = decodeURIComponent(code);
        } catch (e) {
          console.log('Bookmarklet Runner: Decode failed, using original');
        }
      }
      
      /* Execute via scripting API - inject script element to bypass CSP */
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: injectBookmarkletScript,
        args: [code]
      });
      
      showStatus(`✓ Ran: ${bookmarklet.name}`, 'success');
      
      /* Auto-close popup after short delay */
      setTimeout(() => window.close(), 400);
      
    } catch (err) {
      console.error('Bookmarklet Runner: Execution error', err);
      showStatus('Execution failed: ' + err.message, 'error');
    }
  }

  /* Function injected into the page */
  function injectBookmarkletScript(code) {
    try {
      /* Execute directly like a real bookmarklet using eval() */
      /* This works in the global scope, matching how bookmarklets execute from the address bar */
      eval(code);
    } catch (err) {
      console.error('Bookmarklet error:', err);
      alert('Bookmarklet error: ' + err.message);
    }
  }

  /* Fetch repo contents from GitHub API */
  async function fetchRepoContents() {
    const path = FOLDER_PATH ? `/${FOLDER_PATH}` : '';
    const url = `${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents${path}`;
    console.log('Bookmarklet Runner: Fetching', url);

    const response = await fetch(url, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json();
  }

  /* Fetch individual file content */
  async function fetchFileContent(downloadUrl) {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status}`);
    }
    return response.text();
  }

  /* Cache management */
  async function getCachedBookmarklets() {
    try {
      const data = await chrome.storage.local.get(CACHE_KEY);
      if (data[CACHE_KEY]) {
        const { bookmarklets, timestamp } = data[CACHE_KEY];
        const age = Date.now() - timestamp;
        if (age < CACHE_DURATION_MS) {
          return bookmarklets;
        }
      }
    } catch (err) {
      console.error('Bookmarklet Runner: Cache read error', err);
    }
    return null;
  }

  async function cacheBookmarklets(bookmarklets) {
    try {
      await chrome.storage.local.set({
        [CACHE_KEY]: {
          bookmarklets: bookmarklets,
          timestamp: Date.now()
        }
      });
      console.log('Bookmarklet Runner: Cached', bookmarklets.length, 'bookmarklets');
    } catch (err) {
      console.error('Bookmarklet Runner: Cache write error', err);
    }
  }

  /* UI helpers */
  function showLoading(show) {
    loadingEl.classList.toggle('hidden', !show);
    listEl.classList.toggle('hidden', show);
  }

  function showStatus(message, type = '') {
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
    statusEl.classList.remove('hidden');
    
    if (type !== 'error') {
      setTimeout(hideStatus, 2000);
    }
  }

  function hideStatus() {
    statusEl.classList.add('hidden');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function debounce(fn, delay) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  }

})();
