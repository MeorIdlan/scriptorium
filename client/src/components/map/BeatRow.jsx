export default function BeatRow({ chapters }) {
  return (
    <div className="beat-row">
      {chapters.map((ch) => (
        <div key={ch.id} className="beat-row-cell">
          {ch.beat ? (
            <span className="beat-label">{ch.beat}</span>
          ) : (
            <span className="beat-label-empty">—</span>
          )}
        </div>
      ))}
    </div>
  );
}
