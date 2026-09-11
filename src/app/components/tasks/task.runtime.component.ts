import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { TaskExecutionEvent } from '../../models/task.execution';
import { EMPTY_RUNTIME_TASK, RuntimeTaskViewModel, StepViewModel, TaskStatus, TaskStepType } from '../../models/task';
import { TaskExecuteService } from '../../services/task.execuer.service';
import { IconComponent } from '../icon/icon.component';

interface TaskTimelineItem {
    id: string;
    mainStepIndex: number;
    kind: TaskStepType;
    step: StepViewModel;
}

@Component({
    selector: 'mtx-task-runtime',
    templateUrl: 'task.runtime.component.html',
    styles: [`
        @keyframes runtime-step-running {
            0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.35); }
            70% { box-shadow: 0 0 0 8px rgba(245, 158, 11, 0); }
            100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
        }

        .runtime-step-running {
            animation: runtime-step-running 1.1s ease-out infinite;
        }

        :host {
            display: flex;
            flex: 1 1 0%;
            min-height: 0;
            flex-direction: column;
        }
    `],
    imports: [CommonModule, IconComponent]
})
export class TaskRuntimeComponent implements OnDestroy, OnInit {
    private readonly taskRuntimeService = inject(TaskExecuteService);
    private readonly runningTaskSubscription = this.taskRuntimeService.onRunTask.subscribe(data => {
        this.runtimeTask.set(data.runtimeTask);
    });

    readonly runtimeTask = signal<RuntimeTaskViewModel>(EMPTY_RUNTIME_TASK);
    readonly executionSummary = computed(() => this.taskRuntimeService.executionSummary());
    readonly executionEvents = computed(() => this.taskRuntimeService.executionEvents());
    readonly graphNodes = computed(() => this.taskRuntimeService.currentGraph()?.nodes ?? []);
    readonly recentExecutionEvents = computed(() => this.executionEvents().slice(-8).reverse());

    readonly timeline = computed(() => {
        const selectedTask = this.runtimeTask();
        if (!selectedTask?.id || selectedTask.steps.length === 0) {
            return [] as TaskTimelineItem[];
        }

        const timelineItems: TaskTimelineItem[] = [];
        selectedTask.steps.forEach((stepGroup, mainStepIndex) => {
            for (const step of stepGroup.steps) {
                timelineItems.push({
                    id: step.runtimeId,
                    mainStepIndex,
                    kind: step.type,
                    step,
                });
            }
        });

        return timelineItems;
    });

    completedPercent(): number {
        const summary = this.executionSummary();
        if (!summary || summary.totalNodes === 0) {
            return 0;
        }
        return Math.round((summary.completedNodes / summary.totalNodes) * 100);
    }

    elapsedLabel(): string {
        const summary = this.executionSummary();
        if (!summary) {
            return '0s';
        }
        const end = summary.completedAt ?? Date.now();
        const seconds = Math.max(0, Math.round((end - summary.startedAt) / 1000));
        if (seconds < 60) {
            return `${seconds}s`;
        }
        const minutes = Math.floor(seconds / 60);
        return `${minutes}m ${seconds % 60}s`;
    }

    eventLabel(event: TaskExecutionEvent): string {
        return event.type.replaceAll('_', ' ');
    }

    eventDuration(event: TaskExecutionEvent): string {
        if (event.durationMs === undefined) {
            return '';
        }
        if (event.durationMs < 1000) {
            return `${event.durationMs}ms`;
        }
        return `${(event.durationMs / 1000).toFixed(1)}s`;
    }

    timelineTitle(item: TaskTimelineItem): string {
        const phase = item.kind === 'pre' ? 'Pre Step' : item.kind === 'post' ? 'Post Step' : 'Main Step';
        return `${phase} - Cycle ${item.mainStepIndex + 1}`;
    }

    timelineIcon(item: TaskTimelineItem): string {
        if (item.kind === 'pre') {
            return 'arrow-90deg-down text-xs text-amber-300';
        }
        if (item.kind === 'post') {
            return 'arrow-return-right text-xs text-emerald-300';
        }
        return 'arrow-right text-sm text-sky-300';
    }

