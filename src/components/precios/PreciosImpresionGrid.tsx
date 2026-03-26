import { useState, useMemo } from "react";
import { preciosApi } from "../../services/preciosApi";
import {
  costoVariablePorUnidadImpresion,
  margenSobreVenta,
  tieneCostoDirectoTarifaImpresion
} from "../../services/costEngine";
import { showToast } from "../ui/Toast";
import { ConfirmSheet, useConfirmSheet } from "../ui/ConfirmSheet";
import { formatCurrency } from "../../utils/formatters";
import {
  labelPrecioImpresionTarifa,
  labelSlugLineaImpresion,
  normalizarSlugLineaImpresion,
  perfilTintaEfectivo,
  type PerfilTintaImpresion,
  type PrecioImpresion
} from "../../types/precio";
import type { Insumo } from "../../types/insumo";
import type { Equipo } from "../../types/equipo";
import { MargenTarifaHint, type AvisoCostoTarifa } from "./MargenTarifaHint";

interface Props {
  precios: PrecioImpresion[];
  onReload: () => Promise<void>;
  onAjusteMasivo: () => void;
  insumos: Insumo[];
  equipos: Equipo[];
  costosListos: boolean;
}

function errorImpresionMsg(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (err?.code === "23505" || err?.message?.includes("duplicate"))
    return "Solo puede haber una tarifa activa por tipo y cara.";
  if (err?.code === "23503" || err?.message?.includes("foreign key"))
    return "No se puede borrar: hay datos vinculados. Desactivá la tarifa.";
  if (err?.message?.includes("Ya hay otra tarifa activa"))
    return err.message;
  return err?.message ?? "Error al guardar.";
}

