import test from 'node:test';
import assert from 'node:assert/strict';
import { validateResourceDraft } from '../js/domain/resources.js';

test('validateResourceDraft rejects missing required fields', () => {
  const errs = validateResourceDraft({});
  assert.ok(errs.length >= 4);
});

test('validateResourceDraft accepts minimal valid resource', () => {
  const errs = validateResourceDraft({
    resourceType: 'Rescue Helicopter',
    resourceName: 'IAF Mi-17',
    quantity: 2,
    capacityPerUnit: 20,
    costPerUnit: 50,
    baseLat: 28.6,
    baseLng: 77.2,
    status: 'available',
  });
  assert.deepEqual(errs, []);
});
