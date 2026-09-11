# Matrix Flow

> Repository name: `matrix-codex-flow` · Product direction: **AI Software Engineering Control Plane**

**Matrix Flow** is a local-first AI software engineering harness for turning a high-level engineering goal into a planned, isolated, observable, reviewed, and verified execution workflow.

It is **not intended to be another Codex chat UI** and it does not try to beat Codex, Claude Code, Gemini, or other coding agents at raw code generation. Those systems are execution workers. Matrix Flow is the control layer that coordinates them.

> Coding agents are the engineers. Matrix Flow is the orchestration, technical-lead, QA, policy, and execution layer around them.

## Why Matrix Flow Exists

Modern coding agents are already very strong at implementing changes. The harder engineering problem is everything around the implementation:

- how a large goal is decomposed
- which tasks can run in parallel
- which agent or provider should execute each task
- how agents avoid corrupting each other's context or working tree
- how results are reviewed and verified
- what happens when verification fails
- what the system remembers about the repository over time
- how a user can inspect exactly what happened before accepting a result

Matrix Flow is being built around those problems.

## Matrix Flow vs. a Coding Agent

| Coding agent such as Codex | Matrix Flow |
| --- | --- |
| Executes coding tasks | Coordinates complete engineering workflows |
| Primarily acts as an individual agent | Manages a team of role-specific agents |
| Works inside a session/thread | Manages independent sessions and execution state |
| Edits one checkout at a time | Targets isolated Git worktrees per worker |
| Can decide a task looks complete | Requires review and verification evidence |
| Optimizes a single agent experience | Orchestrates multiple providers and models |
| Focuses on the current task | Builds project-level execution memory and history |
| Produces code and explanations | Produces an auditable engineering run and merge candidate |

The intended abstraction is:

```text
Codex / Claude Code / Gemini / Local Agent
                    |
                    v
              execution workers
                    |
                    v
              MATRIX FLOW
      AI Software Engineering Control Plane
```

## Target User Experience

A user should be able to provide a goal such as:

```text
Add multi-tenant RBAC without breaking the existing API.
```

Matrix Flow should eventually execute a workflow like this:

```text
User Goal
   |
   v
Planner
   |
   v
Task DAG
   |
   +----------------+----------------+----------------+
   |                |                |                |
   v                v                v                v
Explorer       Backend Worker   Frontend Worker   Test Worker
                   |                |                |
              worktree A       worktree B       worktree C
                   |                |                |
                   +----------------+----------------+
                                    |
                                    v
                                 Reviewer
                                    |
                                    v
                                 Verifier
                            build / test / lint
                                    |
                           +--------+--------+
                           |                 |
                         FAIL               PASS
                           |                 |
                           v                 v
                         Fixer         Merge Candidate
                           |
                           +----> Verify Again
```

The user should not need to manually supervise every model turn. Human approval should be concentrated around meaningful risk boundaries such as destructive edits, dependency installation, network access, push, merge, or deployment.

## Product Pillars

### 1. Multi-Agent Engineering Orchestration

Matrix Flow models software work as a dependency graph instead of a single chat loop.

Core roles:

- **Planner** - decomposes a goal and defines dependencies
- **Explorer** - inspects the repository and gathers relevant context
- **Worker** - implements an assigned node
- **Reviewer** - reviews correctness, maintainability, architecture, and risk
- **Verifier** - checks build, tests, linting, and acceptance criteria
- **Fixer** - repairs a specific failure and returns the result for verification

The objective is not "multiple agents talking." The objective is controlled software-engineering execution with explicit responsibilities and dependencies.

### 2. Isolation Before Parallelism

True parallel execution is useful only when workers are actually isolated.

The target execution model is:

```text
Worker A -> independent agent session -> Git worktree A
Worker B -> independent agent session -> Git worktree B
Worker C -> independent agent session -> Git worktree C
```

This prevents shared-thread context contamination and concurrent writes to the same checkout.

### 3. Verification-First Completion

Matrix Flow should never treat an agent saying "done" as sufficient evidence of completion.

A successful engineering run should be backed by evidence such as:

