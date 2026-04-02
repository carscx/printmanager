import { useState, useEffect, useCallback } from "react";
import { BottomSheet } from "../ui/BottomSheet";
import { ActionSheet, ActionSheetTrigger } from "../ui/ActionSheet";
import type {
  Insumo,
  StockTipo,
  StockMotivo,
  StockMovimiento
} from "../../types/insumo";
import { STOCK_TIPO_LABELS, STOCK_MOTIVO_LABELS } from "../../types/insumo";
import { insumosApi } from "../../services/insumosApi";
import {
  etiquetaStockCategoria,
  stockFisicoTexto
} from "../../utils/insumoStockHuman";
import { showToast } from "../ui/Toast";
import {
  ML_POR_LITRO_TINTA,
  rendimientoEfectivoInsumo
} from "../../services/bomCosto";

function factorHumanoABd(insumo: Insumo): number {
  if (insumo.categoria === "papel" || insumo.categoria === "toner") {
    return rendimientoEfectivoInsumo(insumo);
  }
  /** Tinta: cantidad humana en litros; BD = ml. */
  if (insumo.categoria === "tinta") {
    return ML_POR_LITRO_TINTA;
  }
  return 1;
}

/** Convierte cantidad en unidades humanas → delta en unidades de BD (hojas, carillas, u.). */
function cantidadMovimientoDb(
  insumo: Insumo,
  tipo: StockTipo,
  cantidadHumano: number
): number {
  const f = factorHumanoABd(insumo);
  if (tipo === "ajuste") {
    const nuevoDb = cantidadHumano * f;
    return nuevoDb - Number(insumo.stock_actual);
  }
  const delta = cantidadHumano * f;
  if (tipo === "salida") return -delta;
  return delta;
}

