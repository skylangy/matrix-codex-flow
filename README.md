# Matrix Codex Flow (VibeFlow)

**VibeFlow** is an AI-driven developer workflow engine for planning, executing, and iterating on complex coding tasks end to end. It integrates deeply with **Codex CLI** to apply changes in your repository with full project context, in clear, auditable steps.

> Built as an **AI project executor**, not just a chat assistant.

## Team & Role

This is a **team-developed** project.

| Member | Role |
|--------|------|
| **skylangy** | Core contributor — architecture and core feature implementation |
| Other team members | Product planning, Codex integration, releases |

**skylangy’s focus areas:**

- Codex CLI integration and automated execution pipeline
- Task planner (pre / main / post step workflow)
- Project context management and prompt generation
- Iteration and engineering improvements (OOP layering, testability)

## Tech Stack

- TypeScript / Electron (desktop)
- Codex CLI, Git
- OOP layering: planning, execution, and context decoupled

## Quick Start

1. Install Codex CLI: `npm i -g @openai/codex`
2. Install [Git](https://git-scm.com)
3. Clone this repo, install dependencies from `package.json`, and start the app
4. Load project context, define a goal, and let the planner break it down and run steps

## Core Capabilities

### 1. Codex CLI integration
- Run Codex CLI commands directly
- Apply changes safely inside the repo
- Sandbox and approval policies supported

### 2. Project context management
- Load files on demand to reduce token usage
- Keep architecture and code style consistent

### 3. Task planner
- Pre-step / main-step / post-step workflow
- Suited to refactors, migrations, and long-running tasks

### 4. AI prompt generation
- Structured intent, constraints, and output rules
- Reusable, high-quality instruction templates

## Development Guidelines

The codebase favors **OOP**:

- Single responsibility, encapsulated state and behavior
- Interface abstractions and dependency injection
- Clear separation of planning, execution, and context layers

## Roadmap

- Prompt history
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
