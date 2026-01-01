# Neo4j Agent Memory (Final Solution)

> **🚀 Quick Start:** `./start.sh` then `npm run start:all`
> **🎯 Demo Guide:** See [DEMO_GUIDE.md](./DEMO_GUIDE.md) for what the demo shows
> **📖 Full Docs:** See sections below

## What's Included

- **`packages/neo4j-agent-memory`** — TypeScript npm package implementing:
  - ✅ Semantic / Procedural / **Episodic** memories
  - ✅ **Case-based reasoning** (`Case`, `Symptom`)
  - ✅ **Negative memories** (`polarity=negative`)
  - ✅ **Environment fingerprints** (precision filtering)
  - ✅ Hybrid retrieval (cases by symptoms+env → fix + do-not-do sections)
  - ✅ Reinforcement feedback (edge weights) + optional Beta-with-forgetting scaffold

- **`apps/demo-api`** — Node + Express demo integrating **Auggie SDK** with tools for:
  - 🔧 Mid-run memory retrieval (`memory_get_context`)
  - 💬 Feedback (`memory_feedback`)
  - 💾 Extract+save learnings (`memory_extract_and_save`)
  - 📡 Streaming progress via `client.onSessionUpdate(...)`

- **`apps/demo-ui`** — React 19 + TypeScript 5 demo UI:
  - 🎨 Chip-based filter inputs
  - 🎯 Progressive disclosure UX
  - ♿ Accessible components
  - 📊 Real-time agent progress streaming

## Quick Start

### 🚀 One-Command Setup (Recommended)

```bash
# 1. Configure environment first
cp apps/demo-api/.env.example apps/demo-api/.env
# Edit apps/demo-api/.env with your Auggie credentials and Neo4j settings

# 2. Run the complete setup script
./start.sh

# 3. Start everything (API + UI)
npm run start:all
```

**Access Points:**
- 🌐 **UI**: http://localhost:5173
- 🔌 **API**: http://localhost:3000
- 🗄️ **Neo4j Browser**: http://localhost:7474
- ⚡ **Neo4j Bolt**: neo4j://localhost:7687

### 📋 Manual Setup (Step-by-Step)

#### 1) Start Neo4j
```bash
npm run db:start
# Or: docker compose up -d
```

Neo4j Browser: http://localhost:7474
Bolt: neo4j://localhost:7687

#### 2) Install deps
```bash
npm install
```

#### 3) Configure demo-api

**Option A: Automatic setup (Recommended)**
```bash
cd apps/demo-api
cp .env.example .env
./setup-auth.sh  # Automatically extracts credentials from auggie settings
# Then edit .env to set NEO4J_URI/USER/PASSWORD
```

**Option B: Manual setup**
```bash
cp apps/demo-api/.env.example apps/demo-api/.env
# Get your Auggie credentials:
auggie token print
# Copy the "accessToken" and "tenantURL" values to .env
# Set NEO4J_URI/USER/PASSWORD
```

**Option C: Use settings.json (no .env needed)**
The SDK will automatically load credentials from your Auggie settings.json if no environment variables are set.
Just configure Neo4j credentials in .env:
```bash
cp apps/demo-api/.env.example apps/demo-api/.env
# Only set NEO4J_URI/USER/PASSWORD, leave AUGMENT_API_TOKEN commented out
```

#### 4) Build the package
```bash
npm run build
```

#### 5) Seed the database
```bash
npm run db:seed
```

This will populate Neo4j with sample UX/UI memories and cases for testing.

#### 6) Run demo API
```bash
npm run dev
```

The server will start on **port 3000** (configurable via `PORT` in `.env`).

#### 7) Run demo UI (optional, in a new terminal)
```bash
npm run dev:ui
```

The UI will start on **port 5173**.

## Available Scripts

### Root-Level Commands

| Command | Description |
|---------|-------------|
| `npm run start:all` | Start Neo4j + API + UI (all services) |
| `npm run dev` | Start API server only |
| `npm run dev:ui` | Start UI dev server only |
| `npm run build` | Build all packages and apps |
| `npm run db:start` | Start Neo4j with Docker Compose |
| `npm run db:stop` | Stop Neo4j |
| `npm run db:seed` | Seed database with sample data |
| `npm run db:check` | Check database contents |
| `npm run setup` | Full setup: install + build + seed |
| `npm run clean` | Remove all node_modules and dist folders |
| `./start.sh` | Complete setup script (interactive) |

### Workspace Commands

```bash
# Build specific workspace
npm run build -w packages/neo4j-agent-memory
npm run build -w apps/demo-api
npm run build -w apps/demo-ui

# Run tests
npm run test -w packages/neo4j-agent-memory
```

## 🎯 Try the Demo

### Using the UI (Recommended)

1. **Start everything**: `npm run start:all`
2. **Open**: http://localhost:5173
3. **Click "Run agent"** - The default prompt demonstrates:
   - ✅ Retrieving existing memories (npm EACCES fix)
   - ✅ Case-based reasoning (symptom matching)
   - ✅ Environment filtering (macOS + npm)
   - ✅ Positive + negative memories (fix + anti-patterns)

**See [DEMO_GUIDE.md](./DEMO_GUIDE.md)** for detailed explanation of what memories will be retrieved and why.

