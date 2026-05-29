
export interface AgentRequest {
    prompt: string;
    system?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    jsonMode?: boolean;
    workingDirectory?: string;
    threadId?: string | null;
    sandboxMode?: CodexSandboxMode;
    networkAccessEnabled?: boolean;
    timeoutMs?: number;
    extra?: Record<string, any>;
}

export interface AgentResponse {
    text: string;
    raw?: any;
    durationMs: number;
    extra?: Record<string, any>;
    usage?: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
        cost?: number
    }
}

export interface AgentCapabilities {
    supportsStreaming: boolean;
    supportsJsonMode: boolean;
    supportsTools: boolean;
    canModifyFiles?: boolean;
    canExecuteShell?: boolean;
}

export interface AgentProvider {
    readonly id: string;
    readonly name: string;
    readonly model: string;
    readonly capabilities: AgentCapabilities;

    run(request: AgentRequest): Promise<AgentResponse>;

    runStream?(request: AgentRequest, onChunk: (chunk: AgentResponse) => void): Promise<void>;
}

export interface AgentConfig {
    id: string;
    name: string;
    agentType: string;
    model: string;
    apiKey?: string;
    baseUrl?: string;
    enabled: boolean;
    isDefault: boolean;
    sandboxMode?: CodexSandboxMode;
    networkAccessEnabled?: boolean;
    extra?: Record<string, any>;
}

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export const EMPTY_AGENT_RESULT: AgentResponse = {
    text: '',
    raw: null,
    durationMs: 0,
};
