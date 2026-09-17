import { useEffect } from 'react';

/** True when focus is in a field, so global single-key shortcuts stay quiet. */
export function isTyping(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null;
  if (!n) return false;
  const tag = n.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || n.isContentEditable;
}

export type Binding = {
  key: string;
  meta?: boolean;
  shift?: boolean;
  /** Allow the binding to fire while a field has focus. */
  whileTyping?: boolean;
  run: (e: KeyboardEvent) => void;
};

export function useHotkeys(bindings: Binding[], deps: unknown[] = []) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      for (const b of bindings) {
        if (e.key.toLowerCase() !== b.key.toLowerCase()) continue;
        if (b.meta && !(e.metaKey || e.ctrlKey)) continue;
        if (!b.meta && (e.metaKey || e.ctrlKey)) continue;
        if (b.shift && !e.shiftKey) continue;
        if (!b.whileTyping && isTyping(e.target)) continue;
        e.preventDefault();
        b.run(e);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
