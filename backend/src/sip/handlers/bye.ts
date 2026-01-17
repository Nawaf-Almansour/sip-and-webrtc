import { logger } from '../../utils/logger.js';
import { mediaController } from '../../media/controller.js';
import { query } from '../../store/db.js';

export async function handleBye(req: any, res: any): Promise<void> {
  const callId = req.get('Call-ID');
  const toUri = req.uri;
  logger.info({ callId, toUri }, 'Received BYE');
  
  try {
    // Parse URI to get call/meeting ID
    const uriMatch = toUri?.match(/sip:(call|room)-([a-f0-9-]+)@/i);
    
    if (uriMatch) {
      const [, type, id] = uriMatch;
      
      if (type === 'call') {
        // End the call
        mediaController.endCall(id);
        await query('UPDATE calls SET status = $1, ended_at = NOW() WHERE id = $2', ['ENDED', id]);
        logger.info({ callId: id }, 'Call ended via BYE');
      } else if (type === 'room') {
        // Remove participant from conference
        const participantId = req.get('X-Participant-ID');
        if (participantId) {
          mediaController.removeParticipant(id, participantId);
          await query('UPDATE participants SET left_at = NOW() WHERE id = $1', [participantId]);
        }
        logger.info({ meetingId: id, participantId }, 'Participant left via BYE');
      }
    }
    
    res.send(200);
    logger.info({ callId }, 'BYE processed successfully');
  } catch (error) {
    logger.error({ callId, error }, 'Error handling BYE');
    res.send(500, 'Internal Server Error');
  }
}
