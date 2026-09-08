import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject
} from "react";
import { addCalendarDaysFromTodayAR } from "../../utils/dateAr";

const DIAS_DEFAULT = 5;

const QUICK = [
  { dias: 5, label: "Próximos 5 días" },
  { dias: 7, label: "Próximos 7 días" },
  { dias: 10, label: "Próximos 10 días" }
] as const;

function fechaRapida(dias: number): string {
  return addCalendarDaysFromTodayAR(dias);
}

function esFechaRapida(value: string): boolean {
  if (!value) return false;
  return QUICK.some(({ dias }) => fechaRapida(dias) === value);
}

export interface FechaEntregaSelectorProps {
  value: string;
  onChange: (fecha: string) => void;
  error?: boolean;
  fechaInputRef?: RefObject<HTMLInputElement | null>;
  onClearError?: () => void;
}

export const FechaEntregaSelector = forwardRef<
  HTMLDivElement,
  FechaEntregaSelectorProps
>(function FechaEntregaSelector(
  { value, onChange, error, fechaInputRef, onClearError },
  ref
) {
  const [personalizado, setPersonalizado] = useState(false);

  useLayoutEffect(() => {
    if (error) setPersonalizado(true);
  }, [error]);

  useEffect(() => {
    if (value || error) return;
    onChange(fechaRapida(DIAS_DEFAULT));
  }, [value, error, onChange]);

  useEffect(() => {
    if (!value) {
      if (!error) setPersonalizado(false);
    } else if (!esFechaRapida(value)) setPersonalizado(true);
  }, [value, error]);

  useLayoutEffect(() => {
    if (!error || !personalizado) return;
    fechaInputRef?.current?.focus({ preventScroll: true });
  }, [error, personalizado, fechaInputRef]);

  const pickQuick = (dias: number) => {
    setPersonalizado(false);
    onChange(fechaRapida(dias));
    onClearError?.();
  };

  const openPersonalizado = () => {
    setPersonalizado(true);
    if (!value) onChange(fechaRapida(0));
    onClearError?.();
  };

  const errClass = error
    ? "border-red-400 bg-red-50 focus:ring-2 focus:ring-red-200 text-red-900"
    : "border-blue-100 bg-blue-50/30 text-blue-900 focus:ring-2 focus:ring-blue-200";

  return (
    <div
      ref={ref}
      className={`space-y-3 rounded-sm ${error ? "ring-2 ring-red-200/80 p-1 -m-1" : ""}`}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {QUICK.map(({ dias, label }) => {
          const f = fechaRapida(dias);
          const active = !personalizado && value === f;
          return (
            <button
              key={dias}
              type="button"
              onClick={() => pickQuick(dias)}
              className={`py-3 px-2 rounded-sm text-[10px] font-black uppercase tracking-wide border-2 transition-all ${
                active
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-100 bg-white text-slate-600 hover:border-slate-200"
              }`}
            >
              {label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={openPersonalizado}
          className={`py-3 px-2 rounded-sm text-[10px] font-black uppercase tracking-wide border-2 transition-all ${
            personalizado
              ? "border-violet-600 bg-violet-600 text-white"
              : "border-slate-100 bg-white text-slate-600 hover:border-slate-200"
          }`}
        >
          Personalizado
        </button>
      </div>

      {personalizado && (
        <input
          ref={fechaInputRef}
          id="pedido-fecha-entrega"
          type="date"
          name="fecha_entrega"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onClearError?.();
          }}
          aria-invalid={error}
          aria-describedby={error ? "err-fecha" : undefined}
          className={`w-full p-4 rounded-sm outline-none font-bold border-2 transition-all ${errClass}`}
        />
      )}
    </div>
  );
});