export function PreciosImpresionGrid({
  precios,
  onReload,
  onAjusteMasivo,
  insumos: _insumos,
  equipos,
  costosListos
}: Props) {
  const { state: confirmState, abrir: abrirConfirm, cerrar: cerrarConfirm } =
    useConfirmSheet();

  const [crearAbierto, setCrearAbierto] = useState(false);
  const [draftNuevo, setDraftNuevo] = useState({
    tipo: "bn",
    perfil_tinta: "bn" as PerfilTintaImpresion,
    doble_faz: false,
    precio: "",
    nombre: ""
  });

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [draftEdit, setDraftEdit] = useState({
    precio: "",
    equipoId: "" as string,
    perfil_tinta: "bn" as PerfilTintaImpresion
  });

  const slugsExistentes = useMemo(
    () => [...new Set(precios.map((p) => p.tipo))].sort(),
    [precios]
  );

  const [editRapidoId, setEditRapidoId] = useState<string | null>(null);
  const [valorRapido, setValorRapido] = useState("");

  const [saving, setSaving] = useState(false);

  const preciosOrdenados = useMemo(() => {
    return [...precios].sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo.localeCompare(b.tipo);
      if (a.doble_faz !== b.doble_faz) return a.doble_faz ? 1 : -1;
      return a.id.localeCompare(b.id);
    });
  }, [precios]);

  const costoPorId = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of precios) {
      m.set(p.id, costoVariablePorUnidadImpresion(p, equipos));
    }
    return m;
  }, [precios, equipos]);

  const iniciarEdicionRapida = (p: PrecioImpresion) => {
    setEditRapidoId(p.id);
    setValorRapido(String(p.precio_venta));
  };

  const guardarRapido = async (id: string, precioAnterior: number) => {
    const num = parseFloat(valorRapido.replace(",", "."));
    if (isNaN(num) || num < 0) return;
    const costo = costoPorId.get(id) ?? 0;
    const { margenPct: mAnt } = margenSobreVenta(precioAnterior, costo);
    const { margenPct: mNue, ganancia } = margenSobreVenta(num, costo);
    setSaving(true);
    try {
      await preciosApi.actualizarPrecioImpresion(id, num);
      if (ganancia < 0) {
        showToast(
          "PRECIO POR DEBAJO DEL COSTO VARIABLE ESTIMADO",
          "error"
        );
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
        showToast("PRECIO ACTUALIZADO");
      }
      setEditRapidoId(null);
      await onReload();
    } catch {
      showToast("ERROR AL GUARDAR", "error");
    } finally {
      setSaving(false);
    }
  };

  const cancelarRapido = () => {
    setEditRapidoId(null);
    setValorRapido("");
  };

  const iniciarEdicionCompleta = (p: PrecioImpresion) => {
    setEditandoId(p.id);
    setDraftEdit({
      precio: String(p.precio_venta),
      equipoId: p.equipo_id ?? "",
      perfil_tinta: perfilTintaEfectivo(p)
    });
  };

  const guardarEdicionCompleta = async (id: string, precioAnterior: number) => {
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
      await preciosApi.actualizarPrecioImpresionCompleto(id, {
        precio_venta: precio,
        equipo_id: draftEdit.equipoId === "" ? null : draftEdit.equipoId,
        perfil_tinta: draftEdit.perfil_tinta
      });
      if (ganancia < 0) {
        showToast("PRECIO POR DEBAJO DEL COSTO VARIABLE ESTIMADO", "error");
      } else if (
        mAnt != null &&
        mNue != null &&
        mNue < mAnt - 0.5
      ) {
        showToast(
          `Rentabilidad ${mAnt.toFixed(0)}% → ${mNue.toFixed(0)}%`,
          "warning"
        );
      } else {
        showToast("TARIFA ACTUALIZADA");
      }
      setEditandoId(null);
      await onReload();
    } catch (e) {
      showToast(errorImpresionMsg(e), "error");
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
    const slug = normalizarSlugLineaImpresion(draftNuevo.tipo);
    if (!slug || slug.length > 64) {
      showToast(
        "Código de línea inválido: usá letras minúsculas, números y _ (ej. candy_bar)",
        "error"
      );
      return;
    }
    setSaving(true);
    try {
      const row = await preciosApi.crearPrecioImpresion({
        tipo: slug,
        doble_faz: draftNuevo.doble_faz,
        precio_venta: precio,
        activo: true,
        nombre: draftNuevo.nombre.trim() || undefined,
        perfil_tinta: draftNuevo.perfil_tinta
      });
      if (row.activo === false) {
        showToast(
          "TARIFA CREADA EN BORRADOR: ya había una activa para esa combinación. Activá esta y desactivá la otra si querés usarla.",
          "warning"
        );
      } else {
        showToast("TARIFA CREADA");
      }
      setDraftNuevo({
        tipo: "bn",
        perfil_tinta: "bn",
        doble_faz: false,
        precio: "",
        nombre: ""
      });
      setCrearAbierto(false);
      await onReload();
    } catch (e) {
      showToast(errorImpresionMsg(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (p: PrecioImpresion) => {
    try {
      await preciosApi.toggleImpresionActivo(p.id, !p.activo);
      showToast(p.activo ? "DESACTIVADO" : "ACTIVADO");
      await onReload();
    } catch (e) {
      showToast(errorImpresionMsg(e), "error");
    }
  };

  const pedirEliminar = (p: PrecioImpresion) => {
    abrirConfirm(
      "danger",
      "Eliminar tarifa",
      `¿Eliminar «${labelPrecioImpresionTarifa(p)}»? Se borran las reglas de costo vinculadas.`,
      async () => {
        try {
          await preciosApi.eliminarPrecioImpresion(p.id);
          showToast("TARIFA ELIMINADA");
          if (editandoId === p.id) setEditandoId(null);
          if (editRapidoId === p.id) setEditRapidoId(null);
          await onReload();
        } catch (e) {
          showToast(errorImpresionMsg(e), "error");
        }
      }
    );
  };

  return (
    <div className="bg-white rounded-sm shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] italic leading-none">
            Tarifas de impresión (ABM)
          </h3>
          <p className="text-[10px] text-slate-400 font-semibold mt-2 max-w-lg leading-snug">
            Cada fila es una <strong>línea de producto</strong> (código único) y{" "}
            <strong>cara</strong> (simple / doble). Creá líneas nuevas (ej.{" "}
            <code className="text-amber-800">candy_bar</code>,{" "}
            <code className="text-amber-800">pegatinas</code>) y enlazá{" "}
            <strong>reglas</strong> e <strong>insumos</strong> a esa tarifa.
            solo una puede estar <strong>activa</strong> por combinación (la usa
            el cotizador). El costo variable viene de{" "}
            <strong>Reglas de negocio</strong>.
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
                Código de línea (slug)
              </label>
              <input
                type="text"
                list="slug-lineas-impresion"
                value={draftNuevo.tipo}
                onChange={(e) =>
                  setDraftNuevo((d) => ({ ...d, tipo: e.target.value }))
                }
                placeholder="candy_bar, pegatinas…"
                className="mt-1 w-full sm:w-44 p-2.5 rounded-sm border border-amber-200 font-mono text-sm text-slate-900"
              />
              <datalist id="slug-lineas-impresion">
                {slugsExistentes.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase">
                Perfil tinta (costo motor)
              </label>
              <select
                value={draftNuevo.perfil_tinta}
                onChange={(e) =>
                  setDraftNuevo((d) => ({
                    ...d,
                    perfil_tinta: e.target.value as PerfilTintaImpresion
                  }))
                }
                className="mt-1 w-full sm:w-40 p-2.5 rounded-sm border border-amber-200 font-bold text-sm cursor-pointer"
              >
                <option value="bn">Tóner (B&amp;N)</option>
                <option value="color">Tintas color</option>
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={draftNuevo.doble_faz}
                onChange={(e) =>
                  setDraftNuevo((d) => ({
                    ...d,
                    doble_faz: e.target.checked
                  }))
                }
                className="rounded border-amber-300"
              />
              <span className="text-[10px] font-black text-slate-600 uppercase">
                Doble faz
              </span>
            </label>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase">
                Nombre (opcional)
              </label>
              <input
                type="text"
                value={draftNuevo.nombre}
                onChange={(e) =>
                  setDraftNuevo((d) => ({ ...d, nombre: e.target.value }))
                }
                placeholder="Ej. plancha glossy"
                className="mt-1 w-full sm:w-44 p-2.5 rounded-sm border border-amber-200 text-sm font-semibold text-slate-800"
              />
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase">
                Precio venta / hoja
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
        {preciosOrdenados.length === 0 && (
          <div className="px-4 py-10 text-center text-[10px] text-slate-500 font-semibold leading-relaxed max-w-md mx-auto">
            Todavía no hay tarifas en esta lista. Si en la base de datos sí hay filas,
            probá recargar la página o ejecutá en Supabase:{" "}
            <code className="text-slate-700 bg-slate-100 px-1 rounded-sm">
              NOTIFY pgrst, &apos;reload schema&apos;;
            </code>
          </div>
        )}
        {preciosOrdenados.map((p) => {
          const costo = costoPorId.get(p.id) ?? 0;
          const avisoCosto: AvisoCostoTarifa =
            !tieneCostoDirectoTarifaImpresion(p, equipos) && costo < 0.005
              ? "sin_reglas"
              : null;
          const borrador =
            editRapidoId === p.id
              ? parseFloat(valorRapido.replace(",", "."))
              : NaN;
          const editando = editandoId === p.id;

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
                        Precio / hoja
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
                        className="mt-1 w-28 p-2 rounded-sm border border-blue-200 font-black text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase">
                        Equipo (ROI)
                      </label>
                      <select
                        value={draftEdit.equipoId}
                        onChange={(e) =>
                          setDraftEdit((d) => ({
                            ...d,
                            equipoId: e.target.value
                          }))
                        }
                        className="mt-1 w-full min-w-[200px] p-2 rounded-sm border border-blue-200 text-sm font-bold text-slate-800 bg-white"
                      >
                        <option value="">Sin asignar</option>
                        {equipos.map((eq) => (
                          <option key={eq.id} value={eq.id}>
                            {eq.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase">
                        Perfil tinta
                      </label>
                      <select
                        value={draftEdit.perfil_tinta}
                        onChange={(e) =>
                          setDraftEdit((d) => ({
                            ...d,
                            perfil_tinta: e.target.value as PerfilTintaImpresion
                          }))
                        }
                        className="mt-1 w-full sm:w-40 p-2 rounded-sm border border-blue-200 text-sm font-bold bg-white"
                      >
                        <option value="bn">Tóner (B&amp;N)</option>
                        <option value="color">Tintas color</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void guardarEdicionCompleta(
                            p.id,
                            Number(p.precio_venta)
                          )
                        }
                        className="px-3 py-2 rounded-sm bg-green-500 text-white text-[10px] font-black uppercase disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditandoId(null)}
                        className="px-3 py-2 rounded-sm bg-slate-200 text-slate-600 text-[10px] font-black uppercase"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-400 font-semibold">
                    {labelSlugLineaImpresion(p.tipo)} ·{" "}
                    {p.doble_faz ? "Doble faz" : "Simple faz"} (slug no editable)
                  </p>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-sm flex items-center justify-center flex-shrink-0 ${
                        perfilTintaEfectivo(p) === "bn"
                          ? "bg-slate-100 text-slate-500"
                          : p.tipo === "stickers"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gradient-to-br from-cyan-100 to-pink-100 text-pink-600"
                      }`}
                    >
                      <i
                        className={`fas ${p.doble_faz ? "fa-layer-group" : "fa-file"} text-sm`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-slate-700 leading-none truncate">
                        {labelPrecioImpresionTarifa(p)}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-none">
                        por hoja cobrada ·{" "}
                        {p.activo ? (
                          <span className="text-emerald-600 font-bold">Activa</span>
                        ) : (
                          <span className="text-slate-500 font-bold">Inactiva</span>
                        )}
                      </p>
                      <MargenTarifaHint
                        precioVenta={Number(p.precio_venta)}
                        costoVariable={costo}
                        costosListos={costosListos}
                        avisoCosto={avisoCosto}
                        precioBorrador={
                          editRapidoId === p.id && !Number.isNaN(borrador)
                            ? borrador
                            : null
                        }
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 justify-end">
                    {editRapidoId === p.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={valorRapido}
                          onChange={(e) => setValorRapido(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              void guardarRapido(p.id, Number(p.precio_venta));
                            if (e.key === "Escape") cancelarRapido();
                          }}
                          autoFocus
                          className="w-24 p-2 bg-blue-50 rounded-sm font-black text-blue-700 text-right text-sm outline-none border border-blue-200"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            void guardarRapido(p.id, Number(p.precio_venta))
                          }
                          disabled={saving}
                          className="w-9 h-9 rounded-sm bg-green-500 text-white flex items-center justify-center cursor-pointer"
                        >
                          <i className="fas fa-check text-xs" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelarRapido}
                          className="w-9 h-9 rounded-sm bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"
                        >
                          <i className="fas fa-times text-xs" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => iniciarEdicionRapida(p)}
                        className="text-lg font-black text-blue-600 px-3 py-1 rounded-sm bg-blue-50/50 cursor-pointer active:scale-95"
                      >
                        {formatCurrency(p.precio_venta)}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => iniciarEdicionCompleta(p)}
                      className="text-[10px] font-black text-slate-500 uppercase px-2 py-1 rounded-sm border border-slate-200 hover:bg-slate-50"
                    >
                      <i className="fas fa-pen mr-1" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggle(p)}
                      className={`text-[10px] font-black uppercase px-2 py-1 rounded-sm border ${
                        p.activo
                          ? "border-amber-200 text-amber-700 bg-amber-50"
                          : "border-emerald-200 text-emerald-700 bg-emerald-50"
                      }`}
                    >
                      {p.activo ? "Desactivar" : "Activar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => pedirEliminar(p)}
                      className="text-[10px] font-black text-red-600 uppercase px-2 py-1"
                    >
                      <i className="fas fa-trash mr-1" />
                      Borrar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmSheet {...confirmState} onClose={cerrarConfirm} />
    </div>
  );
}
