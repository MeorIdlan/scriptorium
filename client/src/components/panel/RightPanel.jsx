import { useLayoutEffect, useRef } from 'react';
import { useUI } from '../../context/UIContext.jsx';
import QuillTab from './QuillTab.jsx';
import CodexTab from './CodexTab.jsx';
import CatchTab from './CatchTab.jsx';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { useEditor } from '../../context/EditorContext.jsx';
import { openCountsByChapter } from '../../utils/catchGroups.js';

const SLIDE = 'left 0.22s cubic-bezier(0.4,0,0.2,1), width 0.22s cubic-bezier(0.4,0,0.2,1)';

const TABS = [
  { id: 'quill', label: 'Quill' },
  { id: 'codex', label: 'Codex' },
  { id: 'catch', label: 'Catch' },
];

export default function RightPanel({ workId }) {
  const { state, dispatch } = useUI();
  const { activePanelTab } = state;
  const { state: workState } = useActiveWork();
  const { state: editorState } = useEditor();
  const catchCount = openCountsByChapter(workState.catches).get(editorState.chapterId) || 0;
  const tabsRef = useRef(null);
  const indicatorRef = useRef(null);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    const tabs = tabsRef.current;
    const indicator = indicatorRef.current;
    if (!tabs || !indicator) return;

    const active = tabs.querySelector('.panel-tab.active');
    if (!active) return;

    indicator.style.transition = mounted.current ? SLIDE : 'none';
    indicator.style.left = `${active.offsetLeft}px`;
    indicator.style.width = `${active.offsetWidth}px`;
    mounted.current = true;
  }, [activePanelTab, catchCount]);

  return (
    <div className="right-panel">
      <div className="panel-tabs" ref={tabsRef}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`panel-tab${activePanelTab === tab.id ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'SET_PANEL_TAB', tab: tab.id })}
            title={tab.id === 'catch' && catchCount > 0 ? `${catchCount} open catch${catchCount === 1 ? '' : 'es'} for this chapter` : undefined}
          >
            {tab.id === 'catch' && catchCount > 0 ? `${tab.label} · ${catchCount}` : tab.label}
          </button>
        ))}
        <div ref={indicatorRef} className="panel-tab-indicator" />
      </div>

      <div className="panel-body">
        <div key={activePanelTab} className="tab-enter">
          {activePanelTab === 'quill' && <QuillTab workId={workId} />}
          {activePanelTab === 'codex' && <CodexTab workId={workId} />}
          {activePanelTab === 'catch' && <CatchTab workId={workId} />}
        </div>
      </div>
    </div>
  );
}
