import { useState, useMemo, useEffect } from "react";
import { preciosApi } from "../../services/preciosApi";
import { reglasCostoApi } from "../../services/reglasCostoApi";
import {
  costoVariablePorUnidadAnillado,
  margenSobreVenta,
  tieneCostoDirectoTarifaAnillado
} from "../../services/costEngine";
import { showToast } from "../ui/Toast";
import { ConfirmSheet, useConfirmSheet } from "../ui/ConfirmSheet";
import { formatCurrency } from "../../utils/formatters";
import type { PrecioAnillado, NombreCategoriaAnillado } from "../../types/precio";
import { NOMBRE_CATEGORIA_ANILLADO } from "../../types/precio";
import type { Insumo } from "../../types/insumo";
import type { Equipo } from "../../types/equipo";
import type { ReglaCosto } from "../../types/reglaCosto";
import { MargenTarifaHint, type AvisoCostoTarifa } from "./MargenTarifaHint";

interface Props {
  precios: PrecioAnillado[];
  onReload: () => Promise<void>;
  onAjusteMasivo: () => void;
  insumos: Insumo[];
  equipos: Equipo[];
  costosListos: boolean;
}

function errorAnilladoMsg(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (err?.code === "23505" || err?.message?.includes("duplicate"))
    return "Ya existe una tarifa con esa medida (mm).";
  if (err?.code === "23503" || err?.message?.includes("foreign key"))
    return "No se puede borrar: hay pedidos u otros datos vinculados. Desactivá la tarifa.";
  return err?.message ?? "Error al guardar.";
}

