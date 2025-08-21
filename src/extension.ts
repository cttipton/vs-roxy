// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ProxyServer, RouteConfig } from './proxyServer';
import { RouteManager } from './routeManager';
import { StatusBarManager } from './statusBarManager';
import { RouteTreeProvider, RouteTreeItem } from './routeTreeProvider';

let proxyServer: ProxyServer | null = null;
let routeManager: RouteManager;
let statusBarManager: StatusBarManager;
let routeTreeProvider: RouteTreeProvider;

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
	console.log('Local Reverse Proxy Manager extension is activating...');

	// Initialize managers
	routeManager = new RouteManager(context);
	statusBarManager = new StatusBarManager();
	routeTreeProvider = new RouteTreeProvider(routeManager);

	// Register tree view
	const treeView = vscode.window.createTreeView('roxyRoutes', {
		treeDataProvider: routeTreeProvider,
		showCollapseAll: true
	});

	// Update status bar on startup
	const port = routeManager.getProxyPort();
	const routes = routeManager.getRoutes();
	statusBarManager.updateStatus(false, port, routes.length);

	// Command: Start Proxy
	const startProxyCommand = vscode.commands.registerCommand('vs-roxy.startProxy', async () => {
		try {
			if (proxyServer?.isRunning()) {
				vscode.window.showWarningMessage('Proxy server is already running');
				return;
			}

			// Create proxy server if it doesn't exist
			if (!proxyServer) {
				const port = routeManager.getProxyPort();
				proxyServer = new ProxyServer(port);
			}

			// Update proxy configuration
			updateProxyConfiguration();

			// Start the server
			await proxyServer.start();
			
			// Update status
			const port = routeManager.getProxyPort();
			const routes = routeManager.getRoutes();
			statusBarManager.updateStatus(true, port, routes.length);
			
		} catch (error) {
			const err = error as Error;
			vscode.window.showErrorMessage(`Failed to start proxy: ${err.message}`);
		}
	});

	// Command: Stop Proxy
	const stopProxyCommand = vscode.commands.registerCommand('vs-roxy.stopProxy', async () => {
		try {
			if (!proxyServer?.isRunning()) {
				vscode.window.showWarningMessage('Proxy server is not running');
				return;
			}

			await proxyServer.stop();
			
			// Update status
			const port = routeManager.getProxyPort();
			const routes = routeManager.getRoutes();
			statusBarManager.updateStatus(false, port, routes.length);
			
		} catch (error) {
			const err = error as Error;
			vscode.window.showErrorMessage(`Failed to stop proxy: ${err.message}`);
		}
	});

	// Command: Add Route
	const addRouteCommand = vscode.commands.registerCommand('vs-roxy.addRoute', async () => {
		try {
			const path = await vscode.window.showInputBox({
				prompt: 'Enter the route path (e.g., /api)',
				value: '/',
				validateInput: (value) => {
					if (!value) { return 'Path is required'; }
					if (!value.startsWith('/')) { return 'Path must start with /'; }
					return null;
				}
			});

			if (!path) { return; }

			const target = await vscode.window.showInputBox({
				prompt: 'Enter the target URL (e.g., http://localhost:3001)',
				value: 'http://localhost:3001',
				validateInput: (value) => {
					if (!value) { return 'Target URL is required'; }
					try {
						new URL(value);
						return null;
					} catch {
						return 'Invalid URL format';
					}
				}
			});

			if (!target) { return; }

			await routeManager.addRoute(path, target);
			updateProxyConfiguration();
			routeTreeProvider.refresh();

			vscode.window.showInformationMessage(`Route added: ${path} → ${target}`);
		} catch (error) {
			const err = error as Error;
			vscode.window.showErrorMessage(`Failed to add route: ${err.message}`);
		}
	});

	// Command: Remove Route
	const removeRouteCommand = vscode.commands.registerCommand('vs-roxy.removeRoute', async (item?: RouteTreeItem) => {
		try {
			let pathToRemove: string;

			if (item && item.route) {
				pathToRemove = item.route.path;
			} else {
				const routes = routeManager.getRoutes();
				if (routes.length === 0) {
					vscode.window.showInformationMessage('No routes to remove');
					return;
				}

				const items = routes.map(route => ({
					label: route.path,
					description: route.target,
					route: route
				}));

				const selected = await vscode.window.showQuickPick(items, {
					placeHolder: 'Select a route to remove'
				});

				if (!selected) { return; }
				pathToRemove = selected.route.path;
			}

			await routeManager.removeRoute(pathToRemove);
			updateProxyConfiguration();
			routeTreeProvider.refresh();

			vscode.window.showInformationMessage(`Route removed: ${pathToRemove}`);
		} catch (error) {
			const err = error as Error;
			vscode.window.showErrorMessage(`Failed to remove route: ${err.message}`);
		}
	});

	const showConfigCommand = vscode.commands.registerCommand('vs-roxy.showConfig', async () => {
		const port = routeManager.getProxyPort();
		const routes = routeManager.getRoutes();
		const isRunning = proxyServer?.isRunning() || false;

		const panel = vscode.window.createWebviewPanel(
			'roxyConfig',
			'Roxy Configuration',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);

		panel.webview.html = getConfigWebviewContent(port, routes, isRunning);

		// Handle messages from the webview
		panel.webview.onDidReceiveMessage(async (message) => {
			try {
				switch (message.command) {
					case 'updatePort':
						await routeManager.updateProxyPort(message.port);
						if (proxyServer) {
							proxyServer.setPort(message.port);
							if (proxyServer.isRunning()) {
								await proxyServer.restart();
							}
						}
						statusBarManager.updateStatus(proxyServer?.isRunning() || false, message.port, routeManager.getRoutes().length);
						panel.webview.postMessage({ command: 'portUpdated', port: message.port });
						break;

					case 'addRoute':
						await routeManager.addRoute(message.route.path, message.route.target, message.route.enabled);
						updateProxyConfiguration();
						const newRoutes = routeManager.getRoutes();
						statusBarManager.updateStatus(proxyServer?.isRunning() || false, routeManager.getProxyPort(), newRoutes.length);
						panel.webview.postMessage({ command: 'routesUpdated', routes: newRoutes });
						routeTreeProvider.refresh();
						break;

					case 'updateRoute':
						const routes = routeManager.getRoutes();
						const routeIndex = routes.findIndex(r => r.path === message.originalPath);
						if (routeIndex !== -1) {
							routes[routeIndex] = message.route;
							await routeManager.updateRoutes(routes);
							updateProxyConfiguration();
							statusBarManager.updateStatus(proxyServer?.isRunning() || false, routeManager.getProxyPort(), routes.length);
							panel.webview.postMessage({ command: 'routesUpdated', routes: routes });
							routeTreeProvider.refresh();
						}
						break;

					case 'deleteRoute':
						await routeManager.removeRoute(message.path);
						updateProxyConfiguration();
						const updatedRoutes = routeManager.getRoutes();
						statusBarManager.updateStatus(proxyServer?.isRunning() || false, routeManager.getProxyPort(), updatedRoutes.length);
						panel.webview.postMessage({ command: 'routesUpdated', routes: updatedRoutes });
						routeTreeProvider.refresh();
						break;

					case 'toggleProxy':
						if (proxyServer?.isRunning()) {
							await proxyServer.stop();
						} else {
							// Create proxy server if it doesn't exist
							if (!proxyServer) {
								const port = routeManager.getProxyPort();
								proxyServer = new ProxyServer(port);
							}
							updateProxyConfiguration();
							await proxyServer.start();
						}
						const running = proxyServer?.isRunning() || false;
						statusBarManager.updateStatus(running, routeManager.getProxyPort(), routeManager.getRoutes().length);
						panel.webview.postMessage({ command: 'proxyStatusUpdated', isRunning: running });
						break;

					case 'refresh':
						const currentPort = routeManager.getProxyPort();
						const currentRoutes = routeManager.getRoutes();
						const currentStatus = proxyServer?.isRunning() || false;
						panel.webview.postMessage({ 
							command: 'dataRefreshed', 
							port: currentPort, 
							routes: currentRoutes, 
							isRunning: currentStatus 
						});
						break;
				}
			} catch (error) {
				const err = error as Error;
				vscode.window.showErrorMessage(`Configuration error: ${err.message}`);
				panel.webview.postMessage({ command: 'error', message: err.message });
			}
		});
	});

	// Add all commands to subscriptions
	context.subscriptions.push(
		startProxyCommand,
		stopProxyCommand,
		addRouteCommand,
		removeRouteCommand,
		showConfigCommand,
		treeView,
		statusBarManager
	);

	// Update proxy configuration on activation
	updateProxyConfiguration();

	console.log('Local Reverse Proxy Manager extension activated successfully!');
}

