import { Component, computed, model, OnInit } from '@angular/core';
import { CodexSandboxMode } from '../../models/agent.provider';
import { AgentConfigViewModel } from '../../models/agents';
import { AppSetting, SettingKeys } from '../../models/setting.model';
import { IconComponent } from "../icon/icon.component";

@Component({
    selector: 'mtx-agent-config-editor',
    templateUrl: 'agent.config.editor.component.html',
    imports: [IconComponent]
})
export class AgentConfigEditorComponent implements OnInit {
    readonly appSetting = model.required<AppSetting>();
    config = model.required<AgentConfigViewModel>();
    configuredAgents = model.required<AgentConfigViewModel[]>();
    canDelete = computed(() => !this.config().isDefault);
    isCodexCli = computed(() => this.config().agentType === 'codex-cli');

    constructor() { }

    ngOnInit() { }

    save() {
        this.config().isExpanded = false;
        this.updateSetting();
    }

    cancel() {
        this.config().isExpanded = false;
    }

    setAsDefault(): void {
        for (const agent of this.configuredAgents()) {
            agent.isDefault = agent.id === this.config().id;
        }
        this.updateSetting();
    }

    setSandboxMode(value: string): void {
        this.config().sandboxMode = value as CodexSandboxMode;
        if (this.config().sandboxMode === 'danger-full-access') {
            this.config().networkAccessEnabled = true;
        }
    }

    toggleNetworkAccess(): void {
        this.config().networkAccessEnabled = !(this.config().networkAccessEnabled ?? false);
    }

    deleteConfig(): void {
        const updated = this.configuredAgents().filter((item) => item.id !== this.config().id);
        if (this.config().isDefault && updated.length > 0) {
            updated[0].isDefault = true;
        }
        this.configuredAgents.set(updated);
        this.updateSetting();
    }

    private updateSetting() {
        let settingValue = JSON.stringify(this.configuredAgents());
        this.appSetting().updateSetting(SettingKeys.AGENT_CONFIGS_SETTING, settingValue);
    }
}
