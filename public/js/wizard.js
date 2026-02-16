/**
 * Setup Wizard — Guided Salesforce Agentforce configuration.
 *
 * 8-step wizard: Welcome → Connected App → OAuth → Agent Selection →
 *                Agent Test → Proxy Config → Outbound Setup → Complete
 */

// ─── State ──────────────────────────────────────────────────────────────────

let currentStep = 0;
const totalSteps = 8;

/** Cached OAuth result for downstream steps */
let oauthResult = null;

/** Selected agent for testing */
let selectedAgent = null;

// ─── DOM refs ───────────────────────────────────────────────────────────────

const wizardContainer = document.getElementById('wizard-container');
const progressBar = document.getElementById('wizard-progress-bar');
const progressText = document.getElementById('wizard-progress-text');
const prevBtn = document.getElementById('wizard-prev');
const nextBtn = document.getElementById('wizard-next');

// ─── Step Definitions ───────────────────────────────────────────────────────

const steps = [
  { title: 'Welcome', render: renderWelcome },
  { title: 'Connected App', render: renderConnectedApp },
  { title: 'OAuth Credentials', render: renderOAuth },
  { title: 'Agent Selection', render: renderAgentSelection },
  { title: 'Agent Test', render: renderAgentTest },
  { title: 'Proxy Configuration', render: renderProxyConfig },
  { title: 'Outbound Setup', render: renderOutboundSetup },
  { title: 'Complete', render: renderComplete },
];

// ─── Navigation ─────────────────────────────────────────────────────────────

function goToStep(step) {
  currentStep = Math.max(0, Math.min(step, totalSteps - 1));
  renderStep();
}

function renderStep() {
  // Update progress
  const pct = ((currentStep + 1) / totalSteps) * 100;
  progressBar.style.width = pct + '%';
  progressText.textContent = `Step ${currentStep + 1} of ${totalSteps}: ${steps[currentStep].title}`;

  // Update buttons
  prevBtn.disabled = currentStep === 0;
  nextBtn.textContent = currentStep === totalSteps - 1 ? 'Finish' : 'Next →';

  // Render content
  steps[currentStep].render();
}

if (prevBtn) {
  prevBtn.addEventListener('click', () => goToStep(currentStep - 1));
}
if (nextBtn) {
  nextBtn.addEventListener('click', () => {
    if (currentStep === totalSteps - 1) {
      // Switch to conversations tab
      document.querySelector('[data-tab="conversations"]')?.click();
    } else {
      goToStep(currentStep + 1);
    }
  });
}

// ─── Step Renderers ─────────────────────────────────────────────────────────

function renderWelcome() {
  wizardContainer.innerHTML = `
    <div class="wizard-step">
      <h2>Welcome to the Setup Wizard</h2>
      <p>This wizard will guide you through configuring Salesforce Agentforce to work with the A2A Proxy.</p>

      <div class="wizard-checklist">
        <h3>Prerequisites</h3>
        <ul>
          <li>A Salesforce org with Agentforce enabled</li>
          <li>System Administrator access to your Salesforce org</li>
          <li>An Agentforce agent created and activated</li>
          <li>Access to Salesforce Setup (for Connected App creation)</li>
        </ul>
      </div>

      <div class="wizard-info-box">
        <strong>What we'll set up:</strong>
        <ol>
          <li>Connected App for OAuth authentication</li>
          <li>OAuth credential testing</li>
          <li>Agent discovery and selection</li>
          <li>End-to-end message test</li>
          <li>Proxy environment configuration</li>
          <li>Outbound A2A agent integration (optional)</li>
        </ol>
      </div>
    </div>
  `;
}

