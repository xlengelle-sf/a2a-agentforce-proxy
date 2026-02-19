/**
 * Conversation Monitor — Real-time iMessage-style agent conversation viewer.
 *
 * Uses SSE (EventSource) to receive live events from the dashboard backend.
 * Groups messages by contextId into conversation threads, renders them as
 * chat bubbles, and tracks statistics.
 */

/* global EventSource */

// ─── State ──────────────────────────────────────────────────────────────────

/** @type {Map<string, Array<ConversationEvent>>} contextId → events */
const conversations = new Map();

/** @type {number[]} latency values for average calculation */
const latencies = [];

/** @type {boolean} whether user has scrolled away from bottom */
let userScrolledUp = false;

/** @type {EventSource|null} */
let eventSource = null;

// ─── DOM refs ───────────────────────────────────────────────────────────────

const container = document.getElementById('conversations-container');
const scrollBtn = document.getElementById('scroll-to-bottom');
const statTotal = document.getElementById('stat-total');
const statConversations = document.getElementById('stat-conversations');
const statAvgLatency = document.getElementById('stat-avg-latency');
const connectionDot = document.getElementById('connection-dot');
const connectionLabel = document.getElementById('connection-label');
const clearBtn = document.getElementById('clear-btn');
const logoutBtn = document.getElementById('logout-btn');

// ─── Filter state ────────────────────────────────────────────────────────
let activeDirectionFilter = 'all';
let activeAgentFilter = 'all';
const seenAgents = new Set();

// ─── New DOM refs ────────────────────────────────────────────────────────
const filterDirectionBtns = document.querySelectorAll('#filter-direction .filter-chip');
const filterAgentSelect = document.getElementById('filter-agent-select');
const tipBarToggle = document.getElementById('tip-bar-toggle');
const tipBarDetail = document.getElementById('tip-bar-detail');
const tipBar = document.getElementById('tip-bar');
const tipBarChevron = document.getElementById('tip-bar-chevron');

// ─── Tab switching ──────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    // Deactivate all tabs
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tab-content').forEach((c) => {
      c.classList.remove('active');
    });

    // Activate clicked tab
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    const targetId = 'tab-' + btn.dataset.tab;
    const targetPanel = document.getElementById(targetId);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }
  });
});

// ─── Logout ─────────────────────────────────────────────────────────────────

logoutBtn.addEventListener('click', async () => {
  try {
    await fetch('/dashboard/logout', { method: 'POST' });
  } catch {
    // Ignore errors
  }
  window.location.href = '/dashboard/login';
});

// ─── Clear display ──────────────────────────────────────────────────────────

clearBtn.addEventListener('click', () => {
  conversations.clear();
  latencies.length = 0;
  seenAgents.clear();
  updateAgentFilter();
  renderAllConversations();
  updateStats();
});

// ─── Filter handlers ─────────────────────────────────────────────────────

filterDirectionBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    filterDirectionBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeDirectionFilter = btn.dataset.direction;
    renderAllConversations();
  });
});

filterAgentSelect.addEventListener('change', () => {
  activeAgentFilter = filterAgentSelect.value;
  renderAllConversations();
});

// ─── Tip bar toggle ──────────────────────────────────────────────────────

tipBarToggle.addEventListener('click', () => {
  const isExpanded = !tipBarDetail.hidden;
  tipBarDetail.hidden = isExpanded;
  tipBar.classList.toggle('expanded', !isExpanded);
});

// ─── SSE Connection ─────────────────────────────────────────────────────────

function connectSSE() {
  setConnectionState('reconnecting');

  eventSource = new EventSource('/dashboard/events');

  eventSource.addEventListener('open', () => {
    setConnectionState('connected');
  });

  // History event — bulk load of stored events
  eventSource.addEventListener('history', (e) => {
    try {
      const events = JSON.parse(e.data);
      if (Array.isArray(events)) {
        for (const event of events) {
          addEvent(event, false);
        }
        renderAllConversations();
        updateStats();
        scrollToBottom(true);
      }
    } catch (err) {
      console.error('Failed to parse history event:', err);
    }
  });

  // Live conversation event
  eventSource.addEventListener('conversation', (e) => {
    try {
      const event = JSON.parse(e.data);
      addEvent(event, true);
      updateStats();
    } catch (err) {
      console.error('Failed to parse conversation event:', err);
    }
  });

  eventSource.addEventListener('error', () => {
    setConnectionState('disconnected');
    // EventSource auto-reconnects — we just update the UI
  });
}

// ─── Connection status ──────────────────────────────────────────────────────

function setConnectionState(state) {
  connectionDot.className = 'connection-dot ' + state;
  switch (state) {
    case 'connected':
      connectionLabel.textContent = 'Connected';
      break;
    case 'reconnecting':
      connectionLabel.textContent = 'Reconnecting…';
      break;
    case 'disconnected':
      connectionLabel.textContent = 'Disconnected';
      break;
  }
}

