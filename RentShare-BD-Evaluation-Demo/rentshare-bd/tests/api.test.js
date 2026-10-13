import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';

const PASSWORD = 'RentShare123!';
const PREFERENCES = {
  budgetMin: 5000,
  budgetMax: 10000,
  location: 'Dhanmondi',
  smoking: 'no',
  cleanliness: 'tidy',
  sleep: 'early',
  noise: 'quiet',
  schedule: 'day',
};
const LISTING = {
  title: 'Test — bright room near campus',
  location: 'Dhanmondi',
  address: 'Synthetic demo address, Road 7, Dhanmondi',
  rent: 8000,
  deposit: 16000,
  bedrooms: 2,
  bathrooms: 1,
  area: 900,
  furnished: true,
  availableFrom: '2027-01-01',
  description: 'A synthetic test property with a bright bedroom, a shared kitchen, and a quiet study space.',
  amenities: ['Wi-Fi', 'Furnished'],
  image: '/images/room-sunlight.png',
};

async function startApp(t, options = {}) {
  const instance = createApp({ dbPath: ':memory:', seed: false, ...options });
  const server = instance.app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
  } catch (error) {
    instance.close();
    throw error;
  }
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    instance.close();
  };
  t.after(stop);
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() {
    let cookie = '';
    return async (path, { method = 'GET', body, headers = {}, withCookie = true } = {}) => {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(withCookie && cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const setCookies = response.headers.getSetCookie();
      if (setCookies.length) cookie = setCookies.map(value => value.split(';')[0]).join('; ');
      const content = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        body: content ? JSON.parse(content) : null,
      };
    };
  }
  return { ...instance, client, stop };
}

async function register(client, overrides = {}) {
  const result = await client('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Demo Student',
      email: 'student@example.test',
      password: PASSWORD,
      role: 'tenant',
      occupation: 'Student',
      institution: 'Demo University',
      ...overrides,
    },
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.user;
}

function assertNoSecrets(value) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /password|passwordHash|password_hash|salt|sessionToken|session_token/i);
  assert.ok(!serialized.includes(PASSWORD), 'response must never contain the plaintext password');
}

test('tenant and landlord can register; sessions support login, logout, and invalid-password rejection', async t => {
  const api = await startApp(t);
  const tenant = api.client();
  const landlord = api.client();
  assert.equal((await tenant('/api/auth/me')).body.user, null);

  const tenantUser = await register(tenant);
  const landlordUser = await register(landlord, { name: 'Demo Owner', email: 'owner@example.test', role: 'landlord' });
  assert.equal(tenantUser.role, 'tenant');
  assert.equal(landlordUser.role, 'landlord');
  assertNoSecrets(tenantUser);
  assertNoSecrets(landlordUser);
  assert.equal((await tenant('/api/auth/me')).body.user.id, tenantUser.id);
  const roleAttempt = await tenant('/api/profile', { method: 'PUT', body: { role: 'landlord', email: 'replacement@example.test' } });
  assert.equal(roleAttempt.status, 200);
  assert.equal(roleAttempt.body.user.role, 'tenant');
  assert.equal(roleAttempt.body.user.email, 'student@example.test');

  const duplicate = await api.client()('/api/auth/register', {
    method: 'POST', body: { name: 'Duplicate', email: 'STUDENT@example.test', password: PASSWORD, role: 'tenant' },
  });
  assert.equal(duplicate.status, 409);

  const sessionLogin = await tenant('/api/auth/login', { method: 'POST', body: { email: 'student@example.test', password: PASSWORD } });
  const previousCookie = sessionLogin.headers.get('set-cookie').split(';')[0];
  const logout = await tenant('/api/auth/logout', { method: 'POST' });
  assert.ok([200, 204].includes(logout.status));
  assert.equal((await tenant('/api/auth/me')).body.user, null);
  assert.equal((await tenant('/api/auth/me', { headers: { Cookie: previousCookie } })).body.user, null, 'logging out must invalidate the previous session token on the server');
  assert.equal((await tenant('/api/profile', { method: 'PUT', body: { name: 'No session' } })).status, 401);
  assert.equal((await tenant('/api/auth/login', { method: 'POST', body: { email: 'student@example.test', password: 'WrongPass123!' } })).status, 401);
  const login = await tenant('/api/auth/login', { method: 'POST', body: { email: 'student@example.test', password: PASSWORD } });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, tenantUser.id);
  assertNoSecrets(login.body);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(login.headers.get('set-cookie'), /SameSite=Lax/i);
});

test('registration validates email, password, and supported role', async t => {
  const api = await startApp(t);
  for (const invalid of [{ email: 'invalid' }, { password: 'short' }, { role: 'admin' }, { name: '' }]) {
    const result = await api.client()('/api/auth/register', {
      method: 'POST',
      body: { name: 'Valid Person', email: 'valid@example.test', password: PASSWORD, role: 'tenant', ...invalid },
    });
    assert.equal(result.status, 400, JSON.stringify({ invalid, response: result.body }));
    assert.equal(typeof result.body.error, 'string');
  }
});

