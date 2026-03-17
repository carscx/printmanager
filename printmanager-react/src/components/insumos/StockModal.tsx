import { useState } from "react";
import { BottomSheet } from "../ui/BottomSheet";
import type { Insumo, StockTipo, StockMotivo } from "../../types/insumo";
import {
  STOCK_TIPO_LABELS,
  STOCK_MOTIVO_LABELS,
  INSUMO_UNIDAD_LABELS
} from "../../types/insumo";

interface StockModalProps {
  insumo: Insumo;
  onSave: (data: {
    tipo: StockTipo;
    motivo: StockMotivo;
    cantidad: number;
    notas: string;
  }) => Promise<void>;
  onClose: () => void;
}

const TIPOS: StockTipo[] = ["entrada", "salida", "ajuste"];
const MOTIVOS: StockMotivo[] = [
  "compra",
  "pedido",
  "ajuste_manual",
  "devolucion",
  "cancelacion"
];

export function StockModal({ insumo, onSave, onClose }: StockModalProps) {
  const [tipo, setTipo] = useState<StockTipo>("entrada");
  const [motivo, setMotivo] = useState<StockMotivo>("compra");
  const [cantidad, setCantidad] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  const cantidadNum = parseFloat(cantidad) || 0;
  const nuevoStock =
    tipo === "entrada"
      ? insumo.stock_actual + cantidadNum
      : tipo === "salida"
        ? insumo.stock_actual - cantidadNum
        : cantidadNum; // ajuste = valor absoluto

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cantidadNum <= 0 && tipo !== "ajuste") return;

    setSaving(true);
    try {
      await onSave({
        tipo,
        motivo,
        cantidad: cantidadNum,
        notas: notas.trim()
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open title="Movimiento de Stock" onClose={onClose}>
      {/* Info del insumo */}
      <div className="bg-slate-50 rounded-xl p-3">
        <p className="font-bold text-sm text-slate-800">{insumo.nombre}</p>
        <p className="text-xs text-slate-400 mt-1">
          Stock actual:{" "}
          <span className="font-black text-blue-600">
            {insumo.stock_actual} {INSUMO_UNIDAD_LABELS[insumo.unidad]}
          </span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tipo - tabs */}
        <div className="grid grid-cols-3 gap-2">
          {TIPOS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`py-3 rounded-xl text-xs font-bold cursor-pointer transition-colors active:scale-95 ${
                tipo === t
                  ? t === "entrada"
                    ? "bg-green-600 text-white shadow"
                    : t === "salida"
                      ? "bg-red-500 text-white shadow"
                      : "bg-amber-500 text-white shadow"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {STOCK_TIPO_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Motivo */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
            Motivo
          </label>
          <select
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as StockMotivo)}
            className="w-full p-3.5 bg-slate-50 rounded-xl font-bold text-sm border border-slate-100 cursor-pointer"
          >
            {MOTIVOS.map((m) => (
              <option key={m} value={m}>
                {STOCK_MOTIVO_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        {/* Cantidad */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
            {tipo === "ajuste" ? "Nuevo valor de stock" : "Cantidad"}
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="0"
            autoFocus
            required
            className="w-full p-3.5 bg-slate-50 rounded-xl font-black text-lg border border-slate-100 outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* Preview nuevo stock */}
        {cantidadNum > 0 && (
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-[10px] font-bold text-blue-400 uppercase">
              Nuevo stock
            </p>
            <p className="text-lg font-black text-blue-700">
              {nuevoStock} {INSUMO_UNIDAD_LABELS[insumo.unidad]}
            </p>
          </div>
        )}

        {/* Notas */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
            Notas (opcional)
          </label>
          <input
            type="text"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Compra mayorista, ajuste inventario..."
            className="w-full p-3.5 bg-slate-50 rounded-xl font-semibold text-sm border border-slate-100 outline-none"
          />
        </div>

        {/* Botones */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-4 font-bold text-slate-400 text-sm cursor-pointer bg-slate-50 rounded-xl active:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || (cantidadNum <= 0 && tipo !== "ajuste")}
            className="flex-1 py-4 bg-blue-600 text-white font-black uppercase text-[10px] tracking-widest rounded-xl shadow-lg cursor-pointer disabled:opacity-50 active:scale-95"
          >
            {saving ? (
              <>
                <i className="fas fa-circle-notch fa-spin mr-2" />
                Guardando...
              </>
            ) : (
              "Confirmar"
            )}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
