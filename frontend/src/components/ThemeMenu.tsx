import { useEffect, useRef, useState } from "react";

import { THEMES, type ThemeId } from "../lib/useTheme";
import Icon from "./Icons";

/* Theme picker. A disclosure button and a short list of pressed/unpressed
 * buttons rather than an ARIA menu: five options do not need roving focus or
 * arrow-key handling, and plain buttons get keyboard and screen reader support
 * for free. Each option shows a swatch, so a visitor can see a theme before
 * committing to it. */
export default function ThemeMenu({ theme, setTheme }: { theme: ThemeId; setTheme: (t: ThemeId) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  useEffect(() => {
    if (!open) return;

    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="theme-menu" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="pill-btn"
        aria-expanded={open}
        aria-controls="theme-list"
        aria-label={`Colour theme: ${current.label}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="contrast" />
        <span className="theme-menu-label">{current.label}</span>
      </button>

      {open && (
        <div id="theme-list" className="theme-list" role="group" aria-label="Colour theme">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="theme-option"
              aria-pressed={t.id === theme}
              onClick={() => {
                setTheme(t.id);
                setOpen(false);
                buttonRef.current?.focus();
              }}
            >
              <span
                className="swatch"
                aria-hidden="true"
                style={{ background: `linear-gradient(135deg, ${t.swatch[0]} 50%, ${t.swatch[1]} 50%)` }}
              />
              <span>
                <span className="theme-option-label">{t.label}</span>
                <span className="theme-option-hint">{t.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
