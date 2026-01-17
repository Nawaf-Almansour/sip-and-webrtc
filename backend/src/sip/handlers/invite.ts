import { logger } from '../../utils/logger.js';
import { validateToken } from '../../services/tokenService.js';
import { mediaController } from '../../media/controller.js';

export async function handleInvite(req: any, res: any): Promise<void> {
  const callId = req.get('Call-ID');
  const toUri = req.uri;
  const joinToken = req.get('X-Join-Token');

  logger.info({ callId, toUri }, 'Received INVITE');

  // Validate join token
  if (!joinToken) {
    logger.warn({ callId }, 'Missing X-Join-Token header');
    res.send(403, 'Forbidden - Missing token');
    return;
  }

  const tokenData = await validateToken(joinToken);
  if (!tokenData) {
    logger.warn({ callId, joinToken }, 'Invalid or expired token');
    res.send(403, 'Forbidden - Invalid token');
    return;
  }

  // Parse URI to determine call type
  const uriMatch = toUri.match(/sip:(call|room)-([a-f0-9-]+)@/i);
  if (!uriMatch) {
    logger.warn({ callId, toUri }, 'Invalid SIP URI format');
    res.send(404, 'Not Found');
    return;
  }

  const [, type, id] = uriMatch;
  logger.info({ callId, type, id, tokenData }, 'Processing INVITE');

  try {
    if (type === 'call') {
      // 1:1 call handling
      await mediaController.handleCallInvite(req, res, id, tokenData);
    } else if (type === 'room') {
      // Conference room handling
      await mediaController.handleRoomInvite(req, res, id, tokenData);
    }
  } catch (error) {
    logger.error({ callId, error }, 'Error handling INVITE');
    res.send(500, 'Internal Server Error');
  }
}
