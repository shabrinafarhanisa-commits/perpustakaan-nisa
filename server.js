const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'app.db');
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'dev-secret-change-me';
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!ADMIN_USER || !ADMIN_PASSWORD) {
  console.error('ADMIN_USER and ADMIN_PASSWORD env vars are required.');
  process.exit(1);
}

// --- novel index, loaded once, used to validate slug/chapter on every write ---
const novelIndex = new Map();
try {
  const idx = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'data', 'index.json'), 'utf8'));
  for (const n of idx) novelIndex.set(n.slug, { title: n.title, chapterCount: n.chapterCount });
} catch (err) {
  console.error('Failed to load data/index.json for slug validation:', err.message);
  process.exit(1);
}

function isValidSlugChapter(slug, chapter) {
  const n = novelIndex.get(slug);
  return !!n && Number.isInteger(chapter) && chapter >= 1 && chapter <= n.chapterCount;
}

// --- database ---
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS comments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    novel_slug  TEXT NOT NULL,
    chapter_num INTEGER NOT NULL,
    name        TEXT NOT NULL,
    body        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    ip_hash     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_comments_lookup ON comments(novel_slug, chapter_num, status);

  CREATE TABLE IF NOT EXISTS likes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    novel_slug  TEXT NOT NULL,
    chapter_num INTEGER NOT NULL,
    fingerprint TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(novel_slug, chapter_num, fingerprint)
  );
