import Srf from 'drachtio-srf';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { handleInvite } from './handlers/invite.js';
import { handleBye } from './handlers/bye.js';
import { handleCancel } from './handlers/cancel.js';

const srf = new Srf() as Srf & {
  bye: (handler: (req: any, res: any) => void) => void;
  cancel: (handler: (req: any, res: any) => void) => void;
};

export async function initSipServer(): Promise<typeof srf> {
  return new Promise((resolve, reject) => {
    srf.connect({
      host: config.drachtio.host,
      port: config.drachtio.port,
      secret: config.drachtio.secret,
    });

    srf.on('connect', (err, hostport) => {
      if (err) {
        logger.error({ err }, 'Failed to connect to drachtio');
        reject(err);
        return;
      }
      logger.info({ hostport }, 'Connected to drachtio server');
      resolve(srf);
    });

    srf.on('error', (err) => {
      logger.error({ err }, 'Drachtio connection error');
    });

    // Register SIP handlers
    srf.invite(handleInvite);
    srf.bye(handleBye);
    srf.cancel(handleCancel);
  });
}

export { srf };
