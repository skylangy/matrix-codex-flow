# Matrix Codex Flow (VibeFlow)

**VibeFlow** 是一款 AI 驱动的开发者工作流引擎，用于端到端地规划、执行和迭代复杂编码任务。它与 **Codex CLI** 深度集成，在理解项目上下文的前提下，分步骤、可审计地完成大型改动。

> 定位是 **AI 项目执行器**，而不只是聊天助手。

## 团队与角色

本项目为**团队协作**开发。

| 成员 | 角色 |
|------|------|
| **skylangy** | 核心参与者 — 参与架构设计与核心功能实现 |
| 项目组其他成员 | 产品规划、Codex 集成与发布维护 |

**skylangy 主要负责：**

- Codex CLI 交互与自动化执行链路
- 任务规划器（Pre / Main / Post 步骤工作流）
- 项目上下文管理与 Prompt 生成
- 功能迭代与工程化改进（OOP 分层、可测试性）

## 技术栈

- TypeScript / Electron（桌面端）
- Codex CLI、Git
- 面向对象分层：规划、执行、上下文解耦

## 快速开始

1. 安装 Codex CLI：`npm i -g @openai/codex`
2. 安装 [Git](https://git-scm.com)
3. 克隆本仓库，按 `package.json` 安装依赖并启动
4. 在应用中加载项目上下文，定义目标，由 Planner 拆解并自动执行

## 核心能力

### 1. Codex CLI 集成
- 直接执行 Codex CLI 命令
- 在仓库内安全应用变更
- 支持沙箱与审批策略

### 2. 项目上下文管理
- 按需加载文件，降低 Token 消耗
- 保持架构与代码风格一致

### 3. 任务规划器
- Pre-step / Main-step / Post-step 工作流
- 适合重构、迁移等长任务

### 4. AI Prompt 生成
- 结构化意图、约束与输出规则
- 可复用的高质量指令模板

## 开发规范

代码库采用 **OOP** 为主：

- 单一职责、封装状态与行为
- 接口抽象与依赖注入
- 规划 / 执行 / 上下文层清晰分离

## 路线图

- Prompt 历史记录
- 更多 AI Agent CLI 支持

## 设计理念

> 把 AI 当作可靠队友，而不是玩具聊天。

强调可预测的自动化、显式上下文与安全执行。

## 界面预览

![Welcome](doc/images/1-welcome.png)
![Chat Empty](doc/images/2-chat-empty.png)
![Chat Message](doc/images/3-chat-message.png)
![Context Manage](doc/images/context-4-manage.png)
![Task Editor](doc/images/5-task-editor.png)
![Task Manage](doc/images/5-task-manage.png)
![Task Running](doc/images/6-task-running.png)
