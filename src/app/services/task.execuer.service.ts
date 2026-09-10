import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import {
    AgentRole,
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
import { ChatService } from './chat.service';
import { ProjectService } from './project.service';

@Injectable({ providedIn: 'root' })
export class TaskExecuteService {
    private readonly projectService = inject(ProjectService);
    private readonly router = inject(Router);
    private readonly chatService = inject(ChatService);

    private readonly runTaskSubject = new Subject<TaskRuntimeData>();
    readonly onRunTask = this.runTaskSubject.asObservable();
    readonly currentTask = signal<TaskViewModel | null>(null);
    readonly runtimeTask = signal<RuntimeTaskViewModel | null>(null);
    readonly currentGraph = signal<TaskGraph | null>(null);

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

        try {
            await this.executeGraph(graph, runtimeTask);
            this.updateTaskStatus(task, TaskStatus.Completed);
        } catch (error) {
            this.updateTaskStatus(task, TaskStatus.Failed);
            throw error;
        } finally {
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

            // Sequential for now. When git worktree + independent agent sessions are available,
            // this batch can become Promise.all(ready.map(...)).
            for (const node of ready) {
                node.status = TaskNodeStatus.Ready;
                try {
                    await this.executeNode(node, runtimeTask);
                } catch (error) {
                    node.status = TaskNodeStatus.Failed;
                    TaskGraphBuilder.blockDependants(graph, node.id);
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

    private async executeNode(node: TaskGraphNode, runtimeTask: RuntimeTaskViewModel): Promise<void> {
        node.status = TaskNodeStatus.Running;
        node.attempt += 1;

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
        } catch (error) {
            if (runtimeStep) {
                this.updateStepStatus(runtimeStep, TaskStatus.Failed);
            }
            throw error;
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

    private findRuntimeStep(
        runtimeTask: RuntimeTaskViewModel,
        sourceStepId: string,
        title: string
    ): StepViewModel | undefined {
        // Legacy pre/post steps are cloned per main step, so title is a fallback when IDs differ.
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
