import { computed, inject, Injectable } from '@angular/core';

import { AgentConfig, AgentProvider, AgentResponse } from '../models/agent.provider';
import { AgentProviderRegistry } from '../models/agents';
import { ChatMessage, ChatRole } from '../models/chat.message';
import { MessageStoreService } from './message.store.service';
import { ProjectService } from './project.service';
import { SettingService } from './setting.service';

const USER_ROLE: ChatRole = 'user';
const AGENT_ROLE: ChatRole = 'agent';
const IDENTIFIER_RANDOM_RADIX = 36;
const IDENTIFIER_START_INDEX = 2;
const IDENTIFIER_END_INDEX = 10;
const TIMEOUT_MS = 60000;


@Injectable({
    providedIn: 'root'
})
export class ChatService {
    private readonly settingService = inject(SettingService);
    private readonly projectService = inject(ProjectService);
    private readonly messageStoreService = inject(MessageStoreService);

    currentThread = computed(() => this.messageStoreService.currentThread());

    async chat(content: string, agentConfig?: AgentConfig,
        messageSentHandler?: (message: ChatMessage) => void,
        chunkHandler?: (chunk: AgentResponse, agentConfig: AgentConfig) => void
    ): Promise<void> {
        const prompt = content.trim();
        if (!prompt) {
            return;
        }
        const threadReady = await this.messageStoreService.startThreadIfEmpty();
        if (!threadReady) {
            return;
        }

        if (agentConfig === undefined) {
            agentConfig = await this.settingService.getActiveAgentConfig();
        }

        let responseMessage: ChatMessage | undefined;
        let pendingMessageSave = Promise.resolve();
        const responseHandler = chunkHandler ?? ((chunk: AgentResponse, config: AgentConfig) => {
            const nextMessage = this.mergeAgentResponse(responseMessage, chunk, config);
            if (!nextMessage || nextMessage === responseMessage) {
                return;
            }

            responseMessage = nextMessage;
            pendingMessageSave = pendingMessageSave.then(() => this.messageStoreService.upsert(nextMessage));
        });

        await this.agentStreaming(prompt, agentConfig, messageSentHandler, responseHandler);
        await pendingMessageSave;
    }

    async ask(question: string, agentConfig?: AgentConfig): Promise<string> {
        const prompt = question.trim();
        if (!prompt) {
            return '';
        }
        const threadReady = await this.messageStoreService.startThreadIfEmpty();
        if (!threadReady) {
            return '';
        }

        if (agentConfig === undefined) {
            agentConfig = await this.settingService.getActiveAgentConfig();
        }

        let answer: string[] = [];
        await this.agentStreaming(prompt, agentConfig,
            (message) => { },
            (chunk, agentConfig) => {
                answer.push(chunk.text || '');
            });

        return answer.join('');
    }

    async optimizePrompt(rawPrompt: string): Promise<string> {
        const prompt = `
        Rewrite the following prompt to be clearer, more precise, and better structured for an AI model:

        """${rawPrompt}"""

        Return only the improved prompt, keep it concise, clarify intent, constraints, and expected output.
        `;

        let optimized = await this.ask(prompt);
        return optimized;
    }

    private async agentWait(text: string, agentConfig: AgentConfig): Promise<void> {
        const provider = this.resolveAgent(agentConfig);

        const request = {
            prompt: text,
            model: agentConfig.model,
            timeoutMs: TIMEOUT_MS,
        }
        let response = await provider.run(request);

        this.messageStoreService.add(this.toMessage(response.text, agentConfig.agentType, agentConfig.model, AGENT_ROLE));
    }

    private mergeAgentResponse(current: ChatMessage | undefined, chunk: AgentResponse, agentConfig: AgentConfig): ChatMessage | undefined {
        const text = chunk.text;
        if (!text?.trim()) {
            return current;
        }

        if (!current) {
            return this.toMessage(text, agentConfig.agentType, agentConfig.model, AGENT_ROLE);
        }

        if (current.content === text || current.content.endsWith(`\n\n${text}`)) {
            return current;
        }

        return {
            ...current,
            content: `${current.content}\n\n${text}`
        };
    }

    private async agentStreaming(text: string,
        agentConfig: AgentConfig,
        messageSentHandler?: (message: ChatMessage) => void,
        chunkHandler?: (chunk: AgentResponse, agentConfig: AgentConfig) => void
    ): Promise<void> {
        const message = this.toMessage(text, agentConfig.agentType, agentConfig.model);
        await this.messageStoreService.add(message);
        if (messageSentHandler) {
            messageSentHandler(message);
        }

        const provider = this.resolveAgent(agentConfig);
        const request = {
            prompt: text,
            model: agentConfig.model,
            timeoutMs: TIMEOUT_MS,
            stream: true,
            workingDirectory: this.projectService.currentProject()?.path || undefined,
            threadId: this.currentThread().agentThreadId ?? null,
            sandboxMode: agentConfig.sandboxMode ?? 'workspace-write',
            networkAccessEnabled: agentConfig.networkAccessEnabled ?? false,
        }

        let pendingThreadSave = Promise.resolve();
        const onChunk = (chunk: AgentResponse) => {
            const agentThreadId = chunk.extra?.['threadId'];
            if (typeof agentThreadId === 'string') {
                pendingThreadSave = pendingThreadSave.then(() => this.messageStoreService.setAgentThreadId(agentThreadId));
            }
            chunkHandler?.(chunk, agentConfig);
        };

        this.messageStoreService.isStreaming.set(true);
        try {
            await provider.runStream?.(request, onChunk);
            await pendingThreadSave;
        } finally {
            this.messageStoreService.isStreaming.set(false);
        }
    }

    private resolveAgent(agentConfig: AgentConfig): AgentProvider {
        return AgentProviderRegistry.create(agentConfig);
    }

    private toMessage(content: string, agent: string,
        model: string,
        role: ChatRole = USER_ROLE): ChatMessage {
        return {
            id: this.createIdentifier(),
            threadId: this.currentThread().id,
            role,
            content,
            agent,
            model,
            createdAt: Date.now()
        };
    }

    private createIdentifier(): string {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }

        return `${Date.now()}-${Math.random().toString(IDENTIFIER_RANDOM_RADIX).slice(IDENTIFIER_START_INDEX, IDENTIFIER_END_INDEX)}`;
    }
}
