import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../store/db.js';
import { createJoinToken } from '../../services/tokenService.js';
import { config } from '../../config/index.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { maxParticipants = 10, waitingRoomEnabled = false } = req.body;
    const id = uuidv4();

    await query('INSERT INTO meetings (id, status, max_participants, waiting_room_enabled) VALUES ($1, $2, $3, $4)', [id, 'ACTIVE', maxParticipants, waitingRoomEnabled]);

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    res.status(201).json({
      meetingId: id,
      joinUrl: `${baseUrl}/meeting/${id}`,
      hostUrl: `${baseUrl}/meeting/${id}?role=host`,
    });
  } catch (error) {
    console.error('Create meeting error:', error);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

router.post('/:id/join', async (req, res) => {
  try {
    const { id } = req.params;
    const { displayName, role = 'participant', connectionMode = 'webrtc' } = req.body;

    const result = await query('SELECT * FROM meetings WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const meeting = result.rows[0];
    if (meeting.status === 'ENDED') {
      return res.status(409).json({ error: 'Meeting has ended' });
    }

    const participantsResult = await query('SELECT COUNT(*) FROM participants WHERE meeting_id = $1 AND left_at IS NULL', [id]);
    const participantCount = parseInt(participantsResult.rows[0].count);

    if (participantCount >= meeting.max_participants) {
      return res.status(409).json({ error: 'Meeting is full' });
    }

    // Check if participant already exists and is still active (for browser refresh case)
    const existingParticipant = await query(
      'SELECT * FROM participants WHERE meeting_id = $1 AND display_name = $2 AND role = $3 AND left_at IS NULL ORDER BY joined_at DESC LIMIT 1',
      [id, displayName, role]
    );

    let participantId: string;
    let shortId: string;
    let participantStatus: string;

    if (existingParticipant.rows.length > 0) {
      // Reuse existing participant (browser refresh case)
      const existing = existingParticipant.rows[0];
      participantId = existing.id;
      shortId = existing.short_id;
      participantStatus = existing.status;
      console.log(`Reusing existing participant ${participantId} for ${displayName}`);
    } else {
      // Create new participant
      participantId = uuidv4();
      shortId = Math.random().toString(36).substring(2, 8).toUpperCase();
      participantStatus = (meeting.waiting_room_enabled && role !== 'host') ? 'waiting' : 'approved';
      
      await query(
        'INSERT INTO participants (id, display_name, role, meeting_id, short_id, status, connection_mode) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [participantId, displayName, role, id, shortId, participantStatus, connectionMode]
      );
      console.log(`Created new participant ${participantId} for ${displayName}`);
    }

    const token = await createJoinToken('meeting', id, role);

    res.json({
      participantId,
      displayName,
      status: participantStatus,
      waitingRoomEnabled: meeting.waiting_room_enabled,
      sipUri: `sip:room-${id}@${config.sip.domain}`,
      joinToken: token,
      wssUrl: config.sip.wssUrl,
      turnConfig: {
        urls: [config.turn.url, config.stun.url],
        username: config.turn.username,
        credential: config.turn.password,
      },
      expiresAt: new Date(Date.now() + config.token.ttlSeconds * 1000).toISOString(),
    });
  } catch (error) {
    console.error('Join meeting error:', error);
    res.status(500).json({ error: 'Failed to join meeting' });
  }
});

router.post('/:id/end', async (req, res) => {
  try {
    const { id } = req.params;

    await query('UPDATE meetings SET status = $1, ended_at = NOW() WHERE id = $2', ['ENDED', id]);

    res.json({ success: true, meetingId: id });
  } catch (error) {
    console.error('End meeting error:', error);
    res.status(500).json({ error: 'Failed to end meeting' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query('SELECT * FROM meetings WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const meeting = result.rows[0];
    const participantsResult = await query('SELECT * FROM participants WHERE meeting_id = $1 AND left_at IS NULL ORDER BY joined_at ASC', [id]);

    res.json({
      meetingId: meeting.id,
      status: meeting.status,
      maxParticipants: meeting.max_participants,
      participants: participantsResult.rows.map((p: any) => ({
        id: p.id,
        displayName: p.display_name,
        role: p.role,
        joinedAt: p.joined_at,
      })),
      createdAt: meeting.created_at,
      endedAt: meeting.ended_at,
    });
  } catch (error) {
    console.error('Get meeting error:', error);
    res.status(500).json({ error: 'Failed to get meeting' });
  }
});

router.get('/:id/participants', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query('SELECT * FROM meetings WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const participantsResult = await query(
      'SELECT * FROM participants WHERE meeting_id = $1 AND left_at IS NULL ORDER BY joined_at ASC',
      [id]
    );

    res.json({
      meetingId: id,
      participants: participantsResult.rows.map((p: any) => ({
        id: p.id,
        shortId: p.short_id,
        displayName: p.display_name,
        role: p.role,
        connectionMode: p.connection_mode,
        isMuted: p.is_muted,
        isVideoOff: p.is_video_off,
        joinedAt: p.joined_at,
      })),
      count: participantsResult.rows.length,
    });
  } catch (error) {
    console.error('Get participants error:', error);
    res.status(500).json({ error: 'Failed to get participants' });
  }
});

router.patch('/:id/participants/:participantId/status', async (req, res) => {
  try {
    const { id, participantId } = req.params;
    const { isMuted, isVideoOff } = req.body;

    await query(
      'UPDATE participants SET is_muted = COALESCE($1, is_muted), is_video_off = COALESCE($2, is_video_off) WHERE id = $3 AND meeting_id = $4',
      [isMuted, isVideoOff, participantId, id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update participant status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

router.post('/:id/leave', async (req, res) => {
  try {
    const { id } = req.params;
    const { participantId } = req.body;

    await query('UPDATE participants SET left_at = NOW() WHERE id = $1 AND meeting_id = $2', [participantId, id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Leave meeting error:', error);
    res.status(500).json({ error: 'Failed to leave meeting' });
  }
});

router.post('/:id/mute-all', async (req, res) => {
  try {
    const { id } = req.params;

    await query('UPDATE participants SET is_muted = true WHERE meeting_id = $1 AND left_at IS NULL', [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Mute all error:', error);
    res.status(500).json({ error: 'Failed to mute all' });
  }
});

router.post('/:id/kick', async (req, res) => {
  try {
    const { id } = req.params;
    const { participantId } = req.body;

    await query('UPDATE participants SET left_at = NOW() WHERE id = $1 AND meeting_id = $2', [participantId, id]);

    res.json({ success: true, kicked: participantId });
  } catch (error) {
    console.error('Kick participant error:', error);
    res.status(500).json({ error: 'Failed to kick participant' });
  }
});

router.get('/:id/waiting-room', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT id, display_name, short_id, joined_at 
       FROM participants 
       WHERE meeting_id = $1 AND status = 'waiting' AND left_at IS NULL 
       ORDER BY joined_at ASC`,
      [id]
    );

    res.json({
      waitingParticipants: result.rows.map((p: any) => ({
        id: p.id,
        displayName: p.display_name,
        shortId: p.short_id,
        joinedAt: p.joined_at,
      })),
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get waiting room error:', error);
    res.status(500).json({ error: 'Failed to get waiting room' });
  }
});

router.post('/:id/waiting-room/admit', async (req, res) => {
  try {
    const { id } = req.params;
    const { participantId } = req.body;

    await query(
      "UPDATE participants SET status = 'approved' WHERE id = $1 AND meeting_id = $2",
      [participantId, id]
    );

    res.json({ success: true, admitted: participantId });
  } catch (error) {
    console.error('Admit participant error:', error);
    res.status(500).json({ error: 'Failed to admit participant' });
  }
});

router.post('/:id/waiting-room/admit-all', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      "UPDATE participants SET status = 'approved' WHERE meeting_id = $1 AND status = 'waiting' RETURNING id",
      [id]
    );

    res.json({ success: true, admittedCount: result.rowCount });
  } catch (error) {
    console.error('Admit all error:', error);
    res.status(500).json({ error: 'Failed to admit all' });
  }
});

router.post('/:id/waiting-room/deny', async (req, res) => {
  try {
    const { id } = req.params;
    const { participantId } = req.body;

    await query(
      "UPDATE participants SET status = 'denied', left_at = NOW() WHERE id = $1 AND meeting_id = $2",
      [participantId, id]
    );

    res.json({ success: true, denied: participantId });
  } catch (error) {
    console.error('Deny participant error:', error);
    res.status(500).json({ error: 'Failed to deny participant' });
  }
});

router.get('/:id/my-status/:participantId', async (req, res) => {
  try {
    const { id, participantId } = req.params;

    const result = await query(
      'SELECT status FROM participants WHERE id = $1 AND meeting_id = $2',
      [participantId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    res.json({ status: result.rows[0].status });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

router.patch('/:id/settings', async (req, res) => {
  try {
    const { id } = req.params;
    const { waitingRoomEnabled } = req.body;

    await query(
      'UPDATE meetings SET waiting_room_enabled = COALESCE($1, waiting_room_enabled) WHERE id = $2',
      [waitingRoomEnabled, id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
