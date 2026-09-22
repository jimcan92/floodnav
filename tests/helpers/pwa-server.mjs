// Production-only browser-test proxy. Changes worker bytes to emulate a new deployment.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['client/build/index.js'], {
 env: {...process.env, HOST: '127.0.0.1', PORT: '4321', ORIGIN: 'http://127.0.0.1:4320'}, stdio: 'inherit'
});
let revision = 1;
const server = createServer(async (req, res) => {
 if (req.url === '/__test/update' && req.method === 'POST') { revision++; res.end(String(revision)); return; }
 try {
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(await Array.fromAsync(req));
  const headers = {...req.headers}; delete headers.host;
  const result = await fetch(`http://127.0.0.1:4321${req.url}`, {method: req.method, headers, body, redirect: 'manual'});
  result.headers.forEach((value,key) => { if (!['content-length','content-encoding','transfer-encoding'].includes(key)) res.setHeader(key,value); });
  res.statusCode = result.status;
  if (req.url === '/service-worker.js') {
   res.setHeader('cache-control', 'no-store');
   res.end(`${await result.text()}\nself.addEventListener('message', e => { if (e.data?.type === 'TEST_RELEASE') e.ports[0].postMessage(${revision}); });\n`);
  } else res.end(Buffer.from(await result.arrayBuffer()));
 } catch { res.writeHead(503).end('Starting production app'); }
});
server.listen(4320, '127.0.0.1');
process.on('SIGTERM', () => { server.close(); child.kill('SIGTERM'); });
