import { createApp } from './app.js';

const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a number between 1 and 65535.');
const { app, close } = createApp();
const host = process.env.HOST || '127.0.0.1';
const server = app.listen(port, host, () => console.log(`RentShare BD is running at http://${host}:${port}`));
server.on('error', error => { console.error(`Unable to start RentShare BD: ${error.message}`); close(); process.exitCode = 1; });
const shutdown = () => server.close(() => { close(); process.exit(0); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
