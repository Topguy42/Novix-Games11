import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'users.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    username TEXT,
    bio TEXT,
    avatar_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

try {
  const tableInfo = db.prepare("PRAGMA table_info(users)").all();
  const columnNames = tableInfo.map(col => col.name);
  const hasExistingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count > 0;
  
  if (!columnNames.includes('email_verified')) {
    db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0');
    if (hasExistingUsers) {
      db.exec('UPDATE users SET email_verified = 1');
    }
  }
  if (!columnNames.includes('verification_token')) {
    db.exec('ALTER TABLE users ADD COLUMN verification_token TEXT');
  }
  if (!columnNames.includes('is_admin')) {
    db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
  }
  if (!columnNames.includes('school')) {
    db.exec('ALTER TABLE users ADD COLUMN school TEXT');
  }
  if (!columnNames.includes('age')) {
    db.exec('ALTER TABLE users ADD COLUMN age INTEGER');
  }
  if (!columnNames.includes('ip')) {
    db.exec('ALTER TABLE users ADD COLUMN ip TEXT');
  }
} catch (error) {
  console.error('Migration error:', error);
}

// Migrate feedback table to allow nullable user_id
try {
  const feedbackTableInfo = db.prepare("PRAGMA table_info(feedback)").all();
  const userIdColumn = feedbackTableInfo.find(col => col.name === 'user_id');
  if (userIdColumn && userIdColumn.notnull === 1) {
    console.log('Migrating feedback table to allow nullable user_id...');
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE feedback_new (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT INTO feedback_new SELECT * FROM feedback;
      DROP TABLE feedback;
      ALTER TABLE feedback_new RENAME TO feedback;
      COMMIT;
    `);
    console.log('Feedback table migration completed');
  }
} catch (error) {
  console.error('Feedback table migration error:', error);
}

// Migrate comments table to allow nullable user_id
try {
  const commentsTableInfo = db.prepare("PRAGMA table_info(comments)").all();
  const userIdColumn = commentsTableInfo.find(col => col.name === 'user_id');
  if (userIdColumn && userIdColumn.notnull === 1) {
    console.log('Migrating comments table to allow nullable user_id...');
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE comments_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        user_id TEXT,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT INTO comments_new SELECT * FROM comments;
      DROP TABLE comments;
      ALTER TABLE comments_new RENAME TO comments;
      COMMIT;
    `);
    console.log('Comments table migration completed');
  }
} catch (error) {
  console.error('Comments table migration error:', error);
}

// Migrate likes table to allow nullable user_id
try {
  const likesTableInfo = db.prepare("PRAGMA table_info(likes)").all();
  const userIdColumn = likesTableInfo.find(col => col.name === 'user_id');
  if (userIdColumn && userIdColumn.notnull === 1) {
    console.log('Migrating likes table to allow nullable user_id...');
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE likes_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        user_id TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE(type, target_id, user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT INTO likes_new SELECT * FROM likes;
      DROP TABLE likes;
      ALTER TABLE likes_new RENAME TO likes;
      COMMIT;
    `);
    console.log('Likes table migration completed');
  }
} catch (error) {
  console.error('Likes table migration error:', error);
}

db.exec(`

  CREATE TABLE IF NOT EXISTS changelog (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (author_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    localstorage_data TEXT,
    theme TEXT DEFAULT 'dark',
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    user_id TEXT,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS likes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    user_id TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(type, target_id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
`);

export default db;
