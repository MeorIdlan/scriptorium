import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useActiveWork } from '../context/ActiveWorkContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import TensionCurve from '../components/map/TensionCurve.jsx';
import ChapterBlocks from '../components/map/ChapterBlocks.jsx';
import BeatRow from '../components/map/BeatRow.jsx';
import ChapterDetail from '../components/map/ChapterDetail.jsx';

export default function MapView() {
  const { workId } = useParams();
  const { state, loadWork, refreshMap } = useActiveWork();
  const { state: uiState } = useUI();

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
        <ChapterBlocks chapters={chapters} />
        <BeatRow chapters={chapters} />
      </div>

      <div className="map-detail-section">
        <ChapterDetail
          workId={workId}
          chapterId={uiState.selectedMapChapterId}
          chapters={chapters}
          onSaved={() => refreshMap(workId)}
        />
      </div>
    </div>
  );
}
