/* Claude Usage Monitor - Background Service Worker */

const POLL_INTERVAL_MINUTES = Math.max(1, 5); /* Chrome minimum is 1 minute */
const ALARM_NAME = 'usagePoll';
const HIGH_USAGE_THRESHOLD = 80; /* Percentage to trigger notification */

/* Logging helpers */
function log(...args) {
  console.log('[Claude Usage]', ...args);
}

function logError(...args) {
  console.error('[Claude Usage]', ...args);
}

/* Initialize on install */
chrome.runtime.onInstalled.addListener(() => {
  log('Claude Usage Monitor installed');
  initializeMonitoring();
});

/* Resume monitoring on startup */
chrome.runtime.onStartup.addListener(() => {
  log('Claude Usage Monitor started');
  initializeMonitoring();
});

/* Handle icon click - open usage page */
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'https://claude.ai/settings/usage' });
});

/* Set up periodic polling */
async function initializeMonitoring() {
  /* Clear any existing alarms */
  await chrome.alarms.clear(ALARM_NAME);
  
  /* Create alarm for periodic updates */
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: POLL_INTERVAL_MINUTES
  });
  
  /* Fetch immediately on init */
  await fetchAndUpdateUsage();
}

/* Listen for alarm */
chrome.alarms.onAlarm.addListener(() => {
  log('Polling Claude usage...');
  fetchAndUpdateUsage();
});

/* Fetch usage data and update badge */
async function fetchAndUpdateUsage() {
  try {
    /* Get org ID (cached or fetch fresh) */
    const orgId = await getOrganizationId();

    if (!orgId) {
      updateBadgeError('No org ID');
      return;
    }

    /* Fetch usage data */
    const response = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, {
      credentials: 'include'
    });

    if (!response.ok) {
      /* Clear org ID cache on auth errors */
      if (response.status === 401 || response.status === 403) {
        log('Auth error, clearing org ID cache');
        await chrome.storage.local.remove('orgId');
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    log('Usage data:', data);

    /* Update badge with data */
    await updateBadge(data);

  } catch (error) {
    logError('Failed to fetch usage:', error);
    updateBadgeError(error.message);
  }
}

/* Get organization ID from bootstrap API */
async function getOrganizationId() {
  try {
    /* Check cache first */
    const cached = await chrome.storage.local.get('orgId');
    if (cached.orgId) {
      log('Using cached org ID:', cached.orgId);
      return cached.orgId;
    }

    /* Fetch from bootstrap API */
    log('Fetching org ID from bootstrap...');
    const response = await fetch('https://claude.ai/api/bootstrap', {
      credentials: 'include'
    });

    if (!response.ok) {
      /* Clear cache on auth errors */
      if (response.status === 401 || response.status === 403) {
        await chrome.storage.local.remove('orgId');
      }
      throw new Error(`Bootstrap failed: HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    /* Extract org ID from response */
    const orgId = data?.account?.memberships?.[0]?.organization?.uuid;
    
    if (!orgId) {
      throw new Error('Org ID not found in bootstrap response');
    }
    
    /* Cache it */
    await chrome.storage.local.set({ orgId });
    log('Cached org ID:', orgId);

    return orgId;

  } catch (error) {
    logError('Failed to get org ID:', error);
    return null;
  }
}

/* Generate canvas-based icon with thermometer bar */
function generateIcon(percentage, size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  /* Determine fill color based on percentage */
  const fillColor = percentage < 50 ? '#10b981' : percentage < 80 ? '#f59e0b' : '#ef4444';
  const claudeOrange = '#D97706';

  /* Scale dimensions based on icon size */
  const padding = size <= 16 ? 1 : 2;
  const borderWidth = size <= 16 ? 1 : 2;

  /* Frame dimensions (top 40% of icon) */
  const frameX = padding;
  const frameY = padding;
  const frameWidth = size - (padding * 2);
  const frameHeight = Math.floor(size * 0.4);

  /* Draw Claude orange frame */
  ctx.fillStyle = claudeOrange;
  ctx.fillRect(frameX, frameY, frameWidth, borderWidth);
  ctx.fillRect(frameX, frameY, borderWidth, frameHeight);
  ctx.fillRect(frameX + frameWidth - borderWidth, frameY, borderWidth, frameHeight);
  ctx.fillRect(frameX, frameY + frameHeight - borderWidth, frameWidth, borderWidth);

  /* Draw inner thermometer bar fill */
  const barX = frameX + borderWidth;
  const barY = frameY + borderWidth;
  const barMaxWidth = frameWidth - (borderWidth * 2);
  const barHeight = frameHeight - (borderWidth * 2);
  const barWidth = Math.max(1, (barMaxWidth * percentage) / 100);

  if (barHeight > 0 && barWidth > 0) {
    ctx.fillStyle = fillColor;
    ctx.fillRect(barX, barY, barWidth, barHeight);
  }

  return ctx.getImageData(0, 0, size, size);
}

/* Update icon and badge with usage data */
async function updateBadge(data) {
  const fiveHour = data.five_hour;

  if (!fiveHour) {
    updateBadgeError('No data');
    return;
  }

  const percentage = fiveHour.utilization || 0;
  const resetsAt = fiveHour.resets_at;

  /* Check if we should notify about high usage */
  await checkAndNotifyHighUsage(percentage);
  
  /* Generate dynamic icons at multiple sizes */
  const icon16 = generateIcon(percentage, 16);
  const icon32 = generateIcon(percentage, 32);
  const icon48 = generateIcon(percentage, 48);
  
  /* Set the dynamic icon */
  chrome.action.setIcon({
    imageData: {
      16: icon16,
      32: icon32,
      48: icon48
    }
  });
  
  /* Set badge text with percentage */
  chrome.action.setBadgeText({ text: `${percentage}%` });
  
  /* Set Claude orange color for badge text */
  chrome.action.setBadgeTextColor({ color: '#D97706' });
  
  /* Set transparent background */
  chrome.action.setBadgeBackgroundColor({ color: [0, 0, 0, 0] });
  
  /* Format reset time for tooltip */
  const resetTimeStr = resetsAt
    ? new Date(resetsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : 'Unknown';
  
  /* Set detailed tooltip */
  const title = `Claude Usage Monitor\n${percentage}% used\nResets at ${resetTimeStr}`;
  chrome.action.setTitle({ title });

  log(`Icon updated: ${percentage}% used, resets at ${resetTimeStr}`);
}

/* Check and notify if usage is high */
async function checkAndNotifyHighUsage(percentage) {
  if (percentage < HIGH_USAGE_THRESHOLD) {
    /* Reset notification flag when below threshold */
    await chrome.storage.local.set({ notifiedHighUsage: false });
    return;
  }

  /* Check if we've already notified */
  const { notifiedHighUsage } = await chrome.storage.local.get('notifiedHighUsage');

  if (notifiedHighUsage) {
    return; /* Already notified for this high usage period */
  }

  /* Show notification */
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'Claude Usage Warning',
    message: `You've used ${percentage}% of your Claude limit. Usage will reset soon.`,
    priority: 2
  });

  /* Mark as notified */
  await chrome.storage.local.set({ notifiedHighUsage: true });
  log(`High usage notification sent: ${percentage}%`);
}

/* Update badge to show error state */
function updateBadgeError(message) {
  /* Use static error icon */
  chrome.action.setIcon({ path: 'error-icon.png' });
  chrome.action.setBadgeText({ text: '' });
  chrome.action.setTitle({ title: `Make sure you are logged in to Claude.ai!\nError: ${message}` });
}
