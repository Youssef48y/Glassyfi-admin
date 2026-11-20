export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  tone = 'white',
  ariaLabel,
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`toggle-switch tone-${tone}${checked ? ' checked' : ''}`}
    />
  );
}
