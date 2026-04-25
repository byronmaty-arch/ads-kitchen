// --- Lightweight body validator ---
// Usage:
//   const { error, data } = validate(req.body, schema, { partial: true });
//   if (error) return res.status(400).json({ error });
//   req.body = data; // sanitized
//
// Schema: { field: { type, required?, max?, min?, integer?, enum?, maxLen?, of? } }
// Types: string, number, boolean, array, object, any

function validateField(key, v, rule) {
  if (rule.type === 'string') {
    if (typeof v !== 'string') return { error: `${key} must be a string` };
    const trimmed = v.trim();
    if (rule.required && !trimmed) return { error: `${key} is required` };
    if (rule.max != null && trimmed.length > rule.max) return { error: `${key} must be ${rule.max} characters or less` };
    if (rule.min != null && trimmed.length < rule.min) return { error: `${key} must be at least ${rule.min} characters` };
    if (rule.enum && !rule.enum.includes(trimmed)) return { error: `${key} must be one of: ${rule.enum.join(', ')}` };
    if (rule.pattern && !rule.pattern.test(trimmed)) return { error: `${key} has invalid format` };
    return { value: trimmed };
  }
  if (rule.type === 'number') {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return { error: `${key} must be a number` };
    if (rule.integer && !Number.isInteger(n)) return { error: `${key} must be an integer` };
    if (rule.min != null && n < rule.min) return { error: `${key} must be ≥ ${rule.min}` };
    if (rule.max != null && n > rule.max) return { error: `${key} must be ≤ ${rule.max}` };
    return { value: n };
  }
  if (rule.type === 'boolean') {
    if (typeof v !== 'boolean') return { error: `${key} must be true or false` };
    return { value: v };
  }
  if (rule.type === 'array') {
    if (!Array.isArray(v)) return { error: `${key} must be an array` };
    if (rule.maxLen != null && v.length > rule.maxLen) return { error: `${key} has too many entries (max ${rule.maxLen})` };
    if (rule.of) {
      const out = [];
      for (let i = 0; i < v.length; i++) {
        const r = validateField(`${key}[${i}]`, v[i], rule.of);
        if (r.error) return r;
        out.push(r.value);
      }
      return { value: out };
    }
    return { value: v };
  }
  if (rule.type === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: `${key} must be an object` };
    if (rule.shape) {
      const r = validate(v, rule.shape, { partial: !!rule.partial });
      if (r.error) return { error: `${key}: ${r.error}` };
      return { value: r.data };
    }
    return { value: v };
  }
  if (rule.type === 'any') return { value: v };
  return { error: `Unknown rule for ${key}` };
}

function validate(body, schema, opts = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  // Reject unexpected fields
  for (const key of Object.keys(body)) {
    if (!Object.prototype.hasOwnProperty.call(schema, key)) {
      return { error: `Unexpected field: ${key}` };
    }
  }
  const out = {};
  for (const [key, rule] of Object.entries(schema)) {
    const v = body[key];
    const isMissing = v === undefined || v === null || (rule.type === 'string' && v === '');
    if (isMissing) {
      if (rule.required && !opts.partial) return { error: `${key} is required` };
      if (rule.default !== undefined) out[key] = rule.default;
      continue;
    }
    const r = validateField(key, v, rule);
    if (r.error) return { error: r.error };
    out[key] = r.value;
  }
  return { data: out };
}

module.exports = { validate };