function renderConnectedApp() {
  wizardContainer.innerHTML = `
    <div class="wizard-step">
      <h2>Create a Connected App</h2>
      <p>This step must be done manually in Salesforce Setup.</p>

      <div class="wizard-instructions">
        <div class="wizard-instruction-step">
          <span class="instruction-number">1</span>
          <div>
            <strong>Navigate to Connected Apps</strong>
            <p>Setup → App Manager → New Connected App</p>
          </div>
        </div>

        <div class="wizard-instruction-step">
          <span class="instruction-number">2</span>
          <div>
            <strong>Basic Information</strong>
            <p>Connected App Name: <code>A2A Proxy</code><br>
            API Name: <code>A2A_Proxy</code><br>
            Contact Email: your email</p>
          </div>
        </div>

        <div class="wizard-instruction-step">
          <span class="instruction-number">3</span>
          <div>
            <strong>Enable OAuth Settings</strong>
            <p>Check "Enable OAuth Settings"<br>
            Callback URL: <code>https://login.salesforce.com/services/oauth2/callback</code><br>
            Selected OAuth Scopes: <strong>api</strong>, <strong>cdp_api</strong></p>
          </div>
        </div>

        <div class="wizard-instruction-step">
          <span class="instruction-number">4</span>
          <div>
            <strong>Enable Client Credentials Flow</strong>
            <p>Check "Enable Client Credentials Flow"<br>
            Run As: select an admin user with Einstein/Agentforce permissions</p>
          </div>
        </div>

        <div class="wizard-instruction-step">
          <span class="instruction-number">5</span>
          <div>
            <strong>Save and Collect Credentials</strong>
            <p>After saving, click "Manage Consumer Details" to get:<br>
            • <strong>Consumer Key</strong> (= Client ID)<br>
            • <strong>Consumer Secret</strong> (= Client Secret)</p>
          </div>
        </div>
      </div>

      <div class="wizard-info-box warning">
        <strong>Important:</strong> You must also assign the Connected App to a permission set or profile
        that has the "Run Flows" and "Access Einstein Agent" permissions enabled.
      </div>
    </div>
  `;
}

function renderOAuth() {
  const savedServer = oauthResult?.serverUrl ?? '';
  const savedClientId = oauthResult?.clientId ?? '';
  const savedEmail = oauthResult?.clientEmail ?? '';

  wizardContainer.innerHTML = `
    <div class="wizard-step">
      <h2>Test OAuth Credentials</h2>
      <p>Enter your Connected App credentials to test authentication.</p>

      <form id="oauth-form" class="wizard-form">
        <div class="form-group">
          <label for="w-server-url">Salesforce Server URL</label>
          <input type="text" id="w-server-url" placeholder="myorg.my.salesforce.com" value="${escapeHtml(savedServer)}" required>
          <small>Without https:// prefix</small>
        </div>

        <div class="form-group">
          <label for="w-client-id">Consumer Key (Client ID)</label>
          <input type="text" id="w-client-id" placeholder="3MVG9..." value="${escapeHtml(savedClientId)}" required>
        </div>

        <div class="form-group">
          <label for="w-client-secret">Consumer Secret (Client Secret)</label>
          <input type="password" id="w-client-secret" placeholder="Enter consumer secret" required>
        </div>

        <div class="form-group">
          <label for="w-client-email">Client Email (Run As User)</label>
          <input type="email" id="w-client-email" placeholder="admin@myorg.com" value="${escapeHtml(savedEmail)}" required>
        </div>

        <div id="oauth-result"></div>

        <button type="submit" class="btn btn-primary" id="oauth-test-btn">
          Test OAuth Connection
        </button>
      </form>
    </div>
  `;

  document.getElementById('oauth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('oauth-test-btn');
    const resultDiv = document.getElementById('oauth-result');
    btn.disabled = true;
    btn.textContent = 'Testing…';
    resultDiv.innerHTML = '';

    const body = {
      serverUrl: document.getElementById('w-server-url').value.trim(),
      clientId: document.getElementById('w-client-id').value.trim(),
      clientSecret: document.getElementById('w-client-secret').value,
      clientEmail: document.getElementById('w-client-email').value.trim(),
    };

    try {
      const res = await fetch('/dashboard/api/setup/test-oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        oauthResult = {
          ...body,
          accessToken: data.accessToken,
          instanceUrl: data.instanceUrl,
        };
        resultDiv.innerHTML = `
          <div class="success-message">
            ✅ ${data.message}<br>
            <small>Instance: ${escapeHtml(data.instanceUrl)} | Latency: ${data.latencyMs}ms</small>
          </div>`;
      } else {
        resultDiv.innerHTML = `<div class="error-message">❌ ${escapeHtml(data.error)}</div>`;
      }
    } catch (err) {
      resultDiv.innerHTML = `<div class="error-message">❌ Network error: ${escapeHtml(err.message)}</div>`;
    }

    btn.disabled = false;
    btn.textContent = 'Test OAuth Connection';
  });
}

