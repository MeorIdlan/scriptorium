import { useNavigate } from 'react-router-dom';
import { useUI } from '../../context/UIContext.jsx';
import useHiddenLanes from '../../hooks/useHiddenLanes.js';
import { sceneLabel } from '../../utils/scenes.js';
import { touches, laneGaps, openAtEnd } from '../../utils/threadLanes.js';

const chapterNumber = (chapter, index) => chapter.number ?? index + 1;

function gapTitle(gap, chapters) {
  const from = chapterNumber(chapters[gap.start], gap.start);
  const to = chapterNumber(chapters[gap.end], gap.end);
  return `Untouched for ${gap.length} chapter${gap.length === 1 ? '' : 's'} (Ch. ${from} to Ch. ${to})`;
}

function Lane({ thread, chapters, hidden, setShown, openChapter, openScene }) {
  const marks = touches(thread, chapters);
  const gaps = laneGaps(thread, chapters);

  return (
    <li
      className={`thread-lane thread-lane--${thread.status}${hidden ? ' thread-lane--hidden' : ''}`}
      data-thread-id={thread.id}
    >
      <span className="thread-lane-label" title={thread.name}>
        <input
          type="checkbox"
          checked={!hidden}
          aria-label={`Show ${thread.name}`}
          onChange={(e) => setShown(thread.id, e.target.checked)}
        />
        <span className="thread-swatch" style={{ background: thread.color }} aria-hidden="true" />
        <span className="thread-lane-name">{thread.name}</span>
      </span>
      {!hidden && <div className="thread-lane-track" style={{ gridTemplateColumns: `repeat(${chapters.length}, minmax(0, 1fr))` }}>
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
      </div>}
    </li>
  );
}

function OpenAtEnd({ items, chapters }) {
  return (
    <div className="thread-open-end">
      <h4 className="thread-open-end-title">Open at the end</h4>
      {items.length === 0 ? (
        <p className="thread-lanes-empty">None among the lanes shown.</p>
      ) : (
        <ul className="thread-open-end-list">
          {items.map(({ thread, lastChapter }) => (
            <li key={thread.id} className="thread-open-end-item" data-thread-id={thread.id}>
              <span className="thread-swatch" style={{ background: thread.color }} aria-hidden="true" />
              <span className="thread-lane-name">{thread.name}</span>
              <span className="thread-open-end-last">
                {lastChapter === null ? 'never touched' : `last touched in Ch. ${chapterNumber(chapters[lastChapter], lastChapter)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ThreadLanes({ workId, threads = [], chapters = [] }) {
  const navigate = useNavigate();
  const { dispatch: uiDispatch } = useUI();
  const { isHidden, setShown } = useHiddenLanes(workId);

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
              hidden={isHidden(thread.id)}
              setShown={setShown}
              openChapter={openChapter}
              openScene={openScene}
            />
          ))}
        </ul>
      )}
      {threads.length > 0 && (
        <OpenAtEnd items={openAtEnd(threads.filter((t) => !isHidden(t.id)), chapters)} chapters={chapters} />
      )}
    </section>
  );
}
