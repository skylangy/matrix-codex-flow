import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import {
    ExecutionEventType,
    TaskExecutionEvent,
    TaskExecutionSummary,
} from '../models/task.execution';
import {
    describeAgentRole,
    TaskGraph,
    TaskGraphBuilder,
    TaskGraphNode,
    TaskNodeStatus,
} from '../models/task.graph';
import {
    RuntimeTaskViewModel,
    StepViewModel,
    TaskRuntimeData,
    TaskStatus,
    TaskViewModel,
} from '../models/task';
import { IdGenerator } from '../models/id';
import { ChatService } from './chat.service';
import { ProjectService } from './project.service';

@Injectable({ providedIn: 'root' })
export class TaskExecuteService {
    private readonly projectService = inject(ProjectService);
    private readonly router = inject(Router);
    private readonly chatService = inject(ChatService);

    private readonly runTaskSubject = new Subject<TaskRuntimeData>();
    private readonly executionEventSubject = new Subject<TaskExecutionEvent>();
    readonly onRunTask = this.runTaskSubject.asObservable();
    readonly onExecutionEvent = this.executionEventSubject.asObservable();
    readonly currentTask = signal<TaskViewModel | null>(null);
    readonly runtimeTask = signal<RuntimeTaskViewModel | null>(null);
    readonly currentGraph = signal<TaskGraph | null>(null);
    readonly executionEvents = signal<TaskExecutionEvent[]>([]);
    readonly executionSummary = signal<TaskExecutionSummary | null>(null);

    /**
     * Executes the legacy task model through a DAG scheduler.
     * Concurrency intentionally remains 1 until worktree/session isolation lands.
     */
    async execute(task: TaskViewModel): Promise<void> {
        if (!task?.id) {
            return;
        }

        const runtimeTask = await this.prepareExecute(task);
        const graph = TaskGraphBuilder.fromLegacyTask(task);
        const validationErrors = TaskGraphBuilder.validate(graph);
        if (validationErrors.length > 0) {
            this.updateTaskStatus(task, TaskStatus.Failed);
            throw new Error(validationErrors.join('\n'));
        }

        this.currentGraph.set(graph);
        this.executionEvents.set([]);
        this.refreshSummary(graph, Date.now());
        this.emitExecutionEvent(graph, ExecutionEventType.GraphStarted, undefined, 'Task graph started.');

        try {
            await this.executeGraph(graph, runtimeTask);
            this.updateTaskStatus(task, TaskStatus.Completed);
            this.emitExecutionEvent(graph, ExecutionEventType.GraphCompleted, undefined, 'Task graph completed.');
        } catch (error) {
            this.updateTaskStatus(task, TaskStatus.Failed);
            this.emitExecutionEvent(
                graph,
                ExecutionEventType.GraphFailed,
                undefined,
                error instanceof Error ? error.message : String(error)
            );
            throw error;
        } finally {
            this.refreshSummary(graph, this.executionSummary()?.startedAt ?? Date.now(), Date.now());
            this.syncTaskToProject(task);
            this.runTaskSubject.next({
                runtimeTask,
                status: runtimeTask.task.status || TaskStatus.Pending,
            });
            await this.saveCurrentProject();
        }
    }

    private async prepareExecute(task: TaskViewModel): Promise<RuntimeTaskViewModel> {
        this.router.navigate(['/app/workspace/chat']);
        await this.delay(1000);

        const runtimeTask = new RuntimeTaskViewModel(task);
        this.runtimeTask.set(runtimeTask);
        this.currentTask.set(task);

        this.updateTaskStatus(task, TaskStatus.InProgress);
        this.resetStepStatuses(runtimeTask);

        this.runTaskSubject.next({
            runtimeTask,
            status: TaskStatus.InProgress,
        });
        return runtimeTask;
    }

    private async executeGraph(graph: TaskGraph, runtimeTask: RuntimeTaskViewModel): Promise<void> {
        while (true) {
            const remaining = graph.nodes.filter((node) =>
                node.status === TaskNodeStatus.Pending || node.status === TaskNodeStatus.Ready
            );

            if (remaining.length === 0) {
                break;
            }

            const ready = TaskGraphBuilder.readyNodes(graph);
            if (ready.length === 0) {
                throw new Error('Task graph stalled: no executable nodes remain.');
            }

            for (const node of ready) {
                node.status = TaskNodeStatus.Ready;
                this.emitExecutionEvent(graph, ExecutionEventType.NodeReady, node);
                try {
                    await this.executeNode(graph, node, runtimeTask);
                } catch (error) {
                    node.status = TaskNodeStatus.Failed;
                    TaskGraphBuilder.blockDependants(graph, node.id);
                    this.refreshSummary(graph, this.executionSummary()?.startedAt ?? Date.now());
                    throw error;
                }
            }
        }

        const failed = graph.nodes.find((node) =>
            node.status === TaskNodeStatus.Failed || node.status === TaskNodeStatus.Blocked
        );
        if (failed) {
            throw new Error(`Task graph did not complete successfully. Node: ${failed.step.title}`);
        }
    }