test('profiles and all seven preferences persist across reopening the database', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'rentshare-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dbPath = join(directory, 'persistence.sqlite');
  const first = await startApp(t, { dbPath });
  const tenant = first.client();
  const originalUser = await register(tenant);
  const profile = { name: 'Updated Student', occupation: 'Research student', institution: 'Demo Institute', bio: 'I enjoy quiet study time and shared cooking.' };
  const update = await tenant('/api/profile', { method: 'PUT', body: profile });
  assert.equal(update.status, 200, JSON.stringify(update.body));
  assert.equal(update.body.user.name, profile.name);
  const preferences = await tenant('/api/preferences', { method: 'PUT', body: PREFERENCES });
  assert.equal(preferences.status, 200, JSON.stringify(preferences.body));
  assert.deepEqual(preferences.body.user.preferences, PREFERENCES);
  await first.stop();

  const reopened = await startApp(t, { dbPath });
  const restoredClient = reopened.client();
  const restored = await restoredClient('/api/auth/login', { method: 'POST', body: { email: 'student@example.test', password: PASSWORD } });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.user.id, originalUser.id);
  for (const [key, value] of Object.entries(profile)) assert.equal(restored.body.user[key], value);
  assert.deepEqual(restored.body.user.preferences, PREFERENCES);
  assertNoSecrets(restored.body);
});

test('invalid profile/preferences fail without replacing the saved values; landlord preference access is blocked', async t => {
  const api = await startApp(t);
  const tenant = api.client();
  await register(tenant);
  assert.equal((await tenant('/api/preferences', { method: 'PUT', body: PREFERENCES })).status, 200);
  assert.equal((await tenant('/api/profile', { method: 'PUT', body: { name: '' } })).status, 400);
  for (const invalid of [
    { budgetMin: -1 }, { budgetMin: 12000, budgetMax: 6000 }, { smoking: 'sometimes' },
    { cleanliness: 'unknown' }, { sleep: 'unknown' }, { noise: 'unknown' }, { schedule: 'unknown' }, { location: '' },
  ]) {
    const result = await tenant('/api/preferences', { method: 'PUT', body: { ...PREFERENCES, ...invalid } });
    assert.equal(result.status, 400, JSON.stringify({ invalid, response: result.body }));
  }
  assert.deepEqual((await tenant('/api/auth/me')).body.user.preferences, PREFERENCES);
  const landlord = api.client();
  await register(landlord, { name: 'Owner', email: 'owner@example.test', role: 'landlord' });
  assert.equal((await landlord('/api/preferences', { method: 'PUT', body: PREFERENCES })).status, 403);
  assert.equal((await landlord('/api/matches')).status, 403);
});

