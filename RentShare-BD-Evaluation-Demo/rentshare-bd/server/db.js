import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, saved) {
  const [salt, hash] = saved.split(':');
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
export function openDatabase(dbPath) {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('tenant','landlord')),
      occupation TEXT NOT NULL DEFAULT '', institution TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '',
      preferences TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      seed_key TEXT UNIQUE,
      title TEXT NOT NULL, location TEXT NOT NULL, address TEXT NOT NULL,
      rent INTEGER NOT NULL CHECK(rent > 0), deposit INTEGER NOT NULL CHECK(deposit >= 0),
      bedrooms INTEGER NOT NULL CHECK(bedrooms >= 1), bathrooms INTEGER NOT NULL CHECK(bathrooms >= 1),
      area INTEGER NOT NULL CHECK(area > 0), furnished INTEGER NOT NULL DEFAULT 0,
      available_from TEXT NOT NULL, description TEXT NOT NULL, amenities TEXT NOT NULL,
      image TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS properties_location_rent ON properties(location, rent);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
  `);
  return db;
}
export function publicUser(row, { privateFields = true } = {}) {
  if (!row) return null;
  const user = { id: row.id, name: row.name, occupation: row.occupation, institution: row.institution, bio: row.bio, preferences: row.preferences ? JSON.parse(row.preferences) : null };
  if (privateFields) Object.assign(user, { email: row.email, role: row.role });
  return user;
}
export const PROPERTY_SELECT = 'SELECT p.*, u.name AS owner_name FROM properties p JOIN users u ON u.id = p.owner_id';
export function publicProperty(row) {
  return {
    id: row.id, title: row.title, location: row.location, address: row.address,
    rent: row.rent, deposit: row.deposit, bedrooms: row.bedrooms, bathrooms: row.bathrooms,
    area: row.area, furnished: Boolean(row.furnished), availableFrom: row.available_from,
    description: row.description, amenities: JSON.parse(row.amenities), image: row.image,
    owner: { id: row.owner_id, name: row.owner_name }, createdAt: row.created_at,
  };
}