function renderAgentSelection() {
  wizardContainer.innerHTML = `
    <div class="wizard-step">
      <h2>Discover Agents</h2>
      <p>Find available Agentforce agents in your org.</p>

      ${!oauthResult ? '<div class="error-message">⚠️ Please complete the OAuth test first (Step 3).</div>' : ''}

      <div id="agent-discovery-controls" ${!oauthResult ? 'hidden' : ''}>
        <button class="btn btn-primary" id="discover-btn">Discover Agents</button>
        <div id="agent-list"></div>
      </div>

      ${selectedAgent ? `
        <div class="success-message" style="margin-top: 16px;">
          Selected: <strong>${escapeHtml(selectedAgent.label)}</strong> (${escapeHtml(selectedAgent.id)})
        </div>` : ''}
    </div>
  `;

  const discoverBtn = document.getElementById('discover-btn');
  if (discoverBtn) {
    discoverBtn.addEventListener('click', async () => {
      discoverBtn.disabled = true;
      discoverBtn.textContent = 'Discovering…';
      const listDiv = document.getElementById('agent-list');

      // First, get a fresh token
      try {
        const authRes = await fetch('/dashboard/api/setup/test-oauth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serverUrl: oauthResult.serverUrl,
            clientId: oauthResult.clientId,
            clientSecret: oauthResult.clientSecret,
            clientEmail: oauthResult.clientEmail,
          }),
        });
        const authData = await authRes.json();
        if (!authData.success) {
          listDiv.innerHTML = `<div class="error-message">❌ OAuth re-auth failed: ${escapeHtml(authData.error)}</div>`;
          discoverBtn.disabled = false;
          discoverBtn.textContent = 'Discover Agents';
          return;
        }

        // Use the fresh token from re-authentication
        oauthResult.accessToken = authData.accessToken;
        oauthResult.instanceUrl = authData.instanceUrl;

        const discoverRes = await fetch('/dashboard/api/setup/discover-agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serverUrl: oauthResult.serverUrl,
            accessToken: oauthResult.accessToken,
          }),
        });
        const discoverData = await discoverRes.json();

        if (discoverData.success && discoverData.agents.length > 0) {
          listDiv.innerHTML = `
            <div class="agent-grid">
              ${discoverData.agents.map((a) => `
                <button class="agent-card ${selectedAgent?.id === a.id ? 'selected' : ''}"
                        data-id="${escapeHtml(a.id)}"
                        data-name="${escapeHtml(a.developerName)}"
                        data-label="${escapeHtml(a.label)}">
                  <strong>${escapeHtml(a.label)}</strong>
                  <small>${escapeHtml(a.developerName)}</small>
                  <small class="agent-id">${escapeHtml(a.id)}</small>
                </button>
              `).join('')}
            </div>
            <small>Found ${discoverData.totalSize} active agent(s) | Latency: ${discoverData.latencyMs}ms</small>
          `;

          listDiv.querySelectorAll('.agent-card').forEach((card) => {
            card.addEventListener('click', () => {
              listDiv.querySelectorAll('.agent-card').forEach((c) => c.classList.remove('selected'));
              card.classList.add('selected');
              selectedAgent = {
                id: card.dataset.id,
                developerName: card.dataset.name,
                label: card.dataset.label,
              };
            });
          });
        } else if (discoverData.success) {
          listDiv.innerHTML = '<div class="error-message">No active agents found in your org.</div>';
        } else {
          listDiv.innerHTML = `<div class="error-message">❌ ${escapeHtml(discoverData.error)}</div>`;
        }
      } catch (err) {
        listDiv.innerHTML = `<div class="error-message">❌ Network error: ${escapeHtml(err.message)}</div>`;
      }

      discoverBtn.disabled = false;
      discoverBtn.textContent = 'Discover Agents';
    });
  }
}

