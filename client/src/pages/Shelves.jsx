import { useEffect, useState } from 'react';
import { useWorks } from '../context/WorksContext.jsx';
import WorkGrid from '../components/shelves/WorkGrid.jsx';
import NewWorkWizard from '../components/shelves/NewWorkWizard.jsx';

export default function Shelves() {
  const { state, fetchWorks } = useWorks();
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    fetchWorks();
  }, [fetchWorks]);

  return (
    <div className="shelves-page">
      <div className="shelves-header">
        <h1 className="shelves-title">Your Works</h1>
        <button className="btn btn-primary" onClick={() => setShowWizard(true)}>
          + New Work
        </button>
      </div>

      {state.loading && <p className="loading-text">Loading works…</p>}
      {state.error && <p className="error-text">{state.error}</p>}

      {!state.loading && (
        <WorkGrid works={state.works} />
      )}

      {showWizard && (
        <NewWorkWizard onClose={() => setShowWizard(false)} />
      )}
    </div>
  );
}