function updateProxyConfiguration(): void {
	if (proxyServer) {
		const port = routeManager.getProxyPort();
		const routes = routeManager.getRoutes();
		
		proxyServer.setPort(port);
		proxyServer.updateRoutes(routes);
		
		// Update status bar
		statusBarManager.updateStatus(proxyServer.isRunning(), port, routes.length);
		
		// Refresh tree view
		routeTreeProvider.refresh();
	}
}

function getConfigWebviewContent(port: number, routes: RouteConfig[], isRunning: boolean): string {
	const statusColor = isRunning ? '#28a745' : '#dc3545';
	const statusText = isRunning ? 'Running' : 'Stopped';
	const toggleButtonText = isRunning ? 'Stop Proxy' : 'Start Proxy';
	const toggleButtonClass = isRunning ? 'btn-danger' : 'btn-success';
	
	const routeRows = routes.map((route, index) => {
		const enabledBadge = route.enabled 
			? '<span class="badge enabled">Enabled</span>' 
			: '<span class="badge disabled">Disabled</span>';
		
		return `
			<tr data-index="${index}">
				<td><input type="text" class="path-input" value="${route.path}" data-field="path" /></td>
				<td><input type="text" class="target-input" value="${route.target}" data-field="target" /></td>
				<td>
					<label class="switch">
						<input type="checkbox" ${route.enabled ? 'checked' : ''} data-field="enabled" />
						<span class="slider"></span>
					</label>
				</td>
				<td>
					<button class="btn btn-sm btn-danger delete-route" data-path="${route.path}">Delete</button>
				</td>
			</tr>
		`;
	}).join('');

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Roxy Configuration</title>
	<style>
		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			padding: 20px;
			margin: 0;
		}
		
		.header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-bottom: 20px;
			padding: 15px;
			border-radius: 4px;
			background-color: var(--vscode-editor-inactiveSelectionBackground);
		}
		
		.status {
			display: flex;
			align-items: center;
		}
		
		.status-indicator {
			width: 12px;
			height: 12px;
			border-radius: 50%;
			margin-right: 8px;
			background-color: ${statusColor};
		}
		
		.port-section {
			display: flex;
			align-items: center;
			gap: 10px;
		}
		
		.port-input {
			width: 80px;
			padding: 5px 8px;
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			font-family: var(--vscode-font-family);
		}
		
		.config-section {
			margin-bottom: 30px;
		}
		
		.config-section h2 {
			margin-bottom: 15px;
			color: var(--vscode-textLink-foreground);
			border-bottom: 1px solid var(--vscode-panel-border);
			padding-bottom: 5px;
		}
		
		.btn {
			padding: 8px 16px;
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-size: 14px;
			font-weight: 500;
			transition: opacity 0.2s;
		}
		
		.btn:hover {
			opacity: 0.8;
		}
		
		.btn-success {
			background-color: #28a745;
			color: white;
		}
		
		.btn-danger {
			background-color: #dc3545;
			color: white;
		}
		
		.btn-primary {
			background-color: #007acc;
			color: white;
		}
		
		.btn-sm {
			padding: 4px 8px;
			font-size: 12px;
		}
		
		table {
			width: 100%;
			border-collapse: collapse;
			margin-top: 10px;
		}
		
		th, td {
			padding: 8px 12px;
			text-align: left;
			border-bottom: 1px solid var(--vscode-panel-border);
		}
		
		th {
			background-color: var(--vscode-editor-inactiveSelectionBackground);
			font-weight: 600;
		}
		
		.path-input, .target-input {
			width: 100%;
			padding: 4px 8px;
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			font-family: var(--vscode-editor-font-family);
		}
		
		.switch {
			position: relative;
			display: inline-block;
			width: 40px;
			height: 20px;
		}
		
		.switch input {
			opacity: 0;
			width: 0;
			height: 0;
		}
		
		.slider {
			position: absolute;
			cursor: pointer;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background-color: #ccc;
			transition: .4s;
			border-radius: 20px;
		}
		
		.slider:before {
			position: absolute;
			content: "";
			height: 14px;
			width: 14px;
			left: 3px;
			bottom: 3px;
			background-color: white;
			transition: .4s;
			border-radius: 50%;
		}
		
		input:checked + .slider {
			background-color: #28a745;
		}
		
		input:checked + .slider:before {
			transform: translateX(20px);
		}
		
		.add-route-form {
			background-color: var(--vscode-editor-inactiveSelectionBackground);
			padding: 15px;
			border-radius: 4px;
			margin-bottom: 20px;
		}
		
		.form-row {
			display: flex;
			gap: 10px;
			align-items: end;
			margin-bottom: 10px;
		}
		
		.form-group {
			flex: 1;
		}
		
		.form-group label {
			display: block;
			margin-bottom: 5px;
			font-weight: 500;
		}
		
		.form-group input {
			width: 100%;
			padding: 8px;
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			font-family: var(--vscode-font-family);
		}
		
		.empty-state {
			text-align: center;
			color: var(--vscode-descriptionForeground);
			padding: 40px;
		}
		
		.controls {
			display: flex;
			gap: 10px;
			margin-bottom: 20px;
		}
		
		.usage-section {
			background-color: var(--vscode-textBlockQuote-background);
			border-left: 4px solid var(--vscode-textLink-foreground);
			padding: 15px;
			margin-top: 20px;
		}
		
		.usage-section h3 {
			margin-top: 0;
			color: var(--vscode-textLink-foreground);
		}
		
		.usage-list {
			list-style-type: none;
			padding: 0;
		}
		
		.usage-list li {
			margin: 8px 0;
			font-family: var(--vscode-editor-font-family);
		}
		
		.error-message {
			background-color: var(--vscode-inputValidation-errorBackground);
			color: var(--vscode-inputValidation-errorForeground);
			border: 1px solid var(--vscode-inputValidation-errorBorder);
			padding: 10px;
			border-radius: 4px;
			margin: 10px 0;
			display: none;
		}
	</style>
