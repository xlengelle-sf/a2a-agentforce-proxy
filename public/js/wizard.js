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
  wizardContainer.innerHTML = `
    <div class="wizard-step">
      <h2>Outbound A2A Setup (Optional)</h2>
      <p>Allow Agentforce to call external A2A agents through the proxy. This requires creating an External Credential and a Named Credential in Salesforce.</p>

      <div class="wizard-instructions">
        <div class="wizard-instruction-step">
          <span class="instruction-number">1</span>
          <div>
            <strong>Create an External Credential</strong>
            <p>Setup → Named Credentials → <strong>External Credentials</strong> tab → New</p>
            <ul style="margin:8px 0; padding-left:20px; line-height:1.8;">
              <li><strong>Label:</strong> <code>A2A Proxy</code></li>
              <li><strong>Name:</strong> <code>A2AProxy</code></li>
              <li><strong>Authentication Protocol:</strong> <code>Custom</code></li>
            </ul>
            <p>After saving, on the External Credential detail page:</p>
            <ul style="margin:8px 0; padding-left:20px; line-height:1.8;">
              <li>In <strong>Principals</strong> section → New:<br>
                Parameter Name: <code>NamedPrincipal</code>, Sequence Number: <code>1</code>, Identity Type: <code>Named Principal</code></li>
              <li>In <strong>Custom Headers</strong> section → New:<br>
                Name: <code>X-API-Key</code>, Value: your <code>API_KEY</code> value (from previous step), Sequence Number: <code>1</code></li>
            </ul>
          </div>
        </div>

        <div class="wizard-instruction-step">
          <span class="instruction-number">2</span>
          <div>
            <strong>Create a Named Credential</strong>
            <p>Setup → Named Credentials → <strong>Named Credentials</strong> tab → New</p>
            <ul style="margin:8px 0; padding-left:20px; line-height:1.8;">
              <li><strong>Label:</strong> <code>A2A Proxy</code></li>
              <li><strong>Name:</strong> <code>A2APROXY</code></li>
              <li><strong>URL:</strong> <code>${window.location.origin}/api/v1/delegate</code></li>
              <li><strong>Enabled for Callouts:</strong> ✅ checked</li>
              <li><strong>External Credential:</strong> select <code>A2A Proxy</code> (created in step 1)</li>
            </ul>
            <p>Under <strong>Callout Options</strong>:</p>
            <ul style="margin:8px 0; padding-left:20px; line-height:1.8;">
              <li><strong>Generate Authorization Header:</strong> ☐ <em>unchecked</em> (the X-API-Key custom header handles authentication)</li>
            </ul>
          </div>
        </div>

        <div class="wizard-instruction-step">
          <span class="instruction-number">3</span>
          <div>
            <strong>Create External Service (optional)</strong>
            <p>Setup → External Services → New → From API Specification<br>
            Point to your proxy's OpenAPI spec or manually define the delegate endpoint.<br>
            Select the Named Credential <code>A2A Proxy</code> created above.</p>
          </div>
        </div>

        <div class="wizard-instruction-step">
          <span class="instruction-number">4</span>
          <div>
            <strong>Create Agent Action (optional)</strong>
            <p>In Agent Builder, add a new action:<br>
            Type: Apex / Flow / External Service<br>
            Point to the External Service created above.<br>
            Map the agent's output to the delegate request format.</p>
          </div>
        </div>
      </div>

      <div class="wizard-info-box">
        <strong>External Agents Config:</strong>
        <p>Register external A2A agents in <code>config/external-agents.json</code>:</p>
        <pre>{
  "agents": [
    {
      "alias": "weather-agent",
      "url": "https://weather-agent.example.com",
      "description": "Weather information agent",
      "authType": "bearer",
      "authToken": "ENV:WEATHER_AGENT_TOKEN"
    }
  ]
}</pre>
      </div>
    </div>
  `;
}

function renderComplete() {
  wizardContainer.innerHTML = `
    <div class="wizard-step">
      <h2>Setup Complete! 🎉</h2>
      <p>Your A2A Agentforce Proxy is configured and ready to use.</p>

      <div class="wizard-info-box">
        <strong>Quick Test — Send a message via curl:</strong>
        <pre>curl -X POST ${window.location.origin}/a2a \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tasks/send",
    "params": {
      "message": {
        "role": "user",
        "parts": [{"type": "text", "text": "Hello!"}]
      }
    }
  }'</pre>
      </div>

      <div class="wizard-info-box">
        <strong>What's available:</strong>
        <ul>
          <li><strong>Inbound A2A:</strong> <code>POST ${window.location.origin}/a2a</code></li>
          <li><strong>Agent Card:</strong> <code>GET ${window.location.origin}/.well-known/agent.json</code></li>
          <li><strong>Delegate:</strong> <code>POST ${window.location.origin}/api/v1/delegate</code></li>
          <li><strong>Health:</strong> <code>GET ${window.location.origin}/health</code></li>
          <li><strong>Dashboard:</strong> <code>${window.location.origin}/dashboard</code></li>
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
