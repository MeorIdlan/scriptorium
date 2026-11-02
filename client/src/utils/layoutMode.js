// The three layout modes. The stylesheet repeats these two numbers as literals
// in its media queries (CSS can't read them), and a test keeps both in step.
export const PHONE_MAX = 640;
export const TABLET_MAX = 1099;

export const LAYOUT_QUERIES = {
  phone: `(max-width: ${PHONE_MAX}px)`,
  tablet: `(min-width: ${PHONE_MAX + 1}px) and (max-width: ${TABLET_MAX}px)`,
};

// 'phone' (640px and down), 'tablet' (641 to 1099px) or 'desktop' (1100px and up)
export function modeForWidth(width) {
  if (width <= PHONE_MAX) return 'phone';
  if (width <= TABLET_MAX) return 'tablet';
  return 'desktop';
}