function renderAgentTest() {
  wizardContainer.innerHTML = `
    <div class="wizard-step">
      <h2>Test Agent Communication</h2>
      <p>Send a test message to verify the agent responds.</p>

      ${!oauthResult || !selectedAgent
        ? '<div class="error-message">⚠️ Please complete OAuth (Step 3) and select an agent (Step 4) first.</div>'
        : `
        <div class="wizard-info-box">
          Agent: <strong>${escapeHtml(selectedAgent.label)}</strong> (${escapeHtml(selectedAgent.id)})
        </div>

        <div class="form-group">
          <label for="w-test-message">Test Message</label>
          <input type="text" id="w-test-message" value="Hello, this is a test from the A2A Proxy setup wizard." placeholder="Enter test message">
        </div>

        <button class="btn btn-primary" id="test-msg-btn">Send Test Message</button>
        <div id="test-result" style="margin-top: 16px;"></div>
      `}
    </div>
  `;

  const testBtn = document.getElementById('test-msg-btn');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.textContent = 'Sending…';
      const resultDiv = document.getElementById('test-result');

      try {
        // Re-authenticate to get a fresh token
        resultDiv.innerHTML = '<div class="wizard-info-box">Authenticating…</div>';

        const authRes = await fetch('/dashboard/api/setup/test-oauth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serverUrl: oauthResult.serverUrl,
            clientId: oauthResult.clientId,
            clientSecret: oauthResult.clientSecret,
            clientEmail: oauthResult.clientEmail,
          }),
        });
        const authData = await authRes.json();

        if (!authData.success) {
          resultDiv.innerHTML = `<div class="error-message">❌ OAuth re-auth failed: ${escapeHtml(authData.error)}</div>`;
          testBtn.disabled = false;
          testBtn.textContent = 'Send Test Message';
          return;
        }

        oauthResult.accessToken = authData.accessToken;
        oauthResult.instanceUrl = authData.instanceUrl;

        // Session test first
        resultDiv.innerHTML = '<div class="wizard-info-box">Creating test session…</div>';

        const sessionRes = await fetch('/dashboard/api/setup/test-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken: oauthResult.accessToken,
            instanceUrl: oauthResult.instanceUrl,
            agentId: selectedAgent.id,
          }),
        });
        const sessionData = await sessionRes.json();

        if (!sessionData.success) {
          resultDiv.innerHTML = `<div class="error-message">❌ Session test failed: ${escapeHtml(sessionData.error)}</div>`;
          testBtn.disabled = false;
          testBtn.textContent = 'Send Test Message';
          return;
        }

        // Now send test message
        resultDiv.innerHTML = '<div class="wizard-info-box">Session OK ✅ — Sending message…</div>';

        const text = document.getElementById('w-test-message').value;
        const msgRes = await fetch('/dashboard/api/setup/test-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken: oauthResult.accessToken,
            instanceUrl: oauthResult.instanceUrl,
            agentId: selectedAgent.id,
            testMessage: text,
          }),
        });
        const msgData = await msgRes.json();

        if (msgData.success) {
          resultDiv.innerHTML = `
            <div class="success-message">
              ✅ Agent responded! (${msgData.latencyMs}ms)
            </div>
            <div class="wizard-response-box">
              <strong>Your message:</strong>
              <p>${escapeHtml(text)}</p>
              <strong>Agent response:</strong>
              <p>${escapeHtml(msgData.response)}</p>
            </div>`;
        } else {
          resultDiv.innerHTML = `<div class="error-message">❌ ${escapeHtml(msgData.error)}</div>`;
        }
      } catch (err) {
        resultDiv.innerHTML = `<div class="error-message">❌ Network error: ${escapeHtml(err.message)}</div>`;
      }

      testBtn.disabled = false;
      testBtn.textContent = 'Send Test Message';
    });
  }
}

