import { useId } from 'react';

export default function ParamSliders({ maxTokens, temperature, onChange }) {
  const maxTokensId = useId();
  const temperatureId = useId();
  return (
    <div className="param-sliders">
      <div className="form-group">
        <label className="form-label" htmlFor={maxTokensId}>
          Max Tokens: <strong>{maxTokens || 2048}</strong>
        </label>
        <input
          id={maxTokensId}
          type="range"
          className="param-slider"
          min="256"
          max="8000"
          step="64"
          value={maxTokens || 2048}
          onChange={(e) => onChange('maxTokens', Number(e.target.value))}
        />
        <div className="param-slider-range">
          <span>256</span>
          <span>8000</span>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor={temperatureId}>
          Temperature: <strong>{(temperature ?? 0.7).toFixed(2)}</strong>
        </label>
        <input
          id={temperatureId}
          type="range"
          className="param-slider"
          min="0"
          max="1"
          step="0.05"
          value={temperature ?? 0.7}
          onChange={(e) => onChange('temperature', Number(e.target.value))}
        />
        <div className="param-slider-range">
          <span>0 (precise)</span>
          <span>1 (creative)</span>
        </div>
      </div>
    </div>
  );
}
