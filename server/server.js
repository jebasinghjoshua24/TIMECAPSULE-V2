const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const xss = require('xss');

const app = express();
const PORT = 3000;

if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not set');
    process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors({
    origin: ['http://localhost:3000', 'https://magical-granita-e9f978.netlify.app']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later' }
});
app.use(limiter);
app.use(morgan('dev'));

const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: 'Too many login/signup attempts, please try again later' }
});

const db = new Database(path.join(__dirname, 'timecapsule.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Add metadata column if it doesn't exist (for persisting accessAttempts and reactions)
try { db.exec('ALTER TABLE capsules ADD COLUMN metadata TEXT DEFAULT \'{}\''); } catch (e) {}

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        isAdmin INTEGER DEFAULT 0,
        avatar TEXT,
        createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deleted_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        username TEXT NOT NULL,
        reason TEXT,
        deletedBy TEXT,
        capsuleCount INTEGER DEFAULT 0,
        accountAge TEXT,
        deletedAt TEXT DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS capsules (
        id TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL,
        ownerUsername TEXT,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'personal',
        content TEXT,
        mood TEXT DEFAULT 'happy',
        unlockDate TEXT,
        isLocked INTEGER DEFAULT 0,
        isFavorite INTEGER DEFAULT 0,
        isArchived INTEGER DEFAULT 0,
        isPinned INTEGER DEFAULT 0,
        isOpened INTEGER DEFAULT 0,
        tags TEXT DEFAULT '[]',
        collaborationType TEXT DEFAULT 'private',
        isCollaborative INTEGER DEFAULT 0,
        groupId TEXT,
        allowedUsers TEXT DEFAULT '[]',
        version INTEGER DEFAULT 1,
        editCount INTEGER DEFAULT 0,
        editLocked INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (ownerId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS deleted_capsules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        capsuleId TEXT,
        capsuleTitle TEXT,
        ownerId TEXT,
        ownerUsername TEXT,
        deletedBy TEXT,
        reason TEXT,
        deletedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        reason TEXT,
        bannedBy TEXT,
        expiresAt TEXT,
        permanent INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId1 TEXT NOT NULL,
        userId2 TEXT NOT NULL,
        status TEXT,
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (userId1) REFERENCES users(id),
        FOREIGN KEY (userId2) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        type TEXT NOT NULL,
        message TEXT DEFAULT 'No message',
        read INTEGER DEFAULT 0,
        timestamp TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT,
        type TEXT NOT NULL,
        details TEXT NOT NULL,
        timestamp TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (userId) REFERENCES users(id)
    );
`);

function safeJsonParse(str) {
    try { return JSON.parse(str); } catch { return str; }
}

function sanitize(str) {
    if (!str) return '';
    return xss(str);
}

function parseCapsule(c) {
    if (!c) return c;
    const metadata = safeJsonParse(c.metadata) || {};
    return {
        ...c,
        message: c.content || '',
        tags: safeJsonParse(c.tags),
        allowedUsers: safeJsonParse(c.allowedUsers),
        accessAttempts: metadata.accessAttempts || [],
        reactions: metadata.reactions || { '❤️': 0, '😂': 0, '😮': 0, '😢': 0, '👏': 0 },
        collaborators: [],
        collaboratorRequests: [],
        contributions: [],
        comments: []
    };
}

console.log('Database ready');

// ====== DEBUG LOGGING ======
function debug(...args) {
    console.log(`[${new Date().toISOString()}]`, ...args);
}
// ============================

function authenticationToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if(!token) {
        debug('AUTH FAIL - No token provided');
        return res.status(401).json({ error: 'No token provided' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if(err) {
            debug('AUTH FAIL - Invalid token:', err.message);
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        debug('AUTH OK - User:', user.id, user.username);
        next();
    });
}

app.post('/api/signup', authLimiter, async (req, res) => {
    const { username, password, email } = req.body;
    debug('POST /api/signup - username:', username);

    if(!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    if(username.length < 3 || password.length < 6) {
        debug('SIGNUP FAIL - validation:', username.length, password.length);
        return res.status(400).json({ error: 'Username must be 3 characters long and password must be 6 characters long.' });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if(existing) {
        debug('SIGNUP FAIL - username taken:', username);
        return res.status(409).json({ error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 8);
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    db.prepare('INSERT INTO users (id, username, password, email) VALUES (?, ?, ?, ?)').run(id, sanitize(username), hashedPassword, email || null);
    debug('SIGNUP OK - user created:', id, username);

    const token = jwt.sign({ id, username, isAdmin: 0 }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ token, user: { id, username, email: email || null, isAdmin: 0 } });
});

app.post('/api/login', authLimiter, async (req, res) => {
    const { username, password } = req.body;
    debug('POST /api/login - username:', username);

    if(!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if(!user) {
        debug('LOGIN FAIL - user not found:', username);
        return res.status(401).json({ error: 'Invalid username or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if(!valid) {
        debug('LOGIN FAIL - wrong password:', username);
        return res.status(401).json({ error: 'Invalid username or password' });
    }

    const ban = db.prepare(`
        SELECT * FROM bans WHERE userId = ? AND (permanent = 1 OR expiresAt > datetime('now'))
        ORDER BY createdAt DESC LIMIT 1
    `).get(user.id);

    if(ban) {
        debug('LOGIN FAIL - banned:', username, 'reason:', ban.reason);
        return res.status(403).json({
            error: 'Account banned',
            reason: ban.reason,
            permanent: !!ban.permanent,
            expiresAt: ban.expiresAt
        });
    }

    debug('LOGIN OK - user:', user.id, user.username, 'isAdmin:', user.isAdmin);
    const token = jwt.sign(
        { id: user.id, username: user.username, isAdmin: user.isAdmin },
        JWT_SECRET,
        { expiresIn: '7d' }
    );

    res.json({
        token,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            isAdmin: user.isAdmin,
            avatar: user.avatar
        }
    });
});

app.get('/api/me', authenticationToken, (req, res) => {
    debug('GET /api/me - user:', req.user.id, req.user.username);
    const user = db.prepare('SELECT id, username, email, isAdmin, avatar, createdAt FROM users WHERE id = ?').get(req.user.id);
    if(!user) return res.status(404).json({ error: 'User not found '});
    res.json({ user });
});

app.get('/api/capsules', authenticationToken, (req, res) => {
    debug('GET /api/capsules - user:', req.user.id, req.user.username);
    const capsules = db.prepare('SELECT * FROM capsules WHERE ownerId = ? ORDER BY createdAt DESC').all(req.user.id);
    debug('CAPSULES FOUND:', capsules.length);
    const parsed = capsules.map(c => parseCapsule(c));
    res.json({ capsules: parsed });
});

app.post('/api/capsules', authenticationToken, (req, res) => {
    const { title, description, category, content, message, mood, unlockDate, isLocked, isFavorite, tags, collaborationType, isCollaborative, groupId, allowedUsers } = req.body;
    const finalContent = content || message || '';

    if(!title) {
        debug('CREATE CAPSULE FAIL - no title');
        return res.status(400).json({ error: 'Title is required' });
    }

    if (unlockDate && new Date(unlockDate) <= Date.now()) {
        return res.status(400).json({ error: 'Unlock date must be in the future' });
    }

    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    debug('CREATE CAPSULE - id:', id, 'title:', title, 'owner:', req.user.id, req.user.username);

    const metadata = JSON.stringify({ accessAttempts: [], reactions: { '❤️': 0, '😂': 0, '😮': 0, '😢': 0, '👏': 0 } });

    db.prepare(`
        INSERT INTO capsules (id, ownerId, ownerUsername, title, description, category, content, mood, unlockDate, isLocked, isFavorite, isArchived, isPinned, isOpened, tags, collaborationType, isCollaborative, groupId, allowedUsers, version, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(id, req.user.id, req.user.username, sanitize(title), sanitize(description || ''), category || 'personal', sanitize(finalContent), mood || 'happy', unlockDate || null, isLocked ? 1 : 0, isFavorite ? 1 : 0,  0, JSON.stringify(tags || []), collaborationType || 'private', isCollaborative ? 1 : 0, groupId || null, JSON.stringify(allowedUsers || []), metadata);

    const capsule = parseCapsule(db.prepare('SELECT * FROM capsules WHERE id = ?').get(id));
    debug('CAPSULE CREATED:', id, '- returning to client');
    res.status(201).json({ capsule });
});

app.get('/api/ban/status/:userId', (req, res) => {
    const ban = db.prepare(`
        SELECT * FROM bans WHERE userId = ? AND (permanent = 1 OR expiresAt > datetime('now'))
        ORDER BY createdAt DESC LIMIT 1
    `).get(req.params.userId);

    if(!ban) return res.json({ banned: false });

    res.json({
        banned: true,
        reason: ban.reason,
        permanent: !!ban.permanent,
        expiresAt: ban.expiresAt,
        bannedBy: ban.bannedBy,
        createdAt: ban.createdAt
    });
});

app.post('/api/ban', authenticationToken, (req, res) => {
    if(!req.user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId, reason, duration } = req.body;
    if(!userId) return res.status(400).json({ error: 'userId is required' });

    const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if(!userExists) return res.status(404).json({ error: 'User not found' });

    if(!duration) return res.status(400).json({ error: 'duration is required' });
    if (duration!== 'permanent' && (typeof duration !== 'number' || duration <=0)) {
        return res.status(400).json({ error: 'duration must be a positive number or permanent' });
    }

    const expiresAt = duration === 'permanent' ? null : new Date(Date.now() + duration * 60000).toISOString();

    db.prepare(`
        INSERT INTO bans (userId, reason, bannedBy, expiresAt, permanent)
        VALUES (?, ?, ?, ?, ?)
    `).run(userId, reason || 'No reason provided', req.user.username, expiresAt, duration === 'permanent' ? 1 : 0);

    res.json({ success: true, message: 'User banned'});
});

app.post('/api/unban', authenticationToken, (req, res) => {
    if(!req.user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId } = req.body;
    if(!userId) return res.status(400).json({ error: 'userId is required' });

    db.prepare('DELETE FROM bans WHERE userId = ?').run(userId);
    res.json({ success: true, message: 'User unbanned' });
});

app.put('/api/capsules/:id', authenticationToken, (req, res) => {
    const capsule = db.prepare('SELECT  * FROM capsules WHERE id = ?').get(req.params.id);
    if(!capsule) return res.status(404).json({ error: 'Capsule not found' });
    if(capsule.editLocked) return res.status(403).json({ error: 'Edit limit reached' });

    if(capsule.ownerId !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const { title, description, category, content, unlockDate, isLocked } = req.body;
    debug('PUT /api/capsules/:id - capsule:', req.params.id, 'title:', title);
    
    if(!title) return res.status(400).json({ error: 'Title is needed' });

    if (unlockDate && new Date(unlockDate) <= Date.now()) {
        return res.status(400).json({ error: 'Unlock date must be in the future' });
    }

    db.prepare(`
        UPDATE capsules SET title = ?, description = ?, category = ?, content = ?, unlockDate = ?, isLocked = ?, editCount = editCount + 1, editLocked = CASE WHEN editCount + 1 >= 3 THEN 1 ELSE editLocked END
        WHERE id = ?
    `).run(sanitize(title), sanitize(description || ''), category || 'personal', sanitize(content || ''), unlockDate || null, isLocked ? 1 : 0, req.params.id);

    const updated = parseCapsule(db.prepare('SELECT * FROM capsules WHERE id = ?').get(req.params.id));
    res.json({ capsule: updated });
});

app.delete('/api/capsules/:id', authenticationToken, (req, res) => {
    const capsule = db.prepare('SELECT * FROM capsules WHERE id = ?').get(req.params.id);
    if(!capsule) return res.status(404).json({ error: 'Capsule not found' });
    
    debug('DELETE /api/capsules/:id - capsule:', req.params.id, 'owner:', capsule.ownerId);

    if(capsule.ownerId !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    db.prepare(`DELETE FROM capsules WHERE id = ?`).run(req.params.id);
    debug('CAPSULE DELETED:', req.params.id);
    res.json({ success: true, message: 'Capsule deleted' });
});

app.patch('/api/capsules/:id/archive', authenticationToken, (req, res) => {
    const capsule = db.prepare('SELECT * FROM capsules WHERE id = ?').get(req.params.id);
    if(!capsule) return res.status(404).json({ error: 'Capsule not found' });
    debug('PATCH /api/capsules/:id/archive - capsule:', req.params.id);

    if(capsule.ownerId !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    db.prepare(`UPDATE capsules SET isArchived = ? WHERE id = ?`).run(capsule.isArchived ? 0 : 1, req.params.id);
    const updated = parseCapsule(db.prepare('SELECT * FROM capsules WHERE id = ?').get(req.params.id));
    res.json({ capsule: updated });
});

app.patch('/api/capsules/:id/favorite', authenticationToken, (req, res) => {
    const capsule = db.prepare(`SELECT * FROM capsules WHERE id = ?`).get(req.params.id);
    if(!capsule) return res.status(404).json({ error: 'Capsule not found' });
    debug('PATCH /api/capsules/:id/favorite - capsule:', req.params.id);

    if(capsule.ownerId !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    db.prepare('UPDATE capsules SET isFavorite = ? WHERE id = ?').run(capsule.isFavorite ? 0 : 1, req.params.id);
    const updated = parseCapsule(db.prepare('SELECT * FROM capsules WHERE id = ?').get(req.params.id));
    res.json({ capsule: updated });
});

app.patch('/api/capsules/:id/pin', authenticationToken, (req, res) => {
    const capsule = db.prepare(`SELECT * FROM capsules WHERE id = ?`).get(req.params.id);
    if(!capsule) return res.status(404).json({ error: 'Capsule not found' });
    debug('PATCH /api/capsules/:id/pin - capsule:', req.params.id);

    if(capsule.ownerId !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    db.prepare('UPDATE capsules SET isPinned = ? WHERE id = ?').run(capsule.isPinned ? 0 : 1, req.params.id);
    const updated = parseCapsule(db.prepare('SELECT * FROM capsules WHERE id = ?').get(req.params.id));
    res.json({ capsule: updated });
});

app.post('/api/capsules/:id/open', authenticationToken, (req, res) => {
    const capsule = db.prepare(`SELECT * FROM capsules WHERE id = ?`).get(req.params.id);
    if(!capsule) return res.status(404).json({ error: 'Capsule not found' });
    debug('POST /api/capsules/:id/open - capsule:', req.params.id);

    const allowedUsers = safeJsonParse(capsule.allowedUsers) || [];
    const isOwner = capsule.ownerId === req.user.id;
    const isCollaborator = allowedUsers.includes(req.user.id);

    if (!isOwner && !isCollaborator) return res.status(403).json({ error: 'Access denied' });

    db.prepare('UPDATE capsules SET isOpened = 1 WHERE id = ?').run(req.params.id);

    const metadata = safeJsonParse(capsule.metadata) || {};
    const attempts = metadata.accessAttempts || [];
    attempts.push({ userId: req.user.id, timestamp: new Date().toISOString(), success: true });
    metadata.accessAttempts = attempts;
    db.prepare('UPDATE capsules SET metadata = ? WHERE id = ?').run(JSON.stringify(metadata), req.params.id);

    const updated = parseCapsule(db.prepare('SELECT * FROM capsules WHERE id = ?').get(req.params.id));
    res.json({ capsule: updated })
});

app.get('/api/capsules/opened', authenticationToken, (req, res) => {
    debug('GET /api/capsules/opened - user:', req.user.id);
    const capsules = db.prepare('SELECT * FROM capsules WHERE ownerId = ? AND isOpened = ? ORDER BY createdAt DESC').all(req.user.id, 1);
    debug('OPENED CAPSULES FOUND:', capsules.length);
    const parsed = capsules.map(c => parseCapsule(c));
    res.json({ capsules: parsed });
});

app.get('/api/capsules/shared', authenticationToken, (req, res) => {
    debug('GET /api/capsules/shared - user:', req.user.id);
    const shared = db.prepare("SELECT * FROM capsules WHERE ownerId != ? AND (collaborationType = 'public' OR (collaborationType = 'friends' AND ownerId IN (SELECT CASE WHEN userId1 = ? THEN userId2 WHEN userId2 = ? THEN userId1 END FROM friends WHERE (userId1 = ? OR userId2 = ?) AND status = 'accepted')) OR allowedUsers LIKE ?) ORDER BY createdAt DESC").all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, '%' + req.user.id + '%');
    debug('SHARED CAPSULES FOUND:', shared.length);
    const parsed = shared.map(c => parseCapsule(c));
    res.json({ capsules: parsed });
});

app.get('/api/users', authenticationToken, (req, res) => {
    debug('GET /api/users');
    const users = db.prepare('SELECT id, username, avatar, createdAt FROM users').all();
    debug('USERS FOUND:', users.length);
    return res.status(200).json({ users: users });
});

app.get('/api/users/search', authenticationToken, (req, res) => {
    const q = req.query.q;
    debug('GET /api/users/search - query:', q);
    if(!q || q.length < 2) {
        return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const users = db.prepare(
        "SELECT id, username, avatar FROM users WHERE username LIKE ? LIMIT 10"
    ).all('%' + q + '%');

    res.json({ users });
});

app.delete('/api/users/account', authenticationToken, (req, res) => {
    const userId = req.user.id;
    debug('DELETE /api/users/account - user:', userId);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const capsuleCount = db.prepare('SELECT COUNT(*) AS count FROM capsules WHERE ownerId = ?').get(userId).count;
    const accountAge = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)) + ' days';

    db.prepare('INSERT INTO deleted_users (userId, username, reason, deletedBy, capsuleCount, accountAge) VALUES (?, ?, ?, ?, ?, ?)').run(userId, user.username, 'User self-deleted', 'user', capsuleCount, accountAge);

    db.prepare('DELETE FROM capsules WHERE ownerId = ?').run(userId);
    db.prepare('DELETE FROM friends WHERE userId1 = ? OR userId2 = ?').run(userId, userId);
    db.prepare('DELETE FROM notifications WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM activity_log WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM bans WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.json({ success: true, message: 'Account deleted successfully' });
});

app.post('/api/friends/request', authenticationToken, (req, res) => {
    const { userId } = req.body;
    debug('POST /api/friends/request - from:', req.user.id, 'to:', userId);
    if(!userId) return res.status(400).json({ error: 'userId is required' });

    if(userId === req.user.id) return res.status(400).json({ error: 'Cannot send request to yourself' });

    const existing = db.prepare(`
        SELECT id FROM friends
        WHERE (userId1 = ? AND userId2 = ?) OR (userId1 = ? AND userId2 = ?)
    `).get(req.user.id, userId, userId, req.user.id);

    if(existing) return res.status(409).json({ error: 'Friend request already exists' });

    const targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    if(!targetUser) return res.status(404).json({ error: 'User not found' });

    db.prepare('INSERT INTO friends (userId1, userId2, status) VALUES (?, ?, ?)').run(req.user.id, userId, 'pending');
    debug('FRIEND REQUEST SENT');

    res.status(201).json({ success: true, message: 'Friend request sent' });
});

app.post('/api/friends/accept', authenticationToken, (req, res) => {
    const { userId } = req.body;
    debug('POST /api/friends/accept - current:', req.user.id, 'sender:', userId);
    if(!userId) return res.status(400).json({ error: 'User Id required' });

    if(userId === req.user.id) return res.status(400).json({ error: 'Cannot accept friend request from yourself' });

    const existing = db.prepare(`
        SELECT id FROM friends
        WHERE userId1 = ? AND userId2 = ? AND status = 'pending'
    `).get(userId, req.user.id);

    if(!existing) return res.status(409).json({ error: 'No pending request' });

    const targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    if(!targetUser) return res.status(404).json({ error: 'User not found' });

    db.prepare('UPDATE friends SET status = ? WHERE id = ?').run('accepted', existing.id);
    debug('FRIEND REQUEST ACCEPTED');

    res.status(201).json({ success: true, message: 'Friend request accepted' });
});

app.post('/api/friends/decline', authenticationToken, (req, res) => {
    const { userId } = req.body;
    debug('POST /api/friends/decline - current:', req.user.id, 'other:', userId);
    if(!userId) return res.status(400).json({ error: 'User Id required' });

    if(userId === req.user.id) return res.status(400).json({ error: 'Cannot decline friend request to yourself' });

    const existing = db.prepare(`
        SELECT id FROM friends
        WHERE ((userId1 = ? AND userId2 = ?) OR (userId1 = ? AND userId2 = ?)) AND status = 'pending'
    `).get(userId, req.user.id, req.user.id, userId);

    if(!existing) return res.status(409).json({ error: 'No pending request' });

    const targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    if(!targetUser) return res.status(404).json({ error: 'User not found' });

    db.prepare('DELETE FROM friends WHERE id = ?').run(existing.id);
    debug('FRIEND REQUEST DECLINED');

    res.status(201).json({ success: true, message: 'Friend request declined' });
});

app.post('/api/friends/remove', authenticationToken, (req, res) => {
    const { userId } = req.body;
    debug('POST /api/friends/remove - current:', req.user.id, 'other:', userId);
    if(!userId) return res.status(400).json({ error: 'userId is required' });

    if(userId === req.user.id) return res.status(400).json({ error: 'Cannot delete friend to yourself' });

    const existing = db.prepare(`
        SELECT id FROM friends
        WHERE ((userId1 = ? AND userId2 = ?) OR (userId1 = ? AND userId2 = ?)) AND status = ?
    `).get(req.user.id, userId, userId, req.user.id, 'accepted');

    if(!existing) return res.status(409).json({ error: 'Not a friend' });

    const targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    if(!targetUser) return res.status(404).json({ error: 'User not found' });

    db.prepare('DELETE FROM friends WHERE id = ?').run(existing.id);
    debug('FRIEND REMOVED');

    res.status(201).json({ success: true, message: 'Friend successfully removed' });
});

app.get('/api/friends/list', authenticationToken, (req, res) => {
    debug('GET /api/friends/list - user:', req.user.id);
    const rows = db.prepare('SELECT * FROM friends WHERE (userId1 = ? OR userId2 = ?)').all(req.user.id, req.user.id);
    debug('FRIEND ROWS FOUND:', rows.length);
    const result = rows.map(f => {
        const friendId = f.userId1 === req.user.id ? f.userId2 : f.userId1;
        const direction = f.userId1 === req.user.id ? 'sent' : 'received';
        const user = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(friendId);
        return { ...user, direction: direction, status: f.status, since: f.createdAt };
    });

    return res.json({ friends: result });
});

app.get('/api/notifications', authenticationToken, (req, res) => {
    let notifications = db.prepare('SELECT * FROM notifications WHERE userId = ? ORDER BY timestamp DESC').all(req.user.id);
    if(req.query.filter === 'unread') {
        notifications = db.prepare('SELECT * FROM notifications WHERE (userId = ? AND read = ?) ORDER BY timestamp DESC').all(req.user.id, 0);
    }
    else if(req.query.filter === 'read') {
        notifications = db.prepare('SELECT * FROM notifications WHERE (userId = ? AND read = ?) ORDER BY timestamp DESC').all(req.user.id, 1);
    }
    res.json({ notifications: notifications });
});

app.patch('/api/notifications/:id/read', authenticationToken, (req, res) => {
    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
    if(!notification) return res.status(404).json({ error: 'Notification not found' });

    if(notification.userId !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    db.prepare(`UPDATE notifications SET read = ? WHERE id = ?`).run( 1, req.params.id);
    const updated = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
    res.json({ notification: updated });
});

app.get('/api/activity', authenticationToken, (req, res) => {
    const isAdmin = req.user.isAdmin;
    let activity = [];
    if(!isAdmin) {
        activity = db.prepare('SELECT * FROM activity_log WHERE userId = ? ORDER BY timestamp DESC').all(req.user.id);
    }

    else {
        activity = db.prepare('SELECT * FROM activity_log ORDER BY timestamp DESC').all();
    }

    res.json({ activity: activity });
});

app.post('/api/activity', authenticationToken, (req, res) => {
    const { userId, type, details } = req.body;
    if(!type || !details) return res.status(400).json({ error: 'Type and Details are required' });

    const entry = db.prepare('INSERT INTO activity_log (userId, type, details) VALUES (?, ?, ?)').run(userId || null, type, details);

    res.status(201).json({ entry: entry });
});

app.get('/api/admin/users', authenticationToken, (req, res) => {
    let isAdmin = req.user.isAdmin;
    if(!isAdmin) return res.status(403).json({ error: 'Access denied' });

    const users = db.prepare('SELECT id, username, email, isAdmin, avatar, createdAt FROM users ORDER BY createdAt DESC').all();

    res.json({ users: users });
});

app.delete('/api/admin/users/:id', authenticationToken, (req, res) => {
    const userId = req.params.id;
    const { reason } = req.body;
    const isAdmin = req.user.isAdmin;
    if(!isAdmin) return res.status(403).json({ error: 'Access denied' });

    if(!userId) return res.status(400).json({ error: 'UserId is required' });

    const existing = db.prepare('SELECT id, username, createdAt FROM users WHERE id = ?').get(userId);

    if(!existing) return res.status(404).json({ error: 'User not found' });

    const capsules = db.prepare('SELECT id FROM capsules WHERE ownerId = ?').all(userId);
    const capsuleCount = capsules.length;

    db.prepare('DELETE FROM activity_log WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM bans WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM capsules WHERE ownerId = ?' ).run(userId);
    db.prepare('DELETE FROM notifications WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM friends WHERE userId1 = ? OR userId2 = ?').run(userId, userId);

    const accountAge = Math.floor((Date.now() - new Date(existing.createdAt)) / (1000 * 60 * 60 * 24)) + ' days';

    db.prepare('INSERT INTO deleted_users (userId, username, reason, deletedBy, capsuleCount, accountAge) VALUES(?, ?, ?, ?, ?, ?)').run(userId, existing.username, reason, req.user.id, capsuleCount, accountAge);

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    return res.status(201).json({ success: true, message: 'User removed successfully' });

});

app.delete('/api/admin/capsules/:id', authenticationToken, (req, res) => {
    const capsuleId = req.params.id;
    const { reason } = req.body;
    const isAdmin = req.user.isAdmin;
    if(!isAdmin) return res.status(403).json({ error: 'Access denied' });

    if(!capsuleId) return res.status(400).json({ error: 'Capsule ID is required' });

    const existing = db.prepare('SELECT ownerId, ownerUsername, createdAt, title FROM capsules WHERE id = ?').get(capsuleId);

    if(!existing) return res.status(404).json({ error: 'Capsule not found' });

    db.prepare('DELETE FROM capsules WHERE id = ?' ).run(capsuleId);

    db.prepare('INSERT INTO deleted_capsules (capsuleId, capsuleTitle, ownerId, ownerUsername, deletedBy, reason) VALUES (?, ?, ?, ?, ?, ?)').run(capsuleId, existing.title, existing.ownerId, existing.ownerUsername, req.user.username, reason);

    db.prepare('INSERT INTO notifications (userId, type, message) VALUES (?, ?, ?)').run(existing.ownerId, 'deleted_capsule', `Capsule has been deleted because ${reason}`);

    db.prepare('INSERT INTO activity_log (userId, type, details) VALUES (?, ?, ?)').run(existing.ownerId, 'deleted_capsule', `Capsule ${existing.title} has been deleted due to ${reason}`);

    return res.status(201).json({ success: true, message: 'Capsule deleted successfully' });

});

app.get('/api/admin/stats', authenticationToken, (req, res) => {
    const isAdmin = req.user.isAdmin;
    if(!isAdmin) return res.status(403).json({ error: 'Access denied' });
    const totalUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
    const totalCapsules = db.prepare('SELECT COUNT(*) AS count FROM capsules').get().count;
    const lockedCapsules = db.prepare('SELECT COUNT(*) AS count FROM capsules WHERE isLocked = ?').get(1).count;
    const deletedUsers = db.prepare('SELECT COUNT(*) AS count FROM deleted_users').get().count;

    return res.status(200).json({ stats: { totalUsers, totalCapsules, lockedCapsules, deletedUsersCount: deletedUsers } });
});

app.get('/api/admin/deleted-users', authenticationToken, (req, res) => {
    const isAdmin = req.user.isAdmin;
    if(!isAdmin) return res.status(403).json({ error: 'Access denied' });
    const deletedUsers = db.prepare('SELECT * FROM deleted_users ORDER BY deletedAt DESC').all();

    return res.status(200).json({ deleted_users: deletedUsers });
});

app.get('/api/admin/capsules', authenticationToken, (req, res) => {
    const isAdmin = req.user.isAdmin;
    if(!isAdmin) return res.status(403).json({ error: 'Access denied' });
    const capsules_raw = db.prepare('SELECT * FROM capsules ORDER BY createdAt DESC').all();
    const capsules = capsules_raw.map(c => ({
        ...c,
        tags: safeJsonParse(c.tags),
        allowedUsers: safeJsonParse(c.allowedUsers)
    }));

    return res.status(200).json({ capsules: capsules });
});

app.get('/api/admin/bans', authenticationToken, (req, res) => {
    const isAdmin = req.user.isAdmin;
    if(!isAdmin) return res.status(403).json({ error: 'Access denied' });
    const bans = db.prepare('SELECT * FROM bans ORDER BY createdAt DESC').all();
    return res.status(200).json({ bans: bans });
});

app.use((err, req, res, next) => {
    debug('ERROR:', err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`The server has started on the port ${PORT}`);
    debug('Server fully initialized, listening on port', PORT);
});