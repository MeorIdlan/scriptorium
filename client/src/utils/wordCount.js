export const countWords = (text) =>
  !text || text.trim() === '' ? 0 : text.trim().split(/\s+/).length;

export const formatNumber = (n) => n.toLocaleString();
