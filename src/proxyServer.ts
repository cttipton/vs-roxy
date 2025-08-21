import * as vscode from 'vscode';
import { Server, IncomingMessage, ServerResponse } from 'http';
import * as http from 'http';
import * as url from 'url';

export interface RouteConfig {
    path: string;
    target: string;
    enabled: boolean;
}

export class ProxyServer {
    private server: Server | null = null;
    private port: number;
    private routes: RouteConfig[] = [];

    constructor(port: number = 8080) {
        this.port = port;
    }

    private setCorsHeaders(res: ServerResponse): void {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    private logRequest(req: IncomingMessage): void {
        console.log(`[Roxy] ${new Date().toISOString()} - ${req.method} ${req.url}`);
    }

    public updateRoutes(routes: RouteConfig[]): void {
        this.routes = routes;
        console.log(`[Roxy] Updated routes:`, routes);
    }

    private findMatchingRoute(requestPath: string): RouteConfig | null {
        // Sort routes by path length (longest first) to match more specific routes first
        const sortedRoutes = this.routes
            .filter(route => route.enabled && route.path && route.target)
            .sort((a, b) => b.path.length - a.path.length);

        for (const route of sortedRoutes) {
            // Normalize paths for comparison
            const routePath = route.path.endsWith('/') ? route.path.slice(0, -1) : route.path;
            const normalizedRequestPath = requestPath.endsWith('/') ? requestPath.slice(0, -1) : requestPath;
            
            if (routePath === '/' || normalizedRequestPath.startsWith(routePath)) {
                return route;
            }
        }
        
        return null;
    }

    private handleRequest(req: IncomingMessage, res: ServerResponse): void {
        this.logRequest(req);
        this.setCorsHeaders(res);

        // Handle OPTIONS requests for CORS
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        const requestUrl = req.url || '/';
        const matchingRoute = this.findMatchingRoute(requestUrl);

        if (!matchingRoute) {
            // No matching route found
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'Not Found',
                message: `No route configured for ${requestUrl}`,
                availableRoutes: this.routes
                    .filter(r => r.enabled)
                    .map(r => ({ path: r.path, target: r.target }))
            }));
            return;
        }

        this.proxyRequest(req, res, matchingRoute);
    }

    private proxyRequest(req: IncomingMessage, res: ServerResponse, route: RouteConfig): void {
        try {
            // Parse the target URL
            const targetUrl = new URL(route.target);
            
            // Calculate the target path by removing the route path prefix
            let targetPath = req.url || '/';
            if (route.path !== '/' && targetPath.startsWith(route.path)) {
                targetPath = targetPath.substring(route.path.length);
                if (!targetPath.startsWith('/')) {
                    targetPath = '/' + targetPath;
                }
            }
            
            console.log(`[Roxy] Proxying ${req.method} ${req.url} -> ${route.target}${targetPath}`);
            
            // Set up the proxy request options
            const proxyOptions = {
                hostname: targetUrl.hostname,
                port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
                path: targetPath,
                method: req.method,
                headers: {
                    ...req.headers,
                    host: targetUrl.host
                }
            };
            
            // Create the proxy request
            const proxyReq = http.request(proxyOptions, (proxyRes) => {
                // Copy status code and headers
                res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
                
                // Pipe the response
                proxyRes.pipe(res);
            });
            
            // Handle proxy request errors
            proxyReq.on('error', (err) => {
                console.error(`[Roxy] Proxy error for ${route.path}:`, err.message);
                if (!res.headersSent) {
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        error: 'Bad Gateway', 
                        message: `Failed to connect to ${route.target}` 
                    }));
                }
            });
            
            // Handle timeouts
            proxyReq.setTimeout(30000, () => {
                proxyReq.destroy();
                if (!res.headersSent) {
                    res.writeHead(504, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        error: 'Gateway Timeout',
                        message: `Request to ${route.target} timed out`
                    }));
                }
            });
            
            // Pipe the request body
            req.pipe(proxyReq);
            
        } catch (error) {
            console.error(`[Roxy] Error handling request for ${route.path}:`, error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal Server Error' }));
            }
        }
    }

    public async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.server) {
                reject(new Error('Server is already running'));
                return;
            }

            // Create the HTTP server with our request handler
            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            this.server.listen(this.port, () => {
                console.log(`[Roxy] Reverse proxy server started on port ${this.port}`);
                vscode.window.showInformationMessage(`Reverse proxy started on localhost:${this.port}`);
                resolve();
            });

            this.server.on('error', (error: any) => {
                if (error.code === 'EADDRINUSE') {
                    const message = `Port ${this.port} is already in use`;
                    vscode.window.showErrorMessage(message);
                    reject(new Error(message));
                } else {
                    vscode.window.showErrorMessage(`Failed to start proxy server: ${error.message}`);
                    reject(error);
                }
            });
        });
    }

    public async stop(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.server) {
                resolve();
                return;
            }

            this.server.close(() => {
                console.log('[Roxy] Reverse proxy server stopped');
                vscode.window.showInformationMessage('Reverse proxy stopped');
                this.server = null;
                resolve();
            });
        });
    }

    public async restart(): Promise<void> {
        await this.stop();
        await this.start();
    }

    public isRunning(): boolean {
        return this.server !== null;
    }

    public getPort(): number {
        return this.port;
    }

    public setPort(port: number): void {
        this.port = port;
    }

    public getRoutes(): RouteConfig[] {
        return [...this.routes];
    }
}
