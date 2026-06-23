import server from './app.config.js';

const port = Number(process.env.PORT) || 4001;

server.listen(port);
console.log(`[Colyseus] listening on http://localhost:${port}`);