function renderProxyConfig() {
  const baseUrl = window.location.origin;

  wizardContainer.innerHTML = `
    <div class="wizard-step">
      <h2>Proxy Configuration</h2>
      <p>Set these environment variables on your Heroku app (or .env file).</p>

      <div class="wizard-code-block">
        <div class="code-header">
          <span>Environment Variables</span>
          <button class="btn btn-sm btn-secondary" id="copy-env-btn">Copy</button>
        </div>
        <pre id="env-code">SALESFORCE_SERVER_URL=${oauthResult?.serverUrl ?? 'myorg.my.salesforce.com'}
SALESFORCE_CLIENT_ID=${oauthResult?.clientId ?? 'your_consumer_key'}
SALESFORCE_CLIENT_SECRET=${oauthResult?.clientSecret ? '***' : 'your_consumer_secret'}
SALESFORCE_AGENT_ID=${selectedAgent?.id ?? 'your_agent_id'}
SALESFORCE_CLIENT_EMAIL=${oauthResult?.clientEmail ?? 'admin@myorg.com'}
BASE_URL=${baseUrl}
API_KEY=<generate-a-strong-key>
DELEGATE_API_KEY=<generate-a-strong-key></pre>
      </div>

      <div class="wizard-info-box">
        <strong>Heroku CLI:</strong>
        <pre>heroku config:set SALESFORCE_SERVER_URL=${oauthResult?.serverUrl ?? '...'} \\
  SALESFORCE_CLIENT_ID=${oauthResult?.clientId ?? '...'} \\
  SALESFORCE_CLIENT_SECRET=YOUR_SECRET \\
  SALESFORCE_AGENT_ID=${selectedAgent?.id ?? '...'} \\
  SALESFORCE_CLIENT_EMAIL=${oauthResult?.clientEmail ?? '...'} \\
  BASE_URL=${baseUrl} \\
  API_KEY=$(openssl rand -hex 32)</pre>
      </div>

      <button class="btn btn-primary" id="verify-btn" style="margin-top:16px;">Verify Current Config</button>
      <div id="verify-result" style="margin-top:12px;"></div>

      <div class="wizard-info-box" style="margin-top:20px; border-left: 4px solid #f59e0b; background: #fffbeb; padding: 12px 16px;">
        <strong>⚠️ Important — Save your API Key</strong>
        <p style="margin:8px 0 4px;">Once set, the <code>API_KEY</code> is needed to authenticate requests to the proxy and to configure the Named Credential in Salesforce (next step).</p>
        <button class="btn btn-sm btn-secondary" id="reveal-api-key-btn">🔑 Reveal API Key</button>
        <div id="api-key-display" style="margin-top:8px;"></div>
      </div>
    </div>
  `;

  document.getElementById('copy-env-btn')?.addEventListener('click', () => {
    const code = document.getElementById('env-code').textContent;
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('copy-env-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    });
  });

  document.getElementById('verify-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('verify-btn');
    const resultDiv = document.getElementById('verify-result');
    btn.disabled = true;

    try {
      const res = await fetch('/dashboard/api/setup/verify-proxy');
      const data = await res.json();

      if (!res.ok) {
        resultDiv.innerHTML = `<div class="error-message">❌ ${escapeHtml(data.error?.message || data.error || 'Verification request failed')}</div>`;
        btn.disabled = false;
        return;
      }

      if (data.healthy) {
        resultDiv.innerHTML = '<div class="success-message">✅ All required environment variables are set.</div>';
      } else {
        const issues = Array.isArray(data.issues) ? data.issues : [];
        resultDiv.innerHTML = `
          <div class="error-message">
            ⚠️ Configuration issues:<br>
            ${issues.map((i) => `• ${escapeHtml(i)}`).join('<br>')}
          </div>`;
      }

      if (data.config) {
        resultDiv.innerHTML += `
          <div class="wizard-code-block" style="margin-top:12px;">
            <pre>${JSON.stringify(data.config, null, 2)}</pre>
          </div>`;
      }
    } catch (err) {
      resultDiv.innerHTML = `<div class="error-message">❌ ${escapeHtml(err.message)}</div>`;
    }

    btn.disabled = false;
  });

  document.getElementById('reveal-api-key-btn')?.addEventListener('click', async () => {
    const display = document.getElementById('api-key-display');
    try {
      const res = await fetch('/dashboard/api/setup/reveal-api-key');
      const data = await res.json();
      if (!res.ok) {
        display.innerHTML = `<div class="error-message">❌ ${escapeHtml(data.error || 'Could not retrieve API key')}</div>`;
        return;
      }
      display.innerHTML = `
        <div style="background:#1e293b; color:#e2e8f0; padding:12px; border-radius:6px; font-family:monospace; font-size:13px; word-break:break-all;">
          <div style="margin-bottom:8px;"><strong style="color:#94a3b8;">API_KEY:</strong><br>${escapeHtml(data.apiKey)}</div>
          ${data.delegateApiKey ? `<div><strong style="color:#94a3b8;">DELEGATE_API_KEY:</strong><br>${escapeHtml(data.delegateApiKey)}</div>` : '<div style="color:#94a3b8; font-style:italic;">DELEGATE_API_KEY: not set</div>'}
        </div>
        <button class="btn btn-sm btn-secondary" style="margin-top:8px;" onclick="navigator.clipboard.writeText('${data.apiKey}').then(() => { this.textContent = 'Copied!'; setTimeout(() => { this.textContent = 'Copy API Key'; }, 2000); })">Copy API Key</button>`;
    } catch (err) {
      display.innerHTML = `<div class="error-message">❌ ${escapeHtml(err.message)}</div>`;
    }
  });
}

