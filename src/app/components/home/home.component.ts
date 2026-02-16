import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AppService } from '../../services/app.service';
import { ProjectService } from '../../services/project.service';
import { IconComponent } from "../icon/icon.component";
import { WarnComponent } from '../warn/warn.component';

@Component({
    selector: 'mtx-home',
    imports: [RouterModule, CommonModule, IconComponent, WarnComponent],
    templateUrl: 'home.component.html'
})
export class HomeComponent implements OnInit {
    private readonly appService = inject(AppService);
    private readonly projectService = inject(ProjectService);
    readonly router = inject(Router);

    readonly title = computed(() => this.appService.splashName);
    readonly recentProjects = computed(() => this.projectService.recentProjects());
    readonly gitInstalled = computed(() => this.appService.isGitInstalled());
    readonly codexInstalled = computed(() => this.appService.isCodexInstalled());
    readonly gitVersion = computed(() => this.appService.gitInfo());
    readonly codexVersion = computed(() => this.appService.codexVersion());

    constructor() {

    }

    async ngOnInit() {
        await this.projectService.initialize();
    }

    async newProject(): Promise<void> {
        if (await this.projectService.newProject()) {
            await this.goToWorkspace();
        }
    }

    async openProject(): Promise<void> {
        if (await this.projectService.openProject()) {
            await this.goToWorkspace();
        }
    }

    async openRecentProject(path: string): Promise<void> {
        if (await this.projectService.openProject(path)) {
            await this.goToWorkspace();
        }
    }

    async removeProject(path: string, event: Event): Promise<void> {
        event.stopPropagation();
        let project = this.projectService.recentProjects().find(p => p.path === path);
        if (project) {
            await this.projectService.deleteProject(project.id);
        }
    }

    displayProjectName(path: string): string {
        return this.projectService.getPathName(path);
    }

    private async goToWorkspace(): Promise<void> {
        await this.router.navigate(['/app/workspace']);
    }
}
