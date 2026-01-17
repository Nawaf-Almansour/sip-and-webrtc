import { logger } from '../../utils/logger.js';
import { mediaController } from '../../media/controller.js';

export async function handleCancel(req: any, res: any): Promise<void> {
  const callId = req.get('Call-ID');
  const toUri = req.uri;
  logger.info({ callId, toUri }, 'Received CANCEL');
  
  try {
    // Parse URI to get call/meeting ID
    const uriMatch = toUri?.match(/sip:(call|room)-([a-f0-9-]+)@/i);
    
    if (uriMatch) {
      const [, type, id] = uriMatch;
      
      if (type === 'call') {
        // Cancel pending call
        mediaController.endCall(id);
        logger.info({ callId: id }, 'Call cancelled');
      } else if (type === 'room') {
        // Cancel conference join attempt
        const participantId = req.get('X-Participant-ID');
        if (participantId) {
          mediaController.removeParticipant(id, participantId);
        }
        logger.info({ meetingId: id }, 'Conference join cancelled');
      }
    }
    
    res.send(200);
    logger.info({ callId }, 'CANCEL processed successfully');
  } catch (error) {
    logger.error({ callId, error }, 'Error handling CANCEL');
    res.send(500, 'Internal Server Error');
  }
}
