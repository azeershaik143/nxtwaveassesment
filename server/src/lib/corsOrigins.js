/** Parse CLIENT_ORIGIN env: comma-separated list, or "*" for any origin */
function parseClientOrigins(raw) {
  const val = (raw || '').trim();
  if (!val || val === '*') return true;
  const parts = val.split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return true;
  if (parts.length === 1) return parts[0];
  return parts;
}

module.exports = { parseClientOrigins };