function renderOutboundSetup() {
  const proxyOrigin = window.location.origin;

  wizardContainer.innerHTML = `
    <div class="wizard-step">
      <h2>Salesforce → External Agents Setup</h2>
      <p>Configure Salesforce so your Agentforce agent can call external A2A agents through the proxy. This involves 5 steps in Salesforce Setup.</p>

      <div class="wizard-info-box warning" style="margin-bottom:20px;">
        <strong>⚠️ Before you start:</strong> Make sure you have your <code>DELEGATE_API_KEY</code> ready (revealed in the previous step).
        This is the key used to authenticate callouts from Salesforce to the proxy's delegate endpoints.
        <em>It is different from the <code>API_KEY</code> used for the dashboard &amp; inbound A2A.</em>
      </div>

      <div class="wizard-instructions">

        <!-- Step 1: External Credential -->
        <div class="wizard-instruction-step">
          <span class="instruction-number">1</span>
          <div>
            <strong>Create an External Credential</strong>
            <p>Setup → search "<strong>Named Credentials</strong>" → click the <strong>External Credentials</strong> tab → <strong>New</strong></p>
            <ul style="margin:8px 0; padding-left:20px; line-height:1.8;">
              <li><strong>Label:</strong> <code>A2A Proxy</code></li>
              <li><strong>Name:</strong> <code>A2AProxy</code></li>
              <li><strong>Authentication Protocol:</strong> <code>Custom</code></li>
            </ul>
            <p>Click <strong>Save</strong>. Then, on the External Credential detail page:</p>

            <div style="background:#f1f5f9; border-radius:6px; padding:12px; margin:8px 0;">
              <strong>a) Add a Principal</strong>
              <p>In the <strong>Principals</strong> section → click <strong>New</strong></p>
              <ul style="margin:4px 0; padding-left:20px; line-height:1.8;">
                <li><strong>Parameter Name:</strong> <code>NamedPrincipal</code></li>
                <li><strong>Sequence Number:</strong> <code>1</code></li>
                <li><strong>Identity Type:</strong> <code>Named Principal</code></li>
              </ul>
              <p>Click <strong>Save</strong>.</p>
            </div>

            <div style="background:#f1f5f9; border-radius:6px; padding:12px; margin:8px 0;">
              <strong>b) Add the API Key Custom Header</strong>
              <p>In the <strong>Custom Headers</strong> section → click <strong>New</strong></p>
              <ul style="margin:4px 0; padding-left:20px; line-height:1.8;">
                <li><strong>Name:</strong> <code>X-API-Key</code></li>
                <li><strong>Value:</strong> paste your <code>DELEGATE_API_KEY</code> value</li>
                <li><strong>Sequence Number:</strong> <code>1</code></li>
              </ul>
              <p>Click <strong>Save</strong>.</p>
            </div>

            <div class="wizard-info-box warning" style="margin-top:8px; font-size: 13px;">
              <strong>🔑 Important:</strong> Use the <code>DELEGATE_API_KEY</code> here, <strong>not</strong> the <code>API_KEY</code>.
              The delegate endpoints (<code>/api/v1/delegate</code>, <code>/api/v1/agents</code>) validate against <code>DELEGATE_API_KEY</code>.
            </div>
          </div>
        </div>

        <!-- Step 2: Named Credential -->
        <div class="wizard-instruction-step">
          <span class="instruction-number">2</span>
          <div>
            <strong>Create a Named Credential</strong>
            <p>Setup → search "<strong>Named Credentials</strong>" → stay on the <strong>Named Credentials</strong> tab → <strong>New</strong></p>
            <ul style="margin:8px 0; padding-left:20px; line-height:1.8;">
              <li><strong>Label:</strong> <code>A2A Proxy</code></li>
              <li><strong>Name:</strong> <code>A2AProxy</code></li>
              <li><strong>URL:</strong> <code>${escapeHtml(proxyOrigin)}</code></li>
              <li><strong>Enabled for Callouts:</strong> ✅ checked</li>
              <li><strong>External Credential:</strong> select <code>A2A Proxy</code> (created in step 1)</li>
            </ul>
            <p>Under <strong>Callout Options</strong>:</p>
            <ul style="margin:8px 0; padding-left:20px; line-height:1.8;">
              <li><strong>Generate Authorization Header:</strong> ☐ <em>unchecked</em></li>
            </ul>
            <p>Click <strong>Save</strong>.</p>

            <div class="wizard-info-box warning" style="margin-top:8px; font-size: 13px;">
              <strong>⚠️ URL must be the root!</strong> Do <strong>not</strong> add <code>/api/v1/delegate</code> to the URL.
              The OpenAPI spec already contains the full paths for each endpoint.
              If you add a path suffix here, Salesforce will concatenate it with the spec paths and produce 404 errors
              (e.g. <code>/api/v1/delegate/api/v1/agents</code>).
            </div>
          </div>
        </div>

        <!-- Step 3: External Service -->
        <div class="wizard-instruction-step">
          <span class="instruction-number">3</span>
          <div>
            <strong>Create an External Service</strong>
            <p>Setup → search "<strong>External Services</strong>" → <strong>New External Service</strong></p>
            <ul style="margin:8px 0; padding-left:20px; line-height:1.8;">
              <li><strong>External Service Name:</strong> <code>A2AProxyDelegate</code></li>
              <li><strong>Select a Named Credential:</strong> select <code>A2A Proxy</code> (created in step 2)</li>
              <li><strong>Service Schema:</strong> select <strong>Relative URL</strong></li>
            </ul>
            <p>In the <strong>URL</strong> field, enter the path to the OpenAPI specification:</p>
            <div style="background:#1e293b; color:#e2e8f0; padding:10px 14px; border-radius:6px; font-family:monospace; font-size:13px; margin:8px 0; word-break:break-all;">
              /openapi/agentforce-action.yaml
            </div>
            <p>Click <strong>Save &amp; Next</strong>, then review the discovered operations and click <strong>Next</strong>, then <strong>Done</strong>.</p>

            <div class="wizard-info-box" style="margin-top:8px; font-size: 13px;">
              <strong>ℹ️ Discovered operations:</strong> You should see 3 operations:
              <code>delegateTask</code>, <code>listAgents</code>, and <code>discoverAgent</code>.
              Select all of them and confirm.
            </div>
          </div>
        </div>

        <!-- Step 4: Permission Set -->
        <div class="wizard-instruction-step">
          <span class="instruction-number">4</span>
          <div>
            <strong>Grant External Credential Access to the Agent's Permission Set</strong>
            <p>Your Agentforce agent runs as a special user with its own auto-generated Permission Set.
            That Permission Set needs access to the External Credential principal — otherwise all callouts will silently return <code>null</code>.</p>

            <div style="background:#f1f5f9; border-radius:6px; padding:12px; margin:8px 0;">
              <strong>a) Find the agent's Permission Set</strong>
              <p>Setup → search "<strong>Permission Sets</strong>" → look for a Permission Set named like:<br>
              <code>Agentforce_Service_Agent_XXXXXXXXX_Permissions</code><br>
              (It's auto-generated when you create your Agentforce Service Agent. The name contains a numeric ID.)</p>
            </div>

            <div style="background:#f1f5f9; border-radius:6px; padding:12px; margin:8px 0;">
              <strong>b) Add External Credential Principal Access</strong>
              <p>Click on that Permission Set → in the left sidebar, click <strong>External Credential Principal Access</strong></p>
              <p>Click <strong>Edit</strong> → in the <strong>Available</strong> list, find:</p>
              <div style="background:#1e293b; color:#e2e8f0; padding:8px 14px; border-radius:6px; font-family:monospace; font-size:13px; margin:8px 0;">
                A2A Proxy - NamedPrincipal
              </div>
              <p>Select it and move it to <strong>Enabled</strong> using the right arrow → Click <strong>Save</strong>.</p>
            </div>

            <div class="wizard-info-box warning" style="margin-top:8px; font-size: 13px;">
              <strong>🚨 This step is critical!</strong> Without this, the agent user cannot make callouts through the Named Credential.
              All External Service actions will silently return <code>null</code> and the agent will say "Something went wrong".
            </div>
          </div>
        </div>

        <!-- Step 5: Agent Actions -->
        <div class="wizard-instruction-step">
          <span class="instruction-number">5</span>
          <div>
            <strong>Add Agent Actions in Agentforce Builder</strong>
            <p>Now wire the External Service operations as actions for your agent.</p>

            <div style="background:#f1f5f9; border-radius:6px; padding:12px; margin:8px 0;">
              <strong>a) Open Agent Builder</strong>
              <p>Setup → search "<strong>Agents</strong>" → click on your Agentforce Service Agent → <strong>Open in Builder</strong></p>
              <p>⚠️ The agent must be <strong>deactivated</strong> to add or edit actions.</p>
            </div>

            <div style="background:#f1f5f9; border-radius:6px; padding:12px; margin:8px 0;">
              <strong>b) Create or select a Topic</strong>
              <p>In the Topics panel, create a new topic (e.g. <code>External A2A Agents</code>) or use an existing one.
              Give it a clear description and classification so the agent knows when to route queries to external agents.</p>
            </div>

            <div style="background:#f1f5f9; border-radius:6px; padding:12px; margin:8px 0;">
              <strong>c) Add the actions to the topic</strong>
              <p>In <strong>This Topic's Actions</strong>, click the <strong>+</strong> button and search for actions from the <code>A2AProxyDelegate</code> External Service. You should find:</p>
              <ul style="margin:4px 0; padding-left:20px; line-height:1.8;">
                <li><strong>List Agents</strong> — Lists available external A2A agents (useful for discovery)</li>
                <li><strong>Delegate Task</strong> — Sends a message to an external agent and gets the response</li>
                <li><strong>Discover Agent</strong> — Fetches an agent's capabilities card</li>
              </ul>
              <p>Add all three (or at least <strong>Delegate Task</strong>) to the topic.</p>
            </div>

            <div style="background:#f1f5f9; border-radius:6px; padding:12px; margin:8px 0;">
              <strong>d) Activate the agent</strong>
              <p>Once your actions are added, <strong>activate</strong> the agent and test it in the chat panel on the right.</p>
            </div>
          </div>
        </div>

      </div>

      <!-- External agents config -->
      <div class="wizard-info-box" style="margin-top:20px;">
        <strong>📋 Register External A2A Agents on the Proxy</strong>
        <p>The proxy needs to know which external agents to delegate to.
        Edit <code>config/external-agents.json</code> on the proxy:</p>
        <pre>{
  "agents": [
    {
      "alias": "my-agent",
      "url": "https://my-a2a-agent.herokuapp.com",
      "description": "Description of what this agent does",
      "authType": "bearer",
      "authToken": "ENV:MY_AGENT_TOKEN"
    }
  ]
}</pre>
        <p style="margin-top:8px; font-size:13px;">
          <code>authToken: "ENV:MY_AGENT_TOKEN"</code> means the proxy reads the token from the <code>MY_AGENT_TOKEN</code> environment variable.
          Set it with <code>heroku config:set MY_AGENT_TOKEN=&lt;value&gt;</code>.
        </p>
      </div>
    </div>
  `;
}

