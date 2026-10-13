import { useNavigate } from 'react-router-dom';
import { useUI } from '../../context/UIContext.jsx';
import { sceneLabel } from '../../utils/scenes.js';
import { touches, laneGaps } from '../../utils/threadLanes.js';

const chapterNumber = (chapter, index) => chapter.number ?? index + 1;

function gapTitle(gap, chapters) {
  const from = chapterNumber(chapters[gap.start], gap.start);
  const to = chapterNumber(chapters[gap.end], gap.end);
  return `Untouched for ${gap.length} chapter${gap.length === 1 ? '' : 's'} (Ch. ${from} to Ch. ${to})`;
}

function Lane({ thread, chapters, openChapter, openScene }) {
  const marks = touches(thread, chapters);
  const gaps = laneGaps(thread, chapters);

  return (
    <li
      className={`thread-lane thread-lane--${thread.status}`}
      data-thread-id={thread.id}
    >
      <span className="thread-lane-label" title={thread.name}>
        <span className="thread-swatch" style={{ background: thread.color }} aria-hidden="true" />
        <span className="thread-lane-name">{thread.name}</span>
      </span>
      <div className="thread-lane-track" style={{ gridTemplateColumns: `repeat(${chapters.length}, minmax(0, 1fr))` }}>
        {gaps.map((gap) => (
          <div
            key={gap.start}
            className="thread-lane-gap"
            style={{ gridColumn: `${gap.start + 1} / ${gap.end + 2}` }}
            title={gapTitle(gap, chapters)}
          />
        ))}
        {chapters.map((chapter, i) => {
          const num = chapterNumber(chapter, i);
          const chapterTagged = !!chapter.threadIds?.includes(thread.id);
          const { sceneIndexes } = marks[i];
          return (
            <div key={chapter.id} className="thread-lane-cell" style={{ gridColumn: i + 1 }}>
              {chapterTagged && (
                <button
                  className="thread-lane-dot thread-lane-dot--chapter"
                  style={{ background: thread.color }}
                  data-chapter={chapter.id}
                  title={`Ch. ${num}: ${chapter.title}`}
                  onClick={() => openChapter(chapter)}
                />
              )}
              {sceneIndexes.map((si) => (
                <button
                  key={si}
                  className="thread-lane-dot"
                  style={{ background: thread.color }}
                  data-chapter={chapter.id}
                  data-scene={si}
                  title={`Ch. ${num}: ${chapter.title}, ${sceneLabel({ ...chapter.scenes[si], index: si })}`}
                  onClick={() => openScene(chapter, si)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </li>
  );
}

export default function ThreadLanes({ workId, threads = [], chapters = [] }) {
  const navigate = useNavigate();
  const { dispatch: uiDispatch } = useUI();

  const openChapter = (chapter) => navigate(`/work/${workId}/chapter/${chapter.id}`);
  const openScene = (chapter, sceneIndex) => {
    uiDispatch({ type: 'OPEN_SCENE', chapterId: chapter.id, sceneIndex });
    navigate(`/work/${workId}/chapter/${chapter.id}`);
  };

  return (
    <section className="thread-lanes">
      <h3 className="thread-lanes-title">Thread lanes</h3>
      {threads.length === 0 ? (
        <p className="thread-lanes-empty">No plot threads yet. Add one below, then tag scenes and chapters with it.</p>
      ) : (
        <ul className="thread-lane-list">
          {threads.map((thread) => (
            <Lane
              key={thread.id}
              thread={thread}
              chapters={chapters}
              openChapter={openChapter}
              openScene={openScene}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
