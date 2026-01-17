import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../store/db.js';
import { createJoinToken } from '../../services/tokenService.js';
import { config } from '../../config/index.js';

const router = Router();

router.post('/', async (_req, res) => {
  try {
    const id = uuidv4();
    await query('INSERT INTO calls (id, status) VALUES ($1, $2)', [id, 'PENDING']);

    const baseUrl = `${_req.protocol}://${_req.get('host')}`;

    res.status(201).json({
      callId: id,
      joinUrlA: `${baseUrl}/call/${id}?role=A`,
      joinUrlB: `${baseUrl}/call/${id}?role=B`,
    });
  } catch (error) {
    console.error('Create call error:', error);
    res.status(500).json({ error: 'Failed to create call' });
  }
});

router.post('/:id/join', async (req, res) => {
  try {
    const { id } = req.params;
    const { role = 'A', displayName = 'Guest' } = req.body;

    const result = await query('SELECT * FROM calls WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const call = result.rows[0];
    if (call.status === 'ENDED') {
      return res.status(409).json({ error: 'Call has ended' });
    }

    const participantId = `${id}-${role}-${Date.now()}`;
    await query(
      'INSERT INTO participants (id, display_name, role, call_id) VALUES ($1, $2, $3, $4)',
      [participantId, displayName, role, id]
    );

    const token = await createJoinToken('call', id, role);

    res.json({
      participantId,
      displayName,
      sipUri: `sip:call-${id}@${config.sip.domain}`,
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
    console.error('Join call error:', error);
    res.status(500).json({ error: 'Failed to join call' });
  }
});

router.post('/:id/end', async (req, res) => {
  try {
    const { id } = req.params;

    await query('UPDATE calls SET status = $1, ended_at = NOW() WHERE id = $2', ['ENDED', id]);

    res.json({ success: true, callId: id });
  } catch (error) {
    console.error('End call error:', error);
    res.status(500).json({ error: 'Failed to end call' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query('SELECT * FROM calls WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const call = result.rows[0];
    const participantsResult = await query('SELECT * FROM participants WHERE call_id = $1 AND left_at IS NULL ORDER BY joined_at ASC', [id]);

    res.json({
      callId: call.id,
      status: call.status,
      participants: participantsResult.rows.map((p: any) => ({
        id: p.id,
        displayName: p.display_name,
        role: p.role,
        joinedAt: p.joined_at,
      })),
      createdAt: call.created_at,
      endedAt: call.ended_at,
    });
  } catch (error) {
    console.error('Get call error:', error);
    res.status(500).json({ error: 'Failed to get call' });
  }
});

router.get('/:id/participants', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query('SELECT * FROM calls WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const participantsResult = await query(
      'SELECT * FROM participants WHERE call_id = $1 AND left_at IS NULL ORDER BY joined_at ASC',
      [id]
    );

    res.json({
      callId: id,
      participants: participantsResult.rows.map((p: any) => ({
        id: p.id,
        displayName: p.display_name,
        role: p.role,
        joinedAt: p.joined_at,
      })),
      count: participantsResult.rows.length,
    });
  } catch (error) {
    console.error('Get participants error:', error);
    res.status(500).json({ error: 'Failed to get participants' });
  }
});

router.post('/:id/leave', async (req, res) => {
  try {
    const { id } = req.params;
    const { participantId } = req.body;

    await query('UPDATE participants SET left_at = NOW() WHERE id = $1 AND call_id = $2', [participantId, id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Leave call error:', error);
    res.status(500).json({ error: 'Failed to leave call' });
  }
});

export default router;
