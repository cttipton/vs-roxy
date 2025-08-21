# vs-roxy

A VS Code extension for managing local HTTP reverse proxies. It enables path-based routing of multiple web applications under a single hostname and port (e.g., `localhost:8080`).

## Core Features

*   **Reverse Proxy Server**: A built-in proxy server.
*   **Path-Based Routing**: Route URL paths (e.g., `/app1`) to different local services (e.g., `http://localhost:3001`).
*   **UI Management**: A Tree View in the Explorer to visualize and manage routes.
*   **Status Bar Indicator**: Shows the current proxy status and port.
*   **Commands**: Simple commands to start/stop the proxy and manage routes.

## Usage

1.  **Add a Route**: Use the `Roxy: Add Route` command from the Command Palette (`Ctrl+Shift+P`).
2.  **Start Proxy**: Run the `Roxy: Start Reverse Proxy` command.
3.  **Access Services**: Navigate to `http://localhost:8080/your-path` to access your routed application.

## Configuration

Routes and the proxy port can be configured via VS Code settings (`settings.json`).

```json
{
  "roxy.proxyPort": 8080,
  "roxy.routes": [
    {
      "path": "/app",
      "target": "http://localhost:3000",
      "enabled": true
    },
    {
      "path": "/api",
      "target": "http://localhost:3001",
      "enabled": true
    }
  ]
}
```

## License

This project is licensed under BSD-3. See the [LICENSE](LICENSE) file for details.
