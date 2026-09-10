import { AgentRole, TaskNodeStatus } from './task.graph';

export const ExecutionEventType = {
    GraphStarted: 'graph_started',
    NodeReady: 'node_ready',
    NodeStarted: 'node_started',
    NodeCompleted: 'node_completed',
    NodeFailed: 'node_failed',
    GraphCompleted: 'graph_completed',
    GraphFailed: 'graph_failed',
} as const;

export type ExecutionEventType = typeof ExecutionEventType[keyof typeof ExecutionEventType];

export interface TaskExecutionEvent {
    id: string;
    graphId: string;
    taskId: string;
    nodeId?: string;
    stepTitle?: string;
    role?: AgentRole;
    nodeStatus?: TaskNodeStatus;
    type: ExecutionEventType;
    timestamp: number;
    durationMs?: number;
    attempt?: number;
    message?: string;
}

export interface TaskExecutionSummary {
    graphId: string;
    taskId: string;
    startedAt: number;
    completedAt?: number;
    totalNodes: number;
    completedNodes: number;
    failedNodes: number;
    blockedNodes: number;
    runningNodes: number;
}