```text
implementation
   -> build
   -> tests
   -> lint / static checks
   -> reviewer findings
   -> acceptance criteria
   -> final verdict
```

When verification fails, the intended loop is:

```text
Verifier FAIL
   -> Fixer
   -> retry
   -> Verifier
```

Retries must be bounded and visible. Infinite autonomous repair loops are explicitly out of scope.

### 4. Provider-Neutral Execution

Codex is the first-class provider today, but Matrix Flow is designed around provider-neutral execution boundaries.

The long-term goal is provider routing such as:

```text
Planner          -> model/provider best suited for planning
Repository work  -> coding agent suited for repo execution
Implementation   -> selected coding provider
Review           -> independent reviewer model
Verification     -> deterministic tools + agent reasoning
Cheap/simple work-> local or lower-cost model
```

Matrix Flow should choose and coordinate agents; it should not become dependent on one vendor's UX or session model.

### 5. Project Intelligence

The long-term differentiation is not only orchestration. Matrix Flow should become progressively better at engineering a specific repository.

Target project memory includes:

```text
Project Intelligence
├─ architecture
├─ coding conventions
├─ important modules
├─ repository/dependency structure
├─ historical engineering decisions
├─ previous bugs
├─ failed approaches
├─ test strategy
├─ deployment knowledge
└─ team rules and constraints
```

This is more than generic RAG. The goal is accumulated engineering context that improves future planning, execution, and review.

### 6. Observable and Auditable Runs

Every execution should be inspectable.

A run should eventually preserve:

```text
Run #42
├─ Goal
├─ Plan / DAG
├─ Agent assignments
├─ Sessions
├─ Tool calls
├─ File changes / diffs
├─ Commands
├─ Test and build results
├─ Reviewer findings
├─ Retry history
├─ Token / cost telemetry
└─ Final result
```

The product should expose engineering history, not only chat history.

### 7. Policy and Approval Layer

The harness should own risk policy instead of hard-coding one global permission mode.

Intended policy model:

- read/search/test: generally automatic
- edit/install/commit: configurable
- delete/network/push/merge/deploy: explicit policy or approval
- all privileged actions: visible in the execution trace

### 8. Autopilot With Guardrails

The eventual high-level workflow is:

```text
understand
-> plan
-> isolate
-> execute parallel work
-> review
-> verify
-> fix failures
-> produce merge candidate
```

Autopilot does **not** mean unrestricted autonomy. It means minimizing low-value supervision while keeping strong approval boundaries and complete observability.

## Current Implementation Status

The `feat/agent-harness-core` branch contains the first working harness foundation:

- provider-neutral `AgentRuntime` and `AgentProvider` boundaries
- Codex execution moved behind `CodexProvider`
- dependency-graph execution for legacy tasks
- Planner / Explorer / Worker / Reviewer / Verifier / Fixer role model
- graph validation, ready-node scheduling, cycle detection, and downstream blocking
- structured execution events and runtime telemetry
- Agent Graph and Execution Trace UI in the task runtime view
- managed detached Git worktree isolation foundation
- backward compatibility with the existing pre/main/post task model

True parallel worker execution is **intentionally disabled** at this stage. The current chat path still shares session state, so enabling `Promise.all` now would introduce context contamination and concurrent-write risk. Independent agent sessions and worktree lifecycle management come first.

## Current Architecture

```text
Angular UI
   |
   +-- Project / Task UX
   +-- Task DAG Runtime
   +-- Agent Graph
   +-- Execution Trace
   |
   v
Agent Runtime
   |
   +-- role orchestration
   +-- lifecycle / telemetry
   +-- provider routing
   |
   v
Agent Provider
   |
   +-- CodexProvider [current]
   +-- future providers
   |
   v
Tauri / Rust Services
   |
   +-- Git / Worktree
   +-- Shell / Tools
   +-- Persistence
   +-- future MCP / Policy
```

## Next Architecture Slice

The next major implementation milestone is **independent Agent Execution Sessions**.

That means moving DAG node execution away from the shared UI chat thread and giving every worker its own execution state:

