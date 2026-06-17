import { useEffect } from 'react';
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

  if (state.loading) {
    return <div className="loading-page"><p className="loading-text">Loading map…</p></div>;
  }

  const chapters = state.chapters || [];

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
        />
      </div>
    </div>
  );
}
