// TensionCurve: SVG polyline plotting tensionScore across chapters
export default function TensionCurve({ chapters }) {
  if (!chapters || chapters.length === 0) {
    return (
      <div className="tension-curve-empty">
        <p>No chapters to plot.</p>
      </div>
    );
  }

  const WIDTH = 900;
  const HEIGHT = 120;
  const PADDING = { top: 12, bottom: 20, left: 24, right: 24 };

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const getX = (i) =>
    PADDING.left + (i / Math.max(chapters.length - 1, 1)) * plotWidth;

  const getY = (tension) =>
    PADDING.top + plotHeight - ((tension || 50) / 100) * plotHeight;

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
            stroke="#2a2a38"
            strokeWidth="1"
          />
        ))}

        {/* Curve */}
        <polyline
          points={points}
          fill="none"
          stroke="#c9a96e"
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
            fill={ch.beat ? '#e8a030' : '#c9a96e'}
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
              fill="#e8a030"
            >
              {ch.beat}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