    timelineColor(item: TaskTimelineItem): string {
        if (item.step.status === TaskStatus.Completed) {
            return 'border-emerald-500/30';
        }
        if (item.step.status === TaskStatus.Failed) {
            return 'border-rose-500/30';
        }
        if (item.step.status === TaskStatus.InProgress) {
            return 'border-amber-500/30';
        }
        return 'border-slate-700/50';
    }

    timelineStatusBackground(item: TaskTimelineItem): string {
        if (item.step.status === TaskStatus.Completed) {
            return 'bg-emerald-900/30';
        }
        if (item.step.status === TaskStatus.Failed) {
            return 'bg-rose-900/30';
        }
        if (item.step.status === TaskStatus.InProgress) {
            return 'bg-amber-900/30';
        }
        return 'bg-slate-800/60';
    }

    isTimelineItemRunning(item: TaskTimelineItem): boolean {
        return item.step.runtimeStatus() === TaskStatus.InProgress;
    }

    timelineCardClass(item: TaskTimelineItem, itemIndex: number): string {
        if (item.kind === 'pre') {
            const isFirstPre = this.isFirstPreStep(item, itemIndex);
            let classes = 'relative ml-8 rounded-none border border-b-0 p-4';
            if (isFirstPre) {
                classes += ' rounded-t-lg';
            }
            return classes;
        }

        if (item.kind === 'post') {
            const isFirstPost = this.isFirstPostStep(item, itemIndex);
            const isLastPost = this.isLastPostStep(item, itemIndex);
            let classes = 'relative ml-8 rounded-none border p-4';
            if (isFirstPost) {
                classes += ' border-t-0';
            }
            if (isLastPost) {
                classes += ' rounded-b-lg';
            }
            return classes;
        }

        const hasPreSteps = this.hasPreStepsForMain(item, itemIndex);
        const hasPostSteps = this.hasPostStepsForMain(item, itemIndex);
        let classes = 'relative rounded-xl border p-4';
        if (hasPreSteps) {
            classes += ' rounded-tr-none';
        }
        if (hasPostSteps) {
            classes += ' rounded-br-none';
        }
        return classes;
    }

    shouldShowCycleSeparator(current: TaskTimelineItem, next?: TaskTimelineItem): boolean {
        if (!next) {
            return false;
        }
        return current.kind === 'post' && next.kind === 'pre' && current.mainStepIndex !== next.mainStepIndex;
    }

    private isFirstPostStep(item: TaskTimelineItem, itemIndex: number): boolean {
        if (item.kind !== 'post') {
            return false;
        }
        const previous = this.timeline()[itemIndex - 1];
        return !previous || previous.kind !== 'post' || previous.mainStepIndex !== item.mainStepIndex;
    }

    private isFirstPreStep(item: TaskTimelineItem, itemIndex: number): boolean {
        if (item.kind !== 'pre') {
            return false;
        }
        const previous = this.timeline()[itemIndex - 1];
        return !previous || previous.kind !== 'pre' || previous.mainStepIndex !== item.mainStepIndex;
    }

    private isLastPostStep(item: TaskTimelineItem, itemIndex: number): boolean {
        if (item.kind !== 'post') {
            return false;
        }
        const next = this.timeline()[itemIndex + 1];
        return !next || next.kind !== 'post' || next.mainStepIndex !== item.mainStepIndex;
    }

    private hasPreStepsForMain(item: TaskTimelineItem, itemIndex: number): boolean {
        if (item.kind !== 'normal') {
            return false;
        }
        const previous = this.timeline()[itemIndex - 1];
        return !!previous && previous.kind === 'pre' && previous.mainStepIndex === item.mainStepIndex;
    }

    private hasPostStepsForMain(item: TaskTimelineItem, itemIndex: number): boolean {
        if (item.kind !== 'normal') {
            return false;
        }
        const next = this.timeline()[itemIndex + 1];
        return !!next && next.kind === 'post' && next.mainStepIndex === item.mainStepIndex;
    }

    ngOnInit() {
        const task = this.taskRuntimeService.runtimeTask();
        if (task) {
            this.runtimeTask.set(task);
        }
    }

    ngOnDestroy() {
        this.runningTaskSubscription.unsubscribe();
    }
}
