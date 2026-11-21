const EXPIRY_PRESETS = [
  { label: '10 ثواني', amount: 10, unit: 'seconds' },
  { label: 'دقيقة', amount: 1, unit: 'minutes' },
  { label: 'ساعة', amount: 1, unit: 'hours' },
  { label: 'يوم', amount: 1, unit: 'days' },
  { label: 'دائم', amount: 0, unit: 'never' },
];

export function ExpiryPicker({
  idPrefix = 'exp',
  amount,
  unit,
  onChange,
  disabled = false,
}) {
  const isNever = unit === 'never';

  return (
    <div className="duration-picker">
      <div className="duration-presets">
        {EXPIRY_PRESETS.map((p) => {
          const isActive =
            p.unit === unit && (p.unit === 'never' || Number(amount) === p.amount);
          return (
            <button
              key={p.label}
              type="button"
              disabled={disabled}
              className={`duration-preset-btn${isActive ? ' active' : ''}`}
              onClick={() => onChange({ amount: p.amount || 0, unit: p.unit })}
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
          disabled={disabled || isNever}
          value={isNever ? '' : amount}
          placeholder={isNever ? '∞' : '10'}
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
              amount: nextUnit === 'never' ? 0 : Math.max(1, Number(amount) || 1),
              unit: nextUnit,
            });
          }}
        >
          <option value="seconds">ثانية</option>
          <option value="minutes">دقيقة</option>
          <option value="hours">ساعة</option>
          <option value="days">يوم</option>
          <option value="never">بدون انتهاء</option>
        </select>
      </div>
    </div>
  );
}
