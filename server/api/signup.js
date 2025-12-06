import bcrypt from 'bcrypt';
import db from '../db.js';
import { randomUUID } from 'crypto';

export async function signupHandler(req, res) {
  const { email, password, school, age } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = randomUUID();
    const now = Date.now();

    let ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.connection?.remoteAddress || null;
    if (ip && typeof ip === 'string' && ip.includes(',')) ip = ip.split(',')[0].trim();
    if (ip && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');

    const isFirstUser = db.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0;
    const isAdmin = isFirstUser || email === process.env.ADMIN_EMAIL;

    db.prepare(`
      INSERT INTO users (id, email, password_hash, created_at, updated_at, is_admin, email_verified, school, age, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, email, passwordHash, now, now, isAdmin ? 1 : 0, 1, school || null, age || null, ip);

    // Auto-login the new user
    req.session.user = {
      id: userId,
      email: email,
      username: null,
      bio: null,
      avatar_url: null
    };

    req.session.touch();

    console.log(`[SIGNUP] User ${email} created, session ID: ${req.sessionID}`);
    
    return res.status(201).json({
      user: {
        id: userId,
        email: email,
        user_metadata: {
          name: null,
          bio: null,
          avatar_url: null
        },
        app_metadata: {
          provider: 'email',
          is_admin: isAdmin ? 1 : 0,
          role: isAdmin ? 'Owner' : 'User'
        }
      },
      message: 'Account created successfully!'
    });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
