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
const emptyState = document.getElementById('empty-state');
const scrollBtn = document.getElementById('scroll-to-bottom');
const statTotal = document.getElementById('stat-total');
const statConversations = document.getElementById('stat-conversations');
const statAvgLatency = document.getElementById('stat-avg-latency');
const connectionDot = document.getElementById('connection-dot');
const connectionLabel = document.getElementById('connection-label');
const clearBtn = document.getElementById('clear-btn');
const logoutBtn = document.getElementById('logout-btn');

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
  renderAllConversations();
  updateStats();
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

/** Render all conversations from scratch */
function renderAllConversations() {
  // Remove all thread elements but keep empty state
  container.querySelectorAll('.conversation-thread').forEach((el) => el.remove());

  if (conversations.size === 0) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  // Sort threads by their first event timestamp
  const sorted = [...conversations.entries()].sort((a, b) => {
    const ta = a[1][0]?.timestamp ?? '';
    const tb = b[1][0]?.timestamp ?? '';
    return ta.localeCompare(tb);
  });

  for (const [contextId, events] of sorted) {
    const threadEl = createThreadElement(contextId, events);
    container.appendChild(threadEl);
  }
}

/** Render a single new event — either into existing thread or new thread */
function renderEvent(event) {
  emptyState.hidden = true;

  let threadEl = container.querySelector(
    `[data-context-id="${CSS.escape(event.contextId)}"]`
  );

  if (!threadEl) {
    // Create new thread with just this event
    threadEl = createThreadElement(event.contextId, [event]);
    container.appendChild(threadEl);
  } else {
    // Append bubble to existing thread's message list
    const messagesEl = threadEl.querySelector('.thread-messages');
    const bubble = createBubble(event);
    messagesEl.appendChild(bubble);

    // Update thread header badge count
    const badge = threadEl.querySelector('.thread-count');
    const thread = conversations.get(event.contextId);
    if (badge && thread) {
      badge.textContent = thread.length + ' msgs';
    }
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
  threadEl.className = 'conversation-thread';
  threadEl.dataset.contextId = contextId;

  // Thread header (collapsible)
  const header = document.createElement('div');
  header.className = 'thread-header';
  header.innerHTML = `
    <div class="thread-header-left">
      <span class="thread-toggle">▼</span>
      <span class="thread-direction-badge ${events[0]?.direction ?? 'inbound'}">
        ${events[0]?.direction === 'outbound' ? '↗ Outbound' : '↙ Inbound'}
      </span>
      <span class="thread-agents">
        ${getThreadAgents(events)}
      </span>
    </div>
    <div class="thread-header-right">
      <span class="thread-count">${events.length} msgs</span>
      <span class="thread-time">${formatTime(events[0]?.timestamp)}</span>
    </div>
  `;

  header.addEventListener('click', () => {
    threadEl.classList.toggle('collapsed');
    const toggle = header.querySelector('.thread-toggle');
    toggle.textContent = threadEl.classList.contains('collapsed') ? '▶' : '▼';
  });

  threadEl.appendChild(header);

  // Messages
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

/** Format ISO timestamp to local time string */
function formatTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoStr;
  }
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
