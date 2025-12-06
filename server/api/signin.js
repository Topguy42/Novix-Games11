import bcrypt from 'bcrypt';
import db from '../db.js';

export async function signinHandler(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = db.prepare('SELECT id, email, password_hash, username, bio, avatar_url, email_verified, ip FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.email_verified) {
      return res.status(401).json({ error: 'Please verify your email before logging in. Check your inbox for the verification link.' });
    }

    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || null;
    if (ip && typeof ip === 'string' && ip.includes(',')) ip = ip.split(',')[0].trim();
    if (ip && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
    if (!user.ip) {
      db.prepare('UPDATE users SET ip = ? WHERE id = ?').run(ip, user.id);
    }

    // Set session user data directly without complex callback
    req.session.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      bio: user.bio,
      avatar_url: user.avatar_url
    };

    // Touch the session to ensure it's marked as modified
    req.session.touch();

    console.log(`[SIGNIN] User ${email} logged in, session ID: ${req.sessionID}`);
    
    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        user_metadata: {
          name: user.username,
          bio: user.bio,
          avatar_url: user.avatar_url
        },
        app_metadata: {
          provider: 'email'
        }
      },
      message: 'Signin successful'
    });
  } catch (error) {
    console.error('Signin error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
