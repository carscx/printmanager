import { useMemo, useCallback } from "react";
import type { Insumo, InsumoCategoria } from "../../types/insumo";
import { INSUMO_CATEGORIAS, INSUMO_CATEGORIA_LABELS } from "../../types/insumo";
import { formatCurrency } from "../../utils/formatters";
import { costoUnitarioInsumo } from "../../services/bomCosto";
import { generarReporteStockPdf } from "../../services/generarReporteStockPdf";
import {
  stockHumanoTexto,
  valorInventarioUltimoPrecioBulto
} from "../../utils/insumoStockHuman";
import { showToast } from "../ui/Toast";

export type ImpactoMargenResumen = { lineas: number; tarifas: number };

interface InsumosListProps {
  insumos: Insumo[];
  loading: boolean;
  /** Informativo: uso en reglas de costo (Precios → Reglas de negocio). */
  impactoPorInsumo?: Record<string, ImpactoMargenResumen>;
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
  const { stock_actual, stock_minimo } = insumo;
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
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-black ${bg}`}
    >
      <i className={`fas ${icon} text-[10px]`} />
      {stockHumanoTexto(insumo)}
    </span>
  );
}

function ImpactoMargenLine({
  row
}: {
  row?: ImpactoMargenResumen;
}) {
  if (!row || row.lineas === 0) {
    return <span className="text-slate-400">—</span>;
  }
  return (
    <span
      className="text-slate-600 font-semibold"
      title="Insumo citado en reglas de costo (informativo)"
    >
      {row.lineas} línea{row.lineas !== 1 ? "s" : ""} · {row.tarifas} tarifa
      {row.tarifas !== 1 ? "s" : ""}
    </span>
  );
}

function InsumoCard({
  insumo,
  impacto,
  onSelect,
  onStock
}: {
  insumo: Insumo;
  impacto?: ImpactoMargenResumen;
  onSelect: () => void;
  onStock: () => void;
}) {
  const cu = costoUnitarioInsumo(insumo);
  const valorInv = valorInventarioUltimoPrecioBulto(insumo);
  return (
    <div
      className={`bg-white rounded-sm border border-slate-100 p-4 space-y-2 ${
        !insumo.activo ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-sm bg-slate-100 flex items-center justify-center flex-shrink-0">
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
            </p>
          </div>
        </div>
        <StockBadge insumo={insumo} />
      </div>
      <p className="text-[10px] text-slate-500 font-semibold">
        Costo real (por carilla/hoja):{" "}
        <span className="text-slate-800 font-black">
          {cu > 0 ? formatCurrency(cu) : "—"}
        </span>
      </p>
      <p className="text-[10px] text-slate-500 font-semibold">
        Valor inventario:{" "}
        <span className="text-emerald-800 font-black">
          {formatCurrency(valorInv)}
        </span>
      </p>
      <p className="text-[10px] text-slate-400 font-semibold">
        Impacto en margen: <ImpactoMargenLine row={impacto} />
      </p>
      <div className="flex items-center justify-between pt-1">
        <p className="text-xs font-black text-green-700">
          {formatCurrency(Number(insumo.costo_base ?? insumo.precio_compra) || 0)}
          <span className="text-slate-400 font-semibold">
            {" "}
            / lote ·{" "}
            {Number(
              insumo.rendimiento ??
                insumo.unidad_venta_equivalente ??
                insumo.unidades_por_compra
            ) || 0}{" "}
            rend.
          </span>
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onStock}
            title="Ajuste manual de stock"
            className="w-11 h-11 rounded-sm bg-blue-50 text-blue-600 flex items-center justify-center cursor-pointer active:bg-blue-100 active:scale-95 transition-all"
          >
            <i className="fas fa-scale-balanced text-sm" />
          </button>
          <button
            type="button"
            onClick={onSelect}
            className="w-11 h-11 rounded-sm bg-slate-50 text-slate-500 flex items-center justify-center cursor-pointer active:bg-slate-100 active:scale-95 transition-all"
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
  impactoPorInsumo,
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
  const filtrosDescripcion = useMemo(() => {
    const partes: string[] = [];
    if (categoriaFiltro !== "todas") {
      partes.push(`Categoría: ${INSUMO_CATEGORIA_LABELS[categoriaFiltro]}`);
    }
    if (busqueda.trim()) {
      partes.push(`Búsqueda: «${busqueda.trim()}»`);
    }
    partes.push(
      mostrarInactivos ? "Incluye insumos inactivos" : "Solo insumos activos"
    );
    return partes.join(" · ");
  }, [categoriaFiltro, busqueda, mostrarInactivos]);

