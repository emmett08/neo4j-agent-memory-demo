import { useMemo, useRef, useState } from "react";

export interface ChipInputProps {
  label: string;
  value: string[];
  placeholder?: string;
  onChange: (value: string[]) => void;
  helper?: React.ReactNode;
}

const normalise = (s: string) => s.trim().replace(/\s+/g, " ");

export const ChipInput: React.FC<ChipInputProps> = ({ label, value, placeholder, onChange, helper }) => {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const chips = useMemo(() => value.map(normalise).filter(Boolean), [value]);

  const addChip = (raw: string) => {
    const next = normalise(raw);
    if (!next) return;
    if (chips.some((c) => c.toLowerCase() === next.toLowerCase())) return;
    onChange([...chips, next]);
    setDraft("");
    inputRef.current?.focus();
  };

  const removeAt = (idx: number) => onChange(chips.filter((_, i) => i !== idx));

  return (
    <div>
      <div className="label">{label}</div>
      <div className="row" style={{ gap: 8 }}>
        {chips.map((c, i) => (
          <span key={`${c}-${i}`} className="pill">
            <span className="mono">{c}</span>
            <button
              type="button"
              className="btn"
              style={{ padding: "2px 8px", borderRadius: 9999 }}
              aria-label={`Remove ${c}`}
              onClick={() => removeAt(i)}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addChip(draft);
            }
            if (e.key === "Backspace" && draft.length === 0 && chips.length > 0) {
              removeAt(chips.length - 1);
            }
          }}
          placeholder={placeholder ?? "Type and press Enter"}
          aria-label={label}
          style={{
            flex: 1,
            minWidth: 180,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "rgba(0,0,0,0.22)",
            color: "var(--text)",
            padding: "10px 10px",
            outline: "none",
          }}
        />
        <span className="pill" aria-hidden="true">
          <span className="mono">Enter</span> <span className="kbd">↵</span>
          <span style={{ width: 8 }} />
          <span className="mono">Backspace</span> <span className="kbd">⌫</span>
        </span>
      </div>
      {helper ? <div className="small" style={{ marginTop: 8 }}>{helper}</div> : null}
    </div>
  );
};
