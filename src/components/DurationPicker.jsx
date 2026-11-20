const PRESETS = [
  { label: '15 دقيقة', amount: 15, unit: 'minutes' },
  { label: 'ساعة', amount: 1, unit: 'hours' },
  { label: '24 ساعة', amount: 24, unit: 'hours' },
  { label: '7 أيام', amount: 7, unit: 'days' },
  { label: '30 يوم', amount: 30, unit: 'days' },
  { label: 'مدى الحياة', amount: 0, unit: 'lifetime' },
];

export function DurationPicker({
  idPrefix = 'dur',
  amount,
  unit,
  onChange,
  disabled = false,
}) {
  const isLifetime = unit === 'lifetime';

  return (
    <div className="duration-picker">
      <div className="duration-presets">
        {PRESETS.map((p) => {
          const isActive =
            p.unit === unit && (p.unit === 'lifetime' || Number(amount) === p.amount);
          return (
            <button
              key={p.label}
              type="button"
              disabled={disabled}
              className={`duration-preset-btn${isActive ? ' active' : ''}`}
              onClick={() => onChange({ amount: p.amount || 1, unit: p.unit })}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="duration-inputs-row">
        <input
          id={`${idPrefix}-amount`}
          type="number"
          min={1}
          max={99999}
          className="input mono"
          disabled={disabled || isLifetime}
          value={isLifetime ? '' : amount}
          placeholder={isLifetime ? '∞' : '30'}
          onChange={(e) =>
            onChange({
              amount: e.target.value === '' ? '' : Math.max(1, Number(e.target.value)),
              unit,
            })
          }
        />

        <select
          id={`${idPrefix}-unit`}
          className="select"
          disabled={disabled}
          value={unit}
          onChange={(e) => {
            const nextUnit = e.target.value;
            onChange({
              amount: nextUnit === 'lifetime' ? 0 : Math.max(1, Number(amount) || 1),
              unit: nextUnit,
            });
          }}
        >
          <option value="minutes">دقيقة (Minutes)</option>
          <option value="hours">ساعة (Hours)</option>
          <option value="days">يوم (Days)</option>
          <option value="lifetime">مدى الحياة (Lifetime)</option>
        </select>
      </div>
    </div>
  );
}
