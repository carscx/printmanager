import { useState, useEffect, useMemo } from "react";
import { reglasCostoApi } from "../../services/reglasCostoApi";
import type { TipoTarifaRegla } from "../../services/reglasCostoApi";
import { showToast } from "../ui/Toast";
import type { PrecioImpresion, PrecioAnillado } from "../../types/precio";
import type { Insumo } from "../../types/insumo";
import { labelPrecioImpresionTarifa } from "../../types/precio";
import {
  INSUMO_CATEGORIAS,
  INSUMO_CATEGORIA_LABELS,
  type InsumoCategoria
} from "../../types/insumo";
import type { ReglaCosto } from "../../types/reglaCosto";
import { formatCurrency } from "../../utils/formatters";
import {
  costoUnitarioInsumo,
  estimacionStockPorCaraReglaImpresion,
  REGLAS_COSTO_FACTOR_SEGURIDAD
} from "../../services/bomCosto";
import { margenSobreVenta } from "../../services/costEngine";

function colorMargenPct(pct: number | null): string {
  if (pct == null) return "text-slate-400";
  if (pct < 0) return "text-red-600";
  if (pct < 15) return "text-amber-600";
  return "text-emerald-600";
}

interface Props {
  preciosImpresion: PrecioImpresion[];
  preciosAnillado: PrecioAnillado[];
  insumos: Insumo[];
  onChanged?: () => void;
}

/** Orden de categorías para sugerir el siguiente insumo (evita repetir siempre la misma categoría). */
const PREF_IMPRESION: InsumoCategoria[] = [
  "papel",
  "tinta",
  "toner",
  "espiral",
  "tapa_transparente",
  "tapa_color",
  "bolsa",
  "bolsa_propileno",
  "clip",
  "otro"
];

const PREF_ANILLADO: InsumoCategoria[] = [
  "espiral",
  "tapa_transparente",
  "tapa_color",
  "papel",
  "tinta",
  "toner",
  "bolsa",
  "bolsa_propileno",
  "clip",
  "otro"
];

/** Coeficiente por línea: papel por hoja física; tóner/tinta por cara impresa. */
function etiquetaCantidadReglaImpresion(
  cat: InsumoCategoria | undefined
): string {
  switch (cat) {
    case "papel":
      return "Coef. (hoja física)";
    case "toner":
      return "Coef. (cara impresa)";
    case "tinta":
      return "Coef. (cara impresa)";
    default:
      return "Cantidad";
  }
}

function textoEstimacionDescuentoStock(
  ins: Insumo | undefined,
  cantidadUsada: number
): string | null {
  if (!ins) return null;
  const est = estimacionStockPorCaraReglaImpresion(ins, cantidadUsada);
  if (!est) return null;
  const v = est.valor;
  const n =
    Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : v.toFixed(4);
  switch (est.unidad) {
    case "hojas":
      return `Descuento stock: ${n} hoja(s) de este papel por cada hoja física del ítem.`;
    case "carillas":
      return `Descuento stock: ${n} carilla(s) por cada cara impresa (coef. × carillas del PDF).`;
    case "ml":
      return `Descuento stock: ≈ ${v.toFixed(4)} ml por cada cara impresa.`;
    default:
      return null;
  }
}

function insumoIdSugeridoNuevaLinea(
  tipo: TipoTarifaRegla,
  ordenados: Insumo[],
  reglasActuales: ReglaCosto[]
): string | null {
  const activos = ordenados.filter((i) => i.activo !== false);
  if (activos.length === 0) return null;

  const idsEnLineas = new Set(
    reglasActuales.map((r) => r.insumo_id).filter(Boolean) as string[]
  );

  const prefer = tipo === "anillado" ? PREF_ANILLADO : PREF_IMPRESION;

  for (const cat of prefer) {
    const cand = activos.find(
      (i) => i.categoria === cat && !idsEnLineas.has(i.id)
    );
    if (cand) return cand.id;
  }
  for (const i of activos) {
    if (!idsEnLineas.has(i.id)) return i.id;
  }
  for (const cat of prefer) {
    const cand = activos.find((i) => i.categoria === cat);
    if (cand) return cand.id;
  }
  return activos[0]?.id ?? null;
}

