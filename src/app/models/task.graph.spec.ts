import { AgentRole, TaskGraph, TaskGraphBuilder, TaskNodeStatus } from './task.graph';
import { TaskStep, TaskViewModel } from './task';

function step(id: string, title: string, content: string, type: TaskStep['type'] = 'normal'): TaskStep {
    return {
        id,
        title,
        content,
        status: 'pending',
        createdAt: 1,
        updatedAt: 1,
        type,
    };
}

describe('TaskGraphBuilder', () => {
    it('converts legacy pre/main/post steps into ordered dependencies', () => {
        const task = new TaskViewModel();
        task.id = 'task-1';
        task.presteps = [step('pre-1', 'Inspect repository', 'inspect', 'pre')];
        task.steps = [step('main-1', 'Implement feature', 'implement')];
        task.poststeps = [step('post-1', 'Run tests', 'npm test', 'post')];

        const graph = TaskGraphBuilder.fromLegacyTask(task);

        expect(graph.nodes.length).toBe(3);
        expect(graph.nodes[0].role).toBe(AgentRole.Explorer);
        expect(graph.nodes[1].role).toBe(AgentRole.Worker);
        expect(graph.nodes[2].role).toBe(AgentRole.Verifier);
        expect(graph.nodes[1].dependsOn).toEqual([graph.nodes[0].id]);
        expect(graph.nodes[2].dependsOn).toEqual([graph.nodes[1].id]);
    });

    it('returns only nodes whose dependencies are complete', () => {
        const graph: TaskGraph = {
            id: 'graph-1',
            taskId: 'task-1',
            createdAt: 1,
            nodes: [
                {
                    id: 'a',
                    step: step('s-a', 'A', 'A'),
                    role: AgentRole.Worker,
                    dependsOn: [],
                    status: TaskNodeStatus.Completed,
                    attempt: 1,
                    maxAttempts: 1,
                },
                {
                    id: 'b',
                    step: step('s-b', 'B', 'B'),
                    role: AgentRole.Worker,
                    dependsOn: ['a'],
                    status: TaskNodeStatus.Pending,
                    attempt: 0,
                    maxAttempts: 1,
                },
                {
                    id: 'c',
                    step: step('s-c', 'C', 'C'),
                    role: AgentRole.Worker,
                    dependsOn: ['b'],
                    status: TaskNodeStatus.Pending,
                    attempt: 0,
                    maxAttempts: 1,
                },
            ],
        };

        expect(TaskGraphBuilder.readyNodes(graph).map((node) => node.id)).toEqual(['b']);
    });

    it('detects cycles', () => {
        const graph: TaskGraph = {
            id: 'graph-cycle',
            taskId: 'task-1',
            createdAt: 1,
            nodes: [
                {
                    id: 'a',
                    step: step('s-a', 'A', 'A'),
                    role: AgentRole.Worker,
                    dependsOn: ['b'],
                    status: TaskNodeStatus.Pending,
                    attempt: 0,
                    maxAttempts: 1,
                },
                {
                    id: 'b',
                    step: step('s-b', 'B', 'B'),
                    role: AgentRole.Worker,
                    dependsOn: ['a'],
                    status: TaskNodeStatus.Pending,
                    attempt: 0,
                    maxAttempts: 1,
                },
            ],
        };

        expect(TaskGraphBuilder.validate(graph)).toContain('Task graph contains a dependency cycle.');
    });

    it('blocks downstream nodes when a dependency fails', () => {
        const graph: TaskGraph = {
            id: 'graph-failure',
            taskId: 'task-1',
            createdAt: 1,
            nodes: [
                {
                    id: 'a',
                    step: step('s-a', 'A', 'A'),
                    role: AgentRole.Worker,
                    dependsOn: [],
                    status: TaskNodeStatus.Failed,
                    attempt: 1,
                    maxAttempts: 1,
                },
                {
                    id: 'b',
                    step: step('s-b', 'B', 'B'),
                    role: AgentRole.Reviewer,
                    dependsOn: ['a'],
                    status: TaskNodeStatus.Pending,
                    attempt: 0,
                    maxAttempts: 1,
                },
                {
                    id: 'c',
                    step: step('s-c', 'C', 'C'),
                    role: AgentRole.Verifier,
                    dependsOn: ['b'],
                    status: TaskNodeStatus.Pending,
                    attempt: 0,
                    maxAttempts: 1,
                },
            ],
        };

        TaskGraphBuilder.blockDependants(graph, 'a');

        expect(graph.nodes[1].status).toBe(TaskNodeStatus.Blocked);
        expect(graph.nodes[2].status).toBe(TaskNodeStatus.Blocked);
    });
});