function renderComplete() {
  const origin = window.location.origin;

  wizardContainer.innerHTML = `
    <div class="wizard-step">
      <h2>Setup Complete! 🎉</h2>
      <p>Your A2A Agentforce Proxy is configured and ready to use.</p>

      <div class="wizard-info-box">
        <strong>Quick Test — Delegate to an external agent via curl:</strong>
        <pre>curl -X POST ${escapeHtml(origin)}/api/v1/delegate \\
  -H "X-API-Key: YOUR_DELEGATE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agentAlias": "your-agent-alias",
    "message": "Hello from the proxy!"
  }'</pre>
      </div>

      <div class="wizard-info-box">
        <strong>Available Endpoints:</strong>
        <table style="width:100%; border-collapse:collapse; margin-top:8px; font-size:14px;">
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 8px;"><strong>Inbound A2A</strong></td>
            <td style="padding:6px 8px;"><code>POST ${escapeHtml(origin)}/a2a</code></td>
            <td style="padding:6px 8px; color:#64748b;">External agents call your Agentforce agent</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 8px;"><strong>Agent Card</strong></td>
            <td style="padding:6px 8px;"><code>GET ${escapeHtml(origin)}/.well-known/agent.json</code></td>
            <td style="padding:6px 8px; color:#64748b;">A2A discovery endpoint</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 8px;"><strong>Delegate</strong></td>
            <td style="padding:6px 8px;"><code>POST ${escapeHtml(origin)}/api/v1/delegate</code></td>
            <td style="padding:6px 8px; color:#64748b;">Agentforce calls external agents</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 8px;"><strong>List Agents</strong></td>
            <td style="padding:6px 8px;"><code>POST ${escapeHtml(origin)}/api/v1/agents</code></td>
            <td style="padding:6px 8px; color:#64748b;">List registered external agents</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 8px;"><strong>OpenAPI Spec</strong></td>
            <td style="padding:6px 8px;"><code>GET ${escapeHtml(origin)}/openapi/agentforce-action.yaml</code></td>
            <td style="padding:6px 8px; color:#64748b;">For Salesforce External Service import</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 8px;"><strong>Health</strong></td>
            <td style="padding:6px 8px;"><code>GET ${escapeHtml(origin)}/health</code></td>
            <td style="padding:6px 8px; color:#64748b;">Liveness check</td>
          </tr>
          <tr>
            <td style="padding:6px 8px;"><strong>Dashboard</strong></td>
            <td style="padding:6px 8px;"><code>${escapeHtml(origin)}/dashboard</code></td>
            <td style="padding:6px 8px; color:#64748b;">This UI</td>
          </tr>
        </table>
      </div>

      <div class="wizard-info-box" style="border-left: 4px solid #10b981;">
        <strong>✅ Salesforce Setup Checklist</strong>
        <p style="margin:8px 0 4px; font-size:13px;">Verify you've completed all Salesforce-side configuration:</p>
        <ul style="padding-left:20px; line-height:2;">
          <li>☐ <strong>External Credential</strong> created with Custom auth protocol</li>
          <li>☐ <strong>Named Principal</strong> added to the External Credential</li>
          <li>☐ <strong>X-API-Key header</strong> set to <code>DELEGATE_API_KEY</code> value</li>
          <li>☐ <strong>Named Credential</strong> pointing to proxy root URL (no path suffix!)</li>
          <li>☐ <strong>External Service</strong> imported from OpenAPI spec</li>
          <li>☐ <strong>Permission Set</strong> — agent's perm set has External Credential Principal Access</li>
          <li>☐ <strong>Agent Actions</strong> added to a topic in Agentforce Builder</li>
        </ul>
      </div>

      <p style="margin-top:24px;">Switch to the <strong>Conversations</strong> tab to monitor live agent traffic.</p>
    </div>
  `;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// ─── Init ───────────────────────────────────────────────────────────────────

if (wizardContainer) {
  renderStep();
}
