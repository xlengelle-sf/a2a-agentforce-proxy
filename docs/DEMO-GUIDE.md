# A2A ↔ Agentforce Proxy — Guide de Démonstration Complet

> **Version :** 0.1.0
> **Date :** Février 2026
> **Instance live :** https://a2a-agentforce-proxy-0de05538a326.herokuapp.com
> **Code source :** https://github.com/xlengelle-sf/a2a-agentforce-proxy

---

## Table des Matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture](#2-architecture)
3. [Prérequis Salesforce](#3-prérequis-salesforce)
4. [Configuration pas-à-pas](#4-configuration-pas-à-pas)
5. [Démo Direction A — Agent externe → Agentforce](#5-démo-direction-a--agent-externe--agentforce)
6. [Démo Direction B — Agentforce → Agent externe](#6-démo-direction-b--agentforce--agent-externe)
7. [Dashboard temps réel](#7-dashboard-temps-réel)
8. [Scénarios de démo avancés](#8-scénarios-de-démo-avancés)
9. [Référence API complète](#9-référence-api-complète)
10. [Troubleshooting](#10-troubleshooting)
11. [Glossaire](#11-glossaire)

---

## 1. Vue d'ensemble

### Le problème

Les agents Salesforce Agentforce communiquent via l'**Agent API** (REST + OAuth 2.0), tandis que l'écosystème multi-agents émergent utilise le **protocole A2A** (Agent-to-Agent, JSON-RPC 2.0 over HTTPS) poussé par Google. Ces deux protocoles sont incompatibles : un agent externe A2A ne peut pas appeler directement Agentforce, et vice-versa.

### La solution

Le **A2A Agentforce Proxy** est un serveur Node.js/TypeScript déployé sur Heroku qui traduit **dans les deux sens** entre les deux protocoles :

```
┌─────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│  Agent externe   │  A2A     │                  │  Agent   │   Salesforce     │
│  (Claude, Gemini,│ ◄──────► │   A2A Proxy      │ ◄──────► │   Agentforce     │
│   custom agent)  │ JSON-RPC │   (Heroku)       │  API     │   Agent          │
└─────────────────┘          └──────────────────┘          └──────────────────┘
                                      │
                                      │ SSE (temps réel)
                                      ▼
                              ┌──────────────────┐
                              │   Dashboard Web   │
                              │   - Conversations │
                              │   - Setup Wizard  │
                              └──────────────────┘
```

### Deux directions de communication

| Direction | Nom | Flux | Authentification |
|---|---|---|---|
| **A → Inbound** | Agent externe → Agentforce | `POST /a2a` (JSON-RPC) | Bearer Token (`API_KEY`) |
| **B → Outbound** | Agentforce → Agent externe | `POST /api/v1/delegate` (REST) | X-API-Key (`DELEGATE_API_KEY`) |

### Fonctionnalités clés

- ✅ Traduction bidirectionnelle des protocoles
- ✅ Conversations multi-tours avec gestion du contexte
- ✅ Streaming SSE (Server-Sent Events) temps réel
- ✅ Dashboard de monitoring avec bulles style iMessage
- ✅ Wizard de configuration guidée pour Salesforce
- ✅ Gestion des sessions (mémoire ou Redis)
- ✅ Sécurité (Helmet, rate limiting, CORS, HMAC)
- ✅ 262 tests automatisés (31 fichiers)

---

## 2. Architecture

### Couches applicatives

```
┌─────────────────────────────────────────────────────────────────┐
│                     Express 5.x Application                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌───────────────┐  ┌───────────────────┐  ┌─────────────────┐ │
│  │ A2A Server    │  │ Delegate Endpoint  │  │   Dashboard     │ │
│  │ (Inbound)     │  │ (Outbound)         │  │   + Wizard      │ │
│  │               │  │                    │  │                 │ │
│  │ • Agent Card  │  │ • /api/v1/delegate │  │ • Monitor SSE   │ │
│  │ • JSON-RPC    │  │ • /api/v1/agents   │  │ • Login/Auth    │ │
│  │ • Streaming   │  │ • Agent Discovery  │  │ • Setup APIs    │ │
│  └───────┬───────┘  └────────┬──────────┘  └────────┬────────┘ │
│          │                   │                       │           │
│  ┌───────┴───────────────────┴───────────────────────┴────────┐ │
│  │              Protocol Translation Layer                     │ │
│  │  • A2A Message → Agentforce Text                           │ │
│  │  • Agentforce Response → A2A Task + Artifacts              │ │
│  │  • SSE Event Bridging (chunks, progress, end-of-turn)      │ │
│  │  • Error Code Mapping                                       │ │
│  └────────────────────────────┬────────────────────────────────┘ │
│                               │                                   │
│  ┌────────────────────────────┴────────────────────────────────┐ │
│  │              Session Management Layer                        │ │
│  │  • contextId ↔ sessionId mapping                            │ │
│  │  • sequenceId auto-incrémenté                               │ │
│  │  • Store abstrait (MemoryStore | RedisStore)                │ │
│  │  • TTL configurable (défaut : 30 min)                       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │ Agentforce   │  │ A2A Client   │  │ Config Manager      │   │
│  │ Client       │  │ (Outbound)   │  │ + Agent Registry    │   │
│  │ • OAuth 2.0  │  │ • sendMsg    │  │ + Env Validation    │   │
│  │ • Session    │  │ • getTask    │  │ + Agent Card        │   │
│  │ • Messaging  │  │ • cancelTask │  │   Template          │   │
│  │ • Streaming  │  │ • CardResolv │  │                     │   │
│  └──────────────┘  └──────────────┘  └─────────────────────┘   │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│  Middleware : Helmet CSP • Rate Limiter • CORS • Pino Logger     │
├─────────────────────────────────────────────────────────────────┤
│  Infrastructure : Heroku (Node.js 24) • Redis (optionnel)        │
└─────────────────────────────────────────────────────────────────┘
```

### Mapping des protocoles

| Concept A2A | Concept Agentforce | Traduction par le proxy |
|---|---|---|
| `contextId` (UUID) | `sessionId` | Mapping 1:1 stocké en session |
| `taskId` (UUID) | — | Généré par le proxy à chaque message |
| `message.parts[].text` | `message.text` | Concaténation des TextParts |
| `message.parts[].data` | `[Structured Data] JSON` | Sérialisation JSON inline |
| `artifacts[].parts[]` | `messages[].message` | Conversion texte → TextPart |
| — | `sequenceId` | Auto-incrémenté par le proxy |
| `state: completed` | `EndOfTurn` | Mapping d'événement |
| `state: working` | `ProgressIndicator` | Mapping d'événement |
| `TaskArtifactUpdateEvent` | `TextChunk` | Streaming SSE bridgé |

---

## 3. Prérequis Salesforce

Avant de lancer la démo, vérifiez que votre org Salesforce dispose de :

### 3.1 Salesforce Edition
- ✅ Enterprise, Unlimited ou Developer Edition
- ✅ Agentforce activé dans l'org (Setup → Agents → Einstein Agents)

### 3.2 Agent Agentforce configuré
- ✅ Au moins un agent Einstein créé et **activé**
- ✅ L'agent doit avoir au minimum un Topic avec des instructions
- ✅ L'agent doit être publié (pas seulement en draft)

### 3.3 Connected App (OAuth 2.0 Client Credentials)
- ✅ Connected App créée avec :
  - **Enable OAuth Settings** activé
  - **Callback URL** : `https://login.salesforce.com/services/oauth2/callback`
  - **OAuth Scopes** : `api`, `cdp_api`
  - **Enable Client Credentials Flow** activé
  - Un **utilisateur** assigné comme run-as user

### 3.4 Informations nécessaires

| Information | Où la trouver | Variable d'env |
|---|---|---|
| My Domain URL | Setup → My Domain | `SALESFORCE_SERVER_URL` |
| Consumer Key | Setup → App Manager → View | `SALESFORCE_CLIENT_ID` |
| Consumer Secret | Setup → App Manager → View | `SALESFORCE_CLIENT_SECRET` |
| Agent ID | Setup → Agents → Agent Details → ID | `SALESFORCE_AGENT_ID` |
| Run-as User Email | User assigné à la Connected App | `SALESFORCE_CLIENT_EMAIL` |

> **💡 Astuce :** Le **Setup Wizard** du dashboard guide l'ensemble de cette configuration étape par étape.

---

## 4. Configuration pas-à-pas

### 4.1 Accéder au Dashboard

1. Ouvrir le navigateur à l'adresse :
   ```
   https://a2a-agentforce-proxy-0de05538a326.herokuapp.com
   ```
   → Redirige automatiquement vers la page de login

2. Se connecter avec :
   - **Username :** `xlengelle`
   - **Password :** `Kyx39vn7`

### 4.2 Setup Wizard (onglet « Setup Wizard »)

Le wizard comporte **8 étapes** :

| Étape | Nom | Action |
|---|---|---|
| 1 | Welcome | Checklist des prérequis |
| 2 | Connected App | Instructions Salesforce pas-à-pas |
| 3 | OAuth Test | Saisir credentials → **test automatique** de l'OAuth |
| 4 | Agent Discovery | **Découverte automatique** des agents via SOQL |
| 5 | Agent Test | **Test automatique** : création session + envoi message |
| 6 | Proxy Config | Commandes `heroku config:set` à exécuter |
| 7 | Outbound Setup | Configuration Named Credential + External Service |
| 8 | Complete | Récapitulatif et liens utiles |

### 4.3 Configuration des variables d'environnement

Une fois les credentials validées par le wizard :

```bash
heroku config:set \
  SALESFORCE_SERVER_URL=votre-domaine.my.salesforce.com \
  SALESFORCE_CLIENT_ID=votre-consumer-key \
  SALESFORCE_CLIENT_SECRET=votre-consumer-secret \
  SALESFORCE_AGENT_ID=votre-agent-id \
  SALESFORCE_CLIENT_EMAIL=votre-user@example.com \
  --app a2a-agentforce-proxy
```

Le proxy redémarre automatiquement et vérifie les variables au boot.

### 4.4 Vérifier le déploiement

```bash
# Health check
curl https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/health | jq

# Agent Card A2A
curl https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/.well-known/agent-card.json | jq

# Vérification proxy (via dashboard API - nécessite auth cookie)
# → Utiliser l'étape 8 du wizard à la place
```

Réponse attendue du health check :
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 120,
  "memory": {
    "rss": 45,
    "heapUsed": 22,
    "heapTotal": 35
  },
  "redis": "not configured",
  "timestamp": "2026-02-13T10:00:00.000Z"
}
```

---

## 5. Démo Direction A — Agent externe → Agentforce

### Scénario

Un agent externe compatible A2A (Claude, Gemini, agent custom) envoie un message à un agent Agentforce **via le proxy**.

### 5.1 Découverte de l'Agent Card

Le protocole A2A commence par la découverte : l'agent appelant récupère la « carte » de l'agent cible.

```bash
curl -s https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/.well-known/agent-card.json | jq
```

Réponse :
```json
{
  "name": "Agentforce Proxy",
  "description": "A2A proxy for Salesforce Agentforce agents",
  "url": "https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/a2a",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "stateTransitionHistory": true
  },
  "authentication": {
    "schemes": ["bearer"]
  },
  "defaultInputModes": ["text"],
  "defaultOutputModes": ["text"],
  "skills": []
}
```

> **Point de démo :** Montrer que le proxy se présente comme un agent A2A standard. Tout agent compatible A2A peut le découvrir et communiquer avec lui sans savoir qu'il parle à Agentforce derrière.

### 5.2 Envoi d'un message (synchrone)

```bash
curl -X POST https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/a2a \
  -H "Authorization: Bearer 8dc26e003bd9798b212795a8f0d2c371848057ef34a9fcd2bc9eb0c12645902b" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tasks/send",
    "params": {
      "message": {
        "role": "user",
        "parts": [
          {"type": "text", "text": "Bonjour ! Quels services proposes-tu ?"}
        ]
      }
    }
  }' | jq
```

Réponse attendue :
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "id": "task-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "contextId": "ctx-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "status": {
      "state": "completed",
      "timestamp": "2026-02-13T10:05:00.000Z"
    },
    "artifacts": [
      {
        "name": "response",
        "parts": [
          {
            "type": "text",
            "text": "Bonjour ! Je suis votre assistant Agentforce..."
          }
        ],
        "index": 0
      }
    ]
  }
}
```

> **Point de démo :** Le proxy a :
> 1. Authentifié le caller via Bearer token
> 2. Obtenu un token OAuth 2.0 auprès de Salesforce (client credentials)
> 3. Créé une session Agentforce
> 4. Traduit le message A2A → format Agentforce
> 5. Envoyé le message à l'agent
> 6. Traduit la réponse Agentforce → format A2A
> 7. Retourné le résultat en JSON-RPC 2.0

### 5.3 Conversation multi-tours

Réutiliser le `contextId` de la réponse précédente pour continuer la conversation :

```bash
# Remplacer CONTEXT_ID par la valeur reçue ci-dessus
curl -X POST https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/a2a \
  -H "Authorization: Bearer 8dc26e003bd9798b212795a8f0d2c371848057ef34a9fcd2bc9eb0c12645902b" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tasks/send",
    "params": {
      "contextId": "CONTEXT_ID",
      "message": {
        "role": "user",
        "parts": [
          {"type": "text", "text": "Peux-tu me donner plus de détails sur le premier point ?"}
        ]
      }
    }
  }' | jq
```

> **Point de démo :** Le même `contextId` = la même session Agentforce. L'agent se souvient du contexte de la conversation précédente. Le proxy gère automatiquement l'incrémentation du `sequenceId` Agentforce.

### 5.4 Envoi en streaming (SSE)

Pour les réponses longues, le proxy supporte le streaming temps réel :

```bash
curl -X POST https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/a2a \
  -H "Authorization: Bearer 8dc26e003bd9798b212795a8f0d2c371848057ef34a9fcd2bc9eb0c12645902b" \
  -H "Content-Type: application/json" \
  -N \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tasks/sendSubscribe",
    "params": {
      "message": {
        "role": "user",
        "parts": [
          {"type": "text", "text": "Raconte-moi une histoire longue sur un robot qui apprend à cuisiner."}
        ]
      }
    }
  }'
```

Événements SSE reçus :
```
event: TaskStatusUpdateEvent
data: {"taskId":"...","contextId":"...","status":{"state":"working"},"final":false}

event: TaskArtifactUpdateEvent
data: {"taskId":"...","artifact":{"parts":[{"type":"text","text":"Il était une fois"}],"append":true}}

event: TaskArtifactUpdateEvent
data: {"taskId":"...","artifact":{"parts":[{"type":"text","text":" un robot nommé Chef-Bot"}],"append":true}}

... (chunks successifs)

event: TaskStatusUpdateEvent
data: {"taskId":"...","status":{"state":"completed"},"final":true}
```

> **Point de démo :** Le proxy bridge le streaming Agentforce (SSE natif) vers le format A2A SSE. Les événements Agentforce (`ProgressIndicator`, `TextChunk`, `EndOfTurn`) sont traduits en événements A2A (`TaskStatusUpdateEvent`, `TaskArtifactUpdateEvent`). Un heartbeat toutes les 15 secondes évite le timeout Heroku de 30 secondes.

### 5.5 Récupérer le statut d'une tâche

```bash
curl -X POST https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/a2a \
  -H "Authorization: Bearer 8dc26e003bd9798b212795a8f0d2c371848057ef34a9fcd2bc9eb0c12645902b" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tasks/get",
    "params": {
      "id": "TASK_ID"
    }
  }' | jq
```

### 5.6 Annuler une tâche

```bash
curl -X POST https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/a2a \
  -H "Authorization: Bearer 8dc26e003bd9798b212795a8f0d2c371848057ef34a9fcd2bc9eb0c12645902b" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tasks/cancel",
    "params": {
      "id": "TASK_ID"
    }
  }' | jq
```

> Le proxy supprime la session Agentforce côté serveur et retourne un statut `canceled`.

---

## 6. Démo Direction B — Agentforce → Agent externe

### Scénario

Un agent Agentforce utilise une **Action** pour déléguer une tâche à un agent externe A2A via le proxy.

### 6.1 Prérequis côté Salesforce

Pour cette direction, il faut configurer dans Salesforce :

1. **Named Credential** pointant vers le proxy :
   - URL : `https://a2a-agentforce-proxy-0de05538a326.herokuapp.com`
   - Authentication : Custom Header → `X-API-Key: <DELEGATE_API_KEY>`

2. **External Service** importé depuis l'OpenAPI :
   - Utiliser le fichier `openapi/agentforce-action.yaml` du repo
   - Ou l'URL : `https://raw.githubusercontent.com/xlengelle-sf/a2a-agentforce-proxy/main/openapi/agentforce-action.yaml`

3. **Agent Action** liée à l'External Service :
   - Action `delegateTask` disponible dans l'agent

### 6.2 Configuration des agents externes

Le fichier `config/external-agents.json` référence les agents A2A disponibles :

```json
{
  "agents": [
    {
      "alias": "weather-agent",
      "url": "https://weather-agent.example.com",
      "description": "Agent météo mondial",
      "authType": "bearer",
      "authToken": "ENV:WEATHER_AGENT_TOKEN"
    },
    {
      "alias": "translation-agent",
      "url": "https://translation.example.com",
      "description": "Agent de traduction multilingue",
      "authType": "none"
    }
  ]
}
```

> **Sécurité :** Les tokens sont référencés via `ENV:NOM_VARIABLE` et résolus depuis les variables d'environnement au runtime — jamais de secrets en dur dans le code.

### 6.3 Lister les agents disponibles

```bash
curl -s https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/api/v1/agents \
  -H "X-API-Key: 307d1d6882e05f1135e0aa6a0c390ed112d623db5b6660ad31174a5cef9f31da" | jq
```

### 6.4 Déléguer une tâche

```bash
curl -X POST https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/api/v1/delegate \
  -H "X-API-Key: 307d1d6882e05f1135e0aa6a0c390ed112d623db5b6660ad31174a5cef9f31da" \
  -H "Content-Type: application/json" \
  -d '{
    "agentAlias": "weather-agent",
    "message": "Quel temps fait-il à Paris ?"
  }' | jq
```

Réponse :
```json
{
  "taskId": "task-uuid",
  "contextId": "ctx-uuid",
  "status": "completed",
  "response": "Paris : 18°C, ensoleillé avec quelques nuages.",
  "artifacts": [...]
}
```

### 6.5 Découvrir un agent externe

```bash
curl -X POST https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/api/v1/agents/weather-agent/discover \
  -H "X-API-Key: 307d1d6882e05f1135e0aa6a0c390ed112d623db5b6660ad31174a5cef9f31da" | jq
```

> Retourne l'Agent Card de l'agent externe (nom, capabilities, skills).

### 6.6 Conversation multi-tours (outbound)

Réutiliser le `contextId` pour maintenir le contexte :

```bash
curl -X POST https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/api/v1/delegate \
  -H "X-API-Key: 307d1d6882e05f1135e0aa6a0c390ed112d623db5b6660ad31174a5cef9f31da" \
  -H "Content-Type: application/json" \
  -d '{
    "agentAlias": "weather-agent",
    "contextId": "CONTEXT_ID_DU_PREMIER_APPEL",
    "message": "Et demain ?"
  }' | jq
```

---

## 7. Dashboard temps réel

### 7.1 Accès

URL : https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/dashboard

### 7.2 Onglet « Conversations »

Le moniteur affiche toutes les conversations traversant le proxy en **temps réel** :

- **Bulles style iMessage** : requêtes à gauche (bleu), réponses à droite (vert)
- **Groupement par `contextId`** : les messages d'une même conversation sont regroupés dans un thread pliable
- **Badges** :
  - 🔵 `inbound` = Agent externe → Agentforce
  - 🟢 `outbound` = Agentforce → Agent externe
  - ⏱️ Latence de réponse en millisecondes
  - 📡 `streaming` quand le mode SSE est utilisé
- **Barre de stats** : nombre total de messages, nombre de conversations, latence moyenne
- **Indicateur de connexion** : Vert (connecté) / Rouge (déconnecté) / Orange (reconnexion)

#### Fonctionnement technique

```
Dashboard (navigateur)
    │
    │ EventSource (SSE)
    │ GET /dashboard/events
    │
    ▼
┌─────────────────────────┐
│ ConversationEventBus    │ ◄── Émissions depuis :
│ (EventEmitter singleton)│     • jsonrpc-handler.ts (inbound)
│                         │     • streaming.ts (SSE bridge)
│                         │     • delegate.ts (outbound)
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ ConversationEventStore  │
│ (ring buffer, 500 max)  │
│                         │
│ → getAll() pour history │
│ → événements live via   │
│   EventEmitter          │
└─────────────────────────┘
```

**À la connexion :** le client reçoit d'abord un événement `history` contenant tous les événements stockés, puis les événements `conversation` en live.

### 7.3 Onglet « Setup Wizard »

Voir [Section 4.2](#42-setup-wizard-onglet--setup-wizard-) pour le détail des 8 étapes.

#### APIs du wizard (toutes authentifiées par cookie) :

| Endpoint | Méthode | Description |
|---|---|---|
| `/dashboard/api/setup/test-oauth` | POST | Teste les credentials OAuth |
| `/dashboard/api/setup/discover-agents` | POST | Requête SOQL pour lister les agents |
| `/dashboard/api/setup/test-session` | POST | Crée puis supprime une session test |
| `/dashboard/api/setup/test-message` | POST | Envoie un message test à l'agent |
| `/dashboard/api/setup/verify-proxy` | GET | Vérifie la configuration env |

---

## 8. Scénarios de démo avancés

### 8.1 Scénario complet : Agent externe interroge un agent Service Cloud

**Contexte :** Un agent IA externe (ex: chatbot interne d'entreprise) a besoin de vérifier le statut d'un ticket Salesforce via un agent Agentforce configuré sur Service Cloud.

```bash
# 1. Premier message : identifier le cas
curl -X POST https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/a2a \
  -H "Authorization: Bearer 8dc26e003bd9798b212795a8f0d2c371848057ef34a9fcd2bc9eb0c12645902b" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tasks/send",
    "params": {
      "message": {
        "role": "user",
        "parts": [
          {"type": "text", "text": "Quel est le statut du case numéro 00001234 ?"}
        ]
      }
    }
  }' | jq

# 2. Récupérer le contextId de la réponse
# 3. Poser une question de suivi dans le même contexte
curl -X POST https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/a2a \
  -H "Authorization: Bearer 8dc26e003bd9798b212795a8f0d2c371848057ef34a9fcd2bc9eb0c12645902b" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tasks/send",
    "params": {
      "contextId": "CONTEXT_ID",
      "message": {
        "role": "user",
        "parts": [
          {"type": "text", "text": "Qui est l assigné et quand a-t-il été mis à jour pour la dernière fois ?"}
        ]
      }
    }
  }' | jq
```

> **Pendant la démo :** Ouvrir le dashboard dans un second onglet pour voir les bulles de conversation apparaître en temps réel.

### 8.2 Scénario : Streaming d'une réponse longue

```bash
# Utiliser -N pour désactiver le buffering curl
curl -X POST https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/a2a \
  -H "Authorization: Bearer 8dc26e003bd9798b212795a8f0d2c371848057ef34a9fcd2bc9eb0c12645902b" \
  -H "Content-Type: application/json" \
  -N \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tasks/sendSubscribe",
    "params": {
      "message": {
        "role": "user",
        "parts": [
          {"type": "text", "text": "Donne-moi un guide détaillé en 10 étapes pour configurer Einstein Prediction Builder."}
        ]
      }
    }
  }'
```

> **Point de démo :** Les chunks de texte arrivent progressivement. On voit les événements SSE `TaskArtifactUpdateEvent` avec `append: true` se succéder jusqu'au `TaskStatusUpdateEvent` final avec `state: completed`.

### 8.3 Scénario : Gestion d'erreurs

```bash
# Erreur 401 : Bearer token invalide
curl -X POST https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/a2a \
  -H "Authorization: Bearer mauvais-token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tasks/send","params":{"message":{"role":"user","parts":[{"type":"text","text":"test"}]}}}' \
  -w "\nHTTP Status: %{http_code}\n"

# Erreur JSON-RPC : méthode inconnue
curl -X POST https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/a2a \
  -H "Authorization: Bearer 8dc26e003bd9798b212795a8f0d2c371848057ef34a9fcd2bc9eb0c12645902b" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tasks/unknown","params":{}}' | jq

# Erreur JSON-RPC : message vide
curl -X POST https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/a2a \
  -H "Authorization: Bearer 8dc26e003bd9798b212795a8f0d2c371848057ef34a9fcd2bc9eb0c12645902b" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tasks/send","params":{"message":{"role":"user","parts":[]}}}' | jq
```

> **Point de démo :** Le proxy retourne des erreurs JSON-RPC standardisées avec les codes appropriés (-32600, -32601, -32602, etc.) et n'expose jamais de détails d'implémentation interne.

### 8.4 Script de démo automatisé

```bash
#!/bin/bash
# demo.sh — Démonstration complète A2A → Agentforce → A2A

PROXY_URL="https://a2a-agentforce-proxy-0de05538a326.herokuapp.com"
API_KEY="8dc26e003bd9798b212795a8f0d2c371848057ef34a9fcd2bc9eb0c12645902b"

echo "═══════════════════════════════════════════════════════"
echo "  A2A ↔ Agentforce Proxy — Démonstration"
echo "═══════════════════════════════════════════════════════"
echo ""

echo "1️⃣  Health Check"
echo "────────────────"
curl -s "$PROXY_URL/health" | jq .
echo ""

echo "2️⃣  Agent Card Discovery"
echo "────────────────────────"
curl -s "$PROXY_URL/.well-known/agent-card.json" | jq .
echo ""

echo "3️⃣  Envoi d'un message (tasks/send)"
echo "─────────────────────────────────────"
RESPONSE=$(curl -s -X POST "$PROXY_URL/a2a" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tasks/send",
    "params": {
      "message": {
        "role": "user",
        "parts": [{"type": "text", "text": "Bonjour ! Présente-toi brièvement."}]
      }
    }
  }')

echo "$RESPONSE" | jq .

# Extraire le contextId pour la suite
CONTEXT_ID=$(echo "$RESPONSE" | jq -r '.result.contextId')
echo ""
echo "   → contextId capturé : $CONTEXT_ID"
echo ""

echo "4️⃣  Message de suivi (même contexte)"
echo "──────────────────────────────────────"
curl -s -X POST "$PROXY_URL/a2a" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 2,
    \"method\": \"tasks/send\",
    \"params\": {
      \"contextId\": \"$CONTEXT_ID\",
      \"message\": {
        \"role\": \"user\",
        \"parts\": [{\"type\": \"text\", \"text\": \"Quelles sont tes principales compétences ?\"}]
      }
    }
  }" | jq .
echo ""

echo "═══════════════════════════════════════════════════════"
echo "  ✅ Démonstration terminée"
echo "  📊 Voir les conversations : $PROXY_URL/dashboard"
echo "═══════════════════════════════════════════════════════"
```

---

## 9. Référence API complète

### 9.1 Endpoints publics

| Méthode | URL | Description |
|---|---|---|
| `GET` | `/` | Redirige vers `/dashboard/login` |
| `GET` | `/health` | Health check + métriques mémoire |
| `GET` | `/.well-known/agent-card.json` | Agent Card A2A (découverte) |

### 9.2 Inbound A2A (Bearer Token)

**URL :** `POST /a2a`
**Auth :** `Authorization: Bearer <API_KEY>`
**Content-Type :** `application/json`

#### `tasks/send` — Envoi synchrone

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tasks/send",
  "params": {
    "contextId": "optionnel-pour-multi-tour",
    "message": {
      "role": "user",
      "parts": [
        {"type": "text", "text": "Votre message"}
      ]
    }
  }
}
```

#### `tasks/sendSubscribe` — Envoi avec streaming SSE

Même format que `tasks/send`. La réponse est un flux SSE.

#### `tasks/get` — Statut d'une tâche

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tasks/get",
  "params": {"id": "task-uuid"}
}
```

#### `tasks/cancel` — Annulation

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tasks/cancel",
  "params": {"id": "task-uuid"}
}
```

### 9.3 Outbound Delegate (X-API-Key)

| Méthode | URL | Description |
|---|---|---|
| `POST` | `/api/v1/delegate` | Déléguer à un agent externe |
| `GET` | `/api/v1/agents` | Lister les agents disponibles |
| `POST` | `/api/v1/agents/:alias/discover` | Découvrir un agent |

**Auth :** `X-API-Key: <DELEGATE_API_KEY>`

#### Corps de `POST /api/v1/delegate`

```json
{
  "agentAlias": "weather-agent",
  "message": "Quel temps fait-il à Paris ?",
  "contextId": "optionnel-pour-multi-tour"
}
```

#### Réponse

```json
{
  "taskId": "task-uuid",
  "contextId": "ctx-uuid",
  "status": "completed",
  "response": "Paris : 18°C, ensoleillé.",
  "artifacts": [...]
}
```

### 9.4 Dashboard (Cookie Auth)

| Méthode | URL | Description |
|---|---|---|
| `GET` | `/dashboard/login` | Page de login |
| `POST` | `/dashboard/login` | Authentification |
| `POST` | `/dashboard/logout` | Déconnexion |
| `GET` | `/dashboard/` | Page principale |
| `GET` | `/dashboard/events` | Flux SSE temps réel |
| `GET` | `/dashboard/api/status` | Stats du buffer |
| `POST` | `/dashboard/api/setup/test-oauth` | Test OAuth |
| `POST` | `/dashboard/api/setup/discover-agents` | Découverte agents |
| `POST` | `/dashboard/api/setup/test-session` | Test session |
| `POST` | `/dashboard/api/setup/test-message` | Test message |
| `GET` | `/dashboard/api/setup/verify-proxy` | Vérification config |

### 9.5 Codes d'erreur JSON-RPC

| Code | Signification |
|---|---|
| `-32600` | Requête JSON-RPC invalide |
| `-32601` | Méthode inconnue |
| `-32602` | Paramètres invalides |
| `-32603` | Erreur interne |
| `-32001` | Tâche introuvable |
| `-32002` | Tâche non annulable |
| `-32005` | Rate limit dépassé |

### 9.6 Codes HTTP

| Code | Signification |
|---|---|
| `200` | Succès |
| `302` | Redirection (login, root) |
| `400` | Requête invalide |
| `401` | Non authentifié |
| `404` | Ressource introuvable |
| `413` | Body trop large (>1 MB) |
| `429` | Rate limit (100 req/min A2A, 60 req/min delegate) |
| `502` | Erreur upstream (Agentforce ou agent externe) |

---

## 10. Troubleshooting

### Le proxy retourne 502

**Cause :** Agentforce ou l'agent externe est injoignable.

```bash
# Vérifier les logs
heroku logs --tail --app a2a-agentforce-proxy

# Tester l'OAuth manuellement
curl -X POST "https://YOUR_DOMAIN.my.salesforce.com/services/oauth2/token" \
  -d "grant_type=client_credentials&client_id=YOUR_ID&client_secret=YOUR_SECRET&client_email=YOUR_EMAIL"
```

### Le proxy retourne 401

**Cause :** Le Bearer token ou l'API key est incorrect.

```bash
# Vérifier la clé configurée
heroku config:get API_KEY --app a2a-agentforce-proxy
heroku config:get DELEGATE_API_KEY --app a2a-agentforce-proxy
```

### Le dashboard est vide (aucune conversation)

**Cause :** Les événements sont stockés en mémoire et perdus au redémarrage du dyno.

**Solution :** Lancer quelques requêtes A2A puis rafraîchir le dashboard.

### Timeout sur les requêtes streaming

**Cause :** Heroku coupe les connexions après 30 secondes sans bytes.

**Solution :** Le proxy envoie un heartbeat SSE toutes les 15 secondes. Si le timeout persiste, vérifier que la requête utilise `-N` (no buffering) avec curl.

### L'agent Agentforce ne répond pas correctement

```bash
# Vérifier l'agent ID
heroku config:get SALESFORCE_AGENT_ID --app a2a-agentforce-proxy

# Tester via le Setup Wizard (Step 5)
# → Le wizard envoie un message test et affiche la réponse
```

### Variables d'environnement manquantes

```bash
# Le proxy démarre mais sans les fonctionnalités proxy
# Vérifier les logs au démarrage
heroku logs --app a2a-agentforce-proxy | grep "env vars"

# Configurer les variables manquantes
heroku config:set SALESFORCE_SERVER_URL=... --app a2a-agentforce-proxy
```

---

## 11. Glossaire

| Terme | Définition |
|---|---|
| **A2A** | Agent-to-Agent protocol — protocole open-source de Google pour la communication inter-agents |
| **Agent Card** | Document JSON décrivant les capacités d'un agent A2A (équivalent d'une carte de visite) |
| **Agentforce** | Plateforme de création d'agents IA de Salesforce |
| **Agent API** | API REST de Salesforce pour interagir avec les agents Agentforce |
| **Bearer Token** | Méthode d'authentification HTTP via le header `Authorization: Bearer <token>` |
| **Client Credentials Flow** | Flux OAuth 2.0 machine-to-machine (sans interaction utilisateur) |
| **Connected App** | Application enregistrée dans Salesforce pour accéder aux APIs |
| **contextId** | Identifiant unique de conversation A2A (permet le multi-tour) |
| **Delegate** | Action de délégation : un agent confie une sous-tâche à un autre agent |
| **External Service** | Fonctionnalité Salesforce permettant d'appeler des APIs REST externes |
| **JSON-RPC 2.0** | Protocole d'appel de procédure distant encodé en JSON |
| **Named Credential** | Stockage sécurisé de credentials dans Salesforce |
| **Ring Buffer** | Structure de données circulaire à taille fixe (500 événements max) |
| **sequenceId** | Compteur Agentforce incrémenté à chaque message dans une session |
| **sessionId** | Identifiant de session Agentforce (mappé 1:1 avec contextId A2A) |
| **SSE** | Server-Sent Events — protocole de streaming unidirectionnel serveur → client |
| **taskId** | Identifiant unique d'une tâche A2A (généré par le proxy à chaque message) |

---

## Annexes

### Valeurs de l'instance de démo

| Élément | Valeur |
|---|---|
| URL du proxy | `https://a2a-agentforce-proxy-0de05538a326.herokuapp.com` |
| Dashboard | `https://a2a-agentforce-proxy-0de05538a326.herokuapp.com/dashboard` |
| Login Dashboard | `xlengelle` / `Kyx39vn7` |
| API_KEY (inbound A2A) | `8dc26e003bd9798b212795a8f0d2c371848057ef34a9fcd2bc9eb0c12645902b` |
| DELEGATE_API_KEY (outbound) | `307d1d6882e05f1135e0aa6a0c390ed112d623db5b6660ad31174a5cef9f31da` |
| GitHub | `https://github.com/xlengelle-sf/a2a-agentforce-proxy` |

### Suite de tests

```bash
# Exécuter les 262 tests
cd a2a-agentforce-proxy
npm test

# Tests avec coverage
npx vitest run --coverage

# Tests en mode watch (développement)
npm run test:watch
```

### Commandes Heroku utiles

```bash
# Voir les logs en temps réel
heroku logs --tail --app a2a-agentforce-proxy

# Redémarrer l'app
heroku restart --app a2a-agentforce-proxy

# Voir la configuration
heroku config --app a2a-agentforce-proxy

# Ouvrir une console
heroku run bash --app a2a-agentforce-proxy

# Scaler (si besoin)
heroku ps:scale web=2:standard-1x --app a2a-agentforce-proxy
```