### Using the API (curl)

#### 1) Health check
```bash
curl -s http://localhost:3000/health
```

#### 2) Test the agent with memory retrieval
```bash
curl -X POST http://localhost:3000/agent/run \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "How should I structure a prompt builder UI?",
    "symptoms": ["ui design"],
    "tags": ["ux", "ui"]
  }'
```

#### 3) Example with technical troubleshooting (matches seeded memories)
```bash
curl -X POST http://localhost:3000/agent/run \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "auggie",
    "prompt": "npm install fails with EACCES permission denied on macOS",
    "symptoms": ["EACCES", "permission denied"],
    "tags": ["npm", "macos"],
    "env": {
      "os": "macos",
      "packageManager": "npm",
      "container": false
    }
  }'
```

**Expected**: Agent will retrieve 4+ memories including procedural fix, episodic success story, and anti-pattern warning.

The response is streamed as NDJSON with:
- `{"type":"tool_call","title":"..."}` - Tool execution events
- `{"type":"tool_call_update","title":"..."}` - Tool progress updates
- `{"type":"final","durationMs":...,"answer":"..."}` - Final answer
- `{"type":"error","message":"..."}` - Error if something fails

## API Endpoints

### Core Endpoints

- **`GET /health`** - Health check endpoint
  ```bash
  curl http://localhost:3000/health
  ```

- **`POST /memory/retrieve`** - Preview ContextBundle before running agent
  ```bash
  curl -X POST http://localhost:3000/memory/retrieve \
    -H "Content-Type: application/json" \
    -d '{
      "agentId": "auggie",
      "prompt": "npm install fails with EACCES",
      "symptoms": ["EACCES", "permission denied"],
      "tags": ["npm", "macos"],
      "env": {"os": "macos", "packageManager": "npm"}
    }'
  ```

  **Response:**
  ```json
  {
    "sessionId": "uuid-here",
    "sections": {
      "fix": [
        {
          "id": "mem_...",
          "kind": "procedural",
          "polarity": "positive",
          "title": "Fix npm EACCES permission denied on macOS",
          "content": "...",
          "tags": ["npm", "macos", "permissions"],
          "confidence": 0.95,
          "utility": 0.8,
          "updatedAt": "2024-12-22T14:25:00Z"
        }
      ],
      "doNotDo": [
        {
          "id": "mem_...",
          "kind": "semantic",
          "polarity": "negative",
          "title": "Anti-pattern: Using sudo with npm",
          "content": "...",
          "tags": ["npm", "sudo", "anti-pattern"],
          "confidence": 0.96,
          "utility": 0.9,
          "updatedAt": "2024-12-20T10:00:00Z"
        }
      ]
    },
    "injection": {
      "fixBlock": "# Fix Memories\n\n[MEM:mem_...] Fix npm EACCES...",
      "doNotDoBlock": "# Do Not Do\n\n[MEM:mem_...] Anti-pattern: Using sudo..."
    }
  }
  ```

- **`POST /agent/run`** - Run the agent with memory-augmented prompts (streams NDJSON)
  ```bash
  curl -X POST http://localhost:3000/agent/run \
    -H "Content-Type: application/json" \
    -d '{
      "agentId": "auggie",
      "prompt": "npm install fails with EACCES",
      "symptoms": ["EACCES"],
      "tags": ["npm"]
    }'
  ```

**Note:** The root endpoint `/` is not defined and will return `Cannot GET /`. Use the endpoints above.

## Architecture Notes

- Cypher queries are in `packages/neo4j-agent-memory/src/cypher/*` for transparency.
- By default, episodic `Case` traces are stored for audit but not over-favoured in retrieval; retrieval returns distilled procedural/semantic fix memories + negative do-not-do memories.
- The system uses **case-based reasoning**: symptoms + environment fingerprints are matched to historical cases, which then surface relevant fix and do-not-do memories.
- **Negative memories** (anti-patterns) are explicitly tracked with `polarity=negative` and surfaced in the "Do-not-do" section.
- **Reinforcement learning**: The `memory_feedback` tool adjusts edge weights based on which memories were useful/not useful.

## Troubleshooting

**Cypher linting warnings in VS Code:**
- The `.cypher` files show parameter warnings because the linter doesn't understand runtime parameters
- These are **false positives** - the queries work perfectly at runtime
- Solution: Reload VS Code window (Cmd/Ctrl + Shift + P → "Developer: Reload Window")
- The `.vscode/settings.json` file disables these warnings by treating `.cypher` files as plain text
- The parameter documentation comments at the top of each `.cypher` file explain what parameters are expected

**Port 8080 already in use:**
- The default port has been changed to 3000 in `.env`
- If you need a different port, edit `PORT=3000` in `apps/demo-api/.env`

**Seed script fails:**
- Make sure Neo4j is running: `docker compose up -d`
- Check Neo4j credentials in `.env` match your docker-compose.yml
- Rebuild the package: `npm run build`

**Server won't start:**
- Check that Auggie credentials are configured (see step 3)
- Verify Neo4j is accessible: `docker compose ps`
- Check logs for authentication errors

## CyVer Validation

Cypher validation is performed by `validate_cypher.py` using CyVer.

```bash
export NEO4J_URI=neo4j://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=password && python3 validate_cypher.py
```
