import { logger } from '../utils/logger.js';
import { prisma } from '../store/prisma.js';

interface TokenData {
  type: string;
  id: string;
  role: string;
}

// Store for active calls and conferences
const activeCalls = new Map<string, { participants: any[] }>();
const activeConferences = new Map<string, { participants: any[] }>();

export const mediaController = {
  async handleCallInvite(req: any, res: any, callId: string, tokenData: TokenData): Promise<void> {
    logger.info({ callId, tokenData }, 'Handling 1:1 call INVITE');

    try {
      // Get or create call state
      let callState = activeCalls.get(callId);
      
      if (!callState) {
        callState = { participants: [] };
        activeCalls.set(callId, callState);
      }

      // Add participant
      callState.participants.push({
        role: tokenData.role,
        req,
        res,
        joinedAt: new Date(),
      });

      // If both participants are present, bridge them
      if (callState.participants.length === 2) {
        logger.info({ callId }, 'Both participants present, bridging call');
        // In production, use drachtio-fsmrf to bridge
        // For now, send 200 OK to both
        for (const participant of callState.participants) {
          participant.res.send(200, {
            headers: {
              'Content-Type': 'application/sdp',
            },
          });
        }
      } else {
        // First participant - send ringing
        res.send(180, 'Ringing');
        logger.info({ callId }, 'First participant joined, waiting for second');
      }

      // Update database
      await prisma.call.update({
        where: { id: callId },
        data: { status: 'ACTIVE' },
      }).catch(() => {
        // Call might not exist yet
        logger.warn({ callId }, 'Call not found in database');
      });

    } catch (error) {
      logger.error({ callId, error }, 'Error in handleCallInvite');
      res.send(500, 'Internal Server Error');
    }
  },

  async handleRoomInvite(req: any, res: any, meetingId: string, tokenData: TokenData): Promise<void> {
    logger.info({ meetingId, tokenData }, 'Handling room INVITE');

    try {
      // Get or create conference state
      let confState = activeConferences.get(meetingId);
      
      if (!confState) {
        confState = { participants: [] };
        activeConferences.set(meetingId, confState);
      }

      // Check max participants
      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
      });

      if (meeting && confState.participants.length >= meeting.maxParticipants) {
        logger.warn({ meetingId }, 'Meeting is full');
        res.send(486, 'Busy Here - Meeting Full');
        return;
      }

      // Add participant to conference
      const participant = {
        id: `${meetingId}-${Date.now()}`,
        role: tokenData.role,
        req,
        res,
        joinedAt: new Date(),
      };
      confState.participants.push(participant);

      // Send 200 OK
      res.send(200, {
        headers: {
          'Content-Type': 'application/sdp',
        },
      });

      logger.info({ meetingId, participantCount: confState.participants.length }, 'Participant joined conference');

      // Update database
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { status: 'ACTIVE' },
      }).catch(() => {
        logger.warn({ meetingId }, 'Meeting not found in database');
      });

    } catch (error) {
      logger.error({ meetingId, error }, 'Error in handleRoomInvite');
      res.send(500, 'Internal Server Error');
    }
  },

  getActiveCall(callId: string) {
    return activeCalls.get(callId);
  },

  getActiveConference(meetingId: string) {
    return activeConferences.get(meetingId);
  },

  removeParticipant(callId: string, participantId: string) {
    const callState = activeCalls.get(callId);
    if (callState) {
      callState.participants = callState.participants.filter(p => p.id !== participantId);
      if (callState.participants.length === 0) {
        activeCalls.delete(callId);
      }
    }
  },

  endCall(callId: string) {
    activeCalls.delete(callId);
    logger.info({ callId }, 'Call ended and removed from active calls');
  },

  endConference(meetingId: string) {
    activeConferences.delete(meetingId);
    logger.info({ meetingId }, 'Conference ended and removed from active conferences');
  },
};
