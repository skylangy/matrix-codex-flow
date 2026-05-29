import { describe, expect, it } from 'vitest';

import { AgentConfig } from './agent.provider';
import { AppSetting, DEFAULT_SETTINGS, SettingKeys } from './setting.model';

describe('AppSetting', () => {
    it('keeps the default Codex agent in a restricted execution mode', () => {
        const appSetting = new AppSetting(DEFAULT_SETTINGS.map((setting) => ({ ...setting })));

        const agents = appSetting.getSettingValue<AgentConfig[]>(
            SettingKeys.AGENT_CONFIGS_SETTING,
        );

        expect(agents).toHaveLength(1);
        expect(agents?.[0]).toMatchObject({
            name: 'Codex CLI Agent',
            agentType: 'codex-cli',
            sandboxMode: 'workspace-write',
            networkAccessEnabled: false,
            enabled: true,
            isDefault: true,
        });
    });

    it('updates scalar settings without changing the setting identity', () => {
        const appSetting = new AppSetting(DEFAULT_SETTINGS.map((setting) => ({ ...setting })));

        appSetting.updateSetting(SettingKeys.GENERATE_FOLDER_SETTING, true);

        expect(appSetting.getSetting<boolean>(SettingKeys.GENERATE_FOLDER_SETTING)).toBe(true);
    });
});
