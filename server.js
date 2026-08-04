const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { spawn } = require('child_process');
const path = require('path');
const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV === 'development';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Hardened Production: Prevent global crashes from unhandled promises
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err);
  // Do not exit in production, let PM2 manage if it's catastrophic, but log it
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

global.__quotesPayload = '';
global.__enginePayload = '';
global.__wsClients = new Set();
process.env.CUSTOM_SERVER = 'true';

function wsBroadcast() {
  if (!global.__quotesPayload || global.__wsClients.size === 0) return;
  const wsMsg = JSON.stringify({ type: 'quote', data: global.__quotesPayload });
  for (const ws of global.__wsClients) {
    if (ws.readyState === 1) {
      try { ws.send(wsMsg); } catch { global.__wsClients.delete(ws); }
    } else {
      global.__wsClients.delete(ws);
    }
  }
}

function wsBroadcastEngine() {
  if (!global.__enginePayload || global.__wsClients.size === 0) return;
  const wsMsg = JSON.stringify({ type: 'engine_state', data: global.__enginePayload });
  for (const ws of global.__wsClients) {
    if (ws.readyState === 1) {
      try { ws.send(wsMsg); } catch { global.__wsClients.delete(ws); }
    } else {
      global.__wsClients.delete(ws);
    }
  }
}

function wsBroadcastAlert() {
  if (!global.__alertPayload || global.__wsClients.size === 0) return;
  const wsMsg = JSON.stringify({ type: 'alert', data: global.__alertPayload });
  for (const ws of global.__wsClients) {
    if (ws.readyState === 1) {
      try { ws.send(wsMsg); } catch { global.__wsClients.delete(ws); }
    } else {
      global.__wsClients.delete(ws);
    }
  }
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      
      // V4 Architecture: API routes run in a separate process and lack access to the ML worker's memory.
      // We must intercept it here at the custom server level and dispatch via IPC.
      if (parsedUrl.pathname === '/api/force') {
        if (global.__worker) {
          global.__worker.send({ type: 'FORCE_INTRADAY' });
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ success: true, message: 'Force scan dispatched via IPC' }));
      }
      
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Attach WebSocket server with heartbeat without breaking Next.js HMR
  const wss = new WebSocketServer({ noServer: true });
  
  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url);
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    global.__wsClients.add(ws);
    
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => global.__wsClients.delete(ws));
    ws.on('error', () => global.__wsClients.delete(ws));
  });

  // Ping clients every 30 seconds to kill dead connections (memory leak fix)
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        global.__wsClients.delete(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  server
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log(`> WebSocket available at ws://${hostname}:${port}/ws`);
      
      if (!process.env.VERCEL && process.env.DISABLE_WORKER !== 'true') {
        console.log('> Spawning dedicated ML Background Worker Thread via tsx...');
        
        const workerPath = path.join(__dirname, 'src', 'worker.ts');
        const worker = spawn(process.execPath, ['--import', 'tsx', workerPath], {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env: { ...process.env, IS_WORKER: 'true' },
          shell: false
        });
        
        global.__worker = worker;

        worker.on('message', (msg) => {
          if (msg && msg.type === 'QUOTE_PAYLOAD') {
            global.__quotesPayload = msg.data;
            wsBroadcast();
          } else if (msg && msg.type === 'ENGINE_PAYLOAD') {
            global.__enginePayload = msg.data;
            wsBroadcastEngine();
          } else if (msg && msg.type === 'ALERT_PAYLOAD') {
            let parsed;
            try { parsed = JSON.parse(msg.data); } catch { parsed = msg.data; }
            global.__alertPayload = parsed;
            wsBroadcastAlert();
          }
        });

        worker.on('exit', (code) => {
          console.error(`[Worker] Exited with code ${code}. Restarting container in 5s...`);
          setTimeout(() => process.exit(1), 5000);
        });
      }
    });
});
