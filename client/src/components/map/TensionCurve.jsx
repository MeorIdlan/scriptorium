// TensionCurve: SVG polyline plotting tensionScore across chapters
export default function TensionCurve({ chapters }) {
  if (!chapters || chapters.length === 0) {
    return (
      <div className="tension-curve-empty">
        <p>No chapters to plot.</p>
      </div>
    );
  }

  // Up to a dozen chapters the curve keeps its 900-unit drawing, stretched over the card. Beyond
  // that the Map scrolls sideways (.map-timeline), and the drawing is made 1:1 with the chapter
  // blocks under it: 74px a chapter, the first block's centre 42px in, so each dot sits over its
  // block and nothing is stretched. The SVG is as wide as its box: 74n + 10 pixels.
  const BLOCK_STEP = 74;
  const SIDE = 42;
  const scrolls = chapters.length * BLOCK_STEP + 10 > 900;
  const WIDTH = scrolls ? chapters.length * BLOCK_STEP + 10 : 900;
  const HEIGHT = 120;
  const PADDING = scrolls
    ? { top: 12, bottom: 20, left: SIDE, right: SIDE }
    : { top: 12, bottom: 20, left: 24, right: 24 };

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const getX = (i) =>
    PADDING.left + (i / Math.max(chapters.length - 1, 1)) * plotWidth;

  const getY = (tension) =>
    PADDING.top + plotHeight - ((tension ?? 50) / 100) * plotHeight;

  const points = chapters.map((ch, i) => `${getX(i)},${getY(ch.tensionScore)}`).join(' ');

  // Key beats to highlight
  const beatChapters = chapters.filter((ch) => ch.beat);

  return (
    <div className="tension-curve">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="tension-curve-svg"
      >
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((v) => (
          <line
            key={v}
            x1={PADDING.left}
            y1={getY(v)}
            x2={WIDTH - PADDING.right}
            y2={getY(v)}
            className="tension-grid"
            strokeWidth="1"
          />
        ))}

        {/* Curve */}
        <polyline
          points={points}
          fill="none"
          className="tension-line"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {chapters.map((ch, i) => (
          <circle
            key={ch.id}
            cx={getX(i)}
            cy={getY(ch.tensionScore)}
            r="3"
            className={ch.beat ? 'tension-dot tension-dot--beat' : 'tension-dot'}
          />
        ))}

        {/* Beat labels */}
        {beatChapters.map((ch) => {
          const idx = chapters.indexOf(ch);
          return (
            <text
              key={ch.id}
              x={getX(idx)}
              y={getY(ch.tensionScore) - 8}
              textAnchor="middle"
              fontSize="9"
              className="tension-beat-label"
            >
              {ch.beat}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