</head>
<body>
	<div class="header">
		<div class="status">
			<div class="status-indicator"></div>
			<strong>Proxy Status: ${statusText}</strong>
		</div>
		<div class="port-section">
			<label for="port">Port:</label>
			<input type="number" id="port" class="port-input" value="${port}" min="1" max="65535" />
			<button class="btn btn-primary" onclick="updatePort()">Update</button>
		</div>
		<button class="btn ${toggleButtonClass}" onclick="toggleProxy()">${toggleButtonText}</button>
	</div>

	<div class="error-message" id="errorMessage"></div>

	<div class="config-section">
		<h2>Add New Route</h2>
		<div class="add-route-form">
			<div class="form-row">
				<div class="form-group">
					<label for="newPath">Path</label>
					<input type="text" id="newPath" placeholder="/api" />
				</div>
				<div class="form-group">
					<label for="newTarget">Target URL</label>
					<input type="text" id="newTarget" placeholder="http://localhost:3001" />
				</div>
				<div class="form-group">
					<label>&nbsp;</label>
					<button class="btn btn-primary" onclick="addRoute()">Add Route</button>
				</div>
			</div>
		</div>
	</div>

	<div class="config-section">
		<h2>Routes Configuration</h2>
		${routes.length > 0 ? `
			<table id="routesTable">
				<thead>
					<tr>
						<th>Path</th>
						<th>Target URL</th>
						<th>Enabled</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					${routeRows}
				</tbody>
			</table>
		` : `
			<div class="empty-state">
				<p>No routes configured</p>
				<p>Add your first route using the form above.</p>
			</div>
		`}
	</div>

	${routes.filter(r => r.enabled).length > 0 ? `
		<div class="usage-section">
			<h3>Access URLs</h3>
			<p>When the proxy is running, your applications will be available at:</p>
			<ul class="usage-list">
				${routes.filter(r => r.enabled).map(route => 
					`<li><code>http://localhost:${port}${route.path}</code> → <code>${route.target}</code></li>`
				).join('')}
			</ul>
		</div>
	` : ''}

	<script>
		const vscode = acquireVsCodeApi();
		let currentPort = ${port};
		let currentRoutes = ${JSON.stringify(routes)};
		let isRunning = ${isRunning};

		function showError(message) {
			const errorDiv = document.getElementById('errorMessage');
			errorDiv.textContent = message;
			errorDiv.style.display = 'block';
			setTimeout(() => {
				errorDiv.style.display = 'none';
			}, 5000);
		}

		function updatePort() {
			const portInput = document.getElementById('port');
			const newPort = parseInt(portInput.value);
			
			if (newPort < 1 || newPort > 65535) {
				showError('Port must be between 1 and 65535');
				return;
			}

			currentPort = newPort;
			vscode.postMessage({
				command: 'updatePort',
				port: newPort
			});
		}

		function toggleProxy() {
			vscode.postMessage({
				command: 'toggleProxy'
			});
		}

		function addRoute() {
			const pathInput = document.getElementById('newPath');
			const targetInput = document.getElementById('newTarget');
			
			const path = pathInput.value.trim();
			const target = targetInput.value.trim();
			
			if (!path || !target) {
				showError('Both path and target are required');
				return;
			}

			if (!path.startsWith('/')) {
				showError('Path must start with /');
				return;
			}

			vscode.postMessage({
				command: 'addRoute',
				route: {
					path: path,
					target: target,
					enabled: true
				}
			});

			// Clear form
			pathInput.value = '';
			targetInput.value = '';
		}

		function deleteRoute(path) {
			if (confirm('Are you sure you want to delete this route?')) {
				vscode.postMessage({
					command: 'deleteRoute',
					path: path
				});
			}
		}

		// Handle route table changes
		function attachRouteEventListeners() {
			const routeInputs = document.querySelectorAll('.path-input, .target-input');
			const routeCheckboxes = document.querySelectorAll('input[data-field="enabled"]');
			const deleteButtons = document.querySelectorAll('.delete-route');

			routeInputs.forEach(input => {
				input.addEventListener('blur', () => {
					updateRoute(input);
				});
			});

			routeCheckboxes.forEach(checkbox => {
				checkbox.addEventListener('change', () => {
					updateRoute(checkbox);
				});
			});

			deleteButtons.forEach(button => {
				button.addEventListener('click', (e) => {
					const path = button.getAttribute('data-path');
					deleteRoute(path);
				});
			});
		}

		function updateRoute(element) {
			const row = element.closest('tr');
			const index = parseInt(row.getAttribute('data-index'));
			const originalRoute = currentRoutes[index];
			
			const pathInput = row.querySelector('[data-field="path"]');
			const targetInput = row.querySelector('[data-field="target"]');
			const enabledInput = row.querySelector('[data-field="enabled"]');
			
			const updatedRoute = {
				path: pathInput.value.trim(),
				target: targetInput.value.trim(),
				enabled: enabledInput.checked
			};

			if (!updatedRoute.path.startsWith('/')) {
				showError('Path must start with /');
				pathInput.value = originalRoute.path; // Restore original
				return;
			}

			vscode.postMessage({
				command: 'updateRoute',
				originalPath: originalRoute.path,
				route: updatedRoute
			});
		}

		// Handle messages from extension
		window.addEventListener('message', event => {
			const message = event.data;
			
			switch (message.command) {
				case 'error':
					showError(message.message);
					break;
				case 'portUpdated':
					currentPort = message.port;
					break;
				case 'routesUpdated':
					currentRoutes = message.routes;
					// Refresh the page content
					location.reload();
					break;
				case 'proxyStatusUpdated':
					isRunning = message.isRunning;
					// Refresh the page content
					location.reload();
					break;
				case 'dataRefreshed':
					currentPort = message.port;
					currentRoutes = message.routes;
					isRunning = message.isRunning;
					// Refresh the page content
					location.reload();
					break;
			}
		});

		// Initialize event listeners when page loads
		document.addEventListener('DOMContentLoaded', () => {
			attachRouteEventListeners();
		});

		// Also attach listeners immediately in case DOMContentLoaded already fired
		attachRouteEventListeners();
	</script>
</body>
</html>`;
}

// This method is called when your extension is deactivated
export async function deactivate() {
	if (proxyServer?.isRunning()) {
		await proxyServer.stop();
	}
}
