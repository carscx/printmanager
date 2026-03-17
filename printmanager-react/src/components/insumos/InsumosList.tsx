import type { Insumo, InsumoCategoria } from "../../types/insumo";
import {
  INSUMO_CATEGORIAS,
  INSUMO_CATEGORIA_LABELS,
  INSUMO_UNIDAD_LABELS
} from "../../types/insumo";

interface InsumosListProps {
  insumos: Insumo[];
  loading: boolean;
  categoriaFiltro: InsumoCategoria | "todas";
  setCategoriaFiltro: (v: InsumoCategoria | "todas") => void;
  busqueda: string;
  setBusqueda: (v: string) => void;
  mostrarInactivos: boolean;
  setMostrarInactivos: (v: boolean) => void;
  onSelect: (insumo: Insumo) => void;
  onNuevo: () => void;
  onStock: (insumo: Insumo) => void;
}

const ICONO_CATEGORIA: Record<string, string> = {
  espiral: "fa-circle-notch",
  tapa_transparente: "fa-file",
  tapa_color: "fa-file",
  papel: "fa-scroll",
  tinta: "fa-droplet",
  toner: "fa-fill",
  bolsa: "fa-bag-shopping",
  bolsa_propileno: "fa-bag-shopping",
  clip: "fa-paperclip",
  otro: "fa-box"
};

function StockBadge({ insumo }: { insumo: Insumo }) {
  const { stock_actual, stock_minimo, unidad } = insumo;
  const bajo = stock_actual <= stock_minimo;
  const sinStock = stock_actual <= 0;

  let bg = "bg-green-50 text-green-700";
  let icon = "fa-check";
  if (sinStock) {
    bg = "bg-red-50 text-red-600 animate-pulse";
    icon = "fa-xmark";
  } else if (bajo) {
    bg = "bg-amber-50 text-amber-600";
    icon = "fa-triangle-exclamation";
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-black ${bg}`}
    >
      <i className={`fas ${icon} text-[10px]`} />
      {stock_actual} {INSUMO_UNIDAD_LABELS[unidad]}
    </span>
  );
}

function InsumoCard({
  insumo,
  onSelect,
  onStock
}: {
  insumo: Insumo;
  onSelect: () => void;
  onStock: () => void;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-100 p-4 space-y-2 ${
        !insumo.activo ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
            <i
              className={`fas ${ICONO_CATEGORIA[insumo.categoria] ?? "fa-box"} text-slate-400 text-xs`}
            />
          </span>
          <div className="min-w-0">
            <p className="font-bold text-sm text-slate-800 truncate">
              {insumo.nombre}
            </p>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
              {INSUMO_CATEGORIA_LABELS[insumo.categoria]}
              {insumo.medida_mm ? ` · ${insumo.medida_mm}mm` : ""}
              {insumo.color ? ` · ${insumo.color}` : ""}
            </p>
          </div>
        </div>
        <StockBadge insumo={insumo} />
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className="text-xs font-black text-green-700">
          ${insumo.precio_compra.toLocaleString("es-AR")}
          <span className="text-slate-400 font-semibold">
            {" "}
            / {INSUMO_UNIDAD_LABELS[insumo.unidad]}
          </span>
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onStock}
            className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center cursor-pointer active:bg-blue-100 active:scale-95 transition-all"
          >
            <i className="fas fa-boxes-stacked text-sm" />
          </button>
          <button
            onClick={onSelect}
            className="w-11 h-11 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center cursor-pointer active:bg-slate-100 active:scale-95 transition-all"
          >
            <i className="fas fa-pen text-sm" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function InsumosList({
  insumos,
  loading,
  categoriaFiltro,
  setCategoriaFiltro,
  busqueda,
  setBusqueda,
  mostrarInactivos,
  setMostrarInactivos,
  onSelect,
  onNuevo,
  onStock
}: InsumosListProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] italic">
          Insumos
        </h2>
        <button
          onClick={onNuevo}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow cursor-pointer"
        >
          <i className="fas fa-plus" /> Nuevo
        </button>
      </div>

      {/* Búsqueda */}
      <div className="relative">
        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-sm" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar insumo..."
          className="w-full pl-10 pr-4 py-3 bg-white rounded-xl font-semibold text-sm border border-slate-100 outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {/* Filtro categoría - wrap grid */}
      <div className="flex flex-wrap gap-2">
        <FilterChip
          label="Todas"
          active={categoriaFiltro === "todas"}
          onClick={() => setCategoriaFiltro("todas")}
        />
        {INSUMO_CATEGORIAS.map((cat) => (
          <FilterChip
            key={cat}
            label={INSUMO_CATEGORIA_LABELS[cat]}
            active={categoriaFiltro === cat}
            onClick={() => setCategoriaFiltro(cat)}
          />
        ))}
        {/* Toggle inactivos inline */}
        <button
          onClick={() => setMostrarInactivos(!mostrarInactivos)}
          className={`px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors active:scale-95 ${
            mostrarInactivos
              ? "bg-slate-700 text-white shadow"
              : "bg-slate-100 text-slate-400"
          }`}
        >
          <i className="fas fa-eye-slash text-[10px] mr-1" />
          Inactivos
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-slate-300">
          <i className="fas fa-circle-notch fa-spin text-2xl" />
        </div>
      ) : insumos.length === 0 ? (
        <div className="text-center py-12">
          <i className="fas fa-box-open text-4xl text-slate-200 mb-3" />
          <p className="text-sm text-slate-400 font-semibold">No hay insumos</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {insumos.map((insumo) => (
            <InsumoCard
              key={insumo.id}
              insumo={insumo}
              onSelect={() => onSelect(insumo)}
              onStock={() => onStock(insumo)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors active:scale-95 ${
        active ? "bg-blue-600 text-white shadow" : "bg-slate-100 text-slate-500"
      }`}
    >
      {label}
    </button>
  );
}
