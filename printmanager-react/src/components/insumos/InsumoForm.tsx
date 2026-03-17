import { useState, useEffect } from "react";
import type {
  Insumo,
  InsumoInput,
  InsumoCategoria,
  InsumoUnidad
} from "../../types/insumo";
import {
  INSUMO_CATEGORIAS,
  INSUMO_CATEGORIA_LABELS,
  INSUMO_UNIDADES,
  INSUMO_UNIDAD_LABELS
} from "../../types/insumo";

interface InsumoFormProps {
  insumo?: Insumo | null;
  onSave: (data: InsumoInput) => Promise<void>;
  onCancel: () => void;
}

const CATEGORIAS_CON_MEDIDA: InsumoCategoria[] = ["espiral"];
const CATEGORIAS_CON_COLOR: InsumoCategoria[] = [
  "espiral",
  "tapa_color",
  "tinta",
  "toner"
];
const CATEGORIAS_CON_PAPEL: InsumoCategoria[] = ["papel"];
const CATEGORIAS_CON_RENDIMIENTO: InsumoCategoria[] = ["tinta", "toner"];
const CATEGORIAS_CON_HOJAS: InsumoCategoria[] = ["papel"];

const DEFAULT_UNIDAD: Record<string, InsumoUnidad> = {
  espiral: "unidad",
  tapa_transparente: "unidad",
  tapa_color: "unidad",
  papel: "resma",
  tinta: "litro",
  toner: "cartucho",
  bolsa: "unidad",
  bolsa_propileno: "unidad",
  clip: "unidad",
  otro: "unidad"
};

