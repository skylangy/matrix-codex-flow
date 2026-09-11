import { AgentConfig, AgentResponse } from './agent.provider';
import { AgentRole } from './task.graph';

export const AgentExecutionSessionStatus = {
    Pending: 'pending',
    Running: 'running',
    Completed: 'completed',
    Failed: 'failed',
} as const;

export type AgentExecutionSessionStatus =
    typeof AgentExecutionSessionStatus[keyof typeof AgentExecutionSessionStatus];

export interface AgentExecutionSession {
    id: string;
    nodeId: string;
    role: AgentRole;
    provider: string;
    model: string;
    threadId?: string;
    workingDirectory?: string;
    worktreeId?: string;
    status: AgentExecutionSessionStatus;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
    output?: string;
    error?: string;
}

export interface AgentExecutionRequest {
    nodeId: string;
    role: AgentRole;
    prompt: string;
    agentConfig?: AgentConfig;
    workingDirectory?: string;
    threadId?: string | null;
    worktreeId?: string;
}

export interface AgentExecutionResult {
    session: AgentExecutionSession;
    output: string;
    lastResponse?: AgentResponse;
}
