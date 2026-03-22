import {
  useEffect,
  useState,
  type ChangeEvent,
  type ReactNode,
  type RefObject
} from "react";

interface NumberStepperProps {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  label?: ReactNode;
  /** Si es false, solo botones +/− (comportamiento anterior). */
  editable?: boolean;
  id?: string;
  /**
   * Al enfocar, si el valor coincide (ej. 0 páginas o 1 copia inicial), vacía el
   * campo para escribir sin el dígito inicial delante del cursor.
   */
  clearOnFocusWhen?: number;
  /** Borde rojo (validación). */
  error?: boolean;
  /** Ref al input numérico (focus tras scroll). */
  inputRef?: RefObject<HTMLInputElement | null>;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  disabled,
  label,
  editable = true,
  id,
  clearOnFocusWhen,
  error,
  inputRef,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid
}: NumberStepperProps) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  const dec = () => onChange(clamp(value - step));
  const inc = () => onChange(clamp(value + step));

  const applyDigits = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits === "") {
      setText("");
      return;
    }
    const n = parseInt(digits, 10);
    if (Number.isNaN(n)) return;
    onChange(clamp(n));
    setText(String(clamp(n)));
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === "") {
      setText("");
      return;
    }
    applyDigits(v);
  };

  const handleFocus = () => {
    if (
      clearOnFocusWhen !== undefined &&
      value === clearOnFocusWhen
    ) {
      setText("");
    }
  };

  const handleBlur = () => {
    if (text === "" || !/^\d+$/.test(text)) {
      onChange(clamp(min));
      setText(String(clamp(min)));
      return;
    }
    const n = parseInt(text, 10);
    if (Number.isNaN(n)) {
      setText(String(value));
      return;
    }
    const c = clamp(n);
    onChange(c);
    setText(String(c));
  };

  return (
    <div className="space-y-1">
      {label && (
        <span className="text-[10px] font-black text-slate-400 ml-2 uppercase block">
          {label}
        </span>
      )}
      <div
        className={`flex items-stretch justify-between gap-1 rounded-sm border-2 p-1 ${
          error
            ? "bg-red-50 border-red-400"
            : "bg-slate-50 border-slate-100"
        } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
      >
        <button
          type="button"
          onClick={dec}
          disabled={disabled || value <= min}
          className="min-w-12 min-h-12 flex items-center justify-center rounded-sm bg-white shadow-sm text-slate-700 font-black text-xl active:scale-95 disabled:opacity-40 shrink-0"
          aria-label="Menos"
        >
          −
        </button>
        {editable ? (
          <input
            ref={inputRef}
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            aria-valuenow={value}
            aria-invalid={ariaInvalid ?? error}
            aria-describedby={ariaDescribedBy}
            value={text}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={disabled}
            className={`flex-1 min-w-0 min-h-12 text-center font-black text-xl tabular-nums bg-transparent outline-none rounded-sm ${
              error
                ? "text-red-800 focus:ring-2 focus:ring-red-300"
                : "text-blue-600 focus:ring-2 focus:ring-blue-200"
            }`}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center min-h-12">
            <span className="font-black text-xl text-blue-600 tabular-nums">
              {value}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={inc}
          disabled={disabled || value >= max}
          className="min-w-12 min-h-12 flex items-center justify-center rounded-sm bg-white shadow-sm text-slate-700 font-black text-xl active:scale-95 disabled:opacity-40 shrink-0"
          aria-label="Más"
        >
          +
        </button>
      </div>
    </div>
  );
}
