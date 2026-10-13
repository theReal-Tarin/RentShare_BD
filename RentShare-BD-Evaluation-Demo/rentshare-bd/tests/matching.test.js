import test from 'node:test';
import assert from 'node:assert/strict';
import { WEIGHTS, calculateCompatibility } from '../server/matching.js';

const ALIGNED = {
  budgetMin: 5000, budgetMax: 10000, location: 'Dhanmondi',
  smoking: 'no', cleanliness: 'tidy', sleep: 'early', noise: 'quiet', schedule: 'day',
};
const OPPOSITE = {
  budgetMin: 15000, budgetMax: 20000, location: 'Mirpur',
  smoking: 'yes', cleanliness: 'relaxed', sleep: 'late', noise: 'social', schedule: 'night',
};

function factor(result, key) {
  const found = result.factors.find(item => item.key === key);
  assert.ok(found, `missing ${key} factor`);
  return found;
}

test('matching weights cover the seven required factors and sum to 100', () => {
  assert.deepEqual(WEIGHTS, { budget: 25, location: 20, smoking: 20, cleanliness: 15, sleep: 10, noise: 5, schedule: 5 });
  assert.equal(Object.values(WEIGHTS).reduce((sum, value) => sum + value, 0), 100);
});

test('complete alignment scores 100 and every factor explains its contribution', () => {
  const result = calculateCompatibility(ALIGNED, { ...ALIGNED });
  assert.equal(result.score, 100);
  assert.equal(result.factors.length, 7);
  assert.equal(result.factors.reduce((sum, item) => sum + item.points, 0), 100);
  for (const item of result.factors) {
    assert.equal(item.similarity, 1);
    assert.equal(item.points, item.weight);
    assert.ok(item.explanation.length > 5);
  }
  assert.ok(result.strengths.length > 0);
  assert.equal(result.differences.length, 0);
});

test('complete mismatch scores zero and describes differences', () => {
  const result = calculateCompatibility(ALIGNED, OPPOSITE);
  assert.equal(result.score, 0);
  assert.ok(result.factors.every(item => item.similarity === 0 && item.points === 0));
  assert.equal(result.strengths.length, 0);
  assert.ok(result.differences.length > 0);
});

test('changing smoking alone changes the score by its 20-point weight', () => {
  const result = calculateCompatibility(ALIGNED, { ...ALIGNED, smoking: 'yes' });
  assert.equal(result.score, 80);
  assert.equal(factor(result, 'smoking').points, 0);
  assert.ok(result.differences.length > 0);
});

test('partially overlapping budgets contribute the documented fraction', () => {
  const result = calculateCompatibility(ALIGNED, { ...ALIGNED, budgetMin: 7500, budgetMax: 12500 });
  assert.equal(factor(result, 'budget').similarity, 0.5);
  assert.equal(factor(result, 'budget').points, 12.5);
  assert.equal(result.score, 88);
});

test('a contained budget interval is fully compatible and disjoint intervals contribute zero', () => {
  const contained = calculateCompatibility(ALIGNED, { ...ALIGNED, budgetMin: 6500, budgetMax: 8500 });
  const disjoint = calculateCompatibility(ALIGNED, { ...ALIGNED, budgetMin: 11000, budgetMax: 13000 });
  assert.equal(factor(contained, 'budget').similarity, 1);
  assert.equal(factor(disjoint, 'budget').similarity, 0);
});

test('single-value budgets avoid division by zero and have defined overlap behavior', () => {
  const point = { ...ALIGNED, budgetMin: 8000, budgetMax: 8000 };
  const equal = calculateCompatibility(point, { ...point });
  const inside = calculateCompatibility(point, ALIGNED);
  const outside = calculateCompatibility(point, { ...ALIGNED, budgetMin: 9000, budgetMax: 11000 });
  assert.equal(equal.score, 100);
  assert.equal(factor(inside, 'budget').similarity, 1);
  assert.equal(factor(outside, 'budget').similarity, 0);
  assert.ok(Number.isFinite(equal.score));
});

test('scores and factor contributions are symmetric and stay in range', () => {
  const samples = [
    ALIGNED,
    OPPOSITE,
    { ...ALIGNED, budgetMin: 7500, budgetMax: 12500, cleanliness: 'balanced', sleep: 'regular', noise: 'balanced', schedule: 'flexible' },
    { ...OPPOSITE, budgetMin: 8000, budgetMax: 8000, location: 'Dhanmondi', smoking: 'no' },
  ];
  for (const first of samples) {
    for (const second of samples) {
      const forward = calculateCompatibility(first, second);
      const reverse = calculateCompatibility(second, first);
      assert.equal(forward.score, reverse.score);
      assert.ok(Number.isFinite(forward.score) && forward.score >= 0 && forward.score <= 100);
      assert.equal(forward.score, Math.round(forward.factors.reduce((sum, item) => sum + item.points, 0)));
      for (const item of forward.factors) {
        assert.equal(item.points, factor(reverse, item.key).points);
        assert.ok(item.similarity >= 0 && item.similarity <= 1);
        assert.ok(item.points >= 0 && item.points <= item.weight);
      }
    }
  }
});
