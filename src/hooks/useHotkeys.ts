// src/hooks/useHotkeys.ts
import { useEffect } from "react";

/**
 * Global keyboard shortcuts:
 *   /  -> focus the first search input on the page
 *   n  -> click button/link with data-hotkey="new" (open create modal)
 *   e  -> click button/link with data-hotkey="export" (export CSV)
 *
 * Shortcuts are ignored when:
 *   - user is typing in an input/textarea/select/contenteditable
 *   - a modal dialog is open (role="dialog" aria-modal="true")
 *   - Ctrl/Cmd/Alt is pressed
 */
export default function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore while modifier keys are held
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target as HTMLElement | null;

      // Ignore when typing in form fields / editable content
      const isTyping =
        !!target &&
        !!target.closest(
          "input, textarea, select, [contenteditable], [contenteditable='true']"
        );
      if (isTyping) return;

      // Ignore if a modal is open
      const modalOpen = !!document.querySelector(
        '[role="dialog"][aria-modal="true"]'
      );
      if (modalOpen) return;

      const key = e.key.toLowerCase();

      // Focus a search input
      if (key === "/") {
        e.preventDefault();
        const input =
          document.querySelector<HTMLInputElement>("input[aria-label^='Search']") ||
          document.querySelector<HTMLInputElement>("input[aria-label*='search' i]") ||
          document.querySelector<HTMLInputElement>("input[placeholder*='search' i]") ||
          document.querySelector<HTMLInputElement>("input[type='search']");
        if (input) {
          input.focus();
          input.select?.();
        }
        return;
      }

      // Open "New ..." modal on current page
      if (key === "n") {
        const el = document.querySelector<HTMLElement>("[data-hotkey='new']");
        if (el) {
          e.preventDefault();
          el.click();
        }
        return;
      }

      // Export CSV on current page
      if (key === "e") {
        const el = document.querySelector<HTMLElement>("[data-hotkey='export']");
        if (el) {
          e.preventDefault();
          el.click();
        }
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
