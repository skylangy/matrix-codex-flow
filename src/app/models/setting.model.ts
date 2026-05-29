import { IdGenerator } from './id';

export type SettingValueType = 'string' | 'boolean' | 'number';

export type SettingValue = string | boolean | number;

export interface SettingModel {
    id: string;
    key: string;
    value: SettingValue;
    valueType: SettingValueType;
}

export class AppSetting {
    constructor(public readonly settings: SettingModel[]) { }

    getSetting<T extends SettingValue>(key: string): T | undefined {
        const setting = this.settings.find(s => s.key === key);
        return setting ? setting.value as T : undefined;
    }

    updateSetting(key: string, value: SettingValue): void {
        const settingIndex = this.settings.findIndex(s => s.key === key);
        if (settingIndex !== -1) {
            this.settings[settingIndex].value = value;
        } else {
            console.warn(`Setting with key "${key}" not found.`);
        }
    }

    getSettingValue<T>(key: string): T | undefined {
        const setting = this.settings.find(s => s.key === key);
        const result = JSON.parse(setting?.value as string);
        return result as T | undefined;
    }
}

export class SettingKeys {
    static AGENT_CONFIGS_SETTING = 'configured.agents';
    static PROMPT_TEMPLATE_SETTING = 'prompt.template';
    static GENERATE_FOLDER_SETTING = 'project.generateVibeflowFolder';
}

export const DEFAULT_SETTINGS: SettingModel[] = [
    {
        id: 'setting-configured-agents',
        key: SettingKeys.AGENT_CONFIGS_SETTING,
        value: JSON.stringify(
            [
                {
                    id: IdGenerator.generateId(),
                    name: 'Codex CLI Agent',
                    agentType: 'codex-cli',
                    model: 'gpt-5.3-codex',
                    apiKey: '',
                    baseUrl: '',
                    enabled: true,
                    isDefault: true,
                    sandboxMode: 'workspace-write',
                    networkAccessEnabled: false,
                }
            ]
        ),
        valueType: 'string'
    },
    {
        id: 'setting-default-prompt-template',
        key: SettingKeys.PROMPT_TEMPLATE_SETTING,
        value: `You are Codex working in this project.
                Follow project context and rules, keep outputs concise, and produce actionable steps.`,
        valueType: 'string'
    },
    {
        id: 'setting-generate-folder',
        key: SettingKeys.GENERATE_FOLDER_SETTING,
        value: false,
        valueType: 'boolean'
    }
];
