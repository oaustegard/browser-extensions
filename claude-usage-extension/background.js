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

/* Generate canvas-based icon with two horizontal bars */
function generateIcon(fiveHourPct, weeklyPct, size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  /* Color function based on percentage */
  const getColor = (pct) => pct < 50 ? '#10b981' : pct < 80 ? '#f59e0b' : '#ef4444';

  /* Bars must fit in top ~40% of icon (badge covers bottom half) */
  const padding = size <= 16 ? 1 : 2;
  const barHeight = size <= 16 ? 2 : 3;
  const gap = size <= 16 ? 1 : 2;
  const barWidth = size - (padding * 2);

  /* Dark background for contrast */
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(0, 0, size, size);

  /* Top bar: 5-hour usage */
  const topY = padding;
  const fiveHourWidth = Math.max(1, (barWidth * fiveHourPct) / 100);
  ctx.fillStyle = getColor(fiveHourPct);
  ctx.fillRect(padding, topY, fiveHourWidth, barHeight);

  /* Bottom bar: Weekly usage */
  const bottomY = topY + barHeight + gap;
  const weeklyWidth = Math.max(1, (barWidth * weeklyPct) / 100);
  ctx.fillStyle = getColor(weeklyPct);
  ctx.fillRect(padding, bottomY, weeklyWidth, barHeight);

  return ctx.getImageData(0, 0, size, size);
}

/* Update icon and badge with usage data */
async function updateBadge(data) {
  const fiveHour = data.five_hour;
  const sevenDay = data.seven_day;

  if (!fiveHour) {
    updateBadgeError('No data');
    return;
  }

  const fiveHourPct = Math.round(fiveHour.utilization || 0);
  const sevenDayPct = Math.round(sevenDay?.utilization || 0);
  const fiveHourResets = fiveHour.resets_at;
  const sevenDayResets = sevenDay?.resets_at;

  /* Calculate weekly budget status: are we ahead or behind? */
  let weeklyStatus = 'ok'; /* 'ok' = ahead/on track, 'warning' = slightly over, 'danger' = significantly over */
  if (sevenDayResets) {
    const now = Date.now();
    const resetTime = new Date(sevenDayResets).getTime();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const timeElapsedMs = weekMs - (resetTime - now);
    const expectedPct = (timeElapsedMs / weekMs) * 100;
    const diff = sevenDayPct - expectedPct;

    if (diff > 15) {
      weeklyStatus = 'danger';  /* More than 15% over expected */
    } else if (diff > 5) {
      weeklyStatus = 'warning'; /* 5-15% over expected */
    }
  }

  /* Check if we should notify about high usage (based on 5hr) */
  await checkAndNotifyHighUsage(fiveHourPct);

  /* Generate dynamic icons at multiple sizes (two bars: 5hr on top, weekly below) */
  const icon16 = generateIcon(fiveHourPct, sevenDayPct, 16);
  const icon32 = generateIcon(fiveHourPct, sevenDayPct, 32);
  const icon48 = generateIcon(fiveHourPct, sevenDayPct, 48);

  /* Set the dynamic icon */
  chrome.action.setIcon({
    imageData: {
      16: icon16,
      32: icon32,
      48: icon48
    }
  });

  /* Set badge text with 5hr percentage */
  chrome.action.setBadgeText({ text: `${fiveHourPct}%` });

  /* Set badge colors based on weekly budget status */
  const badgeColors = {
    ok: { text: '#ffffff', bg: '#10b981' },       /* Green - on track */
    warning: { text: '#000000', bg: '#f59e0b' },  /* Yellow - slightly over */
    danger: { text: '#ffffff', bg: '#ef4444' }    /* Red - significantly over */
  };
  const colors = badgeColors[weeklyStatus];
  chrome.action.setBadgeTextColor({ color: colors.text });
  chrome.action.setBadgeBackgroundColor({ color: colors.bg });

  /* Format reset times for tooltip */
  const fiveHourResetStr = fiveHourResets
    ? new Date(fiveHourResets).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : 'Unknown';
  const sevenDayResetStr = sevenDayResets
    ? new Date(sevenDayResets).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
    : 'Unknown';

  /* Calculate expected usage for tooltip explanation */
  let weeklyStatusText = '';
  if (sevenDayResets) {
    const now = Date.now();
    const resetTime = new Date(sevenDayResets).getTime();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const timeElapsedMs = weekMs - (resetTime - now);
    const expectedPct = Math.round((timeElapsedMs / weekMs) * 100);
    const diff = sevenDayPct - expectedPct;
    if (diff > 5) {
      weeklyStatusText = `\n⚠️ ${Math.abs(diff)}% over pace`;
    } else if (diff < -5) {
      weeklyStatusText = `\n✓ ${Math.abs(diff)}% under pace`;
    } else {
      weeklyStatusText = '\n✓ On pace';
    }
  }

  /* Set detailed tooltip with both usage periods */
  const title = `Claude Usage Monitor\n5-hour: ${fiveHourPct}% (resets ${fiveHourResetStr})\nWeekly: ${sevenDayPct}% (resets ${sevenDayResetStr})${weeklyStatusText}`;
  chrome.action.setTitle({ title });

  log(`Icon updated: 5hr=${fiveHourPct}%, weekly=${sevenDayPct}%`);
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
