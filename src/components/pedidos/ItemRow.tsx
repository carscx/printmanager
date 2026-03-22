import type { PedidoItem } from "../../types/pedido";
import { Badge } from "../ui/Badge";

interface ItemRowProps {
  item: PedidoItem;
  index: number;
  onRemove: (index: number) => void;
  onEdit?: (index: number) => void;
  isEditing?: boolean;
}

export function ItemRow({
  item,
  index,
  onRemove,
  onEdit,
  isEditing
}: ItemRowProps) {
  // Mostrar badge de descuento/recargo
  const descRecBadges = [];
  if (item.descuento_porcentaje)
    descRecBadges.push(
      <Badge
        key="desc-pct"
        text={`-${item.descuento_porcentaje}%`}
        className="bg-green-100 text-green-700 text-[8px]"
      />
    );
  if (item.descuento_monto)
    descRecBadges.push(
      <Badge
        key="desc-monto"
        text={`-$${item.descuento_monto}`}
        className="bg-green-100 text-green-700 text-[8px]"
      />
    );
  if (item.recargo_porcentaje)
    descRecBadges.push(
      <Badge
        key="rec-pct"
        text={`+${item.recargo_porcentaje}%`}
        className="bg-red-100 text-red-700 text-[8px]"
      />
    );
  if (item.recargo_monto)
    descRecBadges.push(
      <Badge
        key="rec-monto"
        text={`+$${item.recargo_monto}`}
        className="bg-red-100 text-red-700 text-[8px]"
      />
    );

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-sm border group ${
        isEditing
          ? "bg-amber-50 border-amber-200 ring-1 ring-amber-100"
          : "bg-slate-50 border-slate-100"
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-bold text-slate-500 uppercase leading-tight mb-0.5 truncate">
          {item.nombre_archivo || "Archivo"}
        </p>
        <p className="text-[10px] font-black text-slate-800 uppercase leading-none mb-1 text-ellipsis overflow-hidden">
          {item.paginas} PAG
          {(item.copias ?? 1) > 1 ? ` × ${item.copias} cop` : ""} |{" "}
          {item.tipo_impresion || "B/N"}
        </p>
        <div className="flex gap-2 mb-1 flex-wrap">
          {item.solo_anillado && (
            <Badge
              text="SOLO ANILLADO"
              className="bg-emerald-100 text-emerald-800 text-[8px]"
            />
          )}
          {item.anillado && (
            <Badge
              text="ANILLADO"
              className="bg-amber-100 text-amber-700 text-[8px]"
            />
          )}
          {descRecBadges}
        </div>
        {item.observaciones && (
          <p className="text-[8px] text-slate-400 italic font-medium leading-tight">
            "{item.observaciones}"
          </p>
        )}
      </div>
      <div className="text-right flex items-center gap-2 shrink-0">
        <p className="font-black text-slate-900 text-sm">
          ${(item.precio_unitario || 0).toLocaleString("es-AR")}
        </p>
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(index)}
            className="text-amber-600 hover:text-amber-800 transition-colors p-1 cursor-pointer"
            title="Editar línea"
            aria-label="Editar línea"
          >
            <i className="fas fa-pen" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-slate-300 hover:text-red-500 transition-colors p-1 cursor-pointer"
          title="Quitar"
          aria-label="Quitar línea"
        >
          <i className="fas fa-times-circle" />
        </button>
      </div>
    </div>
  );
}
