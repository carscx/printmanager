import type { MouseEvent } from "react";
import type { Pedido, EstadoPedido } from "../../types/pedido";
import { PedidoEstadoSwitcher } from "./PedidoEstadoSwitcher";
import { Badge } from "../ui/Badge";
import { formatCurrency, formatDateFromInput } from "../../utils/formatters";
import { normalizarEstadoPedido } from "../../utils/pedidoEstado";
import { copyTextToClipboard } from "../../utils/clipboard";
import { showToast } from "../ui/Toast";

interface PedidoCardProps {
  pedido: Pedido;
  onBorrar: (id: string) => void;
  onEditar: (p: Pedido) => void;
  onTransition: (p: Pedido, nuevo: EstadoPedido) => void;
  onWA: (p: Pedido) => void;
}

export function PedidoCard({
  pedido: p,
  onBorrar,
  onEditar,
  onTransition,
  onWA
}: PedidoCardProps) {
  const estadoRaw = normalizarEstadoPedido(p.estado);

  const borderConfig: Record<EstadoPedido, string> = {
    presupuesto: "border-l-slate-400",
    pendiente: "border-l-amber-400",
    listo: "border-l-sky-500",
    pagado: "border-l-emerald-500",
    entregado: "border-l-emerald-600",
    cancelado: "border-l-red-500"
  };
  const currentBorder = borderConfig[estadoRaw] ?? "border-l-slate-300";

  const items = p.pedido_items || [];
  const fDate = p.fecha_entrega ? formatDateFromInput(p.fecha_entrega) : "⏳";
  const totalP = Number(p.total ?? p.total_pedido ?? 0);
  const senaP = Number(p.sena ?? 0);

  const etiquetaEstado: Record<EstadoPedido, string> = {
    presupuesto: "Presupuesto",
    pendiente: "En producción",
    listo: "Listo para retirar",
    pagado: "Pagado",
    entregado: "Entregado",
    cancelado: "Cancelado"
  };

  const nombreCliente = (p.cliente ?? "").trim() || "Sin nombre";
  const textoCopiarPedido =
    p.numero_publico != null
      ? `${nombreCliente} #${p.numero_publico}`
      : nombreCliente;

  const handleCopiarNumero = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const ok = await copyTextToClipboard(textoCopiarPedido);
    if (ok) {
      showToast("COPIADO AL PORTAPAPELES");
    } else {
      showToast("NO SE PUDO COPIAR", "error");
    }
  };

  return (
    <div
      className={`bg-white rounded-sm shadow-sm border border-gray-100 border-l-[10px] ${currentBorder} p-5 mb-4 transition-all hover:shadow-md animate-slide-in-right min-w-0 overflow-hidden`}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-slate-900 text-xl md:text-2xl uppercase leading-none tracking-tighter truncate">
            {p.cliente}
          </h3>
          {p.numero_publico != null && (
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider mt-0.5">
              Pedido #{p.numero_publico}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge
              text={etiquetaEstado[estadoRaw]}
              className="bg-slate-100 text-slate-600 font-bold text-[10px]"
            />
            <Badge
              text={
                items.length === 1
                  ? "1 ítem"
                  : `${items.length} ítems`
              }
              className="bg-slate-100 text-slate-500 font-bold text-[10px]"
            />
            <Badge
              text={fDate}
              className="bg-blue-50 text-blue-600 font-bold text-[10px]"
            />
          </div>
        </div>

        <div className="flex gap-1.5 shrink-0 p-1 rounded-sm bg-slate-100/80 border border-slate-200">
          <button
            onClick={handleCopiarNumero}
            className="p-2.5 rounded-sm border-2 border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:border-slate-300 hover:text-slate-800 active:scale-95 transition-all touch-manipulation"
            title={
              p.numero_publico != null
                ? "Copiar cliente y número de pedido"
                : "Copiar nombre del cliente"
            }
            type="button"
            aria-label={
              p.numero_publico != null
                ? `Copiar ${nombreCliente} número ${p.numero_publico}`
                : `Copiar nombre del cliente ${nombreCliente}`
            }
          >
            <i className="fas fa-copy text-lg" />
          </button>
          <button
            onClick={() => onEditar(p)}
            className="p-2.5 rounded-sm border-2 border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 active:scale-95 transition-all touch-manipulation"
            title="Editar pedido"
            type="button"
            aria-label="Editar pedido"
          >
            <i className="fas fa-edit text-lg" />
          </button>
          {estadoRaw !== "cancelado" && (
            <button
              onClick={() => onTransition(p, "cancelado")}
              className="p-2.5 rounded-sm border-2 border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 active:scale-95 transition-all"
              title="Cancelar pedido"
              type="button"
              aria-label="Cancelar pedido"
            >
              <i className="fas fa-ban text-lg" />
            </button>
          )}
          <button
            onClick={() => onBorrar(p.id)}
            className="p-2.5 rounded-sm border-2 border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-red-50 hover:border-red-300 hover:text-red-700 active:scale-95 transition-all"
            title="Eliminar pedido"
            type="button"
            aria-label="Eliminar pedido"
          >
            <i className="fas fa-trash-alt text-lg" />
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
        <div className="space-y-2">
          {items.slice(0, 3).map((it, idx) => (
            <p
              key={idx}
              className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-2"
            >
              <span className="w-1 h-1 bg-slate-300 rounded-full" />
              {it.paginas || 0} PAG{" "}
              {(it.copias ?? 1) > 1 ? `×${it.copias}` : ""} |{" "}
              {it.tipo_impresion}
            </p>
          ))}
          {items.length > 3 && (
            <p className="text-[10px] text-slate-400 font-bold pl-3">
              + {items.length - 3} archivos más...
            </p>
          )}

          {p.observaciones && (
            <div className="mt-3 p-3 rounded-sm bg-amber-50 border border-amber-100 text-[12px] font-bold text-amber-700 italic flex items-start gap-2">
              <i className="fas fa-sticky-note mt-0.5 opacity-60" />
              <span>{p.observaciones}</span>
            </div>
          )}
        </div>

        <div className="text-right">
          <p className="text-4xl md:text-5xl font-black text-slate-900 leading-none tracking-tighter">
            {formatCurrency(totalP)}
          </p>
          <div className="mt-1">
            {senaP >= totalP && totalP > 0 ? (
              <span className="text-[11px] font-black text-green-600 uppercase tracking-widest bg-green-50 px-2 py-0.5 rounded-sm">
                PAGADO
              </span>
            ) : (
              <span
                className={`text-[11px] font-black uppercase tracking-widest ${senaP > 0 ? "text-blue-600" : "text-red-500"}`}
              >
                {senaP > 0 ? `SEÑA: ${formatCurrency(senaP)}` : "SIN SEÑA"}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <PedidoEstadoSwitcher pedido={p} onTransition={onTransition} />
        <button
          type="button"
          onClick={() => onWA(p)}
          className={
            estadoRaw === "listo"
              ? "flex-1 bg-[#00bb2d] hover:bg-green-600 text-white py-4 px-6 rounded-sm text-xs font-black uppercase tracking-[0.12em] flex items-center justify-center gap-2 shadow-lg shadow-green-200 transition-all active:scale-95 border-b-4 border-green-800/20 ring-2 ring-emerald-300/80 ring-offset-2"
              : "flex-1 bg-[#00bb2d] hover:bg-green-600 text-white py-4 px-6 rounded-sm text-xs font-black uppercase tracking-[0.15em] flex items-center justify-center gap-2 shadow-lg shadow-green-100 transition-all active:scale-95 border-b-4 border-green-800/20"
          }
        >
          <i className="fab fa-whatsapp text-2xl" />
          {estadoRaw === "listo" ? (
            <span className="text-left leading-tight">
              Avisar retiro
              <span className="block text-[10px] font-bold opacity-90 normal-case tracking-normal">
                Listo para retirar
              </span>
            </span>
          ) : estadoRaw === "presupuesto" ? (
            "Enviar presupuesto al cliente"
          ) : estadoRaw === "pendiente" ? (
            "Avisar al cliente"
          ) : (
            "WHATSAPP"
          )}
        </button>
      </div>
    </div>
  );
}
