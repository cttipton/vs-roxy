const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <html>
      <head>
        <title>Hello World - Test Server</title>
      </head>
      <body style='font-family: Arial, sans-serif; text-align: center; padding: 50px;'>
        <h1 style='color: #28a745;'>🎉 Hello World!</h1>
        <p>This is a test server running on <strong>localhost:3000</strong></p>
        <p>Request details:</p>
        <div style='display: inline-block; text-align: left; background: #f5f5f5; padding: 20px; border-radius: 8px;'>
          <p><strong>Method:</strong> ${req.method}</p>
          <p><strong>URL:</strong> ${req.url}</p>
          <p><strong>User-Agent:</strong> ${req.headers['user-agent']}</p>
          <p><strong>Host:</strong> ${req.headers.host}</p>
          <p><strong>X-Forwarded-For:</strong> ${req.headers['x-forwarded-for'] || 'Not set'}</p>
        </div>
        <p style='margin-top: 30px; color: #007acc;'>
          If you're seeing this through the proxy, it's working! 🚀
        </p>
        <p style='margin-top: 20px; font-size: 14px; color: #666;'>
          Direct access: <a href="http://localhost:3000">http://localhost:3000</a><br/>
          Via proxy: <a href="http://localhost:8066/login">http://localhost:8066/login</a>
        </p>
      </body>
    </html>
  `);
});

server.listen(3000, () => {
  console.log('🚀 Hello World server running on http://localhost:3000');
  console.log('📡 Test your proxy at: http://localhost:8066/login');
  console.log('Press Ctrl+C to stop the server');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Server shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});
