import { DEEP_LINK_PRESETS } from '../lib/constants';

const PRESET_VALUES = new Set(
  DEEP_LINK_PRESETS.filter((p) => p.value !== '__custom__').map((p) => p.value),
);

export function DeepLinkPicker({
  id = 'deep-link',
  label = 'التوجيه التلقائي داخل التطبيق (Deep Link)',
  value,
  onChange,
}) {
  const isPreset = PRESET_VALUES.has(value || '');
  const selectValue = isPreset ? value || '' : '__custom__';

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        <span>{label}</span>
        <span className="field-hint">(اختياري)</span>
      </label>

      <select
        id={id}
        className="select"
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === '__custom__') {
            if (isPreset) onChange('glassyfi://wallpaper/');
          } else {
            onChange(next);
          }
        }}
      >
        {DEEP_LINK_PRESETS.map((opt) => (
          <option key={opt.value || 'none'} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {selectValue === '__custom__' && (
        <input
          type="text"
          className="input mono"
          placeholder="glassyfi://wallpaper/<id> أو https://..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
