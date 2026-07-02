'use client';

import React, { useEffect, useId, useRef, useState, useMemo, useCallback } from 'react';

type PulseAutocompleteProps<T> = {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (item: T) => void;
  placeholder: string;
  suggestions: T[];
  getKey: (item: T) => string;
  renderItem: (item: T, active: boolean) => React.ReactNode;
  emptyHint?: string;
  inputClassName?: string;
  inputId?: string;
  inputName?: string;
};

export default function PulseAutocomplete<T>({
  value,
  onChange,
  onSelect,
  placeholder,
  suggestions,
  getKey,
  renderItem,
  emptyHint,
  inputClassName = '',
  inputId: inputIdProp,
  inputName = 'pulse-query',
}: PulseAutocompleteProps<T>) {
  const autoInputId = useId();
  const inputId = inputIdProp ?? autoInputId;
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const showList = open && (suggestions.length > 0 || emptyHint);

  useEffect(() => {
    setHighlight(0);
  }, [value, suggestions.length]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = useCallback(
    (item: T) => {
      onSelect?.(item);
      setOpen(false);
    },
    [onSelect],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!showList && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, Math.max(0, suggestions.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && showList && suggestions[highlight]) {
      e.preventDefault();
      pick(suggestions[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <input
        id={inputId}
        name={inputName}
        type="text"
        value={value}
        onChange={e => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={showList ? true : false}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        className={`w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-[11px] outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 ${inputClassName}`}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 max-h-[220px] overflow-y-auto custom-scrollbar bg-slate-900 border border-slate-700/80 rounded-lg shadow-2xl shadow-black/40 py-1"
        >
          {suggestions.length === 0 && emptyHint ? (
            <li className="px-3 py-2 text-[10px] text-slate-500 font-mono">{emptyHint}</li>
          ) : (
            suggestions.map((item, i) => (
              <li
                key={getKey(item)}
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={e => {
                  e.preventDefault();
                  pick(item);
                }}
                className={`cursor-pointer transition-colors ${
                  i === highlight ? 'bg-orange-500/15' : 'hover:bg-slate-800/60'
                }`}
              >
                {renderItem(item, i === highlight)}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
