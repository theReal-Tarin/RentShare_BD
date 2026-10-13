/** Transparent rules, never an AI prediction or a guarantee of a good roommate. */
export const WEIGHTS = Object.freeze({ budget: 25, location: 20, smoking: 20, cleanliness: 15, sleep: 10, noise: 5, schedule: 5 });
export const PREFERENCE_OPTIONS = Object.freeze({
  smoking: ['no', 'yes'],
  cleanliness: ['relaxed', 'balanced', 'tidy'],
  sleep: ['early', 'regular', 'late'],
  noise: ['quiet', 'balanced', 'social'],
  schedule: ['day', 'night', 'flexible'],
});
const labels = { budget: 'Budget', location: 'Location', smoking: 'Smoking', cleanliness: 'Cleanliness', sleep: 'Sleep schedule', noise: 'Noise', schedule: 'Work / study schedule' };
const display = {
  no: 'non-smoker', yes: 'smoker', early: 'early sleeper', regular: 'regular sleeper', late: 'late sleeper',
  quiet: 'quiet', balanced: 'balanced', social: 'social', relaxed: 'relaxed', tidy: 'very tidy',
  day: 'daytime', night: 'night-time', flexible: 'flexible',
};
const normal = value => value.trim().toLocaleLowerCase('en');
const money = value => `৳${Number(value).toLocaleString('en-BD')}`;

export function hasCompletePreferences(p) {
  return Boolean(p && Number.isFinite(p.budgetMin) && Number.isFinite(p.budgetMax) && p.budgetMin >= 0 && p.budgetMax >= p.budgetMin
    && typeof p.location === 'string' && p.location.trim() && Object.entries(PREFERENCE_OPTIONS).every(([key, choices]) => choices.includes(p[key])));
}

/** Range overlap / smaller range. A point scores 1 only when contained in the other range. */
export function budgetSimilarity(a, b) {
  const smallWidth = Math.min(a.budgetMax - a.budgetMin, b.budgetMax - b.budgetMin);
  const overlap = Math.min(a.budgetMax, b.budgetMax) - Math.max(a.budgetMin, b.budgetMin);
  if (smallWidth === 0) return overlap >= 0 ? 1 : 0;
  return Math.max(0, Math.min(1, overlap / smallWidth));
}

export function calculateCompatibility(a, b) {
  if (!hasCompletePreferences(a) || !hasCompletePreferences(b)) throw new Error('Complete roommate preferences are required to calculate a score.');
  const similarities = {
    budget: budgetSimilarity(a, b),
    location: normal(a.location) === normal(b.location) ? 1 : 0,
    smoking: a.smoking === b.smoking ? 1 : 0,
    ...Object.fromEntries(['cleanliness', 'sleep', 'noise'].map(key => [key, 1 - Math.abs(PREFERENCE_OPTIONS[key].indexOf(a[key]) - PREFERENCE_OPTIONS[key].indexOf(b[key])) / 2])),
    schedule: a.schedule === b.schedule ? 1 : a.schedule === 'flexible' || b.schedule === 'flexible' ? 0.5 : 0,
  };
  const explanation = {
    budget: `${money(a.budgetMin)}–${money(a.budgetMax)} and ${money(b.budgetMin)}–${money(b.budgetMax)}: ${Math.round(similarities.budget * 100)}% overlap of the smaller budget range${a.budgetMin === a.budgetMax || b.budgetMin === b.budgetMax ? ' (a fixed budget matches when it falls inside the other range)' : ''}.`,
    location: similarities.location ? `Both prefer ${a.location.trim()}.` : `You prefer ${a.location.trim()}; they prefer ${b.location.trim()}.`,
    smoking: similarities.smoking ? `Both describe themselves as ${display[a.smoking]}s.` : `You are a ${display[a.smoking]}; they are a ${display[b.smoking]}. Discuss this before sharing.`,
  };
  for (const key of ['cleanliness', 'sleep', 'noise', 'schedule']) {
    explanation[key] = a[key] === b[key]
      ? `Both selected ${display[a[key]]}.`
      : `You selected ${display[a[key]]}; they selected ${display[b[key]]}. ${similarities[key] === 0.5 ? 'Partial alignment earns half the available points.' : 'Different preferences earn no points for this factor.'}`;
  }
  const factors = Object.entries(WEIGHTS).map(([key, weight]) => ({
    key, label: labels[key], weight, similarity: Math.round(similarities[key] * 10000) / 10000,
    points: Math.round(weight * similarities[key] * 100) / 100, explanation: explanation[key],
  }));
  return {
    score: Math.round(factors.reduce((sum, factor) => sum + factor.points, 0)),
    factors,
    strengths: factors.filter(factor => factor.similarity === 1).map(factor => factor.explanation),
    differences: factors.filter(factor => factor.similarity < 1).map(factor => factor.explanation),
  };
}
