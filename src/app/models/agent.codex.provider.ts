import { signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
    AgentCapabilities,
    AgentConfig,
    AgentProvider,
    AgentRequest,
    AgentResponse,
    EMPTY_AGENT_RESULT,
} from './agent.provider';
import { AgentProviderNames } from './agents';
import { ChatResponsePayload } from './chat.message';

export class CodexCliProvider implements AgentProvider {
    readonly id = AgentProviderNames.ID_CODEX_CLI;
    readonly name = AgentProviderNames.CODEX_CLI;
    readonly capabilities: AgentCapabilities = {
        supportsStreaming: true,
        supportsJsonMode: true,
        supportsTools: true,
    };
    isStreaming = signal(false);

    constructor(private config: AgentConfig) { }

    get model() {
        return this.config.model;
    }

    async run(request: AgentRequest): Promise<AgentResponse> {
        let response = EMPTY_AGENT_RESULT;

        await this.runStream(request, (chunk) => {
            response = {
                ...response,
                text: (response as any).text ? (response as any).text + chunk.text : chunk.text,
                raw: chunk.raw,
            };
        });
        return response as AgentResponse;
    }

    async runStream(request: AgentRequest, onChunk: (chunk: AgentResponse) => void): Promise<void> {
        return new Promise(async (resolve, reject) => {
            const unlistenItem = await listen('codex:message', (e) => {
                const payload = e.payload as ChatResponsePayload;
                console.log('Received codex:message:', payload);
                if (payload.type === 'message') {
                    onChunk({ text: payload.data.content, raw: payload, durationMs: 0 });
                }
            });

            const unlistenThreadStarted = await listen('codex:thread-started', (e) => {
                const payload = e.payload as ChatResponsePayload;
                console.log('Received codex:thread-started:', payload);
                if (payload.type === 'threadStarted') {
                    onChunk({
                        text: '',
                        raw: payload,
                        durationMs: 0,
                        extra: { threadId: payload.data.threadId }
                    });
                }
            });

            const unlistenAll = () => {
                unlistenItem();
                unlistenThreadStarted();
                unlistenDone();
            };

            const unlistenDone = await listen('codex:done', (e) => {
                const payload = e.payload as ChatResponsePayload;
                console.log('Received codex:done:', payload);
                if (payload.type === 'error') {
                    unlistenAll();
                    reject(new Error(payload.data.message));
                    return;
                }
                unlistenAll();
                resolve();
            });

            try {
                this.isStreaming.set(true);
                let payload = {
                    content: request.prompt,
                    model: this.config.model,
                    threadId: request.threadId,
                    workingDirectory: request.workingDirectory,
                };
                console.log('Invoking chat command with payload:', payload);
                await invoke('chat', { payload });
            } catch (err) {
                unlistenAll();
                reject(err);
            } finally {
                this.isStreaming.set(false);
            }
        });
    }

    private async runProcess(cmd: string, args: string[]): Promise<AgentResponse> {
        return EMPTY_AGENT_RESULT;
    }
}