export function ReglasNegocioPanel({
  preciosImpresion,
  preciosAnillado,
  insumos,
  onChanged
}: Props) {
  const [tipoServicio, setTipoServicio] = useState<TipoTarifaRegla>("impresion");
  const [selId, setSelId] = useState<string>("");
  const [reglas, setReglas] = useState<ReglaCosto[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  /** Insumos activos + los que ya figuran en una línea (aunque estén inactivos). */
  const insumosParaSelector = useMemo(() => {
    const idsEnReglas = new Set(
      reglas.map((r) => r.insumo_id).filter(Boolean) as string[]
    );
    return insumos.filter(
      (i) => i.activo !== false || idsEnReglas.has(i.id)
    );
  }, [insumos, reglas]);

  const insumosOrdenados = useMemo(() => {
    const order = new Map(
      INSUMO_CATEGORIAS.map((c, i) => [c, i] as const)
    );
    return [...insumosParaSelector].sort((a, b) => {
      const da = order.get(a.categoria) ?? 99;
      const db = order.get(b.categoria) ?? 99;
      if (da !== db) return da - db;
      return a.nombre.localeCompare(b.nombre, "es");
    });
  }, [insumosParaSelector]);

  /** Para anillado: insumos cuyo `rango_anillado` coincide con la tarifa (UX arriba del selector). */
  const insumosRecomendadosRango = useMemo(() => {
    if (tipoServicio !== "anillado" || !selId) return [];
    const tarifa = preciosAnillado.find((p) => p.id === selId);
    const rango = tarifa?.nombre_categoria?.trim();
    if (!rango) return [];
    return insumosOrdenados.filter((i) => i.rango_anillado === rango);
  }, [tipoServicio, selId, preciosAnillado, insumosOrdenados]);

  const idsRecomendados = useMemo(
    () => new Set(insumosRecomendadosRango.map((i) => i.id)),
    [insumosRecomendadosRango]
  );

  const insumoIdParaAnadir = useMemo(
    () =>
      insumoIdSugeridoNuevaLinea(
        tipoServicio,
        insumosOrdenados,
        reglas
      ),
    [tipoServicio, insumosOrdenados, reglas]
  );

  useEffect(() => {
    setSelId("");
  }, [tipoServicio]);

  useEffect(() => {
    if (!selId) {
      setReglas([]);
      return;
    }
    let cancel = false;
    setLoading(true);
    reglasCostoApi
      .fetchByTarifa(tipoServicio, selId)
      .then((r) => {
        if (!cancel) setReglas(r);
      })
      .catch(() => {
        if (!cancel) setReglas([]);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [selId, tipoServicio]);

  const precioImpSel = preciosImpresion.find((p) => p.id === selId);
  const precioAnSel = preciosAnillado.find((p) => p.id === selId);

  const totalBaseReglas = useMemo(() => {
    let s = 0;
    for (const r of reglas) {
      if (!r.activo || !r.insumo_id) continue;
      const ins = insumos.find((i) => i.id === r.insumo_id);
      if (!ins) continue;
      s += costoUnitarioInsumo(ins) * r.cantidad_usada;
    }
    return s;
  }, [reglas, insumos]);

  const totalConSeguridad = totalBaseReglas * REGLAS_COSTO_FACTOR_SEGURIDAD;

  const margenVentaVsReglas = useMemo(() => {
    const pv =
      tipoServicio === "impresion"
        ? precioImpSel?.precio_venta
        : precioAnSel?.precio_venta;
    const n = pv != null ? Number(pv) : NaN;
    if (!Number.isFinite(n) || n <= 0) return null;
    return margenSobreVenta(n, totalConSeguridad);
  }, [tipoServicio, precioImpSel, precioAnSel, totalConSeguridad]);

  const reload = async () => {
    if (!selId) return;
    const r = await reglasCostoApi.fetchByTarifa(tipoServicio, selId);
    setReglas(r);
    onChanged?.();
  };

  const addLinea = async () => {
    if (!selId) return;
    setSaving(true);
    try {
      const row = await reglasCostoApi.insert({
        precio_impresion_id:
          tipoServicio === "impresion" ? selId : null,
        precio_anillado_id: tipoServicio === "anillado" ? selId : null,
        insumo_id: insumoIdParaAnadir,
        cantidad_usada: 1,
        activo: true
      });
      setReglas((prev) => [...prev, row]);
      onChanged?.();
      showToast("COMPONENTE AGREGADO");
    } catch {
      showToast("NO SE PUDO AGREGAR", "error");
    } finally {
      setSaving(false);
    }
  };

  /** Papel + tóner + tinta (primeros del catálogo no usados aún), coef. 1 = una cara “estándar”. */
  const addKitUnaCara = async () => {
    if (!selId || tipoServicio !== "impresion") return;
    setSaving(true);
    try {
      const usados = new Set(
        reglas.map((x) => x.insumo_id).filter(Boolean) as string[]
      );
      const papel = insumosOrdenados.find(
        (i) => i.categoria === "papel" && !usados.has(i.id)
      );
      const toner = insumosOrdenados.find(
        (i) => i.categoria === "toner" && !usados.has(i.id)
      );
      const tinta = insumosOrdenados.find(
        (i) => i.categoria === "tinta" && !usados.has(i.id)
      );
      const filas: { ins: Insumo; nombre: string }[] = [];
      if (papel) filas.push({ ins: papel, nombre: papel.nombre });
      if (toner) filas.push({ ins: toner, nombre: toner.nombre });
      if (tinta) filas.push({ ins: tinta, nombre: tinta.nombre });
      if (filas.length === 0) {
        showToast(
          "YA HAY PAPEL/TÓNER/TINTA EN LA TARIFA O NO EXISTEN EN EL CATÁLOGO",
          "error"
        );
        return;
      }
      for (const { ins } of filas) {
        const row = await reglasCostoApi.insert({
          precio_impresion_id: selId,
          precio_anillado_id: null,
          insumo_id: ins.id,
          cantidad_usada: 1,
          activo: true
        });
        setReglas((prev) => [...prev, row]);
        usados.add(ins.id);
      }
      onChanged?.();
      showToast(
        `KIT 1 CARA: ${filas.map((f) => f.nombre).join(" · ")}`,
        "success"
      );
    } catch {
      showToast("NO SE PUDO AGREGAR EL KIT", "error");
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const updateRegla = async (
    id: string,
    patch: Partial<Pick<ReglaCosto, "insumo_id" | "cantidad_usada" | "activo">>
  ) => {
    setReglas((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
    try {
      await reglasCostoApi.update(id, patch);
      onChanged?.();
    } catch {
      await reload();
      showToast("ERROR AL GUARDAR", "error");
    }
  };

  const deleteRegla = async (id: string) => {
    setReglas((rows) => rows.filter((r) => r.id !== id));
    try {
      await reglasCostoApi.delete(id);
      onChanged?.();
      showToast("COMPONENTE QUITADO");
    } catch {
      await reload();
      showToast("ERROR AL BORRAR", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
          Reglas de negocio (costos por tarifa)
        </h3>
        <p className="text-[11px] text-slate-500 font-semibold leading-relaxed max-w-2xl">
          Elegí <strong>impresión</strong> o <strong>anillado</strong> (Chico /
          Mediano / Grande). Podés sumar cualquier insumo del catálogo; en
          anillado, los que coinciden en <strong>rango</strong> con la tarifa
          aparecen primero como sugeridos. El costo usa tu{" "}
          <strong>precio de compra por bulto</strong> y el rendimiento estándar
          (interno). Al subtotal activo se aplica{" "}
          <strong>+10% desperdicio</strong>.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
            Tipo de servicio
          </label>
          <div className="flex rounded-sm border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setTipoServicio("impresion")}
              className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-wider ${
                tipoServicio === "impresion"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-500"
              }`}
            >
              Impresión
            </button>
            <button
              type="button"
              onClick={() => setTipoServicio("anillado")}
              className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-wider ${
                tipoServicio === "anillado"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-500"
              }`}
            >
              Anillado
            </button>
          </div>
        </div>
        <div className="flex-1 min-w-[200px] space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
            Tarifa
          </label>
          <select
            value={selId}
            onChange={(e) => setSelId(e.target.value)}
            className="w-full max-w-lg p-3.5 rounded-sm bg-white border border-slate-100 font-bold text-sm cursor-pointer"
          >
            <option value="">Seleccionar tarifa…</option>
            {tipoServicio === "impresion"
              ? preciosImpresion.map((p) => (
                  <option key={p.id} value={p.id}>
                    {labelPrecioImpresionTarifa(p)} · venta{" "}
                    {formatCurrency(p.precio_venta)}
                    {!p.activo ? " · inactiva" : ""}
                  </option>
                ))
              : preciosAnillado.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre_categoria} · venta {formatCurrency(p.precio_venta)}
                  </option>
                ))}
          </select>
        </div>
      </div>

      {selId && (precioImpSel || precioAnSel) && (
        <div className="rounded-sm border border-violet-100 bg-violet-50/40 p-4 space-y-4">
          {tipoServicio === "impresion" && (
            <div className="text-[11px] text-violet-900 font-semibold leading-relaxed bg-white/80 rounded-sm border border-violet-100 px-3 py-2 space-y-2">
              <p>
                <strong>Cómo se descuenta el stock en pedidos:</strong> el
                programa multiplica tu coeficiente por las{" "}
                <strong>caras impresas</strong> del PDF (tóner y tinta) y por
                las <strong>hojas físicas</strong> (papel). Con coef.{" "}
                <strong>1</strong> en tóner/tinta = una cara “típica”; podés usar{" "}
                <strong>0,5</strong>, <strong>1,2</strong>, etc. para cubrir
                menos o más cobertura.
              </p>
              <p className="text-violet-800 font-bold">
                Papel: coef. por <strong>hoja física</strong>. Tóner / tinta:
                coef. por <strong>cara impresa</strong>. En B/N quitá la línea de
                tinta color; en color podés combinar varias tintas.
              </p>
              {precioImpSel?.doble_faz && (
                <p className="text-amber-900 font-semibold bg-amber-50 border border-amber-200 rounded-sm px-2 py-1.5">
                  <strong>Tarifa doble faz:</strong> con coef. <strong>1</strong>{" "}
                  en tóner/tinta ya se descuenta <strong>una carilla por cada
                  cara del PDF</strong> (una hoja impresa por los dos lados = 2
                  carillas). <strong>No hace falta poner 2</strong> salvo que
                  quieras el <strong>doble de consumo</strong> por cara (p. ej.
                  mucha tinta).
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-black text-violet-800 uppercase tracking-widest">
              Componentes de costo
            </p>
            <div className="flex flex-wrap gap-2">
              {tipoServicio === "impresion" && (
                <button
                  type="button"
                  disabled={saving || insumosOrdenados.length === 0}
                  onClick={() => void addKitUnaCara()}
                  className="px-4 py-2 rounded-sm bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                  title="Añade papel + tóner + tinta (si hay en catálogo y no están ya) con coef. 1"
                >
                  + Kit 1 cara (papel+tóner+tinta)
                </button>
              )}
              <button
                type="button"
                disabled={saving || insumosOrdenados.length === 0}
                onClick={() => void addLinea()}
                className="px-4 py-2 rounded-sm bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
              >
                + Añadir insumo
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-slate-400 font-semibold">
              <i className="fas fa-circle-notch fa-spin mr-2" />
              Cargando…
            </p>
          ) : reglas.length === 0 ? (
            <p className="text-xs text-slate-500 font-semibold">
              Sin reglas para esta tarifa: el costo directo se calcula con la
              lógica previa del sistema hasta que agregues líneas acá.
            </p>
          ) : (
            <div className="space-y-3">
              {reglas.map((r) => {
                const ins = insumos.find((i) => i.id === r.insumo_id);
                const cu = ins ? costoUnitarioInsumo(ins) : 0;
                const lineaCosto = r.activo && ins ? cu * r.cantidad_usada : 0;
                const insumoFaltante = Boolean(r.insumo_id && !ins);
                return (
                  <div
                    key={r.id}
                    className="flex flex-col sm:flex-row sm:flex-wrap gap-3 items-stretch sm:items-end bg-white/90 rounded-sm border border-white p-3"
                  >
                    <div className="flex-1 min-w-[140px]">
                      <label className="text-[9px] font-black text-slate-400 uppercase">
                        Insumo
                      </label>
                      {insumoFaltante && !ins && (
                        <p className="text-[9px] text-amber-700 font-bold mt-0.5">
                          Insumo ya no existe — costo 0 (elegí otro o quitá la
                          línea)
                        </p>
                      )}
                      <select
                        value={r.insumo_id ?? ""}
                        onChange={(e) =>
                          void updateRegla(r.id, {
                            insumo_id: e.target.value || null
                          })
                        }
                        className="w-full mt-1 p-2 rounded-sm border border-slate-100 text-xs font-bold"
                      >
                        <option value="">— Sin insumo ($0) —</option>
                        {tipoServicio === "anillado" &&
                          insumosRecomendadosRango.length > 0 && (
                            <optgroup label="Recomendados (rango tarifa)">
                              {insumosRecomendadosRango.map((i) => (
                                <option key={i.id} value={i.id}>
                                  {INSUMO_CATEGORIA_LABELS[i.categoria]} ·{" "}
                                  {i.nombre}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        {INSUMO_CATEGORIAS.map((cat) => {
                          const list = insumosOrdenados.filter(
                            (i) =>
                              i.categoria === cat && !idsRecomendados.has(i.id)
                          );
                          if (list.length === 0) return null;
                          return (
                            <optgroup
                              key={cat}
                              label={INSUMO_CATEGORIA_LABELS[cat]}
                            >
                              {list.map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.nombre}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="text-[9px] font-black text-slate-400 uppercase">
                        {tipoServicio === "impresion"
                          ? etiquetaCantidadReglaImpresion(ins?.categoria)
                          : "Cantidad"}
                      </label>
                      <input
                        type="number"
                        min="0.0001"
                        step="any"
                        value={r.cantidad_usada}
                        onChange={(e) =>
                          void updateRegla(r.id, {
                            cantidad_usada: Math.max(
                              0.0001,
                              parseFloat(e.target.value) || 1
                            )
                          })
                        }
                        className="w-full mt-1 p-2 rounded-sm border border-slate-100 font-black text-xs"
                      />
                      {tipoServicio === "impresion" &&
                        ins?.categoria === "papel" && (
                          <p className="text-[8px] text-slate-500 font-semibold leading-tight mt-0.5 max-w-[11rem]">
                            Por cada <strong>hoja física</strong> del ítem; lo
                            usual es <strong>1</strong>. No cargues hojas de la
                            resma (ej. 500).
                          </p>
                        )}
                      {tipoServicio === "impresion" &&
                        ins &&
                        (ins.categoria === "toner" ||
                          ins.categoria === "tinta") && (
                          <p className="text-[8px] text-emerald-800 font-bold leading-tight mt-0.5 max-w-[14rem]">
                            {textoEstimacionDescuentoStock(
                              ins,
                              r.cantidad_usada
                            )}
                          </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 pb-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase">
                        Activo
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={r.activo}
                        onClick={() =>
                          void updateRegla(r.id, { activo: !r.activo })
                        }
                        className={`relative w-12 h-7 rounded-full transition-colors ${
                          r.activo ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                            r.activo ? "translate-x-5" : ""
                          }`}
                        />
                      </button>
                    </div>
                    <div className="text-[10px] font-bold text-slate-600 sm:ml-auto">
                      Base línea:{" "}
                      <span className="text-violet-800 font-black">
                        {formatCurrency(lineaCosto)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteRegla(r.id)}
                      className="text-red-500 text-xs font-black uppercase px-2"
                    >
                      Quitar
                    </button>
                  </div>
                );
              })}
              <div className="rounded-sm border border-violet-200 bg-violet-50/80 p-3 space-y-1 text-[11px]">
                <p className="font-bold text-slate-700">
                  Subtotal insumos:{" "}
                  <span className="text-slate-900 font-black">
                    {formatCurrency(totalBaseReglas)}
                  </span>
                </p>
                <p className="font-bold text-slate-600">
                  +10% seguridad / desperdicio:{" "}
                  <span className="text-slate-800 font-black">
                    {formatCurrency(
                      totalBaseReglas * (REGLAS_COSTO_FACTOR_SEGURIDAD - 1)
                    )}
                  </span>
                </p>
                <p className="text-[10px] font-black uppercase tracking-widest text-violet-900 pt-1 border-t border-violet-200">
                  Costo directo tarifa (reglas):{" "}
                  {formatCurrency(totalConSeguridad)}
                </p>
                {tipoServicio === "impresion" && (
                  <p className="text-[9px] text-slate-500 font-semibold leading-snug">
                    Subtotal: una “unidad” de cada coef. a precio 1/1/1. En
                    pedidos reales, el descuento de stock suma{" "}
                    <strong>caras</strong> (tóner/tinta) y <strong>hojas físicas</strong>{" "}
                    (papel); en doble faz hay más caras que hojas.
                  </p>
                )}
                {margenVentaVsReglas && (
                  <p className="text-[11px] font-bold text-slate-700 pt-1">
                    Margen sobre precio de venta (vs{" "}
                    {formatCurrency(margenVentaVsReglas.costo)} costo):{" "}
                    <span
                      className={`font-black ${colorMargenPct(margenVentaVsReglas.margenPct)}`}
                    >
                      {margenVentaVsReglas.margenPct != null
                        ? `${margenVentaVsReglas.margenPct.toFixed(1)}%`
                        : "—"}
                    </span>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