interface StockModalProps {
  insumo: Insumo;
  onSave: (data: {
    tipo: StockTipo;
    motivo: StockMotivo;
    cantidad: number;
    notas: string;
    /** Entrada + compra: precio del bulto; actualiza costo de reposición global. */
    precioCompraBulto?: number;
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
const MOTIVO_OPTS = MOTIVOS.map((m) => ({
  value: m,
  label: STOCK_MOTIVO_LABELS[m]
}));

function textoCantidadMovimiento(m: StockMovimiento): string {
  const n = Number(m.cantidad);
  if (!Number.isFinite(n)) return "—";
  if (m.tipo === "salida") {
    const abs = Math.abs(n);
    return n < 0 ? String(n) : `−${abs}`;
  }
  if (m.tipo === "entrada" && n > 0) return `+${n}`;
  return String(n);
}

export function StockModal({ insumo, onSave, onClose }: StockModalProps) {
  const [tipo, setTipo] = useState<StockTipo>("entrada");
  const [motivo, setMotivo] = useState<StockMotivo>("compra");
  const [cantidad, setCantidad] = useState("");
  const [notas, setNotas] = useState("");
  const [precioCompra, setPrecioCompra] = useState("");
  const [saving, setSaving] = useState(false);
  const [sheetMotivo, setSheetMotivo] = useState(false);
  const [historial, setHistorial] = useState<StockMovimiento[]>([]);
  const [historialLoading, setHistorialLoading] = useState(true);

  const cargarHistorial = useCallback(async () => {
    setHistorialLoading(true);
    try {
      const rows = await insumosApi.fetchMovimientos(insumo.id, 80);
      setHistorial(rows);
    } catch {
      setHistorial([]);
    } finally {
      setHistorialLoading(false);
    }
  }, [insumo.id]);

  useEffect(() => {
    void cargarHistorial();
  }, [cargarHistorial]);

  const requierePrecioCompra =
    tipo === "entrada" && motivo === "compra";

  useEffect(() => {
    const p = Number(insumo.precio_compra ?? insumo.costo_compra ?? insumo.costo_base);
    if (Number.isFinite(p) && p > 0) {
      setPrecioCompra(String(p));
    } else {
      setPrecioCompra("");
    }
  }, [insumo.id, insumo.precio_compra, insumo.costo_compra, insumo.costo_base]);

  const cantidadNum = parseFloat(cantidad) || 0;
  const factorHumano = factorHumanoABd(insumo);
  const deltaDb =
    tipo === "entrada"
      ? cantidadNum * factorHumano
      : tipo === "salida"
        ? -cantidadNum * factorHumano
        : cantidadNum * factorHumano - Number(insumo.stock_actual);
  const nuevoStock = Number(insumo.stock_actual) + deltaDb;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cantidadNum <= 0 && tipo !== "ajuste") return;

    let precioCompraBulto: number | undefined;
    if (requierePrecioCompra) {
      const p = parseFloat(precioCompra.replace(",", "."));
      if (!Number.isFinite(p) || p <= 0) {
        showToast("INDICÁ EL PRECIO DEL BULTO DE ESTA COMPRA", "error");
        return;
      }
      precioCompraBulto = p;
    }

    setSaving(true);
    try {
      await onSave({
        tipo,
        motivo,
        cantidad: cantidadMovimientoDb(insumo, tipo, cantidadNum),
        notas: notas.trim(),
        precioCompraBulto
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <BottomSheet open title="Ajuste manual de stock" onClose={onClose}>
      {/* Info del insumo */}
      <div className="bg-slate-50 rounded-sm p-3">
        <p className="font-bold text-sm text-slate-800">{insumo.nombre}</p>
        <p className="text-xs text-slate-400 mt-1">
          Stock actual:{" "}
          <span className="font-black text-blue-600">
            {stockFisicoTexto(insumo)}
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
              className={`py-3 rounded-sm text-xs font-bold cursor-pointer transition-colors active:scale-95 ${
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
        <ActionSheetTrigger
          label="Motivo"
          displayValue={STOCK_MOTIVO_LABELS[motivo]}
          onClick={() => setSheetMotivo(true)}
        />

        {/* Cantidad */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
            {tipo === "ajuste"
              ? `Nuevo stock (${etiquetaStockCategoria(insumo.categoria)})`
              : tipo === "entrada" && motivo === "compra"
                ? `Bultos nuevos que entraron (${etiquetaStockCategoria(insumo.categoria)})`
                : `Cantidad (${etiquetaStockCategoria(insumo.categoria)})`}
          </label>
          {tipo === "entrada" && motivo === "compra" && (
            <p className="text-[9px] text-slate-500 font-semibold px-0.5">
              {insumo.categoria === "papel"
                ? "Se suma al stock en bodega: resmas × hojas/resma → total en hojas (unidad en base)."
                : insumo.categoria === "tinta"
                  ? "Tinta: cantidad en litros de esta compra; se suman a depósito en ml (litros × 1000)."
                  : "Se suma al stock en bodega: cartuchos × rendimiento en carillas (la base guarda el total)."}
            </p>
          )}
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
            className="w-full p-3.5 bg-slate-50 rounded-sm font-black text-lg border border-slate-100 outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* Preview nuevo stock */}
        {(cantidadNum > 0 || tipo === "ajuste") && (
          <div className="bg-blue-50 rounded-sm p-3 text-center">
            <p className="text-[10px] font-bold text-blue-400 uppercase">
              Nuevo stock
            </p>
            <p className="text-lg font-black text-blue-700">
              {stockFisicoTexto({ ...insumo, stock_actual: nuevoStock })}
            </p>
          </div>
        )}

        {requierePrecioCompra && (
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
              Precio del bulto / esta compra ($) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              value={precioCompra}
              onChange={(e) => setPrecioCompra(e.target.value)}
              placeholder="0"
              required
              className="w-full p-3.5 bg-emerald-50 rounded-sm font-black text-lg border border-emerald-100 outline-none focus:ring-2 focus:ring-emerald-100"
            />
            <p className="text-[9px] text-slate-600 font-semibold leading-snug px-0.5">
              Este valor <strong>reemplaza</strong> el costo de reposición del insumo
              (última compra). <strong>No</strong> se promedia con el stock que ya
              había.
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
            className="w-full p-3.5 bg-slate-50 rounded-sm font-semibold text-sm border border-slate-100 outline-none"
          />
        </div>

        {/* Botones */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-4 font-bold text-slate-400 text-sm cursor-pointer bg-slate-50 rounded-sm active:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={
              saving ||
              (cantidadNum <= 0 && tipo !== "ajuste") ||
              (requierePrecioCompra &&
                (!parseFloat(precioCompra.replace(",", ".")) ||
                  parseFloat(precioCompra.replace(",", ".")) <= 0))
            }
            className="flex-1 py-4 bg-blue-600 text-white font-black uppercase text-[10px] tracking-widest rounded-sm shadow-lg cursor-pointer disabled:opacity-50 active:scale-95"
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

      <div className="mt-6 pt-4 border-t border-slate-200">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
          Historial de movimientos
        </p>
        {historialLoading ? (
          <p className="text-xs text-slate-400 font-semibold">
            <i className="fas fa-circle-notch fa-spin mr-1" />
            Cargando…
          </p>
        ) : historial.length === 0 ? (
          <p className="text-xs text-slate-400 font-semibold">
            Sin movimientos registrados.
          </p>
        ) : (
          <ul className="max-h-52 overflow-y-auto space-y-2 pr-1 text-[11px]">
            {historial.map((m) => (
              <li
                key={m.id}
                className="rounded-sm bg-slate-50 border border-slate-100 px-2 py-1.5"
              >
                <div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 font-bold text-slate-700">
                  <span>
                    {new Date(m.created_at).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </span>
                  <span
                    className={
                      m.tipo === "entrada"
                        ? "text-emerald-700"
                        : m.tipo === "salida"
                          ? "text-red-600"
                          : "text-amber-700"
                    }
                  >
                    {STOCK_TIPO_LABELS[m.tipo]} ·{" "}
                    {textoCantidadMovimiento(m)}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-semibold">
                  {STOCK_MOTIVO_LABELS[m.motivo]}
                  {m.notas ? ` · ${m.notas}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
    <ActionSheet
      open={sheetMotivo}
      onClose={() => setSheetMotivo(false)}
      title="Motivo del movimiento"
      options={MOTIVO_OPTS}
      value={motivo}
      onChange={(v) => setMotivo(v as StockMotivo)}
    />
    </>
  );
}
