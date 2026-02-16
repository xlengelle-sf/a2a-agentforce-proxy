/**
 * Agents Management — Dashboard tab for managing external A2A agents
 * and viewing Agentforce configuration.
 */

// ─── State ──────────────────────────────────────────────────────────────────

/** @type {Array<ExternalAgent>} */
let externalAgents = [];

/** @type {string|null} alias of agent currently being edited inline */
let editingAlias = null;

/** @type {boolean} true when modal is in "edit" mode */
let modalEditMode = false;

// ─── DOM refs ───────────────────────────────────────────────────────────────

const externalList = document.getElementById('external-agents-list');
const agentforceList = document.getElementById('agentforce-agents-list');
const addBtn = document.getElementById('add-external-agent-btn');
const modalOverlay = document.getElementById('agent-modal-overlay');
const modalTitle = document.getElementById('agent-modal-title');
const modalForm = document.getElementById('agent-modal-form');
const modalClose = document.getElementById('agent-modal-close');
const modalCancel = document.getElementById('agent-modal-cancel');
const modalSave = document.getElementById('agent-modal-save');
const aliasInput = document.getElementById('agent-alias');
const urlInput = document.getElementById('agent-url');
const descInput = document.getElementById('agent-description');
const authTypeSelect = document.getElementById('agent-auth-type');
const authTokenInput = document.getElementById('agent-auth-token');
const authHeaderInput = document.getElementById('agent-auth-header');
const tokenGroup = document.getElementById('agent-token-group');
const headerGroup = document.getElementById('agent-header-group');

// ─── API helpers ────────────────────────────────────────────────────────────

async function apiGet(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `POST ${path} failed`);
  return data;
}

async function apiPut(path, body) {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `PUT ${path} failed`);
  return data;
}

async function apiDelete(path) {
  const res = await fetch(path, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `DELETE ${path} failed`);
  return data;
}

// ─── Load data ──────────────────────────────────────────────────────────────

async function loadExternalAgents() {
  try {
    const data = await apiGet('/dashboard/api/agents/external');
    externalAgents = data.agents || [];
    renderExternalAgents();
  } catch (err) {
    externalList.innerHTML = `<div class="agents-error">Failed to load agents: ${err.message}</div>`;
  }
}

async function loadAgentforceConfig() {
  try {
    const data = await apiGet('/dashboard/api/agents/agentforce');
    renderAgentforceConfig(data.agents || []);
  } catch (err) {
    agentforceList.innerHTML = `<div class="agents-error">Failed to load configuration: ${err.message}</div>`;
  }
}

// ─── Render External Agents ─────────────────────────────────────────────────

function renderExternalAgents() {
  if (externalAgents.length === 0) {
    externalList.innerHTML = `
      <div class="agents-empty">
        <span class="agents-empty-icon">🤖</span>
        <p>No external agents registered yet.</p>
        <p>Click <strong>+ Add Agent</strong> to register your first A2A agent.</p>
      </div>`;
    return;
  }

  externalList.innerHTML = '';
  for (const agent of externalAgents) {
    externalList.appendChild(createAgentRow(agent));
  }
}

/**
 * Create a single agent row card.
 * @param {object} agent
 * @returns {HTMLElement}
 */
function createAgentRow(agent) {
  const row = document.createElement('div');
  row.className = 'agent-row';
  row.dataset.alias = agent.alias;

  const authBadge = agent.authType === 'none'
    ? '<span class="auth-badge auth-none">No Auth</span>'
    : agent.authType === 'bearer'
      ? '<span class="auth-badge auth-bearer">Bearer</span>'
      : '<span class="auth-badge auth-apikey">API Key</span>';

  const tokenDisplay = agent.authToken
    ? (agent.authToken.startsWith('ENV:')
        ? `<code class="token-env">${escapeHtml(agent.authToken)}</code>`
        : '<span class="token-masked">••••••••</span>')
    : '<span class="token-none">—</span>';

  row.innerHTML = `
    <div class="agent-row-main">
      <div class="agent-row-header">
        <strong class="agent-alias-label">${escapeHtml(agent.alias)}</strong>
        ${authBadge}
      </div>
      <div class="agent-row-url">${escapeHtml(agent.url)}</div>
      ${agent.description ? `<div class="agent-row-desc">${escapeHtml(agent.description)}</div>` : ''}
      <div class="agent-row-token">Token: ${tokenDisplay}</div>
    </div>
    <div class="agent-row-actions">
      <button class="btn btn-secondary btn-sm agent-edit-btn" title="Edit">Edit</button>
      <button class="btn btn-danger btn-sm agent-delete-btn" title="Delete">Delete</button>
    </div>
  `;

  // Edit button → open modal in edit mode
  row.querySelector('.agent-edit-btn').addEventListener('click', () => {
    openEditModal(agent);
  });

  // Delete button → confirm and delete
  row.querySelector('.agent-delete-btn').addEventListener('click', async () => {
    if (!confirm(`Delete agent "${agent.alias}"? This cannot be undone.`)) return;
    try {
      await apiDelete(`/dashboard/api/agents/external/${encodeURIComponent(agent.alias)}`);
      await loadExternalAgents();
    } catch (err) {
      alert('Failed to delete agent: ' + err.message);
    }
  });

  return row;
}

