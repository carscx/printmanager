import type { PedidoItem } from "../../types/pedido";
import { Badge } from "../ui/Badge";

interface ItemRowProps {
  item: PedidoItem;
  index: number;
  onRemove: (index: number) => void;
}

export function ItemRow({ item, index, onRemove }: ItemRowProps) {
  const esSobrina =
    item._sobrina ||
    (item.observaciones && item.observaciones.includes("[AVRU]"));

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
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group">
      <div className="flex-1">
        <p className="text-[10px] font-black text-slate-800 uppercase leading-none mb-1 text-ellipsis overflow-hidden">
          {item.paginas} PAG
          {(item.copias ?? 1) > 1 ? ` × ${item.copias} cop` : ""} |{" "}
          {item.tipo_impresion || "B/N"}
        </p>
        <div className="flex gap-2 mb-1 flex-wrap">
          {item.anillado && (
            <Badge
              text="ANILLADO"
              className="bg-amber-100 text-amber-700 text-[8px]"
            />
          )}
          {esSobrina && (
            <Badge
              text="AVRU"
              className="bg-purple-100 text-purple-700 text-[8px]"
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
      <div className="text-right flex items-center gap-3">
        <p className="font-black text-slate-900 text-sm">
          ${(item.precio_unitario || 0).toLocaleString("es-AR")}
        </p>
        <button
          onClick={() => onRemove(index)}
          className="text-slate-300 hover:text-red-500 transition-colors p-1 cursor-pointer"
        >
          <i className="fas fa-times-circle" />
        </button>
      </div>
    </div>
  );
}
