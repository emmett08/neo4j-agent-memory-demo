import { useEffect, useState } from "react";

export interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

/**
 * Clipboard copy button with small feedback state.
 * Uses Clipboard API (supported on localhost).
 */
export function CopyButton({ value, label = "Copy", className }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (state === "copied" || state === "error") {
      const t = window.setTimeout(() => setState("idle"), 1200);
      return () => window.clearTimeout(t);
    }
  }, [state]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("error");
    }
  }

  const text = state === "copied" ? "Copied" : state === "error" ? "Copy failed" : label;

  return (
    <button type="button" className={`btn btnSmall ${className ?? ""}`} onClick={onCopy}>
      {text}
    </button>
  );
}
