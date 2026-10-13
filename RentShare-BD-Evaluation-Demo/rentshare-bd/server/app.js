import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { openDatabase, publicUser, publicProperty, PROPERTY_SELECT, hashPassword, verifyPassword } from './db.js';
import { seedDatabase } from './seed.js';
import { WEIGHTS, PREFERENCE_OPTIONS, calculateCompatibility, hasCompletePreferences } from './matching.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SESSION_COOKIE = 'rentshare_session';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const IMAGES = ['/images/room-sunlight.png', '/images/room-studio.png'];
class RequestError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new RequestError(message, status); };
const text = (value, label, { min = 0, max = 120 } = {}) => {
  if (typeof value !== 'string') fail(`${label} must be text.`);
  const clean = value.trim();
  if (clean.length < min || clean.length > max) fail(`${label} must be ${min ? `${min}–` : 'at most '}${max} characters.`);
  return clean;
};
const optionalText = (value, label, max = 120) => value === undefined ? '' : text(value, label, { max });
const number = (value, label, { min = 0, max = 1000000, integer = true, query = false } = {}) => {
  if (query && typeof value === 'string' && value.trim() !== '') value = Number(value);
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) fail(`${label} must be ${integer ? 'a whole number' : 'a number'} from ${min} to ${max}.`);
  return value;
};
const choice = (value, label, choices) => { if (!choices.includes(value)) fail(`Choose a valid ${label.toLowerCase()}.`); return value; };
const email = value => {
  const result = text(value, 'Email', { min: 3, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail('Enter a valid email address.');
  return result;
};
const password = value => {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) fail('Password must contain 8–128 characters.');
  return value;
};
const digest = value => createHash('sha256').update(value).digest('hex');
const cookies = req => {
  const parts = (req.headers.cookie || '').split(';').map(part => part.trim().split('='));
  return Object.fromEntries(parts.filter(parts => parts.length >= 2).map(([key, ...value]) => [key, value.join('=')]));
};
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('Availability must be a date in YYYY-MM-DD format.');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('Choose a valid availability date.');
  return value;
};
function validatedPreferences(body) {
  const result = {
    budgetMin: number(body.budgetMin, 'Minimum budget'),
    budgetMax: number(body.budgetMax, 'Maximum budget'),
    location: text(body.location, 'Preferred location', { min: 2, max: 80 }),
  };
  if (result.budgetMax < result.budgetMin) fail('Maximum budget must be at least the minimum budget.');
  for (const [key, values] of Object.entries(PREFERENCE_OPTIONS)) result[key] = choice(body[key], key, values);
  return result;
}

