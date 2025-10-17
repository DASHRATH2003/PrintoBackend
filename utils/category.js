export const normalizeCategory = (raw) => {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return value;
  const map = {
    'emart': 'l-mart',
    'e-mart': 'l-mart',
    'lmart': 'l-mart',
    'l-mart': 'l-mart'
  };
  return map[value] || value;
};

export const isValidCategory = (raw) => {
  const val = normalizeCategory(raw);
  return ['l-mart', 'localmarket', 'printing', 'news'].includes(val);
};