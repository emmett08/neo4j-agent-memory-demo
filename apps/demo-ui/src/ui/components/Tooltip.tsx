import { useId, type ReactNode } from "react";

export interface TooltipProps {
  label: string;
  content: ReactNode;
}

/**
 * Tiny tooltip (no dependencies).
 * - Appears on hover/focus (via :focus-within)
 * - Accessible: trigger has aria-describedby to role="tooltip"
 *
 * For complex UI consider a dedicated a11y tooltip library;
 * this is intentionally minimal for the demo.
 */
export function Tooltip({ label, content }: TooltipProps) {
  const id = useId();
  return (
    <span className="tooltip">
      <button type="button" className="tooltipTrigger" aria-label={label} aria-describedby={id}>
        i
      </button>
      <span id={id} role="tooltip" className="tooltipBubble">
        {content}
      </span>
    </span>
  );
}