test('only authenticated landlords create listings and ownership follows the session', async t => {
  const api = await startApp(t);
  const anonymous = api.client();
  assert.equal((await anonymous('/api/properties', { method: 'POST', body: LISTING })).status, 401);
  assert.equal((await anonymous('/api/properties?mine=true')).status, 401);
  const tenant = api.client();
  const tenantUser = await register(tenant);
  assert.equal((await tenant('/api/properties', { method: 'POST', body: LISTING })).status, 403);
  assert.equal((await tenant('/api/properties?mine=true')).status, 403);
  const owner = api.client();
  await register(owner, { email: 'owner@example.test', role: 'landlord' });
  const otherOwner = api.client();
  await register(otherOwner, { email: 'other-owner@example.test', role: 'landlord' });
  const created = await owner('/api/properties', { method: 'POST', body: { ...LISTING, ownerId: tenantUser.id, landlordId: tenantUser.id } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const mine = await owner('/api/properties?mine=true');
  const theirs = await otherOwner('/api/properties?mine=true');
  assert.equal(mine.status, 200);
  assert.equal(mine.body.properties.length, 1);
  assert.equal(theirs.body.properties.length, 0);
  assert.equal(mine.body.properties[0].id, created.body.property.id);
  assertNoSecrets(created.body);
});

test('listing creation, text/location/budget filters, sorting, details, and validation work together', async t => {
  const api = await startApp(t);
  const owner = api.client();
  await register(owner, { email: 'owner@example.test', role: 'landlord' });
  const fixtures = [
    { title: 'Campus sunlit room', location: 'Dhanmondi', rent: 8000 },
    { title: 'Quiet campus apartment', location: 'Dhanmondi', rent: 12000 },
    { title: 'Modern family apartment', location: 'Mirpur', rent: 6500 },
  ];
  const ids = [];
  for (const fixture of fixtures) {
    const result = await owner('/api/properties', { method: 'POST', body: { ...LISTING, ...fixture } });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    ids.push(result.body.property.id);
  }
  const browser = api.client();
  const location = await browser('/api/properties?location=Dhanmondi');
  assert.equal(location.body.properties.length, 2);
  const filtered = await browser('/api/properties?location=Dhanmondi&minRent=7000&maxRent=9000&q=campus');
  assert.equal(filtered.body.properties.length, 1);
  assert.equal(filtered.body.properties[0].id, ids[0]);
  assert.equal((await browser('/api/properties?q=nonexistent-result')).body.properties.length, 0);
  const sorted = await browser('/api/properties?sort=rent-asc');
  assert.deepEqual(sorted.body.properties.map(property => property.rent), [6500, 8000, 12000]);
  const detail = await browser(`/api/properties/${ids[0]}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.property.title, fixtures[0].title);
  assert.equal(detail.body.property.description, LISTING.description);
  assert.equal(detail.body.property.rent, 8000);
  assert.doesNotMatch(JSON.stringify(detail.body), /owner@example\.test/);
  assert.equal((await browser('/api/properties/999999')).status, 404);
  for (const invalid of [{ rent: -1 }, { title: '' }, { location: '' }, { availableFrom: 'not-a-date' }]) {
    const result = await owner('/api/properties', { method: 'POST', body: { ...LISTING, ...invalid } });
    assert.equal(result.status, 400, JSON.stringify({ invalid, response: result.body }));
  }
});

test('matches require preferences, reflect edits, explain all weights, and hide emails and secrets', async t => {
  const api = await startApp(t);
  const viewer = api.client();
  await register(viewer, { name: 'Viewer Student' });
  const beforePreferences = await viewer('/api/matches');
  assert.equal(beforePreferences.status, 409, JSON.stringify(beforePreferences.body));
  await viewer('/api/preferences', { method: 'PUT', body: PREFERENCES });

  const candidate = api.client();
  const candidateUser = await register(candidate, { name: 'Candidate Student', email: 'candidate@example.test' });
  await candidate('/api/preferences', { method: 'PUT', body: PREFERENCES });
  const matches = await viewer('/api/matches');
  assert.equal(matches.status, 200, JSON.stringify(matches.body));
  assert.equal(matches.body.matches.length, 1);
  const match = matches.body.matches[0];
  assert.equal(match.user.id, candidateUser.id);
  assert.equal(match.score, 100);
  assert.equal(match.factors.length, 7);
  assert.equal(match.factors.reduce((sum, factor) => sum + factor.weight, 0), 100);
  assert.ok(match.factors.every(factor => typeof factor.explanation === 'string' && factor.explanation.length > 5));
  assert.ok(match.strengths.length > 0);
  assert.doesNotMatch(JSON.stringify(matches.body), /candidate@example\.test|student@example\.test|"email"/);
  assertNoSecrets(matches.body);

  await viewer('/api/preferences', { method: 'PUT', body: { ...PREFERENCES, smoking: 'yes' } });
  const changed = (await viewer('/api/matches')).body.matches[0];
  assert.equal(changed.score, 80);
  const smoking = changed.factors.find(factor => factor.key === 'smoking');
  assert.equal(smoking.points, 0);
  assert.ok(changed.differences.length > 0);
  assert.notEqual(smoking.explanation, match.factors.find(factor => factor.key === 'smoking').explanation);
});

test('cross-origin browser writes are rejected', async t => {
  const api = await startApp(t);
  const client = api.client();
  await register(client);
  const result = await client('/api/profile', {
    method: 'PUT', body: { name: 'Unexpected change' }, headers: { Origin: 'https://unrelated.example', 'Sec-Fetch-Site': 'cross-site' },
  });
  assert.equal(result.status, 403);
  assert.equal((await client('/api/auth/me')).body.user.name, 'Demo Student');
});

test('seeded demo accounts and inventory are usable and repeated seeding is non-destructive', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'rentshare-seed-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dbPath = join(directory, 'seed.sqlite');
  const first = await startApp(t, { dbPath, seed: true });
  const tenant = first.client();
  const landlord = first.client();
  for (const [client, email, role] of [[tenant, 'tenant@rentshare.demo', 'tenant'], [landlord, 'landlord@rentshare.demo', 'landlord']]) {
    const login = await client('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.equal(login.body.user.role, role);
  }
  const initialProperties = (await tenant('/api/properties')).body.properties;
  assert.ok(initialProperties.length >= 3);
  const seededMatches = (await tenant('/api/matches')).body.matches;
  assert.ok(seededMatches.length >= 3);
  assert.deepEqual(seededMatches.map(match => match.score), [...seededMatches.map(match => match.score)].sort((a, b) => b - a));
  await tenant('/api/profile', { method: 'PUT', body: { name: 'Keep my edited name', occupation: 'Student', institution: 'Demo College', bio: 'Saved during a test.' } });
  const property = await landlord('/api/properties', { method: 'POST', body: { ...LISTING, title: 'Keep my custom listing' } });
  assert.equal(property.status, 201);
  await first.stop();

  const second = await startApp(t, { dbPath, seed: true });
  const restored = second.client();
  const login = await restored('/api/auth/login', { method: 'POST', body: { email: 'tenant@rentshare.demo', password: PASSWORD } });
  assert.equal(login.body.user.name, 'Keep my edited name');
  const properties = (await restored('/api/properties')).body.properties;
  assert.equal(properties.length, initialProperties.length + 1);
  assert.ok(properties.some(item => item.title === 'Keep my custom listing'));
});