```text
AgentExecutionSession
├─ session id
├─ DAG node id
├─ role
├─ provider
├─ provider thread id
├─ working directory
├─ worktree lease
├─ status
└─ result / evidence
```

After this exists, Matrix Flow can safely enable bounded parallel DAG execution.

## Tech Stack

- TypeScript
- Angular 21
- RxJS
- Tauri 2
- Rust backend services
- SQLite persistence
- Codex CLI / Codex SDK as the current execution provider
- Git worktree isolation
- GitHub Actions build validation

## Prerequisites

- Node.js 20+
- npm 11+
- Git
- Rust toolchain with `cargo`
- Tauri CLI dependencies for your OS
- Codex CLI for Codex-backed execution: `npm i -g @openai/codex`

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

Useful validation commands:

```powershell
npm run frontend:build
npm test -- --watch=false
npm audit
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:build
```

`npm start` / `ng serve` is useful for frontend shell checks, but Tauri APIs are only available inside the desktop runtime.

## Development Principles

The codebase should preserve strong boundaries between orchestration, providers, context, execution, persistence, and policy.

Key rules:

- do not couple the product directly to one model vendor
- do not enable parallel workers before session and filesystem isolation
- do not trust agent self-reported completion without verification
- do not hide retries, tool calls, or privileged actions
- do not auto-push, auto-merge, or deploy without an explicit policy
- preserve compatibility with existing user data during architecture migrations
- prefer bounded, recoverable workflows over opaque autonomous loops

## Roadmap

### Phase 1 - Harness Foundation

- [x] provider-neutral backend runtime
- [x] Codex provider boundary
- [x] Task DAG foundation
- [x] role-based execution model
- [x] execution telemetry
- [x] Agent Graph / Execution Trace UI
- [x] Git worktree service foundation

### Phase 2 - Real Multi-Agent Execution

- [ ] independent `AgentExecutionSession` per DAG node
- [ ] independent provider thread/session state
- [ ] worktree lease lifecycle per worker
- [ ] bounded parallel DAG scheduler
- [ ] node outputs and evidence passed to downstream nodes

### Phase 3 - Verification Loop

- [ ] structured Reviewer verdict
- [ ] structured Verifier verdict
- [ ] Fixer retry nodes
- [ ] bounded retry policy
- [ ] deterministic build/test/lint evidence

### Phase 4 - Control Plane

- [ ] risk-tier execution policy
- [ ] interactive approvals
- [ ] provider registry and routing
- [ ] MCP/tool registry
- [ ] project intelligence / engineering memory
- [ ] durable run history
- [ ] token, cost, tool-call, command, and diff observability

### Phase 5 - Autopilot

- [ ] planner-generated native DAGs
- [ ] automatic provider selection
- [ ] safe branch/worktree promotion
- [ ] merge-candidate generation
- [ ] optional PR creation after approval
- [ ] reusable engineering workflows and policies

## Team & Role

This is a team-developed project.

| Member | Role |
| --- | --- |
| **skylangy** | Core contributor - architecture and core feature implementation |
| Other team members | Product planning, Codex integration, releases |

**skylangy's focus areas:**

- Agent Harness architecture
- provider-neutral runtime and Codex integration
- Task DAG and role-based orchestration
- execution lifecycle and observability
- project context and prompt strategy
- isolation, testability, and execution safety

## Philosophy

> Do not build a weaker copy of a coding agent. Build the system that makes a team of coding agents reliable.

Matrix Flow treats AI agents as software-engineering workers that must be **orchestrated, isolated, observed, reviewed, and verified**.

The long-term product ambition is simple:

> **An operating system for AI software engineers.**

## Screenshots

![Welcome](doc/images/1-welcome.png)
![Chat Empty](doc/images/2-chat-empty.png)
![Chat Message](doc/images/3-chat-message.png)
![Context Manage](doc/images/context-4-manage.png)
![Task Editor](doc/images/5-task-editor.png)
![Task Manage](doc/images/5-task-manage.png)
![Task Running](doc/images/6-task-running.png)
