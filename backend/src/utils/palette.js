const PALETTE = [
  { color: '#2563EB', tint: '#EFF6FF' },
  { color: '#7C3AED', tint: '#F5F3FF' },
  { color: '#059669', tint: '#ECFDF5' },
  { color: '#DB2777', tint: '#FDF2F8' },
  { color: '#D97706', tint: '#FFFBEB' },
  { color: '#0891B2', tint: '#ECFEFF' },
];

function colorForId(id) {
  return PALETTE[Number(id) % PALETTE.length];
}

module.exports = {
  colorForId,
};
