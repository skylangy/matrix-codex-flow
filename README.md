# Matrix Codex Flow (VibeFlow)

**Matrix Flow** is evolving into a local-first **AI software engineering Agent Harness** for planning, executing, reviewing, and verifying complex coding work. Codex remains a first-class execution provider, but the runtime is designed so additional agent providers can be added without coupling the product to a single CLI or model.

> Built as an AI engineering execution system, not just a chat assistant.

## Team & Role

This is a team-developed project.

| Member | Role |
| --- | --- |
| **skylangy** | Core contributor - architecture and core feature implementation |
| Other team members | Product planning, Codex integration, releases |

**skylangy's focus areas:**

- Agent Harness runtime and Codex provider integration
- Task DAG, role-based orchestration, and execution lifecycle
- Project context management and prompt generation
- Engineering improvements: OOP layering, testability, isolation, and execution safety

## Tech Stack

- TypeScript, Angular 21, RxJS
- Tauri 2 desktop shell with Rust backend services
- SQLite plugin storage through Tauri
- Provider-neutral Agent Runtime with Codex CLI / Codex SDK integration
- Git worktree isolation foundation
- Git and GitHub release workflow

## Prerequisites

- Node.js 20+ and npm 11+
- Git
- Rust toolchain with `cargo`
- Tauri CLI dependencies for your OS
- Codex CLI when running Codex-backed tasks: `npm i -g @openai/codex`

This repository uses a Rust submodule for the Codex SDK bridge. Initialize submodules before running Tauri commands.

## Quick Start

```powershell
git clone https://github.com/skylangy/matrix-codex-flow.git
cd matrix-codex-flow
git submodule update --init --recursive
npm ci
npm run frontend:build
npm run tauri:dev
```

Useful commands:

```powershell
npm run frontend:build
npm test -- --watch=false
npm audit
npm run tauri:build
```

`npm start` / `ng serve` is useful for frontend shell checks, but Tauri APIs are only available inside the desktop runtime.

## Architecture Direction

```text
User Goal
   |
   v
Agent Runtime
   |
   +-- Planner
   +-- Explorer
   +-- Worker
   +-- Reviewer
   +-- Verifier
   +-- Fixer
   |
   v
Task DAG
   |
   v
Agent Provider
   +-- Codex
   +-- future providers
   |
   v
Tools / Git / Shell / MCP
   |
   v
Isolated Execution
```

## Core Capabilities

### 1. Provider-neutral Agent Runtime

- Route execution through an `AgentRuntime` instead of binding the product directly to Codex
- Codex is implemented as a provider behind a common abstraction
- Continue Codex threads across turns
- Stream responses back into the UI
- Preserve an upgrade path for additional agent CLIs and model providers

### 2. Task DAG and Agent Roles

Legacy pre/main/post tasks are converted into a dependency graph at execution time so existing saved tasks remain compatible while the orchestration layer evolves.

Current roles:

- **Planner** - decomposes goals and defines dependencies
- **Explorer** - inspects repository context
- **Worker** - implements an assigned node
- **Reviewer** - reviews correctness and risk
- **Verifier** - validates builds, tests, linting, and acceptance criteria
- **Fixer** - reserved for targeted repair/retry loops

The scheduler validates dependency references and cycles, discovers ready nodes, and blocks downstream nodes when a dependency fails.

### 3. Harness Observability

The Task Runtime view exposes structured execution state instead of treating agent work as a black box:

- graph/node lifecycle events
- role and node status
- dependency count and attempts
- completed / running / failed / blocked node totals
- execution duration and progress
- recent execution trace

### 4. Execution Safety

- Default Codex sandbox: `workspace-write`
- Default shell network access: disabled
- Full-access mode is available only as an explicit user configuration
- Interactive approval UI is still planned, so the backend currently keeps `ApprovalMode::Never`
- Worktree isolation foundation creates detached, managed worktrees without automatically merging or pushing changes

### 5. Project Context Management

- Load files on demand to reduce token usage
- Keep architecture and code style consistent
- Preserve project task records under `doc/project-log/`
- Evolve toward task-local context, project memory, and agent attempt history

### 6. AI Prompt Generation

- Structured intent, constraints, and output rules
- Reusable instruction templates
- Role-specific execution instructions for DAG nodes

## Development Guidelines

The codebase favors OOP-style boundaries:

- Single responsibility, encapsulated state and behavior
- Interface abstractions and dependency injection
- Clear separation of orchestration, providers, context, execution, and persistence layers

Before publishing a change:

```powershell
git status --short
npm run frontend:build
npm test -- --watch=false
npm audit
```

Run Rust/Tauri validation when the local Rust toolchain is available:

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:build
```

## Roadmap

- Native DAG editor and planner-generated task graphs
- Independent agent sessions and true parallel DAG execution
- Git worktree lifecycle integration per worker
- Interactive approval and permission policy UI
- Reviewer -> Verifier -> Fixer retry loop
- Provider registry for additional AI agent CLIs
- Project memory and task-local context engine
- MCP tool registry
- Token, cost, tool-call, and diff observability

## Philosophy

> Treat AI agents as an engineering team that must be orchestrated, isolated, observable, and verifiable.

Focus on predictable automation, explicit context, safe execution, and evidence-backed completion.

## Screenshots

![Welcome](doc/images/1-welcome.png)
![Chat Empty](doc/images/2-chat-empty.png)
![Chat Message](doc/images/3-chat-message.png)
![Context Manage](doc/images/context-4-manage.png)
![Task Editor](doc/images/5-task-editor.png)
![Task Manage](doc/images/5-task-manage.png)
![Task Running](doc/images/6-task-running.png)
