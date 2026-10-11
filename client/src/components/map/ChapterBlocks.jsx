import { useUI } from '../../context/UIContext.jsx';
import { scenesForPov } from '../../utils/sceneMap.js';

const ACT_COLORS = {
  'Act I': '#5DCAA5',
  'Act II': '#7F77DD',
  'Act III': '#D85A30',
};

function getActColor(act) {
  return ACT_COLORS[act] || '#4a4a5e';
}

function heightForWordCount(wc) {
  const min = 24;
  const max = 80;
  const normalized = Math.min((wc || 0) / 5000, 1); // scale 0-5000 words
  return min + normalized * (max - min);
}

export default function ChapterBlocks({ chapters, pov = '' }) {
  const { state, dispatch } = useUI();
  const selectedId = state.selectedMapChapterId;

  return (
    <div className="chapter-blocks-wrap">
      <div className="chapter-blocks">
        {chapters.map((ch) => {
          const color = getActColor(ch.act);
          const blockHeight = heightForWordCount(ch.wordCount);
          const isSelected = ch.id === selectedId;
          const scenes = ch.scenes || [];
          const matches = pov ? scenesForPov(ch, pov).length : null;

          return (
            <button
              key={ch.id}
              className={`chapter-block${isSelected ? ' selected' : ''}${pov && matches === 0 ? ' dimmed' : ''}`}
              style={{
                height: `${blockHeight}px`,
                borderColor: color,
                background: isSelected ? `${color}33` : 'transparent',
              }}
              onClick={() => dispatch({ type: 'SET_MAP_CHAPTER', chapterId: ch.id })}
              title={`Ch. ${ch.number}: ${ch.title}`}
            >
              <span className="chapter-block-num">
                {ch.number}
              </span>
              {pov && matches > 0 && (
                <span className="chapter-block-pov-count" title={`${matches} ${pov} scene${matches === 1 ? '' : 's'}`}>
                  {matches}
                </span>
              )}
              {scenes.length > 0 && (
                <span className="chapter-block-ticks" aria-hidden="true">
                  {scenes.map((_, i) => <span key={i} className="chapter-block-tick" />)}
                </span>
              )}
              {ch.beat === null || ch.beat === undefined ? (
                <span
                  className="chapter-block-missing-dot"
                  style={{ background: '#e8a030' }}
                  title="No beat assigned"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
