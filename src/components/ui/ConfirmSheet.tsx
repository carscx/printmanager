import { useState, useCallback } from "react";
import { BottomSheet } from "./BottomSheet";

interface ConfirmSheetState {
  open: boolean;
  tipo: "danger" | "success";
  titulo: string;
  texto: string;
  onConfirm: (() => Promise<void>) | null;
}

const initialState: ConfirmSheetState = {
  open: false,
  tipo: "success",
  titulo: "",
  texto: "",
  onConfirm: null
};

export function useConfirmSheet() {
  const [state, setState] = useState<ConfirmSheetState>(initialState);

  const abrir = useCallback(
    (
      tipo: "danger" | "success",
      titulo: string,
      texto: string,
      onConfirm: () => Promise<void>
    ) => {
      setState({ open: true, tipo, titulo, texto, onConfirm });
    },
    []
  );

  const cerrar = useCallback(() => {
    setState(initialState);
  }, []);

  return { state, abrir, cerrar };
}

interface ConfirmSheetProps {
  open: boolean;
  tipo: "danger" | "success";
  titulo: string;
  texto: string;
  onConfirm: (() => Promise<void>) | null;
  onClose: () => void;
}

export function ConfirmSheet({
  open,
  tipo,
  titulo,
  texto,
  onConfirm,
  onClose
}: ConfirmSheetProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!onConfirm) return;
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="text-center py-4">
        <div
          className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl ${
            tipo === "danger"
              ? "bg-red-100 text-red-500"
              : "bg-green-100 text-green-500"
          }`}
        >
          <i
            className={`fas ${tipo === "danger" ? "fa-trash-alt" : "fa-check-circle"}`}
          />
        </div>
        <h3 className="text-lg font-black text-slate-800 mb-1">{titulo}</h3>
        <p className="text-slate-500 text-sm mb-8">{texto}</p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-4 font-bold text-slate-400 text-sm bg-slate-100 rounded-sm cursor-pointer active:bg-slate-200"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`flex-1 py-4 text-white font-black rounded-sm shadow-lg uppercase text-[10px] tracking-widest cursor-pointer disabled:opacity-50 active:scale-95 transition-transform ${
              tipo === "danger" ? "bg-red-500" : "bg-green-500"
            }`}
          >
            {loading ? (
              <i className="fas fa-circle-notch fa-spin" />
            ) : (
              "Confirmar"
            )}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
