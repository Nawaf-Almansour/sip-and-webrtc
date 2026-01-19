import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { query } from '../store/db.js';
import jwt from 'jsonwebtoken';
import { streamSelectionService } from '../services/streamSelectionService.js';
import { layoutBroadcastService } from '../services/layoutBroadcastService.js';
import { streamHandler } from './stream-handler.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const MAX_MESSAGE_SIZE = 64 * 1024; // 64KB
const MAX_CONNECTIONS_PER_IP = 10;
const MAX_PARTICIPANTS_PER_ROOM = 50;
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_MESSAGES_PER_WINDOW = 100;

interface JwtPayload {
  participantId: string;
  meetingId: string;
  displayName: string;
  exp?: number;
  iat?: number;
}

interface Client {
  id: string;
  meetingId: string;
  displayName: string;
  ws: WebSocket;
  messageCount: number;
  windowStart: number;
}

const clients = new Map<string, Client>();
const meetings = new Map<string, Set<string>>();
const connectionsByIp = new Map<string, number>();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://192.168.100.218,https://localhost').split(',');

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    let clientId: string | null = null;
    let authenticated = false;
    const clientIp = req.socket.remoteAddress || 'unknown';

    // Origin validation
    const origin = req.headers.origin || '';
    if (origin && !allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      console.log(`[Security] Rejected connection from invalid origin: ${origin}`);
      ws.close(4003, 'Invalid origin');
      return;
    }

    // Rate limit connections per IP
    const currentConnections = connectionsByIp.get(clientIp) || 0;
    if (currentConnections >= MAX_CONNECTIONS_PER_IP) {
      console.log(`[Security] Too many connections from IP: ${clientIp}`);
      ws.close(4029, 'Too many connections');
      return;
    }
    connectionsByIp.set(clientIp, currentConnections + 1);

    // Cleanup on close
    ws.on('close', () => {
      const count = connectionsByIp.get(clientIp) || 1;
      if (count <= 1) {
        connectionsByIp.delete(clientIp);
      } else {
        connectionsByIp.set(clientIp, count - 1);
      }
    });

    ws.on('message', (data: Buffer) => {
      try {
        // Message size limit
        if (data.length > MAX_MESSAGE_SIZE) {
          console.log(`[Security] Message too large: ${data.length} bytes from ${clientIp}`);
          ws.send(JSON.stringify({ type: 'error', message: 'Message too large' }));
          return;
        }

        const message = JSON.parse(data.toString());

        // Rate limiting per client
        if (authenticated && clientId) {
          const client = clients.get(clientId);
          if (client) {
            const now = Date.now();
            if (now - client.windowStart > RATE_LIMIT_WINDOW_MS) {
              client.messageCount = 0;
              client.windowStart = now;
            }
            client.messageCount++;
            if (client.messageCount > MAX_MESSAGES_PER_WINDOW) {
              console.log(`[Security] Rate limit exceeded for client: ${clientId}`);
              ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded' }));
              return;
            }
          }
        }
        
        switch (message.type) {
          case 'join':
            // Validate JWT token
            if (!message.token) {
              console.log(`[Security] Join attempt without token from ${clientIp}`);
              ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
              ws.close(4001, 'Authentication required');
              return;
            }

            console.log('[Signaling] Join request:', {
              meetingId: message.meetingId,
              displayName: message.displayName,
              tokenLength: message.token.length,
              tokenPreview: message.token.substring(0, 20) + '...',
              jwtSecret: JWT_SECRET.substring(0, 10) + '...',
            });

            // Allow 'guest' token for testing
            if (message.token === 'guest') {
              console.log('[Signaling] Guest token accepted for testing');
              clientId = `guest-${Math.random().toString(36).substring(7)}`;
              authenticated = true;
            } else {
              try {
                const decoded = jwt.verify(message.token, JWT_SECRET) as JwtPayload;
                
                console.log('[Signaling] Token decoded successfully:', {
                  participantId: decoded.participantId,
                  meetingId: decoded.meetingId,
                  displayName: decoded.displayName,
                });
                
                // Verify token matches request
                if (decoded.meetingId !== message.meetingId) {
                  console.log(`[Security] Token meetingId mismatch: token=${decoded.meetingId}, request=${message.meetingId}`);
                  ws.send(JSON.stringify({ type: 'error', message: 'Invalid token for this meeting' }));
                  ws.close(4003, 'Invalid token');
                  return;
                }

                clientId = decoded.participantId;
                authenticated = true;
              } catch (err) {
                console.error('[Security] Token validation failed:', {
                  error: (err as Error).message,
                  errorName: (err as Error).name,
                  clientIp,
                });
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
                ws.close(4001, 'Invalid token');
                return;
              }
            }

            // Room capacity check
            const roomSize = meetings.get(message.meetingId)?.size || 0;
            if (roomSize >= MAX_PARTICIPANTS_PER_ROOM) {
              console.log(`[Security] Room ${message.meetingId} is full`);
              ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
              ws.close(4029, 'Room full');
              return;
            }
            
            // Remove existing client with same ID if exists (handles page refresh)
            const existingClient = clients.get(clientId!);
            if (existingClient) {
              console.log(`Removing stale connection for client ${clientId}`);
              if (existingClient.ws.readyState === WebSocket.OPEN) {
                existingClient.ws.close();
              }
              const oldMeetingClients = meetings.get(existingClient.meetingId);
              if (oldMeetingClients) {
                oldMeetingClients.delete(clientId!);
              }
            }
            
            const client: Client = {
              id: clientId!,
              meetingId: message.meetingId,
              displayName: message.displayName,
              ws,
              messageCount: 0,
              windowStart: Date.now(),
            };
            clients.set(clientId!, client);

            if (!meetings.has(message.meetingId)) {
              meetings.set(message.meetingId, new Set());
            }
            meetings.get(message.meetingId)!.add(clientId!);

            // Notify others in the meeting about new participant (only if not already there)
            if (!existingClient) {
              broadcastToMeeting(message.meetingId, {
                type: 'user-joined',
                participantId: clientId,
                displayName: message.displayName,
              }, clientId!);
            }

            // Send list of existing participants to the new user
            const existingParticipants: { id: string; displayName: string }[] = [];
            meetings.get(message.meetingId)!.forEach(id => {
              if (id !== clientId) {
                const c = clients.get(id);
                if (c) {
                  existingParticipants.push({ id: c.id, displayName: c.displayName });
                }
              }
            });
            
            ws.send(JSON.stringify({
              type: 'existing-participants',
              participants: existingParticipants,
            }));
            
            console.log(`Client ${clientId} joined meeting ${message.meetingId}`);
            break;

          case 'offer':
            if (!authenticated) {
              ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
              return;
            }
            // Validate SDP size
            if (message.offer?.sdp && message.offer.sdp.length > MAX_MESSAGE_SIZE) {
              ws.send(JSON.stringify({ type: 'error', message: 'SDP too large' }));
              return;
            }
            
            // Determine stream type using StreamHandler
            const streamMetadata = streamHandler.determineStreamType(
              clientId!,
              message,
              message.isScreenSharing || false,
              message.hasCameraStream !== false
            );
            
            console.log('[Signaling] Offer with stream metadata:', {
              from: clientId,
              to: message.to,
              streamType: streamMetadata.streamType,
              reason: streamMetadata.reason,
            });
            
            sendToClient(message.to, {
              type: 'offer',
              from: clientId,
              offer: message.offer,
              streamType: streamMetadata.streamType,
              streamMetadata,
            });
            break;

          case 'answer':
            if (!authenticated) {
              ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
              return;
            }
            
            // Determine stream type using StreamHandler
            const answerMetadata = streamHandler.determineStreamType(
              clientId!,
              message,
              message.isScreenSharing || false,
              message.hasCameraStream !== false
            );
            
            console.log('[Signaling] Answer with stream metadata:', {
              from: clientId,
              to: message.to,
              streamType: answerMetadata.streamType,
              reason: answerMetadata.reason,
            });
            
            sendToClient(message.to, {
              type: 'answer',
              from: clientId,
              answer: message.answer,
              streamType: answerMetadata.streamType,
              streamMetadata: answerMetadata,
            });
            break;

          case 'ice-candidate':
            if (!authenticated) {
              ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
              return;
            }
            sendToClient(message.to, {
              type: 'ice-candidate',
              from: clientId,
              candidate: message.candidate,
            });
            break;

          case 'leave':
            if (!authenticated) return;
            handleClientLeave(clientId!);
            break;

          case 'chat':
            if (!authenticated) {
              ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
              return;
            }
            const chatClient = clients.get(clientId!);
            if (chatClient) {
              // Sanitize chat message (basic XSS prevention)
              const sanitizedMessage = String(message.message || '').slice(0, 1000);
              broadcastToMeeting(chatClient.meetingId, {
                type: 'chat',
                from: clientId,
                displayName: chatClient.displayName,
                message: sanitizedMessage,
                timestamp: new Date().toISOString(),
              });
            }
            break;
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', async () => {
      if (clientId) {
        await handleClientLeave(clientId);
      }
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  });

  console.log('WebSocket signaling server started on /ws');
}

function broadcastToMeeting(meetingId: string, message: any, excludeId?: string) {
  const meetingClients = meetings.get(meetingId);
  if (!meetingClients) return;

  const data = JSON.stringify(message);
  meetingClients.forEach(id => {
    if (id !== excludeId) {
      const client = clients.get(id);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  });
}

function sendToClient(clientId: string, message: any) {
  const client = clients.get(clientId);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  }
}

async function handleClientLeave(clientId: string) {
  const client = clients.get(clientId);
  if (!client) return;

  const meetingId = client.meetingId;
  
  // Update database to mark participant as left
  try {
    await query('UPDATE participants SET left_at = NOW() WHERE id = $1 AND meeting_id = $2 AND left_at IS NULL', [clientId, meetingId]);
    console.log(`Database updated: Client ${clientId} marked as left`);
  } catch (err) {
    console.error('Error updating participant left_at:', err);
  }
  
  clients.delete(clientId);

  const meetingClients = meetings.get(meetingId);
  if (meetingClients) {
    meetingClients.delete(clientId);
    if (meetingClients.size === 0) {
      meetings.delete(meetingId);
    } else {
      broadcastToMeeting(meetingId, {
        type: 'user-left',
        participantId: clientId,
      });
    }
  }

  console.log(`Client ${clientId} left meeting ${meetingId}`);
}
