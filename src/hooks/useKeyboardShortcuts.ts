import { useEffect } from 'react';

type ShortcutHandler = (e: KeyboardEvent) => void;

interface Shortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  handler: ShortcutHandler;
  enabled?: boolean;
}

function match(e: KeyboardEvent, s: Shortcut): boolean {
  if (e.key.toLowerCase() !== s.key.toLowerCase()) return false;
  if (s.ctrl && !e.ctrlKey) return false;
  if (s.meta && !e.metaKey) return false;
  if (s.shift && !e.shiftKey) return false;
  if (!s.ctrl && !s.meta && (e.ctrlKey || e.metaKey)) return false;
  return true;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      for (const s of shortcuts) {
        if (s.enabled === false) continue;
        if (match(e, s)) {
          e.preventDefault();
          s.handler(e);
          return;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}

export function useCmdK(handler: () => void) {
  useKeyboardShortcuts([{ key: 'k', meta: true, handler }]);
}
