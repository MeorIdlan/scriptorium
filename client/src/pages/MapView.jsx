import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useActiveWork } from '../context/ActiveWorkContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import TensionCurve from '../components/map/TensionCurve.jsx';
import ChapterBlocks from '../components/map/ChapterBlocks.jsx';
import BeatRow from '../components/map/BeatRow.jsx';
import ChapterDetail from '../components/map/ChapterDetail.jsx';
import { povOptions } from '../utils/sceneMap.js';

export default function MapView() {
  const { workId } = useParams();
  const { state, loadWork, refreshMap } = useActiveWork();
  const { state: uiState } = useUI();
  const [pov, setPov] = useState('');

  useEffect(() => {
    if (workId) {
      loadWork(workId);
      refreshMap(workId);
    }
  }, [workId, loadWork, refreshMap]);

  // Tension, beat, act and notes live in the Map document, keyed by chapter id
  const chapters = useMemo(() => {
    const mapChapters = state.mapData?.chapters || {};
    return (state.chapters || []).map((ch) => {
      const entry = mapChapters[ch.id];
      if (!entry) return ch;
      const { tensionScore, beat, act, notes } = entry;
      return {
        ...ch,
        ...(tensionScore !== undefined && { tensionScore }),
        ...(beat !== undefined && { beat }),
        ...(act !== undefined && { act }),
        ...(notes !== undefined && { notes }),
      };
    });
  }, [state.chapters, state.mapData]);

  const povs = useMemo(() => povOptions(chapters), [chapters]);

  if (state.loading) {
    return <div className="loading-page"><p className="loading-text">Loading map…</p></div>;
  }

  return (
    <div className="map-view">
      <div className="map-header">
        <h2 className="map-title">Story Arc Map</h2>
        {state.work && <p className="map-subtitle">{state.work.title}</p>}
      </div>

      <div className="map-curve-section">
        <TensionCurve chapters={chapters} />
      </div>

      <div className="map-blocks-section">
        {povs.length > 0 && (
          <label className="map-pov-filter">
            POV
            <select className="form-select" value={pov} onChange={(e) => setPov(e.target.value)}>
              <option value="">All POVs</option>
              {povs.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        )}
        <ChapterBlocks chapters={chapters} pov={pov} />
        <BeatRow chapters={chapters} />
      </div>

      <div className="map-detail-section">
        <ChapterDetail
          workId={workId}
          chapterId={uiState.selectedMapChapterId}
          chapters={chapters}
          pov={pov}
          onSaved={() => refreshMap(workId)}
        />
      </div>
    </div>
  );
}
