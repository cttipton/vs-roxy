import * as vscode from 'vscode';
import { RouteConfig } from './proxyServer';

export class RouteManager {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public getRoutes(): RouteConfig[] {
        const config = vscode.workspace.getConfiguration('roxy');
        return config.get('routes', []);
    }

    public async addRoute(path: string, target: string, enabled: boolean = true): Promise<void> {
        const routes = this.getRoutes();
        
        // Check if route already exists
        const existingRoute = routes.find(r => r.path === path);
        if (existingRoute) {
            throw new Error(`Route with path '${path}' already exists`);
        }

        // Validate inputs
        if (!path.startsWith('/')) {
            throw new Error('Path must start with /');
        }

        // Additional path validation to prevent path-to-regexp errors
        if (path.includes('*') || path.includes('(') || path.includes(')') || path.includes('?')) {
            throw new Error('Path cannot contain special regex characters: *, (, ), ?');
        }

        // Ensure path doesn't end with trailing slash unless it's root
        const normalizedPath = path === '/' ? '/' : path.replace(/\/$/, '');

        if (!this.isValidUrl(target)) {
            throw new Error('Target must be a valid URL');
        }

        const newRoute: RouteConfig = { path: normalizedPath, target, enabled };
        routes.push(newRoute);
        
        await this.saveRoutes(routes);
    }

    public async removeRoute(path: string): Promise<void> {
        const routes = this.getRoutes();
        const filteredRoutes = routes.filter(r => r.path !== path);
        
        if (filteredRoutes.length === routes.length) {
            throw new Error(`Route with path '${path}' not found`);
        }
        
        await this.saveRoutes(filteredRoutes);
    }

    public async updateRoute(oldPath: string, newRoute: RouteConfig): Promise<void> {
        const routes = this.getRoutes();
        const index = routes.findIndex(r => r.path === oldPath);
        
        if (index === -1) {
            throw new Error(`Route with path '${oldPath}' not found`);
        }

        // Validate new route
        if (!newRoute.path.startsWith('/')) {
            throw new Error('Path must start with /');
        }

        // Additional path validation to prevent path-to-regexp errors
        if (newRoute.path.includes('*') || newRoute.path.includes('(') || newRoute.path.includes(')') || newRoute.path.includes('?')) {
            throw new Error('Path cannot contain special regex characters: *, (, ), ?');
        }

        // Normalize the path
        const normalizedPath = newRoute.path === '/' ? '/' : newRoute.path.replace(/\/$/, '');
        newRoute.path = normalizedPath;

        if (!this.isValidUrl(newRoute.target)) {
            throw new Error('Target must be a valid URL');
        }

        // Check if new path conflicts with existing routes (except the one being updated)
        const conflictingRoute = routes.find((r, i) => i !== index && r.path === newRoute.path);
        if (conflictingRoute) {
            throw new Error(`Route with path '${newRoute.path}' already exists`);
        }

        routes[index] = newRoute;
        await this.saveRoutes(routes);
    }

    public async toggleRoute(path: string): Promise<void> {
        const routes = this.getRoutes();
        const route = routes.find(r => r.path === path);
        
        if (!route) {
            throw new Error(`Route with path '${path}' not found`);
        }

        route.enabled = !route.enabled;
        await this.saveRoutes(routes);
    }

    private async saveRoutes(routes: RouteConfig[]): Promise<void> {
        const config = vscode.workspace.getConfiguration('roxy');
        await config.update('routes', routes, vscode.ConfigurationTarget.Workspace);
    }

    private isValidUrl(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    public async promptForRoute(): Promise<RouteConfig | undefined> {
        const path = await vscode.window.showInputBox({
            prompt: 'Enter the URL path (e.g., /api)',
            placeHolder: '/api',
            validateInput: (value) => {
                if (!value) {
                    return 'Path is required';
                }
                if (!value.startsWith('/')) {
                    return 'Path must start with /';
                }
                if (value.includes('*') || value.includes('(') || value.includes(')') || value.includes('?')) {
                    return 'Path cannot contain special characters: *, (, ), ?';
                }
                const existingRoutes = this.getRoutes();
                if (existingRoutes.some(r => r.path === value)) {
                    return 'Route with this path already exists';
                }
                return null;
            }
        });

        if (!path) {
            return undefined;
        }

        const target = await vscode.window.showInputBox({
            prompt: 'Enter the target URL (e.g., http://localhost:3000)',
            placeHolder: 'http://localhost:3000',
            validateInput: (value) => {
                if (!value) {
                    return 'Target URL is required';
                }
                if (!this.isValidUrl(value)) {
                    return 'Please enter a valid URL';
                }
                return null;
            }
        });

        if (!target) {
            return undefined;
        }

        // Normalize the path (remove trailing slash unless it's root)
        const normalizedPath = path === '/' ? '/' : path.replace(/\/$/, '');

        return { path: normalizedPath, target, enabled: true };
    }

    public getProxyPort(): number {
        const config = vscode.workspace.getConfiguration('roxy');
        return config.get('proxyPort', 8080);
    }

    public async setProxyPort(port: number): Promise<void> {
        const config = vscode.workspace.getConfiguration('roxy');
        await config.update('proxyPort', port, vscode.ConfigurationTarget.Workspace);
    }

    public async updateProxyPort(port: number): Promise<void> {
        await this.setProxyPort(port);
    }

    public async updateRoutes(routes: RouteConfig[]): Promise<void> {
        await this.saveRoutes(routes);
    }
}