export function InsumoForm({ insumo, onSave, onCancel }: InsumoFormProps) {
  const isEdit = !!insumo;

  const [categoria, setCategoria] = useState<InsumoCategoria>(
    insumo?.categoria ?? "espiral"
  );
  const [nombre, setNombre] = useState(insumo?.nombre ?? "");
  const [unidad, setUnidad] = useState<InsumoUnidad>(
    insumo?.unidad ?? "unidad"
  );
  const [medidaMm, setMedidaMm] = useState<string>(
    insumo?.medida_mm?.toString() ?? ""
  );
  const [color, setColor] = useState(insumo?.color ?? "");
  const [tipoPapel, setTipoPapel] = useState(insumo?.tipo_papel ?? "");
  const [rendimiento, setRendimiento] = useState<string>(
    insumo?.rendimiento?.toString() ?? ""
  );
  const [hojasPorUnidad, setHojasPorUnidad] = useState<string>(
    insumo?.hojas_por_unidad?.toString() ?? "500"
  );
  const [precioCompra, setPrecioCompra] = useState<string>(
    insumo?.precio_compra?.toString() ?? "0"
  );
  const [stockActual, setStockActual] = useState<string>(
    insumo?.stock_actual?.toString() ?? "0"
  );
  const [stockMinimo, setStockMinimo] = useState<string>(
    insumo?.stock_minimo?.toString() ?? "0"
  );
  const [saving, setSaving] = useState(false);

  // Auto-set unidad cuando cambia categoría (solo en creación)
  useEffect(() => {
    if (!isEdit) {
      setUnidad(DEFAULT_UNIDAD[categoria] ?? "unidad");
    }
  }, [categoria, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;

    setSaving(true);
    try {
      await onSave({
        categoria,
        nombre: nombre.trim(),
        unidad,
        medida_mm: CATEGORIAS_CON_MEDIDA.includes(categoria)
          ? parseInt(medidaMm) || null
          : null,
        color:
          CATEGORIAS_CON_COLOR.includes(categoria) && color.trim()
            ? color.trim()
            : null,
        tipo_papel:
          CATEGORIAS_CON_PAPEL.includes(categoria) && tipoPapel.trim()
            ? tipoPapel.trim()
            : null,
        rendimiento: CATEGORIAS_CON_RENDIMIENTO.includes(categoria)
          ? parseInt(rendimiento) || null
          : null,
        hojas_por_unidad: CATEGORIAS_CON_HOJAS.includes(categoria)
          ? parseInt(hojasPorUnidad) || 500
          : null,
        precio_compra: parseFloat(precioCompra) || 0,
        stock_actual: parseFloat(stockActual) || 0,
        stock_minimo: parseFloat(stockMinimo) || 0,
        activo: true,
        updated_by: null
      });
    } finally {
      setSaving(false);
    }
  };

  const showMedida = CATEGORIAS_CON_MEDIDA.includes(categoria);
  const showColor = CATEGORIAS_CON_COLOR.includes(categoria);
  const showPapel = CATEGORIAS_CON_PAPEL.includes(categoria);
  const showRendimiento = CATEGORIAS_CON_RENDIMIENTO.includes(categoria);
  const showHojas = CATEGORIAS_CON_HOJAS.includes(categoria);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] italic">
        {isEdit ? "Editar Insumo" : "Nuevo Insumo"}
      </h2>

      {/* Categoría + Unidad */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
            Categoría
          </label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as InsumoCategoria)}
            disabled={isEdit}
            className="w-full p-3 bg-slate-50 rounded-xl font-bold text-sm border border-slate-100 cursor-pointer disabled:opacity-50"
          >
            {INSUMO_CATEGORIAS.map((cat) => (
              <option key={cat} value={cat}>
                {INSUMO_CATEGORIA_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
            Unidad
          </label>
          <select
            value={unidad}
            onChange={(e) => setUnidad(e.target.value as InsumoUnidad)}
            className="w-full p-3 bg-slate-50 rounded-xl font-bold text-sm border border-slate-100 cursor-pointer"
          >
            {INSUMO_UNIDADES.map((u) => (
              <option key={u} value={u}>
                {INSUMO_UNIDAD_LABELS[u]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Nombre */}
      <div className="space-y-1">
        <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
          Nombre
        </label>
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Espiral 12mm Negro"
          required
          className="w-full p-3 bg-slate-50 rounded-xl font-bold border border-slate-100 focus:ring-2 focus:ring-blue-100 outline-none"
        />
      </div>

      {/* Campos condicionales */}
      <div className="grid grid-cols-2 gap-3">
        {showMedida && (
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
              Medida (mm)
            </label>
            <input
              type="number"
              value={medidaMm}
              onChange={(e) => setMedidaMm(e.target.value)}
              placeholder="12"
              className="w-full p-3 bg-slate-50 rounded-xl font-bold border border-slate-100 outline-none"
            />
          </div>
        )}
        {showColor && (
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
              Color
            </label>
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Negro, Azul..."
              className="w-full p-3 bg-slate-50 rounded-xl font-bold border border-slate-100 outline-none"
            />
          </div>
        )}
        {showPapel && (
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
              Tipo de papel
            </label>
            <input
              type="text"
              value={tipoPapel}
              onChange={(e) => setTipoPapel(e.target.value)}
              placeholder="A4 75g"
              className="w-full p-3 bg-slate-50 rounded-xl font-bold border border-slate-100 outline-none"
            />
          </div>
        )}
        {showRendimiento && (
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
              Rendimiento (págs)
            </label>
            <input
              type="number"
              value={rendimiento}
              onChange={(e) => setRendimiento(e.target.value)}
              placeholder="5000"
              className="w-full p-3 bg-slate-50 rounded-xl font-bold border border-slate-100 outline-none"
            />
          </div>
        )}
        {showHojas && (
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
              Hojas por unidad
            </label>
            <input
              type="number"
              value={hojasPorUnidad}
              onChange={(e) => setHojasPorUnidad(e.target.value)}
              placeholder="500"
              className="w-full p-3 bg-slate-50 rounded-xl font-bold border border-slate-100 outline-none"
            />
          </div>
        )}
      </div>

      {/* Precio + Stock */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
            Precio compra ($)
          </label>
          <input
            type="number"
            step="0.01"
            value={precioCompra}
            onChange={(e) => setPrecioCompra(e.target.value)}
            className="w-full p-3 bg-slate-50 rounded-xl font-black text-green-700 border border-slate-100 outline-none"
          />
        </div>
        {!isEdit && (
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
              Stock inicial
            </label>
            <input
              type="number"
              step="0.01"
              value={stockActual}
              onChange={(e) => setStockActual(e.target.value)}
              className="w-full p-3 bg-slate-50 rounded-xl font-black text-blue-700 border border-slate-100 outline-none"
            />
          </div>
        )}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
            Stock mínimo
          </label>
          <input
            type="number"
            step="0.01"
            value={stockMinimo}
            onChange={(e) => setStockMinimo(e.target.value)}
            className="w-full p-3 bg-slate-50 rounded-xl font-black text-amber-700 border border-slate-100 outline-none"
          />
        </div>
      </div>

      {/* Botones */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-4 font-bold text-slate-400 text-sm cursor-pointer bg-slate-50 rounded-xl"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving || !nombre.trim()}
          className="flex-1 py-4 bg-blue-600 text-white font-black uppercase text-[10px] tracking-widest rounded-xl shadow-lg cursor-pointer disabled:opacity-50"
        >
          {saving ? (
            <>
              <i className="fas fa-circle-notch fa-spin mr-2" />
              Guardando...
            </>
          ) : isEdit ? (
            "Guardar Cambios"
          ) : (
            "Crear Insumo"
          )}
        </button>
      </div>
    </form>
  );
}