// ─── Event handling ─────────────────────────────────────────────────────────

/**
 * Add an event to state and optionally render it.
 * @param {object} event - ConversationEvent
 * @param {boolean} render - Whether to render immediately (false for bulk history)
 */
function addEvent(event, render) {
  const { contextId } = event;
  if (!conversations.has(contextId)) {
    conversations.set(contextId, []);
  }

  // Avoid duplicates (history + live can overlap)
  const thread = conversations.get(contextId);
  if (thread.some((e) => e.id === event.id)) {
    return;
  }

  thread.push(event);

  // Track unique agents for filter dropdown
  if (event.source) seenAgents.add(event.source);
  if (event.target) seenAgents.add(event.target);
  updateAgentFilter();

  // Track latency
  if (event.latencyMs && event.messageType === 'response') {
    latencies.push(event.latencyMs);
  }

  if (render) {
    renderEvent(event);
    if (!userScrolledUp) {
      scrollToBottom(false);
    } else {
      scrollBtn.hidden = false;
    }
  }
}

// ─── Rendering ──────────────────────────────────────────────────────────────

/** Render all conversations from scratch, applying active filters */
function renderAllConversations() {
  container.querySelectorAll('.conversation-thread, .date-separator').forEach((el) => el.remove());

  // Sort threads by latest event timestamp (newest first)
  const sorted = [...conversations.entries()].sort((a, b) => {
    const ta = a[1][a[1].length - 1]?.timestamp ?? '';
    const tb = b[1][b[1].length - 1]?.timestamp ?? '';
    return tb.localeCompare(ta);
  });

  let lastDateLabel = '';

  for (const [contextId, events] of sorted) {
    // Apply direction filter
    if (activeDirectionFilter !== 'all') {
      const dir = events[0]?.direction;
      if (dir !== activeDirectionFilter) continue;
    }

    // Apply agent filter
    if (activeAgentFilter !== 'all') {
      const hasAgent = events.some(
        (e) => e.source === activeAgentFilter || e.target === activeAgentFilter
      );
      if (!hasAgent) continue;
    }

    // Date separator
    const dateLabel = getDateLabel(events[events.length - 1]?.timestamp);
    if (dateLabel && dateLabel !== lastDateLabel) {
      lastDateLabel = dateLabel;
      const sep = document.createElement('div');
      sep.className = 'date-separator';
      sep.innerHTML = `<span class="date-separator-label">${dateLabel}</span>`;
      container.appendChild(sep);
    }

    const threadEl = createThreadElement(contextId, events);
    container.appendChild(threadEl);
  }
}

/** Render a single new event — either into existing thread or new thread */
function renderEvent(event) {
  let threadEl = container.querySelector(
    `[data-context-id="${CSS.escape(event.contextId)}"]`
  );

  if (!threadEl) {
    threadEl = createThreadElement(event.contextId, [event]);

    // Apply current filters — hide if doesn't match
    if (activeDirectionFilter !== 'all' && event.direction !== activeDirectionFilter) {
      threadEl.style.display = 'none';
    }
    if (activeAgentFilter !== 'all' && event.source !== activeAgentFilter && event.target !== activeAgentFilter) {
      threadEl.style.display = 'none';
    }

    // Insert at top (newest first)
    container.prepend(threadEl);
  } else {
    const messagesEl = threadEl.querySelector('.thread-messages');
    messagesEl.appendChild(createBubble(event));

    // Update header count and time
    const badge = threadEl.querySelector('.thread-count');
    const thread = conversations.get(event.contextId);
    if (badge && thread) badge.textContent = thread.length + ' msgs';

    const timeEl = threadEl.querySelector('.thread-time');
    if (timeEl) timeEl.textContent = formatTime(event.timestamp);

    const dateEl = threadEl.querySelector('.thread-date');
    if (dateEl) dateEl.textContent = formatDate(event.timestamp);
  }
}

/**
 * Create a conversation thread element.
 * @param {string} contextId
 * @param {Array<object>} events
 * @returns {HTMLElement}
 */
function createThreadElement(contextId, events) {
  const threadEl = document.createElement('div');
  threadEl.className = 'conversation-thread collapsed'; // collapsed by default
  threadEl.dataset.contextId = contextId;

  const latestEvent = events[events.length - 1];
  const direction = events[0]?.direction ?? 'inbound';

  const header = document.createElement('div');
  header.className = 'thread-header';
  header.innerHTML = `
    <div class="thread-header-left">
      <span class="thread-toggle">▸</span>
      <span class="thread-direction-badge ${direction}">
        ${direction === 'outbound' ? '↗ OUTBOUND' : '↙ INBOUND'}
      </span>
      <span class="thread-agents">${getThreadAgents(events)}</span>
    </div>
    <div class="thread-header-right">
      <span class="thread-count">${events.length} msgs</span>
      <span class="thread-time">${formatTime(latestEvent?.timestamp)}</span>
      <span class="thread-date">${formatDate(latestEvent?.timestamp)}</span>
    </div>
  `;

  header.addEventListener('click', () => {
    threadEl.classList.toggle('collapsed');
    const toggle = header.querySelector('.thread-toggle');
    toggle.textContent = threadEl.classList.contains('collapsed') ? '▸' : '▾';
  });

  threadEl.appendChild(header);

  const messagesEl = document.createElement('div');
  messagesEl.className = 'thread-messages';
  for (const event of events) {
    messagesEl.appendChild(createBubble(event));
  }
  threadEl.appendChild(messagesEl);

  return threadEl;
}

