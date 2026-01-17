import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { query } from '../store/db.js';

interface Client {
  id: string;
  meetingId: string;
  displayName: string;
  ws: WebSocket;
}

const clients = new Map<string, Client>();
const meetings = new Map<string, Set<string>>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let clientId: string | null = null;

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'join':
            clientId = message.participantId;
            
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
            sendToClient(message.to, {
              type: 'offer',
              from: clientId,
              offer: message.offer,
            });
            break;

          case 'answer':
            sendToClient(message.to, {
              type: 'answer',
              from: clientId,
              answer: message.answer,
            });
            break;

          case 'ice-candidate':
            sendToClient(message.to, {
              type: 'ice-candidate',
              from: clientId,
              candidate: message.candidate,
            });
            break;

          case 'leave':
            handleClientLeave(clientId!);
            break;

          case 'chat':
            const chatClient = clients.get(clientId!);
            if (chatClient) {
              broadcastToMeeting(chatClient.meetingId, {
                type: 'chat',
                from: clientId,
                displayName: chatClient.displayName,
                message: message.message,
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