`);

const stmts = {
  approvedComments: db.prepare(
    `SELECT id, name, body, created_at FROM comments
     WHERE novel_slug = ? AND chapter_num = ? AND status = 'approved'
     ORDER BY created_at ASC LIMIT 500`
  ),
  insertComment: db.prepare(
    `INSERT INTO comments (novel_slug, chapter_num, name, body, ip_hash) VALUES (?, ?, ?, ?, ?)`
  ),
  pendingComments: db.prepare(
    `SELECT id, novel_slug, chapter_num, name, body, created_at FROM comments
     WHERE status = 'pending' ORDER BY created_at ASC`
  ),
  recentApproved: db.prepare(
    `SELECT id, novel_slug, chapter_num, name, body, created_at FROM comments
     WHERE status = 'approved' ORDER BY created_at DESC LIMIT 50`
  ),
  approveComment: db.prepare(`UPDATE comments SET status = 'approved' WHERE id = ?`),
  deleteComment: db.prepare(`DELETE FROM comments WHERE id = ?`),
  likeCount: db.prepare(
    `SELECT COUNT(*) AS c FROM likes WHERE novel_slug = ? AND chapter_num = ?`
  ),
  likeExists: db.prepare(
    `SELECT 1 FROM likes WHERE novel_slug = ? AND chapter_num = ? AND fingerprint = ?`
  ),
  insertLike: db.prepare(
    `INSERT OR IGNORE INTO likes (novel_slug, chapter_num, fingerprint) VALUES (?, ?, ?)`
  ),
};

function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip) + COOKIE_SECRET).digest('hex');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// --- app ---
const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser(COOKIE_SECRET));

// ===== public API =====

app.get('/api/comments', (req, res) => {
  const slug = String(req.query.slug || '');
  const chapter = parseInt(req.query.chapter, 10);
  if (!isValidSlugChapter(slug, chapter)) return res.status(400).json({ error: 'invalid slug/chapter' });
  res.json(stmts.approvedComments.all(slug, chapter));
});

const commentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/api/comments', commentLimiter, (req, res) => {
  const { slug, chapter, name, body, hp } = req.body || {};
  const chapterNum = parseInt(chapter, 10);
  if (!isValidSlugChapter(slug, chapterNum)) return res.status(400).json({ error: 'invalid slug/chapter' });

  const cleanName = String(name || '').trim();
  const cleanBody = String(body || '').trim();
  if (!cleanName || cleanName.length > 60) return res.status(400).json({ error: 'invalid name' });
  if (!cleanBody || cleanBody.length > 2000) return res.status(400).json({ error: 'invalid body' });

  // honeypot: bots fill hidden fields. Pretend success, don't store.
  if (hp) return res.status(201).json({ status: 'pending' });

  stmts.insertComment.run(slug, chapterNum, cleanName, cleanBody, hashIp(req.ip));
  res.status(201).json({ status: 'pending' });
});

app.get('/api/likes', (req, res) => {
  const slug = String(req.query.slug || '');
  const chapter = parseInt(req.query.chapter, 10);
  if (!isValidSlugChapter(slug, chapter)) return res.status(400).json({ error: 'invalid slug/chapter' });
  const count = stmts.likeCount.get(slug, chapter).c;
  const fp = req.signedCookies.nisa_fp;
  const liked = !!(fp && stmts.likeExists.get(slug, chapter, fp));
  res.json({ count, liked });
});

app.post('/api/likes', (req, res) => {
  const { slug, chapter } = req.body || {};
  const chapterNum = parseInt(chapter, 10);
  if (!isValidSlugChapter(slug, chapterNum)) return res.status(400).json({ error: 'invalid slug/chapter' });

  let fp = req.signedCookies.nisa_fp;
  if (!fp) {
    fp = crypto.randomUUID();
    res.cookie('nisa_fp', fp, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      signed: true,
      maxAge: 5 * 365 * 24 * 60 * 60 * 1000,
    });
  }
  stmts.insertLike.run(slug, chapterNum, fp);
  const count = stmts.likeCount.get(slug, chapterNum).c;
  res.json({ count, liked: true });
});

// ===== admin (moderation) =====

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    const user = sep === -1 ? decoded : decoded.slice(0, sep);
    const pass = sep === -1 ? '' : decoded.slice(sep + 1);
    if (safeEqual(user, ADMIN_USER) && safeEqual(pass, ADMIN_PASSWORD)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="perpustakaan-nisa admin"');
  res.status(401).send('Authentication required');
}

function renderCommentRow(c, includeApproveReject) {
  const title = novelIndex.get(c.novel_slug)?.title || c.novel_slug;
  const actions = includeApproveReject
    ? `<form method="post" action="/admin/comments/${c.id}/approve" style="display:inline">
         <button type="submit">Approve</button>
       </form>
       <form method="post" action="/admin/comments/${c.id}/reject" style="display:inline">
         <button type="submit">Reject</button>
       </form>`
    : `<form method="post" action="/admin/comments/${c.id}/reject" style="display:inline">
         <button type="submit">Delete</button>
       </form>`;
  return `<li style="margin-bottom:16px; padding:12px; border:1px solid #ccc;">
    <div><strong>${escapeHtml(title)}</strong> — chapter ${c.chapter_num} — <em>${escapeHtml(c.created_at)}</em></div>
    <div><strong>${escapeHtml(c.name)}</strong></div>
    <div style="white-space:pre-wrap;">${escapeHtml(c.body)}</div>
    <div style="margin-top:8px;">${actions}</div>
  </li>`;
}

app.get('/admin', requireAdmin, (req, res) => {
  const pending = stmts.pendingComments.all();
  const approved = stmts.recentApproved.all();
  res.send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Moderasi Komentar — Perpustakaan Nisa</title></head>
<body style="font-family:sans-serif; max-width:720px; margin:32px auto; padding:0 16px;">
  <h1>Menunggu Persetujuan (${pending.length})</h1>
  <ul style="list-style:none; padding:0;">
    ${pending.map((c) => renderCommentRow(c, true)).join('') || '<li>Tidak ada komentar menunggu.</li>'}
  </ul>
  <h1>Baru Disetujui</h1>
  <ul style="list-style:none; padding:0;">
    ${approved.map((c) => renderCommentRow(c, false)).join('') || '<li>Belum ada.</li>'}
  </ul>
</body></html>`);
});

app.post('/admin/comments/:id/approve', requireAdmin, (req, res) => {
  stmts.approveComment.run(req.params.id);
  res.redirect('/admin');
});

app.post('/admin/comments/:id/reject', requireAdmin, (req, res) => {
  stmts.deleteComment.run(req.params.id);
  res.redirect('/admin');
});

// ===== static frontend =====
app.use(express.static(PUBLIC_DIR));

app.listen(PORT, () => console.log(`perpustakaan-nisa listening on :${PORT}`));
