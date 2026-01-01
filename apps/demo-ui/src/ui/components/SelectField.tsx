export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<SelectOption<T>>;
  onChange: (v: T) => void;
}

export function SelectField<T extends string>({ label, value, options, onChange }: SelectFieldProps<T>) {
  return (
    <div style={{ minWidth: 160 }}>
      <div className="label">{label}</div>
      <select
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value as T)}
        style={{
          width: "100%",
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "rgba(0,0,0,0.22)",
          color: "var(--text)",
          padding: "10px 10px",
          outline: "none",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ color: "#000" }}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
