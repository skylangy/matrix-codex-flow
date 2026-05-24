import { inject, Injectable, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { ChatMessage, ChatThread, EMPYT_THREAD } from '../models/chat.message';
import { IdGenerator } from '../models/id';
import { ProjectService } from './project.service';

@Injectable({ providedIn: 'root' })
export class MessageStoreService {
    private readonly MaxThreadCount = 20;
    private readonly projectService = inject(ProjectService);
    private readonly _messages = signal<ChatMessage[]>([]);
    private readonly _threads = signal<ChatThread[]>([]);

    readonly messages = this._messages.asReadonly();
    readonly threads = this._threads.asReadonly();
    isStreaming = signal(false);

    currentThread = signal<ChatThread>(EMPYT_THREAD);

    constructor() { }

    async add(message: ChatMessage) {
        console.log('[MessageStore] Adding message:', message);
        this._messages.update(list => [...list, message]);

        if (message.threadId?.trim()) {
            await invoke('save_chat_message', { message });
        }

        if (this.currentThread().title === EMPYT_THREAD.title) {
            let title = message.content.length > 30 ? message.content.substring(0, 30).trim() + '...' : message.content.trim();
            const updatedAt = Date.now();
            this.currentThread.update(thread => ({ ...thread, title, updatedAt }));
            await invoke('save_chat_thread', { thread: this.currentThread() });
        }
    }

    async upsert(message: ChatMessage): Promise<void> {
        this._messages.update((messages) => {
            const index = messages.findIndex((existing) => existing.id === message.id);
            if (index === -1) {
                return [...messages, message];
            }

            return messages.map((existing) => existing.id === message.id ? message : existing);
        });

        if (message.threadId?.trim()) {
            await invoke('save_chat_message', { message });
        }
    }

    async setAgentThreadId(agentThreadId: string): Promise<void> {
        const normalizedThreadId = agentThreadId.trim();
        if (!normalizedThreadId || this.currentThread().agentThreadId === normalizedThreadId) {
            return;
        }

        this.currentThread.update((thread) => ({
            ...thread,
            agentThreadId: normalizedThreadId,
            updatedAt: Date.now()
        }));
        await invoke('save_chat_thread', { thread: this.currentThread() });
    }



    isEmptyThread(): boolean {
        return this.currentThread().id === EMPYT_THREAD.id;
    }

    async startThreadIfEmpty(): Promise<boolean> {
        if (!this.isEmptyThread()) {
            return true;
        }

        const projectId = (this.projectService.currentProject()?.id ?? '').trim();
        if (!projectId) {
            return false;
        }

        await this.startThread(projectId);
        return true;
    }

    async startThread(projectId?: string): Promise<ChatThread | null> {
        const resolvedProjectId = (projectId ?? this.projectService.currentProject()?.id ?? '').trim();
        if (!resolvedProjectId) {
            return null;
        }

        const now = Date.now();
        let thread: ChatThread = {
            id: IdGenerator.generateId(),
            projectId: resolvedProjectId,
            title: '',
            agentThreadId: null,
            createdAt: now,
            updatedAt: now
        };
        this.currentThread.set(thread);
        await invoke('save_chat_thread', { thread });
        return thread;
    }

    async switchToThread(thread: ChatThread) {
        console.log('[MessageStore] Switching to thread:', thread);
        this.currentThread.set(thread);
        let messages = await this.loadThreadMessages(thread.id);

        console.log(`Loaded message:`, messages);
        this._messages.set(messages);
    }

    async loadThreads(): Promise<ChatThread[]> {
        const projectId = (this.projectService.currentProject()?.id ?? '').trim();
        if (!projectId) {
            return [];
        }
        const threads = await invoke<ChatThread[]>('load_chat_threads', { projectId, count: this.MaxThreadCount });
        this._threads.set(threads);
        return threads;
    }

    private async loadThreadMessages(threadId: string): Promise<ChatMessage[]> {
        return await invoke<ChatMessage[]>('load_chat_messages', { threadId });
    }

    private setThreadMessages(threadId: string, messages: ChatMessage[]) {
        this._threads.update(threads => ({
            ...threads,
            [threadId]: messages
        }));
    }
}
