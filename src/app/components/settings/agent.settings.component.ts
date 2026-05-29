import { Component, model, OnInit, signal } from '@angular/core';

import { AgentConfig } from '../../models/agent.provider';
import { AgentConfigViewModel, AgentProviderRegistry, AgentProviderViewModel } from '../../models/agents';
import { AppSetting, SettingKeys } from '../../models/setting.model';
import { IconComponent } from "../icon/icon.component";
import { AgentConfigEditorComponent } from './agent.config.editor.component';

@Component({
  selector: 'mtx-agent-settings',
  templateUrl: 'agent.settings.component.html',
  imports: [IconComponent, AgentConfigEditorComponent],
})
export class AgentSettingsComponent implements OnInit {

  readonly appSetting = model.required<AppSetting>();
  readonly availableAgents = signal<AgentProviderViewModel[]>(
    AgentProviderRegistry.availableAgents(),
  );
  readonly selectedAgentType = signal<string>(
    this.availableAgents()[0]?.type ?? 'codex-cli',
  );

  readonly configuredAgents = signal<AgentConfigViewModel[]>([]);

  async ngOnInit() {
    let agentConfigs = this.appSetting().getSettingValue<AgentConfig[]>(SettingKeys.AGENT_CONFIGS_SETTING);
    this.configuredAgents.set(agentConfigs?.map(config => ({
      ...config,
      isExpanded: false,
    })) ?? []);
  }

  setSelectedAgentType(value: string): void {
    this.selectedAgentType.set(value);
  }

  addAgentConfig(): void {
    const providerType = this.selectedAgentType();
    const definition = AgentProviderRegistry.findAvailableAgentByType(providerType);
    if (!definition) {
      return;
    }

    const newAgentConfig: AgentConfigViewModel = {
      id: `${providerType}-${Date.now()}`,
      name: definition.name,
      agentType: definition.type,
      model: definition.defaultModel,
      apiKey: '',
      baseUrl: '',
      enabled: true,
      isDefault: false,
      sandboxMode: definition.type === 'codex-cli' ? 'workspace-write' : undefined,
      networkAccessEnabled: definition.type === 'codex-cli' ? false : undefined,
    };
    this.configuredAgents.update((configs) => [...configs, newAgentConfig]);
  }

  toggleExpanded(agent: AgentConfigViewModel): void {
    agent.isExpanded = !agent.isExpanded;
  }
}
