import * as vscode from 'vscode';
import { RouteConfig } from './proxyServer';
import { RouteManager } from './routeManager';

export class RouteTreeItem extends vscode.TreeItem {
    constructor(
        public readonly route: RouteConfig,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(`${route.path} → ${route.target}`, collapsibleState);
        
        this.tooltip = `${route.path} → ${route.target}`;
        this.description = route.enabled ? '✓' : '✗';
        this.contextValue = 'route';
        
        // Set icon based on enabled state
        this.iconPath = new vscode.ThemeIcon(
            route.enabled ? 'check' : 'x',
            route.enabled ? undefined : new vscode.ThemeColor('errorForeground')
        );
    }
}

export class RouteTreeProvider implements vscode.TreeDataProvider<RouteTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<RouteTreeItem | undefined | null | void> = new vscode.EventEmitter<RouteTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<RouteTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private routeManager: RouteManager) {
        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('roxy.routes')) {
                this.refresh();
            }
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: RouteTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: RouteTreeItem): Thenable<RouteTreeItem[]> {
        if (!element) {
            // Root level - show all routes
            const routes = this.routeManager.getRoutes();
            return Promise.resolve(
                routes.map(route => new RouteTreeItem(route, vscode.TreeItemCollapsibleState.None))
            );
        }
        
        return Promise.resolve([]);
    }

    getParent(element: RouteTreeItem): vscode.ProviderResult<RouteTreeItem> {
        return null;
    }
}