export function PreciosAnilladoGrid({
  precios,
  onReload,
  onAjusteMasivo,
  insumos,
  equipos,
  costosListos
}: Props) {
  const { state: confirmState, abrir: abrirConfirm, cerrar: cerrarConfirm } =
    useConfirmSheet();

  const [crearAbierto, setCrearAbierto] = useState(false);
  const [draftNuevo, setDraftNuevo] = useState({
    nombre_categoria: "Mediano" as NombreCategoriaAnillado,
    precio: ""
  });

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [draftEdit, setDraftEdit] = useState({
    nombre_categoria: "Mediano" as NombreCategoriaAnillado,
    precio: ""
  });

  const [saving, setSaving] = useState(false);
  const [reglasAnillado, setReglasAnillado] = useState<ReglaCosto[]>([]);

  useEffect(() => {
    let cancel = false;
    reglasCostoApi
      .fetchTodasAnillado()
      .then((r) => {
        if (!cancel) setReglasAnillado(r);
      })
      .catch(() => {
        if (!cancel) setReglasAnillado([]);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const costoPorId = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of precios) {
      m.set(
        p.id,
        costoVariablePorUnidadAnillado(p, insumos, equipos, reglasAnillado)
      );
    }
    return m;
  }, [precios, insumos, equipos, reglasAnillado]);

  const iniciarEdicion = (p: PrecioAnillado) => {
    setEditandoId(p.id);
    setDraftEdit({
      nombre_categoria: p.nombre_categoria ?? "Mediano",
      precio: String(p.precio_venta)
    });
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
  };

  const guardarEdicion = async (id: string, precioAnterior: number) => {
    const precio = parseFloat(draftEdit.precio.replace(",", "."));
    if (!Number.isFinite(precio) || precio < 0) {
      showToast("Precio inválido", "error");
      return;
    }

    const costo = costoPorId.get(id) ?? 0;
    const { margenPct: mAnt } = margenSobreVenta(precioAnterior, costo);
    const { margenPct: mNue, ganancia } = margenSobreVenta(precio, costo);

    setSaving(true);
    try {
      await preciosApi.actualizarPrecioAnilladoCompleto(id, {
        nombre_categoria: draftEdit.nombre_categoria,
        precio_venta: precio
      });
      if (ganancia < 0) {
        showToast("PRECIO POR DEBAJO DEL COSTO VARIABLE ESTIMADO", "error");
      } else if (
        mAnt != null &&
        mNue != null &&
        mNue < mAnt - 0.5
      ) {
        showToast(
          `Rentabilidad ${mAnt.toFixed(0)}% → ${mNue.toFixed(0)}% (${(mNue - mAnt).toFixed(1)} pts)`,
          "warning"
        );
      } else {
        showToast("TARIFA ACTUALIZADA");
      }
      setEditandoId(null);
      await onReload();
    } catch (e) {
      showToast(errorAnilladoMsg(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const crearTarifa = async () => {
    const precio = parseFloat(draftNuevo.precio.replace(",", "."));
    if (!Number.isFinite(precio) || precio < 0) {
      showToast("Precio inválido", "error");
      return;
    }

    setSaving(true);
    try {
      await preciosApi.crearPrecioAnillado({
        nombre_categoria: draftNuevo.nombre_categoria,
        medida_mm: 0,
        paginas_max: null,
        precio_venta: precio,
        activo: true
      });
      showToast("TARIFA CREADA");
      setDraftNuevo({
        nombre_categoria: "Mediano",
        precio: ""
      });
      setCrearAbierto(false);
      await onReload();
    } catch (e) {
      showToast(errorAnilladoMsg(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (p: PrecioAnillado) => {
    try {
      await preciosApi.toggleAnilladoActivo(p.id, !p.activo);
      showToast(p.activo ? "DESACTIVADO" : "ACTIVADO");
      await onReload();
    } catch {
      showToast("ERROR", "error");
    }
  };

  const pedirEliminar = (p: PrecioAnillado) => {
    abrirConfirm(
      "danger",
      "Eliminar tarifa",
      `¿Eliminar la tarifa «${p.nombre_categoria}»? No podrás si hay pedidos vinculados.`,
      async () => {
        try {
          await preciosApi.eliminarPrecioAnillado(p.id);
          showToast("TARIFA ELIMINADA");
          if (editandoId === p.id) setEditandoId(null);
          await onReload();
        } catch (e) {
          showToast(errorAnilladoMsg(e), "error");
        }
      }
    );
  };

  return (
    <div className="bg-white rounded-sm shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] italic leading-none">
            Tarifas de anillado (ABM)
          </h3>
          <p className="text-[10px] text-slate-400 font-semibold mt-2 max-w-lg leading-snug">
            Cada fila es un <strong>rango</strong> (Chico / Mediano / Grande),
            precio de venta y reglas de negocio asociadas. Podés desactivar o
            borrar. El costo variable viene de las{" "}
            <strong>Reglas de negocio</strong> cuando existan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCrearAbierto((v) => !v)}
            className="text-[10px] font-black text-amber-700 uppercase tracking-wider px-3 py-1.5 bg-amber-100 rounded-sm cursor-pointer active:scale-95 transition-transform"
          >
            <i className="fas fa-plus mr-1" />
            Nueva tarifa
          </button>
          <button
            type="button"
            onClick={onAjusteMasivo}
            className="text-[10px] font-black text-blue-600 uppercase tracking-wider px-3 py-1.5 bg-blue-50 rounded-sm cursor-pointer active:scale-95 transition-transform"
          >
            <i className="fas fa-percent mr-1" />
            Ajuste masivo
          </button>
        </div>
      </div>

      {crearAbierto && (
        <div className="px-4 pb-4 border-b border-amber-100 bg-amber-50/50">
          <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-3">
            Nueva tarifa
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-end">
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase">
                Nombre tarifa
              </label>
              <select
                value={draftNuevo.nombre_categoria}
                onChange={(e) =>
                  setDraftNuevo((d) => ({
                    ...d,
                    nombre_categoria: e.target.value as NombreCategoriaAnillado
                  }))
                }
                className="mt-1 w-full sm:w-36 p-2.5 rounded-sm border border-amber-200 font-bold text-sm cursor-pointer"
              >
                {NOMBRE_CATEGORIA_ANILLADO.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase">
                Precio venta
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={draftNuevo.precio}
                onChange={(e) =>
                  setDraftNuevo((d) => ({ ...d, precio: e.target.value }))
                }
                placeholder="0"
                className="mt-1 w-full sm:w-28 p-2.5 rounded-sm border border-amber-200 font-black text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void crearTarifa()}
                className="px-4 py-2.5 rounded-sm bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                Crear
              </button>
              <button
                type="button"
                onClick={() => setCrearAbierto(false)}
                className="px-4 py-2.5 rounded-sm bg-slate-100 text-slate-600 text-[10px] font-black uppercase"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-50">
        {precios.map((p) => {
          const costo = costoPorId.get(p.id) ?? 0;
          const avisoCosto: AvisoCostoTarifa =
            !tieneCostoDirectoTarifaAnillado(
              p,
              insumos,
              equipos,
              reglasAnillado
            ) && costo < 0.005
              ? "sin_reglas"
              : null;
          const editando = editandoId === p.id;
          const precioNum = editando
            ? parseFloat(draftEdit.precio.replace(",", "."))
            : Number(p.precio_venta);
          const borrador =
            editando && !Number.isNaN(precioNum) ? precioNum : null;

          return (
            <div
              key={p.id}
              className={`flex flex-col px-4 py-3 gap-3 ${
                !p.activo ? "opacity-40 bg-slate-50/50" : ""
              }`}
            >
              {editando ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase">
                        Nombre tarifa
                      </label>
                      <select
                        value={draftEdit.nombre_categoria}
                        onChange={(e) =>
                          setDraftEdit((d) => ({
                            ...d,
                            nombre_categoria: e.target.value as NombreCategoriaAnillado
                          }))
                        }
                        className="mt-1 w-32 p-2 rounded-sm border border-amber-200 font-bold text-sm cursor-pointer"
                      >
                        {NOMBRE_CATEGORIA_ANILLADO.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase">
                        Precio venta
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={draftEdit.precio}
                        onChange={(e) =>
                          setDraftEdit((d) => ({
                            ...d,
                            precio: e.target.value
                          }))
                        }
                        className="mt-1 w-28 p-2 rounded-sm border border-amber-200 font-black text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void guardarEdicion(p.id, Number(p.precio_venta))
                        }
                        className="px-3 py-2 rounded-sm bg-green-500 text-white text-[10px] font-black uppercase disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={cancelarEdicion}
                        className="px-3 py-2 rounded-sm bg-slate-200 text-slate-600 text-[10px] font-black uppercase"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                  <MargenTarifaHint
                    precioVenta={Number(p.precio_venta)}
                    costoVariable={costo}
                    costosListos={costosListos}
                    avisoCosto={avisoCosto}
                    precioBorrador={borrador}
                  />
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-sm bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-black text-amber-600">
                        {p.nombre_categoria?.charAt(0) ?? "?"}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-slate-700 leading-none">
                        {p.nombre_categoria ?? "—"}
                        {!p.activo && (
                          <span className="ml-2 text-[9px] font-black text-slate-400 uppercase">
                            (inactivo)
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-none">
                        Tarifa por trabajo · costo según reglas de negocio
                      </p>
                      <MargenTarifaHint
                        precioVenta={Number(p.precio_venta)}
                        costoVariable={costo}
                        costosListos={costosListos}
                        avisoCosto={avisoCosto}
                        precioBorrador={null}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center flex-wrap justify-end">
                    <span className="text-lg font-black text-amber-600 px-3 py-1 rounded-sm bg-amber-50/50">
                      {formatCurrency(p.precio_venta)}
                    </span>
                    <button
                      type="button"
                      onClick={() => iniciarEdicion(p)}
                      className="text-[10px] font-black text-slate-600 uppercase px-3 py-2 rounded-sm bg-slate-100 cursor-pointer active:scale-95"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggle(p)}
                      className={`w-9 h-9 rounded-sm flex items-center justify-center cursor-pointer active:scale-95 transition-all ${
                        p.activo
                          ? "bg-green-50 text-green-500"
                          : "bg-red-50 text-red-400"
                      }`}
                      title={p.activo ? "Desactivar" : "Activar"}
                    >
                      <i
                        className={`fas ${p.activo ? "fa-eye" : "fa-eye-slash"} text-xs`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => pedirEliminar(p)}
                      className="w-9 h-9 rounded-sm flex items-center justify-center bg-red-50 text-red-500 cursor-pointer active:scale-95"
                      title="Eliminar"
                    >
                      <i className="fas fa-trash-alt text-xs" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {precios.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-slate-400 font-semibold">
          No hay tarifas de anillado. Usá &quot;Nueva tarifa&quot; para crear la
          primera.
        </p>
      )}

      <ConfirmSheet {...confirmState} onClose={cerrarConfirm} />
    </div>
  );
}
