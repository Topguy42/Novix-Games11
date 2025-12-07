import db from '../db.js';
import { randomUUID } from 'crypto';

export async function addCommentHandler(req, res) {
  const { type, targetId, content, user } = req.body || {};

  if (!['changelog','feedback'].includes(type) || !targetId || !content) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const banned = [/\bnigg\w*\b/i, /\bcunt\b/i, /\bchink\b/i, /\bfag\w*\b/i, /\btrann\w*\b/i, /\bspic\b/i, /\bslut\b/i, /\bwhore\b/i, /\bretard\b/i];
  if (banned.some(r => r.test(content))) {
    return res.status(400).json({ error: 'Inappropriate language detected.' });
  }

  try {
    const id = randomUUID();
    let userId = req.session?.user?.id || user?.id || null;
    const now = Date.now();

    console.log(`[COMMENT] User ID: ${userId}, Content: "${content.substring(0, 50)}..."`);
    db.prepare('INSERT INTO comments (id, type, target_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, type, targetId, userId, content, now);
    res.status(201).json({ message: 'Comment posted.', id });
  } catch (error) {
    console.error('Comment error:', error);
    res.status(500).json({ error: 'Failed to post comment' });
  }
}

export async function getCommentsHandler(req, res) {
  const { type, targetId } = req.query;
  if (!['changelog','feedback'].includes(type) || !targetId) return res.status(400).json({ error: 'Invalid request' });
  const comments = db.prepare('SELECT c.*, u.username, u.email, u.avatar_url FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.type = ? AND c.target_id = ? ORDER BY c.created_at ASC').all(type, targetId);
  res.json({ comments });
}
