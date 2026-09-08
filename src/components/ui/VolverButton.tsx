interface VolverButtonProps {
  onClick: () => void;
  /** Visible; el aria-label aclara que no se guarda. */
  label?: string;
}

/** Vuelve atrás sin persistir. Zona táctil ≥44px. */
export function VolverButton({
  onClick,
  label = "Volver"
}: VolverButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 min-h-11 px-1 -ml-1 text-xs font-black uppercase tracking-[0.2em] text-slate-500 hover:text-slate-800 active:text-slate-900 cursor-pointer"
      aria-label="Volver sin guardar cambios"
    >
      <i className="fas fa-arrow-left" aria-hidden />
      {label}
    </button>
  );
}
