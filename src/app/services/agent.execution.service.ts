import { inject, Injectable, signal } from '@angular/core';
import {
    AgentExecutionRequest,
    AgentExecutionResult,
    AgentExecutionSession,
    AgentExecutionSessionStatus,
} from '../models/agent.execution';
import { AgentConfig, AgentProvider, AgentResponse } from '../models/agent.provider';
import { AgentProviderRegistry } from '../models/agents';
import { IdGenerator } from '../models/id';
import { ProjectService } from './project.service';
import { SettingService } from './setting.service';

const EXECUTION_TIMEOUT_MS = 120000;

@Injectable({ providedIn: 'root' })
export class AgentExecutionService {
    private readonly settingService = inject(SettingService);
    private readonly projectService = inject(ProjectService);

    readonly sessions = signal<AgentExecutionSession[]>([]);

    async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
        const agentConfig = request.agentConfig ?? await this.requireActiveAgentConfig();
        const provider = AgentProviderRegistry.create(agentConfig);
        const workingDirectory = request.workingDirectory
            ?? this.projectService.currentProject()?.path
            ?? undefined;

        const session: AgentExecutionSession = {
            id: IdGenerator.generateId(),
            nodeId: request.nodeId,
            role: request.role,
            provider: agentConfig.agentType,
            model: agentConfig.model,
            threadId: request.threadId ?? undefined,
            workingDirectory,
            worktreeId: request.worktreeId,
            status: AgentExecutionSessionStatus.Pending,
            createdAt: Date.now(),
        };

        this.upsertSession(session);
        this.patchSession(session.id, {
            status: AgentExecutionSessionStatus.Running,
            startedAt: Date.now(),
        });

        let output = '';
        let lastResponse: AgentResponse | undefined;

        try {
            const agentRequest = {
                prompt: request.prompt,
                model: agentConfig.model,
                timeoutMs: EXECUTION_TIMEOUT_MS,
                stream: true,
                workingDirectory,
                threadId: request.threadId ?? null,
                sandboxMode: agentConfig.sandboxMode ?? 'workspace-write' as const,
                networkAccessEnabled: agentConfig.networkAccessEnabled ?? false,
            };

            if (provider.runStream) {
                await provider.runStream(agentRequest, (chunk) => {
                    lastResponse = chunk;
                    output = this.mergeOutput(output, chunk.text);

                    const threadId = chunk.extra?.['threadId'];
                    if (typeof threadId === 'string' && threadId.length > 0) {
                        this.patchSession(session.id, { threadId });
                    }
                });
            } else {
                lastResponse = await provider.run(agentRequest);
                output = lastResponse.text ?? '';
                const threadId = lastResponse.extra?.['threadId'];
                if (typeof threadId === 'string' && threadId.length > 0) {
                    this.patchSession(session.id, { threadId });
                }
            }

            this.patchSession(session.id, {
                status: AgentExecutionSessionStatus.Completed,
                completedAt: Date.now(),
                output,
            });

            return {
                session: this.getSession(session.id) ?? session,
                output,
                lastResponse,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.patchSession(session.id, {
                status: AgentExecutionSessionStatus.Failed,
                completedAt: Date.now(),
                output,
                error: message,
            });
            throw error;
        }
    }

    sessionForNode(nodeId: string): AgentExecutionSession | undefined {
        return [...this.sessions()].reverse().find((session) => session.nodeId === nodeId);
    }

    private async requireActiveAgentConfig(): Promise<AgentConfig> {
        const config = await this.settingService.getActiveAgentConfig();
        if (!config) {
            throw new Error('No active agent configuration is available.');
        }
        return config;
    }

    private getSession(id: string): AgentExecutionSession | undefined {
        return this.sessions().find((session) => session.id === id);
    }

    private upsertSession(session: AgentExecutionSession): void {
        this.sessions.update((sessions) => {
            const index = sessions.findIndex((item) => item.id === session.id);
            if (index < 0) {
                return [...sessions, session];
            }
            return sessions.map((item) => item.id === session.id ? session : item);
        });
    }

    private patchSession(id: string, patch: Partial<AgentExecutionSession>): void {
        this.sessions.update((sessions) => sessions.map((session) =>
            session.id === id ? { ...session, ...patch } : session
        ));
    }

    private mergeOutput(current: string, next: string | undefined): string {
        const text = next?.trim();
        if (!text) {
            return current;
        }
        if (!current) {
            return text;
        }
        if (current === text || current.endsWith(`\n\n${text}`)) {
            return current;
        }
        return `${current}\n\n${text}`;
    }
}