export function createApp({ dbPath = process.env.DB_PATH || path.join(projectRoot, 'data', 'rentshare.sqlite'), seed = process.env.SEED_DEMO !== 'false' } = {}) {
  const db = openDatabase(dbPath);
  if (seed) seedDatabase(db);
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('X-Frame-Options', 'DENY');
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'Cross-site requests are not allowed.' });
      const origin = req.get('origin');
      const expectedOrigin = `${req.protocol}://${req.get('host')}`;
      if (origin && origin !== expectedOrigin && origin !== process.env.APP_ORIGIN) return res.status(403).json({ error: 'Use the application from its own origin.' });
      if ((req.headers['content-length'] && req.headers['content-length'] !== '0' || req.headers['transfer-encoding']) && !req.is('application/json')) return res.status(415).json({ error: 'Send request bodies as application/json.' });
    }
    next();
  });
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use('/api', (req, res, next) => {
    if (req.body != null && (typeof req.body !== 'object' || Array.isArray(req.body))) return res.status(400).json({ error: 'Request body must be a JSON object.' });
    req.body ??= {};
    const token = cookies(req)[SESSION_COOKIE];
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const session = db.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?').get(digest(token), Date.now());
      if (session) req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
    }
    next();
  });
  const authenticate = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Please sign in to continue.' });
  const requireRole = role => (req, res, next) => !req.user ? res.status(401).json({ error: 'Please sign in to continue.' }) : req.user.role !== role ? res.status(403).json({ error: `This action is available to ${role}s only.` }) : next();
  const cookieOptions = req => ({ httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/', maxAge: SESSION_TTL });
  const startSession = (req, res, userId) => {
    const previous = cookies(req)[SESSION_COOKIE];
    if (previous) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(previous));
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(digest(token), userId, Date.now() + SESSION_TTL);
    res.cookie(SESSION_COOKIE, token, cookieOptions(req));
  };

  app.get('/api/health', (req, res) => res.json({ status: 'ok', storage: 'sqlite', matching: 'rule-based' }));
  app.get('/api/auth/me', (req, res) => res.json({ user: publicUser(req.user) }));
  app.post('/api/auth/register', (req, res) => {
    const name = text(req.body.name, 'Name', { min: 2, max: 80 });
    const normalizedEmail = email(req.body.email);
    const secret = password(req.body.password);
    const role = choice(req.body.role, 'Role', ['tenant', 'landlord']);
    const occupation = optionalText(req.body.occupation, 'Occupation');
    const institution = optionalText(req.body.institution, 'Institution');
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail)) fail('An account with this email already exists.', 409);
    const result = db.prepare('INSERT INTO users (name,email,password_hash,role,occupation,institution) VALUES (?,?,?,?,?,?)').run(name, normalizedEmail, hashPassword(secret), role, occupation, institution);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    startSession(req, res, user.id);
    res.status(201).json({ user: publicUser(user) });
  });
  app.post('/api/auth/login', (req, res) => {
    const normalizedEmail = email(req.body.email);
    const secret = password(req.body.password);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
    if (!user || !verifyPassword(secret, user.password_hash)) fail('Email or password is incorrect.', 401);
    startSession(req, res, user.id);
    res.json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', (req, res) => {
    const token = cookies(req)[SESSION_COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
    const { maxAge, ...clearOptions } = cookieOptions(req);
    res.clearCookie(SESSION_COOKIE, clearOptions);
    res.json({ ok: true });
  });
  app.put('/api/profile', authenticate, (req, res) => {
    const name = text(req.body.name ?? req.user.name, 'Name', { min: 2, max: 80 });
    const occupation = optionalText(req.body.occupation ?? req.user.occupation, 'Occupation');
    const institution = optionalText(req.body.institution ?? req.user.institution, 'Institution');
    const bio = optionalText(req.body.bio ?? req.user.bio, 'Bio', 600);
    db.prepare('UPDATE users SET name = ?, occupation = ?, institution = ?, bio = ? WHERE id = ?').run(name, occupation, institution, bio, req.user.id);
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
  });
  app.put('/api/preferences', requireRole('tenant'), (req, res) => {
    const preferences = validatedPreferences(req.body);
    db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(JSON.stringify(preferences), req.user.id);
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
  });
  app.get('/api/properties', (req, res) => {
    const conditions = [], values = [];
    if (req.query.mine !== undefined && !['true', 'false'].includes(req.query.mine)) fail('Mine must be true or false.');
    if (req.query.mine === 'true') {
      if (!req.user) fail('Please sign in to see your listings.', 401);
      if (req.user.role !== 'landlord') fail('Only landlords have property listings.', 403);
      conditions.push('p.owner_id = ?'); values.push(req.user.id);
    }
    if (req.query.q !== undefined) {
      const q = text(req.query.q, 'Search', { max: 100 });
      // Treat user input literally: SQL wildcard characters should not broaden searches.
      const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push("(p.title LIKE ? ESCAPE '\\' OR p.location LIKE ? ESCAPE '\\' OR p.address LIKE ? ESCAPE '\\')"); values.push(pattern, pattern, pattern);
    }
    if (req.query.location !== undefined && req.query.location !== '') {
      conditions.push('p.location = ? COLLATE NOCASE'); values.push(text(req.query.location, 'Location', { min: 2, max: 80 }));
    }
    let minRent, maxRent;
    if (req.query.minRent !== undefined && req.query.minRent !== '') { minRent = number(req.query.minRent, 'Minimum rent', { query: true }); conditions.push('p.rent >= ?'); values.push(minRent); }
    if (req.query.maxRent !== undefined && req.query.maxRent !== '') { maxRent = number(req.query.maxRent, 'Maximum rent', { query: true }); conditions.push('p.rent <= ?'); values.push(maxRent); }
    if (minRent !== undefined && maxRent !== undefined && minRent > maxRent) fail('Maximum rent must be at least the minimum rent.');
    const sort = choice(req.query.sort || 'newest', 'Sort order', ['newest', 'rent-asc', 'rent-desc']);
    const order = { newest: 'p.created_at DESC, p.id DESC', 'rent-asc': 'p.rent ASC, p.id DESC', 'rent-desc': 'p.rent DESC, p.id DESC' }[sort];
    const properties = db.prepare(`${PROPERTY_SELECT}${conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''} ORDER BY ${order}`).all(...values).map(publicProperty);
    const locations = db.prepare('SELECT DISTINCT location FROM properties ORDER BY location COLLATE NOCASE').all().map(row => row.location);
    res.json({ properties, locations });
  });
  app.get('/api/properties/:id', (req, res) => {
    const id = number(req.params.id, 'Listing ID', { min: 1, max: Number.MAX_SAFE_INTEGER, query: true });
    const property = db.prepare(`${PROPERTY_SELECT} WHERE p.id = ?`).get(id);
    if (!property) fail('This listing was not found.', 404);
    res.json({ property: publicProperty(property) });
  });
  app.post('/api/properties', requireRole('landlord'), (req, res) => {
    const body = req.body;
    const title = text(body.title, 'Title', { min: 5, max: 100 });
    const location = text(body.location, 'Location', { min: 2, max: 80 });
    const address = text(body.address, 'Address', { min: 5, max: 240 });
    const rent = number(body.rent, 'Monthly rent', { min: 1 });
    const deposit = number(body.deposit, 'Deposit');
    const bedrooms = number(body.bedrooms, 'Bedrooms', { min: 1, max: 20 });
    const bathrooms = number(body.bathrooms, 'Bathrooms', { min: 1, max: 20 });
    const area = number(body.area, 'Area', { min: 1, max: 10000 });
    if (typeof body.furnished !== 'boolean') fail('Furnished must be true or false.');
    const availableFrom = date(body.availableFrom);
    const description = text(body.description, 'Description', { min: 20, max: 3000 });
    if (!Array.isArray(body.amenities) || body.amenities.length > 12) fail('Choose up to 12 amenities.');
    const amenities = [...new Set(body.amenities.map(item => text(item, 'Amenity', { min: 1, max: 40 })))];
    const image = choice(body.image || IMAGES[0], 'Room image', IMAGES);
    const result = db.prepare('INSERT INTO properties (owner_id,title,location,address,rent,deposit,bedrooms,bathrooms,area,furnished,available_from,description,amenities,image) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(req.user.id, title, location, address, rent, deposit, bedrooms, bathrooms, area, Number(body.furnished), availableFrom, description, JSON.stringify(amenities), image);
    res.status(201).json({ property: publicProperty(db.prepare(`${PROPERTY_SELECT} WHERE p.id = ?`).get(result.lastInsertRowid)) });
  });
  app.get('/api/matches', requireRole('tenant'), (req, res) => {
    const viewer = publicUser(req.user);
    if (!hasCompletePreferences(viewer.preferences)) fail('Complete your roommate preferences to see compatibility matches.', 409);
    const candidates = db.prepare("SELECT * FROM users WHERE role = 'tenant' AND id != ? AND preferences IS NOT NULL").all(req.user.id).map(row => publicUser(row, { privateFields: false })).filter(user => hasCompletePreferences(user.preferences));
    const matches = candidates.map(user => ({ user, ...calculateCompatibility(viewer.preferences, user.preferences) })).sort((a, b) => b.score - a.score || a.user.id - b.user.id);
    res.json({ matches, weights: WEIGHTS });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
  const dist = path.join(projectRoot, 'dist');
  app.use(express.static(dist));
  app.get('*', (req, res) => {
    if (existsSync(path.join(dist, 'index.html'))) return res.sendFile(path.join(dist, 'index.html'));
    res.status(404).send('The frontend is not built yet. Run npm run dev for development, or npm run build followed by npm start.');
  });
  app.use((error, req, res, next) => {
    if (error instanceof RequestError) return res.status(error.status).json({ error: error.message });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
    console.error('Request failed:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  let closed = false;
  const close = () => { if (!closed) { db.close(); closed = true; } };
  app.locals.db = db;
  app.locals.close = close;
  return { app, db, close };
}
