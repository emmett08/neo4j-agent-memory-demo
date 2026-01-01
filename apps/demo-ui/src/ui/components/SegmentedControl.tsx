export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
}

/**
 * Small segmented control for views/tabs.
 * Intentionally dependency-free; uses buttons and aria-current.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel = "View",
}: SegmentedControlProps<T>) {
  return (
    <div className="seg" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            className={`segBtn ${active ? "isActive" : ""}`}
            onClick={() => onChange(opt.value)}
            role="tab"
            aria-selected={active}
            aria-current={active ? "page" : undefined}
          >
            <span>{opt.label}</span>
            {typeof opt.count === "number" ? <span className="segCount">{opt.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