    private async executeNode(
        graph: TaskGraph,
        node: TaskGraphNode,
        runtimeTask: RuntimeTaskViewModel
    ): Promise<void> {
        node.status = TaskNodeStatus.Running;
        node.attempt += 1;
        const startedAt = Date.now();
        this.emitExecutionEvent(graph, ExecutionEventType.NodeStarted, node);
        this.refreshSummary(graph, this.executionSummary()?.startedAt ?? startedAt);

        const runtimeStep = this.findRuntimeStep(runtimeTask, node.step.id, node.step.title);
        if (runtimeStep) {
            this.updateStepStatus(runtimeStep, TaskStatus.InProgress);
        }

        const prompt = this.buildRolePrompt(node);

        try {
            await this.chatService.chat(prompt);
            node.status = TaskNodeStatus.Completed;
            if (runtimeStep) {
                this.updateStepStatus(runtimeStep, TaskStatus.Completed);
            }
            this.emitExecutionEvent(
                graph,
                ExecutionEventType.NodeCompleted,
                node,
                undefined,
                Date.now() - startedAt
            );
        } catch (error) {
            node.status = TaskNodeStatus.Failed;
            if (runtimeStep) {
                this.updateStepStatus(runtimeStep, TaskStatus.Failed);
            }
            this.emitExecutionEvent(
                graph,
                ExecutionEventType.NodeFailed,
                node,
                error instanceof Error ? error.message : String(error),
                Date.now() - startedAt
            );
            throw error;
        } finally {
            this.refreshSummary(graph, this.executionSummary()?.startedAt ?? startedAt);
        }
    }

    private buildRolePrompt(node: TaskGraphNode): string {
        return [
            `[Matrix Agent Role: ${node.role}]`,
            describeAgentRole(node.role),
            '',
            `Task: ${node.step.title}`,
            node.step.content,
            '',
            'Work only on this assigned node. Respect the existing project context and avoid unrelated changes.',
        ].join('\n');
    }

    private emitExecutionEvent(
        graph: TaskGraph,
        type: TaskExecutionEvent['type'],
        node?: TaskGraphNode,
        message?: string,
        durationMs?: number
    ): void {
        const event: TaskExecutionEvent = {
            id: IdGenerator.generateId(),
            graphId: graph.id,
            taskId: graph.taskId,
            nodeId: node?.id,
            stepTitle: node?.step.title,
            role: node?.role,
            nodeStatus: node?.status,
            type,
            timestamp: Date.now(),
            durationMs,
            attempt: node?.attempt,
            message,
        };

        this.executionEvents.update((events) => [...events, event]);
        this.executionEventSubject.next(event);
    }

    private refreshSummary(graph: TaskGraph, startedAt: number, completedAt?: number): void {
        this.executionSummary.set({
            graphId: graph.id,
            taskId: graph.taskId,
            startedAt,
            completedAt,
            totalNodes: graph.nodes.length,
            completedNodes: graph.nodes.filter((node) => node.status === TaskNodeStatus.Completed).length,
            failedNodes: graph.nodes.filter((node) => node.status === TaskNodeStatus.Failed).length,
            blockedNodes: graph.nodes.filter((node) => node.status === TaskNodeStatus.Blocked).length,
            runningNodes: graph.nodes.filter((node) => node.status === TaskNodeStatus.Running).length,
        });
    }

    private findRuntimeStep(
        runtimeTask: RuntimeTaskViewModel,
        sourceStepId: string,
        title: string
    ): StepViewModel | undefined {
        const allSteps = runtimeTask.steps.flatMap((group) => group.steps);
        return allSteps.find((step) => step.id === sourceStepId && step.title === title)
            ?? allSteps.find((step) => step.title === title && step.runtimeStatus() === TaskStatus.Pending);
    }

    private resetStepStatuses(task: RuntimeTaskViewModel): void {
        for (const stepGroup of task.steps) {
            for (const step of stepGroup.steps) {
                this.updateStepStatus(step, TaskStatus.Pending);
            }
        }
    }

    private updateTaskStatus(task: TaskViewModel, status: TaskStatus): void {
        task.status = status;
        task.updatedAt = Date.now();
    }

    private updateStepStatus(step: StepViewModel, status: TaskStatus): void {
        step.status = status;
        step.runtimeStatus.set(status);
        step.updatedAt = Date.now();
    }

    private syncTaskToProject(task: TaskViewModel): void {
        this.projectService.currentProject.update((project) => {
            if (!project) {
                return project;
            }

            return {
                ...project,
                tasks: project.tasks.map((existingTask) =>
                    existingTask.id === task.id
                        ? {
                            ...task,
                            presteps: task.presteps.map((step) => ({ ...step })),
                            steps: task.steps.map((step) => ({ ...step })),
                            poststeps: task.poststeps.map((step) => ({ ...step })),
                        }
                        : existingTask
                ),
                updatedAt: Date.now(),
            };
        });
    }

    private async saveCurrentProject(): Promise<void> {
        await this.projectService.saveProject();
    }

    private async delay(ms: number = 1000): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
