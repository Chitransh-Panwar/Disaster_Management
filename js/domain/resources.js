const STATUSES = new Set(['available', 'deployed', 'standby']);

export function validateResourceDraft(draft) {
  const d = draft && typeof draft === 'object' ? draft : {};
  const errors = [];

  const rt = d.resourceType;
  if (typeof rt !== 'string' || rt.trim().length === 0) {
    errors.push('Please select a resource type');
  }

  const rn = d.resourceName;
  if (typeof rn !== 'string' || rn.trim().length < 2 || rn.trim().length > 50) {
    errors.push('Name required (2-50 characters)');
  }

  const qty = d.quantity;
  if (!Number.isInteger(qty) || qty < 1 || qty > 9999) {
    errors.push('Enter a valid quantity (1 to 9999)');
  }

  const cap = d.capacityPerUnit;
  if (!Number.isInteger(cap) || cap < 1) {
    errors.push('Capacity per unit must be a positive integer');
  }

  const cost = d.costPerUnit;
  if (!Number.isInteger(cost) || cost < 1) {
    errors.push('Cost per unit must be a positive integer');
  }

  const lat = d.baseLat;
  const lng = d.baseLng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    errors.push('Click map to set base location');
  }

  const st = d.status;
  if (typeof st !== 'string' || !STATUSES.has(st)) {
    errors.push('Select a status for this resource');
  }

  return errors;
}
