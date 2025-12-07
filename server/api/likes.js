import db from '../db.js';
import { randomUUID } from 'crypto';

export async function likeHandler(req, res) {
  const { type, targetId, action } = req.body || {};

  if (!['changelog','feedback'].includes(type) || !targetId) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const userId = req.session?.user?.id || null;

    if (action === 'unlike') {
      let result;
      if (userId) {
        result = db.prepare('DELETE FROM likes WHERE type = ? AND target_id = ? AND user_id = ?')
          .run(type, targetId, userId);
      } else {
        result = db.prepare('DELETE FROM likes WHERE type = ? AND target_id = ? AND user_id IS NULL')
          .run(type, targetId);
      }
      console.log('Unlike result:', result);
      res.json({ message: 'Unliked.' });
    } else {
      const id = randomUUID();
      const now = Date.now();

      db.prepare('INSERT INTO likes (id, type, target_id, user_id, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, type, targetId, userId, now);

      res.status(201).json({ message: 'Liked!' });
    }
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE')) {
      try {
        const userId = req.session?.user?.id || null;
        let result;
        if (userId) {
          result = db.prepare('DELETE FROM likes WHERE type = ? AND target_id = ? AND user_id = ?')
            .run(type, targetId, userId);
        } else {
          result = db.prepare('DELETE FROM likes WHERE type = ? AND target_id = ? AND user_id IS NULL')
            .run(type, targetId);
        }
        console.log('Unlike error recovery result:', result);
        res.json({ message: 'Unliked.' });
      } catch (deleteError) {
        console.error('Unlike error:', deleteError);
        res.status(500).json({ error: 'Failed to unlike' });
      }
    } else {
      console.error('Like error:', error);
      res.status(500).json({ error: 'Failed to like' });
    }
  }
}

export async function getLikesHandler(req, res) {
  const { type, targetId } = req.query;
  if (!['changelog','feedback'].includes(type) || !targetId) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  
  try {
    const count = db.prepare('SELECT COUNT(*) as count FROM likes WHERE type = ? AND target_id = ?').get(type, targetId)?.count || 0;
    res.json({ count });
  } catch (error) {
    console.error('Get likes error:', error);
    res.status(500).json({ error: 'Failed to get likes', count: 0 });
  }
}
