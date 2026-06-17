import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { WorksProvider } from './context/WorksContext.jsx';
import { ActiveWorkProvider } from './context/ActiveWorkContext.jsx';
import { EditorProvider } from './context/EditorContext.jsx';
import { UIProvider } from './context/UIContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <WorksProvider>
      <ActiveWorkProvider>
        <EditorProvider>
          <UIProvider>
            <App />
          </UIProvider>
        </EditorProvider>
      </ActiveWorkProvider>
    </WorksProvider>
  </BrowserRouter>
);