  const exportarPdfStock = useCallback(async () => {
    try {
      await generarReporteStockPdf({ insumos, filtrosDescripcion });
      showToast("PDF generado");
    } catch {
      showToast("NO SE PUDO GENERAR EL PDF", "error");
    }
  }, [insumos, filtrosDescripcion]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] italic">
          Insumos
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Reporte de stock (PDF) — respeta filtros de la lista"
            disabled={loading}
            onClick={() => void exportarPdfStock()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white font-black text-[10px] uppercase tracking-widest rounded-sm shadow cursor-pointer disabled:opacity-40 active:scale-[0.98]"
          >
            <i className="fas fa-file-pdf" aria-hidden />
            PDF stock
          </button>
          <button
            type="button"
            onClick={onNuevo}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest rounded-sm shadow cursor-pointer active:scale-[0.98]"
          >
            <i className="fas fa-plus" aria-hidden /> Nuevo
          </button>
        </div>
      </div>

      <div className="relative">
        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-sm" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar insumo..."
          className="w-full pl-10 pr-4 py-3 bg-white rounded-sm font-semibold text-sm border border-slate-100 outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

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
        <button
          onClick={() => setMostrarInactivos(!mostrarInactivos)}
          className={`px-3 py-2 rounded-sm text-xs font-bold cursor-pointer transition-colors active:scale-95 ${
            mostrarInactivos
              ? "bg-slate-700 text-white shadow"
              : "bg-slate-100 text-slate-400"
          }`}
        >
          <i className="fas fa-eye-slash text-[10px] mr-1" />
          Inactivos
        </button>
      </div>

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
        <>
          <div className="hidden md:block overflow-x-auto rounded-sm border border-slate-100 bg-white shadow-sm">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/90 text-[9px] font-black uppercase text-slate-500 tracking-wide">
                  <th className="py-3 px-3">Nombre</th>
                  <th className="py-3 px-2">Categoría</th>
                  <th className="py-3 px-2 text-right">Costo base</th>
                  <th
                    className="py-3 px-2 text-right"
                    title="Rendimiento (unidades de consumo por lote)"
                  >
                    Rendimiento
                  </th>
                  <th
                    className="py-3 px-2 text-right"
                    title="Costo compra ÷ rendimiento (por carilla/hoja según tarifa)"
                  >
                    Costo real
                  </th>
                  <th className="py-3 px-2 text-right">Impacto margen</th>
                  <th className="py-3 px-2 text-right">Stock</th>
                  <th className="py-3 px-2 text-right">Mín.</th>
                  <th className="py-3 px-2 text-right">Valor inv.</th>
                  <th className="py-3 px-2 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {insumos.map((insumo) => {
                  const cu = costoUnitarioInsumo(insumo);
                  const base = Number(insumo.costo_base ?? insumo.precio_compra) || 0;
                  const cont =
                    Number(
                      insumo.rendimiento ??
                        insumo.unidad_venta_equivalente ??
                        insumo.unidades_por_compra
                    ) || 0;
                  const imp = impactoPorInsumo?.[insumo.id];
                  const vi = valorInventarioUltimoPrecioBulto(insumo);
                  return (
                    <tr
                      key={insumo.id}
                      className={`border-b border-slate-50 hover:bg-slate-50/80 ${
                        !insumo.activo ? "opacity-60" : ""
                      }`}
                    >
                      <td className="py-2.5 px-3 font-bold text-slate-800 max-w-[10rem] truncate">
                        {insumo.nombre}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600 font-semibold whitespace-nowrap">
                        {INSUMO_CATEGORIA_LABELS[insumo.categoria]}
                      </td>
                      <td className="py-2.5 px-2 text-right font-black text-green-800 whitespace-nowrap">
                        {formatCurrency(base)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-600 font-semibold">
                        {cont}
                      </td>
                      <td className="py-2.5 px-2 text-right font-black text-violet-800 whitespace-nowrap">
                        {cu > 0 ? formatCurrency(cu) : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-right text-[10px]">
                        <ImpactoMargenLine row={imp} />
                      </td>
                      <td className="py-2.5 px-2 text-right font-bold text-slate-700 whitespace-nowrap">
                        {stockHumanoTexto(insumo)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-amber-700 font-bold whitespace-nowrap">
                        {stockHumanoTexto({
                          ...insumo,
                          stock_actual: insumo.stock_minimo
                        })}
                      </td>
                      <td className="py-2.5 px-2 text-right font-black text-emerald-800 whitespace-nowrap">
                        {formatCurrency(vi)}
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            title="Ajuste manual de stock"
                            onClick={() => onStock(insumo)}
                            className="w-9 h-9 rounded-sm bg-blue-50 text-blue-600 flex items-center justify-center cursor-pointer hover:bg-blue-100"
                          >
                            <i className="fas fa-scale-balanced text-xs" />
                          </button>
                          <button
                            type="button"
                            title="Editar"
                            onClick={() => onSelect(insumo)}
                            className="w-9 h-9 rounded-sm bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer hover:bg-slate-200"
                          >
                            <i className="fas fa-pen text-xs" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {insumos.map((insumo) => (
              <InsumoCard
                key={insumo.id}
                insumo={insumo}
                impacto={impactoPorInsumo?.[insumo.id]}
                onSelect={() => onSelect(insumo)}
                onStock={() => onStock(insumo)}
              />
            ))}
          </div>
        </>
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
      className={`px-3 py-2 rounded-sm text-xs font-bold cursor-pointer transition-colors active:scale-95 ${
        active ? "bg-blue-600 text-white shadow" : "bg-slate-100 text-slate-500"
      }`}
    >
      {label}
    </button>
  );
}
