export interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const Toggle: React.FC<ToggleProps> = ({ label, checked, onChange }) => {
  return (
    <label className="row" style={{ gap: 10, alignItems: "center" }}>
      <span className="label" style={{ margin: 0 }}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className="btn"
        onClick={() => onChange(!checked)}
        style={{
          padding: 6,
          width: 56,
          borderRadius: 9999,
          position: "relative",
          background: checked ? "rgba(134,239,172,0.18)" : "rgba(255,255,255,0.08)",
          borderColor: checked ? "rgba(134,239,172,0.35)" : "var(--border)",
        }}
      >
        <span
          style={{
            display: "block",
            width: 22,
            height: 22,
            borderRadius: 9999,
            background: "rgba(255,255,255,0.86)",
            transform: `translateX(${checked ? 26 : 0}px)`,
            transition: "transform 120ms ease",
          }}
        />
      </button>
    </label>
  );
};
