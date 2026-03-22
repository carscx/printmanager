import { useState, useEffect, useCallback } from "react";
import { whatsappApi } from "../services/whatsappApi";
import type { PlantillaWhatsapp, PlantillaWhatsappInput } from "../types/whatsapp";
import { ESTADO_DESTINO_LABELS } from "../types/whatsapp";
import { useAuth } from "../hooks/useAuth";
import { showToast } from "../components/ui/Toast";
import { PlantillaFormSheet } from "../components/whatsapp/PlantillaFormSheet";
import { useConfirmSheet, ConfirmSheet } from "../components/ui/ConfirmSheet";

/** Admin y operador gestionan plantillas; vendedor solo lectura (sin botones). */
function puedeGestionarPlantillas(role: string | undefined) {
  return role === "admin" || role === "operador";
}

export function PlantillasWhatsappPage() {
  const { user } = useAuth();
  const puedeEditar = puedeGestionarPlantillas(user?.role);
  const [plantillas, setPlantillas] = useState<PlantillaWhatsapp[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlantilla, setEditingPlantilla] = useState<PlantillaWhatsapp | null>(null);
  const { state: confirmState, abrir: abrirConfirm, cerrar: cerrarConfirm } = useConfirmSheet();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await whatsappApi.fetchAllPlantillas();
      setPlantillas(data);
    } catch (err) {
      console.error("Error loading plantillas:", err);
      showToast("ERROR AL CARGAR PLANTILLAS", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = () => {
    setEditingPlantilla(null);
    setFormOpen(true);
  };

  const handleEdit = (p: PlantillaWhatsapp) => {
    setEditingPlantilla(p);
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingPlantilla(null);
  };

  const handleSave = async (data: PlantillaWhatsappInput) => {
    if (editingPlantilla) {
      await whatsappApi.updatePlantilla(editingPlantilla.id, data);
      showToast("PLANTILLA ACTUALIZADA");
    } else {
      await whatsappApi.createPlantilla(data);
      showToast("PLANTILLA CREADA");
    }
    await load();
  };

  const handleToggleActivo = async (p: PlantillaWhatsapp) => {
    try {
      await whatsappApi.updatePlantilla(p.id, { activo: !p.activo });
      showToast(p.activo ? "PLANTILLA DESACTIVADA" : "PLANTILLA ACTIVADA");
      await load();
    } catch {
      showToast("ERROR AL ACTUALIZAR", "error");
    }
  };

  const handleDelete = (p: PlantillaWhatsapp) => {
    abrirConfirm(
      "danger",
      "Eliminar plantilla",
      `¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`,
      async () => {
        await whatsappApi.deletePlantilla(p.id);
        showToast("PLANTILLA ELIMINADA");
        await load();
      }
    );
  };

  const handleSubir = async (index: number) => {
    if (index <= 0) return;
    const actual = plantillas[index];
    const anterior = plantillas[index - 1];
    try {
      await whatsappApi.updatePlantilla(actual.id, { orden: anterior.orden });
      await whatsappApi.updatePlantilla(anterior.id, { orden: actual.orden });
      showToast("ORDEN ACTUALIZADO");
      await load();
    } catch {
      showToast("ERROR AL REORDENAR", "error");
    }
  };

  const handleBajar = async (index: number) => {
    if (index >= plantillas.length - 1) return;
    const actual = plantillas[index];
    const siguiente = plantillas[index + 1];
    try {
      await whatsappApi.updatePlantilla(actual.id, { orden: siguiente.orden });
      await whatsappApi.updatePlantilla(siguiente.id, { orden: actual.orden });
      showToast("ORDEN ACTUALIZADO");
      await load();
    } catch {
      showToast("ERROR AL REORDENAR", "error");
    }
  };

  return (
    <section className="animate-fade-in space-y-4 pb-24 lg:max-w-3xl lg:mx-auto">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-black uppercase tracking-tighter text-slate-900">
            Plantillas WhatsApp
          </h1>
          <p className="text-xs text-slate-400 font-bold">
            Mensajes predefinidos por estado del pedido
          </p>
        </div>
        {puedeEditar && (
          <button
            type="button"
            onClick={handleCreate}
            className="px-4 py-3 rounded-sm bg-green-600 text-white text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 cursor-pointer hover:bg-green-700 active:scale-95 transition-transform"
          >
            <i className="fab fa-whatsapp" />
            Nueva plantilla
          </button>
        )}
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <i className="fas fa-circle-notch fa-spin fa-2x text-green-500" />
        </div>
      ) : plantillas.length === 0 ? (
        <div className="bg-white rounded-sm border border-slate-100 p-8 text-center">
          <i className="fab fa-whatsapp text-4xl text-slate-200 mb-4" />
          <p className="text-slate-500 font-bold">
            No hay plantillas.{" "}
            {puedeEditar && "Creá una para enviar mensajes por estado."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {plantillas.map((p, index) => (
            <div
              key={p.id}
              className="bg-white rounded-sm border border-slate-100 shadow-sm overflow-hidden"
            >
              <div className="p-4 flex items-start gap-3">
                {puedeEditar && (
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSubir(index)}
                      disabled={index === 0}
                      className="p-2 rounded-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                      title="Subir"
                    >
                      <i className="fas fa-chevron-up text-sm" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBajar(index)}
                      disabled={index === plantillas.length - 1}
                      className="p-2 rounded-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                      title="Bajar"
                    >
                      <i className="fas fa-chevron-down text-sm" />
                    </button>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    {p.nombre}
                  </span>
                  <span className="px-2 py-0.5 rounded-sm bg-slate-100 text-[10px] font-bold text-slate-600">
                    {ESTADO_DESTINO_LABELS[p.estado_destino as keyof typeof ESTADO_DESTINO_LABELS] ?? p.estado_destino}
                  </span>
                  {!p.activo && (
                    <span className="px-2 py-0.5 rounded-sm bg-red-100 text-[10px] font-bold text-red-600">
                      Inactiva
                    </span>
                  )}
                  {p.incluir_datos_pago && (
                    <span className="px-2 py-0.5 rounded-sm bg-green-50 text-[10px] font-bold text-green-700">
                      Incluye pago
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 font-mono line-clamp-3 whitespace-pre-wrap">
                  {p.cuerpo}
                </p>
                </div>
              </div>
              {puedeEditar && (
                <div className="flex border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleEdit(p)}
                    className="flex-1 py-3 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 active:bg-slate-100"
                  >
                    <i className="fas fa-edit mr-1" /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActivo(p)}
                    className="flex-1 py-3 text-[10px] font-black uppercase tracking-wider text-amber-600 hover:bg-amber-50 active:bg-amber-100"
                  >
                    {p.activo ? (
                      <> <i className="fas fa-pause-circle mr-1" /> Desactivar </>
                    ) : (
                      <> <i className="fas fa-play-circle mr-1" /> Activar </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    className="flex-1 py-3 text-[10px] font-black uppercase tracking-wider text-red-600 hover:bg-red-50 active:bg-red-100"
                  >
                    <i className="fas fa-trash-alt mr-1" /> Eliminar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <PlantillaFormSheet
        open={formOpen}
        onClose={handleCloseForm}
        plantilla={editingPlantilla}
        onSave={handleSave}
      />

      <ConfirmSheet
        open={confirmState.open}
        tipo={confirmState.tipo}
        titulo={confirmState.titulo}
        texto={confirmState.texto}
        onConfirm={confirmState.onConfirm}
        onClose={cerrarConfirm}
      />
    </section>
  );
}
