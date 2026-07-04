const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { spawn } = require('child_process');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '7860', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

global.__quotesPayload = '';
process.env.CUSTOM_SERVER = 'true';

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  })
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      
      if (!process.env.VERCEL && process.env.DISABLE_WORKER !== 'true') {
        console.log('> Spawning dedicated ML Background Worker Thread via tsx...');
        
        // Use tsx to run the TypeScript worker file
        const workerPath = path.join(__dirname, 'src', 'worker.ts');
        const worker = spawn('npx', ['tsx', workerPath], {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env: { ...process.env, IS_WORKER: 'true' }
        });

        worker.on('message', (msg) => {
          if (msg && msg.type === 'QUOTE_PAYLOAD') {
            global.__quotesPayload = msg.data;
          }
        });

        worker.on('exit', (code) => {
          console.error(`[Worker] Exited with code ${code}. Restarting container in 5s...`);
          setTimeout(() => process.exit(1), 5000);
        });
      }
    });
});
