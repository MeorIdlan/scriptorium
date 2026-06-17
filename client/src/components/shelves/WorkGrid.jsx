import WorkCard from './WorkCard.jsx';

export default function WorkGrid({ works }) {
  if (!works || works.length === 0) {
    return (
      <div className="work-grid-empty">
        <p className="work-grid-empty-icon">📖</p>
        <p className="work-grid-empty-title">No works yet</p>
        <p className="work-grid-empty-sub">Start your first work to begin your story.</p>
      </div>
    );
  }

  return (
    <div className="work-grid">
      {works.map((work) => (
        <WorkCard key={work.id} work={work} />
      ))}
    </div>
  );
}
