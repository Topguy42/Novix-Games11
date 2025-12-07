import db from '../db.js';
import { randomUUID } from 'crypto';

export async function likeHandler(req, res) {
  const { type, targetId, action } = req.body || {};

  if (!['changelog','feedback'].includes(type) || !targetId) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const userId = req.session?.user?.id || null;

    if (!userId) {
      return res.status(401).json({ error: 'Must be logged in to like' });
    }

    if (action === 'unlike') {
      const existingLike = db.prepare('SELECT id FROM likes WHERE type = ? AND target_id = ? AND user_id = ?')
        .get(type, targetId, userId);

      if (!existingLike) {
        return res.status(400).json({ error: 'You have not liked this' });
      }

      db.prepare('DELETE FROM likes WHERE type = ? AND target_id = ? AND user_id = ?')
        .run(type, targetId, userId);

      res.json({ message: 'Unliked.' });
    } else {
      const existingLike = db.prepare('SELECT id FROM likes WHERE type = ? AND target_id = ? AND user_id = ?')
        .get(type, targetId, userId);

      if (existingLike) {
        db.prepare('DELETE FROM likes WHERE type = ? AND target_id = ? AND user_id = ?')
          .run(type, targetId, userId);
        res.json({ message: 'Unliked.' });
      } else {
        const id = randomUUID();
        const now = Date.now();
        db.prepare('INSERT INTO likes (id, type, target_id, user_id, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(id, type, targetId, userId, now);
        res.status(201).json({ message: 'Liked!' });
      }
    }
  } catch (error) {
    console.error('Like handler error:', error);
    res.status(500).json({ error: 'Failed to process like' });
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
