import { describe, expect, it } from 'vitest';

import { AgentConfig } from './agent.provider';
import { AgentProviderNames, AgentProviderRegistry } from './agents';

describe('AgentProviderRegistry', () => {
    it('returns copy-safe provider metadata with Codex as the default option', () => {
        const providers = AgentProviderRegistry.availableAgents();
        providers[0].name = 'Changed locally';

        const freshProviders = AgentProviderRegistry.availableAgents();
        const codex = freshProviders.find((provider) => provider.type === 'codex-cli');

        expect(codex).toMatchObject({
            id: AgentProviderNames.ID_CODEX_CLI,
            name: AgentProviderNames.CODEX_CLI,
            defaultModel: 'gpt-5-codex',
            isDefault: true,
        });
    });

    it('creates a Codex provider from a safe agent configuration', () => {
        const config: AgentConfig = {
            id: 'codex-agent',
            name: 'Codex CLI Agent',
            agentType: 'codex-cli',
            model: 'gpt-5-codex',
            enabled: true,
            isDefault: true,
            sandboxMode: 'workspace-write',
            networkAccessEnabled: false,
        };

        const provider = AgentProviderRegistry.create(config);

        expect(provider.id).toBe(AgentProviderNames.ID_CODEX_CLI);
        expect(provider.name).toBe(AgentProviderNames.CODEX_CLI);
        expect(provider.model).toBe('gpt-5-codex');
        expect(provider.capabilities.supportsStreaming).toBe(true);
    });
});
