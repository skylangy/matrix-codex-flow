import { IdGenerator } from './id';
import { TaskStep, TaskStepExtensions, TaskViewModel } from './task';

export const AgentRole = {
    Planner: 'planner',
    Explorer: 'explorer',
    Worker: 'worker',
    Reviewer: 'reviewer',
    Verifier: 'verifier',
    Fixer: 'fixer',
} as const;

export type AgentRole = typeof AgentRole[keyof typeof AgentRole];

export const TaskNodeStatus = {
    Pending: 'pending',
    Ready: 'ready',
    Running: 'running',
    Completed: 'completed',
    Failed: 'failed',
    Blocked: 'blocked',
} as const;

export type TaskNodeStatus = typeof TaskNodeStatus[keyof typeof TaskNodeStatus];

export interface TaskGraphNode {
    id: string;
    step: TaskStep;
    role: AgentRole;
    dependsOn: string[];
    status: TaskNodeStatus;
    attempt: number;
    maxAttempts: number;
    executionSessionId?: string;
    agentThreadId?: string;
    provider?: string;
    model?: string;
}

export interface TaskGraph {
    id: string;
    taskId: string;
    nodes: TaskGraphNode[];
    createdAt: number;
}

/**
 * Converts the legacy pre/main/post task format into a dependency graph.
 * Existing saved tasks continue to work while the UI is migrated to a native DAG editor.
 */
export class TaskGraphBuilder {
    static fromLegacyTask(task: TaskViewModel): TaskGraph {
        const nodes: TaskGraphNode[] = [];
        let previousMainTail: string[] = [];

        for (const mainStep of task.steps) {
            let previousPreId: string | undefined;

            for (const preStep of task.presteps) {
                const node = this.nodeFromStep(
                    TaskStepExtensions.cloneStep(preStep),
                    AgentRole.Explorer,
                    previousPreId ? [previousPreId] : [...previousMainTail]
                );
                nodes.push(node);
                previousPreId = node.id;
            }

            const mainNode = this.nodeFromStep(
                TaskStepExtensions.cloneStep(mainStep),
                AgentRole.Worker,
                previousPreId ? [previousPreId] : [...previousMainTail]
            );
            nodes.push(mainNode);

            let tailId = mainNode.id;
            for (const postStep of task.poststeps) {
                const node = this.nodeFromStep(
                    TaskStepExtensions.cloneStep(postStep),
                    this.roleForPostStep(postStep),
                    [tailId]
                );
                nodes.push(node);
                tailId = node.id;
            }

            previousMainTail = [tailId];
        }

        return {
            id: IdGenerator.generateId(),
            taskId: task.id,
            nodes,
            createdAt: Date.now(),
        };
    }

    static validate(graph: TaskGraph): string[] {
        const errors: string[] = [];
        const ids = new Set(graph.nodes.map((node) => node.id));

        for (const node of graph.nodes) {
            for (const dependency of node.dependsOn) {
                if (!ids.has(dependency)) {
                    errors.push(`Node ${node.id} depends on missing node ${dependency}.`);
                }
                if (dependency === node.id) {
                    errors.push(`Node ${node.id} cannot depend on itself.`);
                }
            }
        }

        if (this.hasCycle(graph)) {
            errors.push('Task graph contains a dependency cycle.');
        }

        return errors;
    }

    static readyNodes(graph: TaskGraph): TaskGraphNode[] {
        const completed = new Set(
            graph.nodes
                .filter((node) => node.status === TaskNodeStatus.Completed)
                .map((node) => node.id)
        );

        return graph.nodes.filter((node) =>
            node.status === TaskNodeStatus.Pending &&
            node.dependsOn.every((dependency) => completed.has(dependency))
        );
    }

    static blockDependants(graph: TaskGraph, failedNodeId: string): void {
        const blocked = new Set<string>([failedNodeId]);
        let changed = true;

        while (changed) {
            changed = false;
            for (const node of graph.nodes) {
                if (node.status !== TaskNodeStatus.Pending) {
                    continue;
                }
                if (node.dependsOn.some((dependency) => blocked.has(dependency))) {
                    node.status = TaskNodeStatus.Blocked;
                    blocked.add(node.id);
                    changed = true;
                }
            }
        }
    }

    private static nodeFromStep(step: TaskStep, role: AgentRole, dependsOn: string[]): TaskGraphNode {
        return {
            id: IdGenerator.generateId(),
            step,
            role,
            dependsOn,
            status: TaskNodeStatus.Pending,
            attempt: 0,
            maxAttempts: role === AgentRole.Fixer ? 2 : 1,
        };
    }

    private static roleForPostStep(step: TaskStep): AgentRole {
        const text = `${step.title} ${step.content}`.toLowerCase();
        if (/(test|verify|lint|build|check)/.test(text)) {
            return AgentRole.Verifier;
        }
        if (/(review|audit|security)/.test(text)) {
            return AgentRole.Reviewer;
        }
        return AgentRole.Reviewer;
    }

    private static hasCycle(graph: TaskGraph): boolean {
        const visiting = new Set<string>();
        const visited = new Set<string>();
        const byId = new Map(graph.nodes.map((node) => [node.id, node]));

        const visit = (id: string): boolean => {
            if (visiting.has(id)) {
                return true;
            }
            if (visited.has(id)) {
                return false;
            }

            visiting.add(id);
            const node = byId.get(id);
            if (node) {
                for (const dependency of node.dependsOn) {
                    if (visit(dependency)) {
                        return true;
                    }
                }
            }
            visiting.delete(id);
            visited.add(id);
            return false;
        };

        return graph.nodes.some((node) => visit(node.id));
    }
}

export function describeAgentRole(role: AgentRole): string {
    switch (role) {
        case AgentRole.Planner:
            return 'Plan the work and define dependencies before implementation.';
        case AgentRole.Explorer:
            return 'Inspect the repository and gather only the context needed for downstream work.';
        case AgentRole.Reviewer:
            return 'Review the completed changes for correctness, maintainability, and risk.';
        case AgentRole.Verifier:
            return 'Run or reason about tests, builds, linting, and acceptance criteria.';
        case AgentRole.Fixer:
            return 'Repair a specific failure reported by review or verification.';
        default:
            return 'Implement the assigned change with minimal unrelated edits.';
    }
}
