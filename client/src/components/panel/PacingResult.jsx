// Renders the /ai/pacing response: { overall, flags: [{ chapterIds, note }] }
export default function PacingResult({ result, chapters = [] }) {
  const titleFor = (id) => {
    const ch = chapters.find((c) => c.id === id);
    return ch ? `Ch. ${ch.number}: ${ch.title}` : null;
  };

  return (
    <div className="pacing-result">
      {result.overall && <p className="ai-result-text">{result.overall}</p>}
      {(result.flags || []).map((flag, i) => {
        const labels = (flag.chapterIds || []).map(titleFor).filter(Boolean);
        return (
          <div key={i} className="pacing-flag">
            {labels.length > 0 && <p className="pacing-flag-chapters">{labels.join(', ')}</p>}
            <p className="ai-result-text">{flag.note}</p>
          </div>
        );
      })}
    </div>
  );
}
