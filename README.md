# Matrix Codex Flow (VibeFlow)

**VibeFlow** is an AI-driven developer workflow engine for planning, executing, and iterating on complex coding tasks end to end. It integrates with **Codex CLI** so changes can be applied in a repository with project context, visible progress, and auditable steps.

> Built as an AI project executor, not just a chat assistant.

## Team & Role

This is a team-developed project.

| Member | Role |
| --- | --- |
| **skylangy** | Core contributor - architecture and core feature implementation |
| Other team members | Product planning, Codex integration, releases |

**skylangy's focus areas:**

- Codex CLI integration and automated execution pipeline
- Task planner: pre / main / post step workflow
- Project context management and prompt generation
- Iteration and engineering improvements: OOP layering, testability, and execution safety

## Tech Stack

- TypeScript, Angular 21, RxJS
- Tauri 2 desktop shell with Rust backend services
- SQLite plugin storage through Tauri
- Codex CLI / Codex SDK integration
- Git and GitHub release workflow

## Prerequisites

- Node.js 20+ and npm 11+
- Git
- Rust toolchain with `cargo`
- Tauri CLI dependencies for your OS
- Codex CLI when running real Codex tasks: `npm i -g @openai/codex`

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

## Core Capabilities

### 1. Codex CLI integration

- Run Codex-backed tasks from the desktop app
- Continue Codex threads across turns
- Stream responses back into the chat UI
- Apply changes with explicit working directory context

### 2. Execution safety

- Default Codex sandbox: `workspace-write`
- Default shell network access: disabled
- Full-access mode is available only as an explicit user configuration
- Interactive approval UI is still planned, so the backend currently keeps `ApprovalMode::Never`

### 3. Project context management

- Load files on demand to reduce token usage
- Keep architecture and code style consistent
- Preserve project task records under `doc/project-log/`

### 4. Task planner

- Pre-step / main-step / post-step workflow
- Suited to refactors, migrations, and long-running tasks

### 5. AI prompt generation

- Structured intent, constraints, and output rules
- Reusable instruction templates

## Development Guidelines

The codebase favors OOP-style boundaries:

- Single responsibility, encapsulated state and behavior
- Interface abstractions and dependency injection
- Clear separation of planning, execution, context, and persistence layers

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

- Interactive Codex approval UI
- Web search configuration in the agent settings UI
- Prompt history
- More automated test coverage
- Support for additional AI agent CLIs

## Philosophy

> Treat AI as a reliable teammate, not a toy chatbot.

Focus on predictable automation, explicit context, and safe execution.

## Screenshots

![Welcome](doc/images/1-welcome.png)
![Chat Empty](doc/images/2-chat-empty.png)
![Chat Message](doc/images/3-chat-message.png)
![Context Manage](doc/images/context-4-manage.png)
![Task Editor](doc/images/5-task-editor.png)
![Task Manage](doc/images/5-task-manage.png)
![Task Running](doc/images/6-task-running.png)