/**
 * Create a single message bubble.
 * @param {object} event - ConversationEvent
 * @returns {HTMLElement}
 */
function createBubble(event) {
  const bubble = document.createElement('div');

  // Determine alignment: requests from the initiating side go left,
  // responses go right. For inbound: request=left, response=right.
  // For outbound: request=left, response=right.
  const isRequest = event.messageType === 'request';
  const side = isRequest ? 'left' : 'right';
  const colorClass = event.direction === 'inbound' ? 'inbound' : 'outbound';

  bubble.className = `bubble bubble-${side} bubble-${colorClass} bubble-enter`;

  // Bubble sender label
  const sender = document.createElement('div');
  sender.className = 'bubble-sender';
  sender.textContent = event.source;
  bubble.appendChild(sender);

  // Bubble content
  const content = document.createElement('div');
  content.className = 'bubble-content';
  content.textContent = event.content || '[empty]';
  bubble.appendChild(content);

  // Bubble metadata line
  const meta = document.createElement('div');
  meta.className = 'bubble-meta';

  const timeSpan = document.createElement('span');
  timeSpan.className = 'bubble-time';
  timeSpan.textContent = formatTime(event.timestamp);
  meta.appendChild(timeSpan);

  if (event.messageType) {
    const typeSpan = document.createElement('span');
    typeSpan.className = 'bubble-type bubble-type-' + event.messageType;
    typeSpan.textContent = event.messageType;
    meta.appendChild(typeSpan);
  }

  if (event.latencyMs != null) {
    const latencySpan = document.createElement('span');
    latencySpan.className = 'bubble-latency';
    latencySpan.textContent = formatLatency(event.latencyMs);
    meta.appendChild(latencySpan);
  }

  if (event.metadata?.streaming) {
    const streamBadge = document.createElement('span');
    streamBadge.className = 'bubble-badge streaming';
    streamBadge.textContent = '⚡ Stream';
    meta.appendChild(streamBadge);
  }

  bubble.appendChild(meta);

  // Trigger enter animation on next frame
  requestAnimationFrame(() => {
    bubble.classList.remove('bubble-enter');
  });

  return bubble;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get a string like "Agent A ↔ Agent B" for the thread header */
function getThreadAgents(events) {
  const agents = new Set();
  for (const e of events) {
    agents.add(e.source);
    agents.add(e.target);
  }
  return [...agents].join(' ↔ ');
}

/** Format ISO timestamp to "HH:MM" */
function formatTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch { return isoStr; }
}

/** Format ISO timestamp to "Feb 17, 2026" */
function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

/** Get a date label for grouping: "Today", "Yesterday", or "Feb 17, 2026" */
function getDateLabel(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const eventDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (eventDay.getTime() === today.getTime()) return 'Today';
  if (eventDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return formatDate(isoStr);
}

/** Format latency in ms to a human-readable string */
function formatLatency(ms) {
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

/** Update the stats bar */
function updateStats() {
  let totalMessages = 0;
  for (const thread of conversations.values()) {
    totalMessages += thread.length;
  }

  statTotal.textContent = totalMessages;
  statConversations.textContent = conversations.size;

  if (latencies.length > 0) {
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    statAvgLatency.textContent = formatLatency(Math.round(avg));
  } else {
    statAvgLatency.textContent = '—';
  }
}

/** Populate the agent filter dropdown with seen agents */
function updateAgentFilter() {
  const current = filterAgentSelect.value;
  const options = ['<option value="all">All agents</option>'];
  for (const agent of [...seenAgents].sort()) {
    options.push(`<option value="${agent}"${agent === current ? ' selected' : ''}>${agent}</option>`);
  }
  filterAgentSelect.innerHTML = options.join('');
}

// ─── Scroll management ─────────────────────────────────────────────────────

function scrollToBottom(force) {
  if (force || !userScrolledUp) {
    container.scrollTop = container.scrollHeight;
    scrollBtn.hidden = true;
  }
}

container.addEventListener('scroll', () => {
  const threshold = 100; // px from bottom
  const atBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  userScrolledUp = !atBottom;

  if (atBottom) {
    scrollBtn.hidden = true;
  }
});

scrollBtn.addEventListener('click', () => {
  scrollToBottom(true);
  userScrolledUp = false;
});

// ─── Init ───────────────────────────────────────────────────────────────────

connectSSE();
