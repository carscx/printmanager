import { useState, useEffect, useMemo } from "react";
import { recetasApi } from "../../services/recetasApi";
import { preciosApi } from "../../services/preciosApi";
import { showToast } from "../ui/Toast";
import type { Insumo } from "../../types/insumo";
import type { PrecioImpresion } from "../../types/precio";
import type { RecetaItem, ModoConsumo, AlcanceReceta } from "../../types/receta";
import { ALCANCE_RECETA, MODO_CONSUMO } from "../../types/receta";
import { labelPrecioImpresionTarifa } from "../../types/precio";
import { formatCurrency } from "../../utils/formatters";
import { fnCostoTotalRealInsumos } from "../../services/bomPreview";
import {
  costoDirectoDesdeRecetaImpresion,
  costoUnitarioInsumo
} from "../../services/bomCosto";

interface Props {
  preciosImpresion: PrecioImpresion[];
  insumos: Insumo[];
  /** Tras agregar/borrar líneas, el padre puede refrescar (ej. márgenes en Impresión) */
  onRecetasChanged?: () => void;
}

export function RecetasBomPanel({
  preciosImpresion,
  insumos,
  onRecetasChanged
}: Props) {
  const [recetas, setRecetas] = useState<RecetaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selImp, setSelImp] = useState<string>("");
  const [selInsumo, setSelInsumo] = useState("");
  const [selModo, setSelModo] = useState<ModoConsumo>("POR_HOJA_FISICA");
  const [cant, setCant] = useState("1");
  const [selAlcance, setSelAlcance] = useState<AlcanceReceta>("IMPRESION");
  const [espiralAuto, setEspiralAuto] = useState(false);
  const [cfg, setCfg] = useState<Awaited<
    ReturnType<typeof preciosApi.fetchConfiguracionNegocio>
  > | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([
        recetasApi.fetchAll(),
        preciosApi.fetchConfiguracionNegocio()
      ]);
      setRecetas(r);
      setCfg(c);
    } catch {
      showToast("ERROR AL CARGAR RECETAS", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const insumoById = useMemo(() => {
    const m = new Map<string, Insumo>();
    for (const i of insumos) m.set(i.id, i);
    return m;
  }, [insumos]);

  const previewLinea = (
    p: PrecioImpresion,
    lineas: RecetaItem[]
  ): { directo: number; real: number } | null => {
    if (!cfg) return null;
    const filas = lineas.filter(
      (x) =>
        x.alcance === "IMPRESION" &&
        x.precio_impresion_id === p.id &&
        !x.es_espiral_auto &&
        x.insumo_id
    );
    if (filas.length === 0) return null;
    let directo = 0;
    const pagEj = 100;
    const df = p.doble_faz;
    const carillas = pagEj;
    const hojas = df ? Math.ceil(pagEj / 2) : pagEj;
    const copias = 1;
    for (const r of filas) {
      if (!r.insumo_id) continue;
      const ins = insumoById.get(r.insumo_id);
      if (!ins) continue;
      const cu = costoUnitarioInsumo(ins);
      let q = Number(r.cantidad) || 0;
      if (r.modo_consumo === "POR_CARA") q *= carillas * copias;
      else if (r.modo_consumo === "POR_HOJA_FISICA") q *= hojas * copias;
      else q *= copias;
      directo += q * cu;
    }
    const real = fnCostoTotalRealInsumos(directo, cfg);
    return { directo, real };
  };

  /** Costo de 1 unidad tarifaria (misma base que Precios → margen) */
  const previewUnidadTarifa = (
    p: PrecioImpresion,
    lineas: RecetaItem[]
  ): { directo: number; real: number } | null => {
    if (!cfg) return null;
    const d = costoDirectoDesdeRecetaImpresion(p, lineas, insumos);
    if (d == null || d <= 0) return null;
    return { directo: d, real: fnCostoTotalRealInsumos(d, cfg) };
  };

  const agregar = async () => {
    if (selAlcance === "IMPRESION" && !selImp) {
      showToast("Elegí una tarifa de impresión", "error");
      return;
    }
    if (!espiralAuto && !selInsumo) {
      showToast("Elegí un insumo o marcá espiral automático", "error");
      return;
    }
    if (espiralAuto && selAlcance === "IMPRESION") {
      showToast("Espiral auto solo aplica a SOLO_ANILLADO o ANILLADO_EXTRA", "error");
      return;
    }
    try {
      await recetasApi.insert({
        alcance: selAlcance,
        precio_impresion_id:
          selAlcance === "IMPRESION" ? selImp : null,
        insumo_id: espiralAuto ? null : selInsumo,
        modo_consumo: selModo,
        cantidad: Math.max(0.0001, parseFloat(cant.replace(",", ".")) || 1),
        es_espiral_auto: espiralAuto
      });
      showToast("LÍNEA DE RECETA AGREGADA");
      setCant("1");
      setEspiralAuto(false);
      await load();
      onRecetasChanged?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "ERROR";
      showToast(msg, "error");
    }
  };

  const borrar = async (id: string) => {
    try {
      await recetasApi.delete(id);
      showToast("ELIMINADO");
      await load();
      onRecetasChanged?.();
    } catch {
      showToast("ERROR AL ELIMINAR", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <i className="fas fa-circle-notch fa-spin text-xl text-blue-600" />
      </div>
    );
  }

  const porImpresion = (pid: string) =>
    recetas.filter((r) => r.alcance === "IMPRESION" && r.precio_impresion_id === pid);

  return (
    <div className="bg-white rounded-sm border border-slate-100 shadow-sm p-5 space-y-6">
      <div>
        <h3 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] italic">
          Recetas BOM (insumos)
        </h3>
        <p className="text-[10px] text-slate-400 font-semibold mt-2 leading-snug max-w-xl">
          Definí consumo por tarifa de impresión (papel, tóner/tinta). Modos:{" "}
          <strong>POR_CARA</strong> = páginas del PDF; <strong>POR_HOJA_FISICA</strong>{" "}
          = hojas tras DF/SF; <strong>POR_TRABAJO</strong> = por copia. El anillado
          (espiral + tapas) puede completarse con filas en{" "}
          <strong>ANILLADO_EXTRA</strong> o con la configuración de negocio (tapas +
          umbrales) si no hay filas.
        </p>
      </div>

      <div className="rounded-sm border border-slate-100 bg-slate-50/80 p-4 space-y-3">
        <p className="text-[10px] font-black text-slate-500 uppercase">Nueva línea</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-[9px] font-bold text-slate-400 uppercase">
            Alcance
            <select
              value={selAlcance}
              onChange={(e) =>
                setSelAlcance(e.target.value as AlcanceReceta)
              }
              className="w-full mt-1 p-2 rounded-sm border border-slate-200 font-bold text-xs"
            >
              {ALCANCE_RECETA.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          {selAlcance === "IMPRESION" && (
            <label className="text-[9px] font-bold text-slate-400 uppercase">
              Tarifa
              <select
                value={selImp}
                onChange={(e) => setSelImp(e.target.value)}
                className="w-full mt-1 p-2 rounded-sm border border-slate-200 font-bold text-xs"
              >
                <option value="">—</option>
                {preciosImpresion.map((p) => (
                  <option key={p.id} value={p.id}>
                    {labelPrecioImpresionTarifa(p)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <input
            type="checkbox"
            checked={espiralAuto}
            onChange={(e) => setEspiralAuto(e.target.checked)}
          />
          Espiral automático (sin insumo fijo; solo SOLO_ANILLADO / ANILLADO_EXTRA)
        </label>
        {!espiralAuto && (
          <label className="text-[9px] font-bold text-slate-400 uppercase block">
            Insumo
            <select
              value={selInsumo}
              onChange={(e) => setSelInsumo(e.target.value)}
              className="w-full mt-1 p-2 rounded-sm border border-slate-200 font-bold text-xs"
            >
              <option value="">—</option>
              {insumos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nombre} ({i.categoria})
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[9px] font-bold text-slate-400 uppercase">
            Modo
            <select
              value={selModo}
              onChange={(e) => setSelModo(e.target.value as ModoConsumo)}
              className="w-full mt-1 p-2 rounded-sm border border-slate-200 font-bold text-xs"
            >
              {MODO_CONSUMO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[9px] font-bold text-slate-400 uppercase">
            Cantidad base
            <input
              value={cant}
              onChange={(e) => setCant(e.target.value)}
              className="w-full mt-1 p-2 rounded-sm border border-slate-200 font-black text-xs"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void agregar()}
          className="w-full py-3 rounded-sm bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest"
        >
          Agregar a la receta
        </button>
      </div>

      <div className="space-y-4">
        {preciosImpresion.map((p) => {
          const lineas = porImpresion(p.id);
          const pv = previewLinea(p, recetas);
          const pu = previewUnidadTarifa(p, recetas);
          return (
            <div
              key={p.id}
              className="border border-slate-100 rounded-sm p-4 space-y-2"
            >
              <div className="flex justify-between items-start gap-2">
                <div>
                  <p className="text-sm font-black text-slate-800">
                    {labelPrecioImpresionTarifa(p)}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Público {formatCurrency(p.precio_venta)} / hoja
                  </p>
                </div>
                <div className="text-right text-[10px] font-bold text-slate-500 space-y-0.5">
                  {pu && (
                    <p>
                      1 hoja cobrada: directo {formatCurrency(pu.directo)} → real{" "}
                      {formatCurrency(pu.real)}
                    </p>
                  )}
                  {pv && (
                    <p>
                      Ej. 100 pág{ p.doble_faz ? ", DF" : ", SF"}: directo{" "}
                      {formatCurrency(pv.directo)} → real{" "}
                      {formatCurrency(pv.real)}
                    </p>
                  )}
                </div>
              </div>
              {lineas.length === 0 ? (
                <p className="text-xs text-amber-700 font-semibold">
                  Sin receta: no se podrá explotar BOM para esta tarifa.
                </p>
              ) : (
                <ul className="space-y-1">
                  {lineas.map((r) => (
                    <li
                      key={r.id}
                      className="flex justify-between items-center text-xs bg-slate-50 rounded-sm px-2 py-1.5"
                    >
                      <span>
                        {(r.insumos as { nombre?: string } | undefined)?.nombre ??
                          r.insumo_id?.slice(0, 8)}{" "}
                        · {r.modo_consumo} × {r.cantidad}
                        {r.es_espiral_auto ? " · espiral auto" : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => void borrar(r.id)}
                        className="text-red-500 px-2"
                      >
                        <i className="fas fa-trash" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-100 pt-4 space-y-2">
        <p className="text-[10px] font-black text-slate-400 uppercase">
          Otras recetas cargadas
        </p>
        {recetas
          .filter((r) => r.alcance !== "IMPRESION")
          .map((r) => (
            <div
              key={r.id}
              className="flex justify-between text-xs bg-amber-50/50 rounded-sm px-2 py-1"
            >
              <span>
                {r.alcance} · {r.modo_consumo} × {r.cantidad}{" "}
                {r.es_espiral_auto ? "(espiral auto)" : ""}
              </span>
              <button
                type="button"
                onClick={() => void borrar(r.id)}
                className="text-red-500"
              >
                <i className="fas fa-trash" />
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
