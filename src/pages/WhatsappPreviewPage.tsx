import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Pedido } from "../types/pedido";
import type { PlantillaWhatsapp } from "../types/whatsapp";
import { api } from "../services/api";
import { whatsappApi } from "../services/whatsappApi";
import {
  renderWhatsappMensaje,
  selectPlantillaParaPedido
} from "../services/whatsappService";
import { showToast } from "../components/ui/Toast";
import { WhatsappMensajeEditor } from "../components/whatsapp/WhatsappMensajeEditor";

export function WhatsappPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [plantilla, setPlantilla] = useState<PlantillaWhatsapp | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!id) return;
      setLoading(true);
      try {
        const [p, datosPagoResp] = await Promise.all([
          api.fetchPedidoById(id),
          whatsappApi.fetchDatosPago()
        ]);
        if (!p) {
          showToast("PEDIDO NO ENCONTRADO", "error");
          navigate("/");
          return;
        }
        setPedido(p);

        const plantillas = await whatsappApi.fetchPlantillasByEstado(
          (p.estado || "presupuesto").toLowerCase()
        );
        const plant = selectPlantillaParaPedido(p, plantillas);
        setPlantilla(plant);
        if (plant) {
          const msg = renderWhatsappMensaje({
            pedido: p,
            items: p.pedido_items || [],
            plantilla: plant,
            datosPago: datosPagoResp
          });
          setMensaje(msg);
        } else {
          setMensaje("");
        }
      } catch (err) {
        console.error("Error loading WhatsApp preview:", err);
        showToast("ERROR AL CARGAR WHATSAPP", "error");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, navigate]);

  const handleAbrirWhatsapp = async () => {
    if (!mensaje || !id) return;
    const url = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
    try {
      await whatsappApi.logMensajeEnviado(
        id,
        plantilla?.id ?? null,
        mensaje
      );
    } catch {
      // Log opcional: si falla (ej. tabla no creada) no bloquear al usuario
    }
  };

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(mensaje);
      showToast("MENSAJE COPIADO");
    } catch {
      showToast("NO SE PUDO COPIAR", "error");
    }
  };

  if (loading) {
    return (
      <section className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center text-slate-400 text-xs font-bold uppercase tracking-[0.2em]">
          Cargando mensaje de WhatsApp...
        </div>
      </section>
    );
  }

  if (!pedido) {
    return null;
  }

  return (
    <section className="space-y-4 lg:max-w-2xl lg:mx-auto pb-24">
      <header className="mt-2 mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2 cursor-pointer"
        >
          <i className="fas fa-arrow-left" />
          Volver
        </button>
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
            WhatsApp para
          </p>
          <p className="text-sm font-black text-slate-800 uppercase">
            {pedido.cliente}
          </p>
        </div>
      </header>

      {plantilla && (
        <div className="bg-slate-900 text-white rounded-sm p-4 text-[10px] font-mono uppercase tracking-[0.2em] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <i className="fab fa-whatsapp text-green-400" />
            <span className="font-black">Plantilla: {plantilla.nombre}</span>
          </div>
          <span className="text-[8px] text-slate-400">
            Estado: {pedido.estado}
          </span>
        </div>
      )}

      <WhatsappMensajeEditor value={mensaje} onChange={setMensaje} />

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handleCopiar}
          className="py-3 rounded-sm bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 cursor-pointer"
        >
          <i className="fas fa-copy" />
          Copiar texto
        </button>
        <button
          type="button"
          onClick={handleAbrirWhatsapp}
          className="py-3 rounded-sm bg-emerald-500 text-white text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-95 transition-transform"
        >
          <i className="fab fa-whatsapp" />
          Abrir WhatsApp
        </button>
      </div>
    </section>
  );
}
