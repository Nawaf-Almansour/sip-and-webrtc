import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import healthRoutes from './api/routes/health.js';
import callsRoutes from './api/routes/calls.js';
import meetingsRoutes from './api/routes/meetings.js';
import { setupWebSocket } from './websocket/signaling.js';
import { initSipServer } from './sip/server.js';

const app = express();
const server = createServer(app);

app.use(express.json());

app.use(healthRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/meetings', meetingsRoutes);

setupWebSocket(server);

server.listen(config.port, async () => {
  logger.info(`Server running on port ${config.port}`);
  
  // Initialize SIP server connection to drachtio
  if (process.env.ENABLE_SIP === 'true') {
    try {
      await initSipServer();
      logger.info('SIP server connected to drachtio');
    } catch (err) {
      logger.error({ err }, 'Failed to connect to drachtio - SIP features disabled');
    }
  }
});
