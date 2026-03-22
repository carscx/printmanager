import { useMemo, useState, useEffect } from "react";
import { BottomSheet } from "./BottomSheet";

export interface ActionOption<T extends string = string> {
  value: T;
  label: string;
}

interface ActionSheetProps<T extends string> {
  open: boolean;
  onClose: () => void;
  title: string;
  options: ActionOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Lista larga (anillado, insumos): filtro por texto */
  searchable?: boolean;
}

export function ActionSheet<T extends string>({
  open,
  onClose,
  title,
  options,
  value,
  onChange,
  searchable = false
}: ActionSheetProps<T>) {
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const filtered = useMemo(() => {
    if (!searchable || !q.trim()) return options;
    const lower = q.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower));
  }, [options, q, searchable]);

  const handleClose = () => {
    setQ("");
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      title={title}
      zIndexClass="z-[100]"
    >
      {searchable && options.length > 6 && (
        <div className="mb-4 sticky top-0 bg-white pb-2 z-10">
          <input
            type="search"
            inputMode="search"
            placeholder="Buscar…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full min-h-12 px-4 py-3 rounded-sm bg-slate-100 border border-slate-200 font-bold text-sm outline-none focus:ring-2 focus:ring-blue-200"
            autoComplete="off"
          />
        </div>
      )}
      <ul className="space-y-2 pb-4">
        {filtered.length === 0 ? (
          <li className="text-center text-slate-400 font-bold text-sm py-8">
            Sin resultados
          </li>
        ) : (
          filtered.map((opt) => (
            <li key={String(opt.value)}>
              <button
                type="button"
                className={`w-full text-left min-h-12 px-4 py-3.5 rounded-sm font-bold text-sm transition-all active:scale-[0.99] ${
                  opt.value === value
                    ? "bg-slate-900 text-white ring-2 ring-blue-400"
                    : "bg-slate-50 text-slate-800 hover:bg-slate-100 border border-slate-100"
                }`}
                onClick={() => {
                  onChange(opt.value);
                  handleClose();
                }}
              >
                {opt.label}
              </button>
            </li>
          ))
        )}
      </ul>
    </BottomSheet>
  );
}

interface ActionSheetTriggerProps {
  label: string;
  displayValue: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

/** Botón que abre el ActionSheet (zona táctil ≥48px) */
export function ActionSheetTrigger({
  label,
  displayValue,
  onClick,
  disabled,
  className = ""
}: ActionSheetTriggerProps) {
  return (
    <div className="space-y-1">
      {label && (
        <span className="text-[10px] font-black text-slate-400 ml-2 uppercase block">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`w-full min-h-12 flex items-center justify-between gap-3 px-4 py-3.5 bg-slate-50 rounded-sm font-bold text-sm text-slate-700 border border-slate-100 outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-50 ${className}`}
      >
        <span className="truncate text-left">{displayValue}</span>
        <i className="fas fa-chevron-down text-slate-400 flex-shrink-0" />
      </button>
    </div>
  );
}
