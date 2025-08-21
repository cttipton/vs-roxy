import * as vscode from 'vscode';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'vs-roxy.showConfig';
        this.statusBarItem.show();
        this.updateStatus(false, 8080);
    }

    public updateStatus(isRunning: boolean, port: number, routeCount: number = 0): void {
        if (isRunning) {
            this.statusBarItem.text = `$(radio-tower) Roxy: ${port}`;
            this.statusBarItem.tooltip = `Reverse proxy running on port ${port} with ${routeCount} route(s)`;
            this.statusBarItem.backgroundColor = undefined;
        } else {
            this.statusBarItem.text = `$(radio-tower) Roxy: Stopped`;
            this.statusBarItem.tooltip = 'Reverse proxy is stopped. Click to view configuration.';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
    }

    public dispose(): void {
        this.statusBarItem.dispose();
    }
}