// ─── Render Agentforce Config ───────────────────────────────────────────────

function renderAgentforceConfig(agents) {
  if (agents.length === 0) {
    agentforceList.innerHTML = `
      <div class="agents-empty">
        <span class="agents-empty-icon">⚙️</span>
        <p>No Agentforce configuration found.</p>
        <p>Set the <code>SALESFORCE_AGENT_ID</code> environment variable to configure.</p>
      </div>`;
    return;
  }

  agentforceList.innerHTML = '';
  for (const agent of agents) {
    const row = document.createElement('div');
    row.className = 'agent-row agentforce-row';

    const fields = [
      { label: 'Agent ID', value: agent.agentId || '—', mono: true },
      { label: 'Server URL', value: agent.serverUrl || '—' },
      { label: 'Client Email', value: agent.clientEmail || '—' },
      { label: 'Client ID', value: agent.clientId ? agent.clientId.slice(0, 20) + '...' : '—', mono: true },
      { label: 'Client Secret', value: agent.hasClientSecret ? '••••••••' : 'Not set' },
    ];

    row.innerHTML = `
      <div class="agent-row-main">
        <div class="agent-row-header">
          <strong class="agent-alias-label">Agentforce Agent</strong>
          <span class="auth-badge auth-oauth">OAuth 2.0</span>
        </div>
        <div class="agentforce-fields">
          ${fields
            .map(
              (f) =>
                `<div class="af-field">
                  <span class="af-field-label">${f.label}</span>
                  <span class="af-field-value${f.mono ? ' mono' : ''}">${escapeHtml(f.value)}</span>
                </div>`
            )
            .join('')}
        </div>
      </div>
      <div class="agent-row-actions">
        <span class="env-badge">ENV</span>
      </div>
    `;

    agentforceList.appendChild(row);
  }
}

// ─── Modal ──────────────────────────────────────────────────────────────────

function openAddModal() {
  modalEditMode = false;
  modalTitle.textContent = 'Add External Agent';
  modalSave.textContent = 'Add Agent';
  aliasInput.disabled = false;
  modalForm.reset();
  authTypeSelect.value = 'bearer';
  updateAuthFields();
  showModal();
}

function openEditModal(agent) {
  modalEditMode = true;
  editingAlias = agent.alias;
  modalTitle.textContent = 'Edit Agent: ' + agent.alias;
  modalSave.textContent = 'Save Changes';
  aliasInput.value = agent.alias;
  aliasInput.disabled = true; // Can't change alias
  urlInput.value = agent.url;
  descInput.value = agent.description || '';
  authTypeSelect.value = agent.authType;
  authTokenInput.value = agent.authToken || '';
  authHeaderInput.value = agent.authHeader || '';
  updateAuthFields();
  showModal();
}

function showModal() {
  modalOverlay.hidden = false;
  // Focus first available input
  setTimeout(() => {
    if (!aliasInput.disabled) aliasInput.focus();
    else urlInput.focus();
  }, 100);
}

function hideModal() {
  modalOverlay.hidden = true;
  editingAlias = null;
}

function updateAuthFields() {
  const type = authTypeSelect.value;
  if (type === 'none') {
    tokenGroup.hidden = true;
    headerGroup.hidden = true;
  } else if (type === 'bearer') {
    tokenGroup.hidden = false;
    headerGroup.hidden = true;
  } else {
    tokenGroup.hidden = false;
    headerGroup.hidden = false;
  }
}

// ─── Modal Event Listeners ──────────────────────────────────────────────────

addBtn.addEventListener('click', openAddModal);
modalClose.addEventListener('click', hideModal);
modalCancel.addEventListener('click', hideModal);

// Close modal on overlay click
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) hideModal();
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalOverlay.hidden) hideModal();
});

// Auth type change
authTypeSelect.addEventListener('change', updateAuthFields);

// Form submit
modalForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const body = {
    alias: aliasInput.value.trim(),
    url: urlInput.value.trim(),
    description: descInput.value.trim(),
    authType: authTypeSelect.value,
    authToken: authTokenInput.value.trim(),
    authHeader: authHeaderInput.value.trim(),
  };

  if (!body.alias || !body.url) {
    alert('Alias and URL are required.');
    return;
  }

  modalSave.disabled = true;
  modalSave.textContent = 'Saving...';

  try {
    if (modalEditMode && editingAlias) {
      await apiPut(
        `/dashboard/api/agents/external/${encodeURIComponent(editingAlias)}`,
        body
      );
    } else {
      await apiPost('/dashboard/api/agents/external', body);
    }
    hideModal();
    await loadExternalAgents();
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    modalSave.disabled = false;
    modalSave.textContent = modalEditMode ? 'Save Changes' : 'Add Agent';
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Init ───────────────────────────────────────────────────────────────────

// Load agents when the Agents tab is first shown
const agentsTab = document.querySelector('[data-tab="agents"]');
let agentsLoaded = false;

agentsTab.addEventListener('click', () => {
  if (!agentsLoaded) {
    agentsLoaded = true;
    loadExternalAgents();
    loadAgentforceConfig();
  }
});

// Also load if the tab is already active (deep link)
if (agentsTab.classList.contains('active')) {
  agentsLoaded = true;
  loadExternalAgents();
  loadAgentforceConfig();
}
