import type { Equipo } from "../../types/equipo";
import {
  EQUIPO_TIPO_LABELS,
  EQUIPO_TIPO_ICONS,
  calcularCostoPorPagina
} from "../../types/equipo";
import type { EquipoResumenRoi } from "../../services/equiposApi";

interface EquiposListProps {
  equipos: Equipo[];
  roiById: Map<string, EquipoResumenRoi>;
  loading: boolean;
  mostrarInactivos: boolean;
  setMostrarInactivos: (v: boolean) => void;
  onSelect: (equipo: Equipo) => void;
  onNuevo: () => void;
}

function CostoBadge({ equipo }: { equipo: Equipo }) {
  const costo = calcularCostoPorPagina(equipo);
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-black bg-emerald-50 text-emerald-700">
      ${costo.toFixed(2)}/pág
    </span>
  );
}

function RoiRecuperacionBar({
  ganancia,
  costoAdquisicion,
  ratioPct
}: {
  ganancia: number;
  costoAdquisicion: number;
  ratioPct: number | null;
}) {
  const ratio =
    ratioPct != null
      ? ratioPct
      : costoAdquisicion > 0
        ? (ganancia / costoAdquisicion) * 100
        : 0;
  const ancho = Math.min(100, Math.max(0, ratio));

  return (
    <div className="bg-slate-50 rounded-sm p-3 space-y-2 border border-slate-100">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
          Recuperación vs adquisición
        </span>
        <span className="text-[10px] font-black text-slate-700">
          {Number.isFinite(ratio) && (costoAdquisicion > 0 || ratioPct != null)
            ? `${ratio.toFixed(1)}%`
            : "—"}
        </span>
      </div>
      <div className="h-2 bg-slate-200/80 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            ratio >= 100 ? "bg-emerald-500" : "bg-blue-500"
          }`}
          style={{ width: `${ancho}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] font-bold text-slate-500">
        <span>
          Ganancia acum.{" "}
          <span className="text-slate-800">
            ${Math.round(ganancia).toLocaleString("es-AR")}
          </span>
        </span>
        <span>
          Inversión{" "}
          <span className="text-slate-800">
            ${Math.round(costoAdquisicion).toLocaleString("es-AR")}
          </span>
        </span>
      </div>
      {ratio >= 100 && (
        <p className="text-[9px] font-bold text-emerald-600">
          Inversión cubierta por ganancias atribuidas
        </p>
      )}
    </div>
  );
}

function EquipoCard({
  equipo,
  roi,
  onSelect
}: {
  equipo: Equipo;
  roi?: EquipoResumenRoi;
  onSelect: () => void;
}) {
  const costoPag = calcularCostoPorPagina(equipo);
  const amortMensual =
    equipo.vida_util_meses > 0
      ? equipo.costo_adquisicion / equipo.vida_util_meses
      : 0;

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left bg-white rounded-sm border border-slate-100 p-4 space-y-3 cursor-pointer active:scale-[0.98] transition-transform ${
        !equipo.activo ? "opacity-50" : ""
      }`}
    >
      {/* Header: icono + nombre + badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-10 h-10 rounded-sm bg-blue-50 flex items-center justify-center flex-shrink-0">
            <i
              className={`fas ${EQUIPO_TIPO_ICONS[equipo.tipo]} text-blue-500`}
            />
          </span>
          <div className="min-w-0">
            <p className="font-bold text-sm text-slate-800 truncate">
              {equipo.nombre}
            </p>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
              {EQUIPO_TIPO_LABELS[equipo.tipo]}
              {equipo.fecha_adquisicion &&
                ` · ${new Date(equipo.fecha_adquisicion + "T00:00:00").toLocaleDateString("es-AR", { month: "short", year: "numeric" })}`}
            </p>
          </div>
        </div>
        <CostoBadge equipo={equipo} />
      </div>

      {/* Desglose de costos */}
      <div className="grid grid-cols-3 gap-2">
        <MiniStat
          label="Adquisición"
          value={`$${equipo.costo_adquisicion.toLocaleString("es-AR")}`}
        />
        <MiniStat
          label="Amort./mes"
          value={`$${Math.round(amortMensual).toLocaleString("es-AR")}`}
        />
        <MiniStat
          label="Mant./mes"
          value={`$${equipo.costo_mantenimiento_mensual.toLocaleString("es-AR")}`}
        />
      </div>

      {/* Info secundaria */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
        <span>
          <i className="fas fa-clock mr-1" />
          {equipo.vida_util_meses} meses vida útil
        </span>
        <span>
          <i className="fas fa-file mr-1" />~
          {equipo.paginas_mes_estimadas.toLocaleString("es-AR")} págs/mes
        </span>
        {costoPag > 0 && (
          <span className="text-emerald-600 font-black">
            ${costoPag.toFixed(2)}/pág
          </span>
        )}
      </div>

      {roi && (
        <RoiRecuperacionBar
          ganancia={roi.ganancia_acumulada}
          costoAdquisicion={roi.costo_adquisicion}
          ratioPct={roi.ratio_recuperacion_pct}
        />
      )}

      {equipo.notas && (
        <p className="text-xs text-slate-400 italic truncate">{equipo.notas}</p>
      )}
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-sm p-2 text-center">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
        {label}
      </p>
      <p className="text-xs font-black text-slate-700">{value}</p>
    </div>
  );
}

export function EquiposList({
  equipos,
  roiById,
  loading,
  mostrarInactivos,
  setMostrarInactivos,
  onSelect,
  onNuevo
}: EquiposListProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] italic">
          Equipos
        </h2>
        <button
          onClick={onNuevo}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest rounded-sm shadow cursor-pointer active:scale-95 transition-transform"
        >
          <i className="fas fa-plus" /> Nuevo
        </button>
      </div>

      {/* Toggle inactivos */}
      <div className="flex flex-wrap gap-2">
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

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-slate-300">
          <i className="fas fa-circle-notch fa-spin text-2xl" />
        </div>
      ) : equipos.length === 0 ? (
        <div className="text-center py-12">
          <i className="fas fa-print text-4xl text-slate-200 mb-3" />
          <p className="text-sm text-slate-400 font-semibold">
            No hay equipos registrados
          </p>
          <p className="text-xs text-slate-300 mt-1">
            Añadí tus impresoras para calcular amortización
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {equipos.map((equipo) => (
            <EquipoCard
              key={equipo.id}
              equipo={equipo}
              roi={roiById.get(equipo.id)}
              onSelect={() => onSelect(equipo)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
