import type { AppConfig } from "../types/config";
import type { Pedido } from "../types/pedido";

export interface CalculatePedidoParams {
  paginas: number;
  copias: number;
  tipo: "bn" | "color";
  doble_faz: boolean;
  idAni: string;
  solo_ani: boolean;
}

export interface CalculatePedidoResult {
  total: number;
  sena: number;
}

export interface ResumenResult {
  total: number;
  comisionTotal: number;
  gananciaLimpiaMoni: number;
}

export const calculator = {
  calculatePedido(
    params: CalculatePedidoParams & {
      descuento_porcentaje?: number | null;
      descuento_monto?: number | null;
      recargo_porcentaje?: number | null;
      recargo_monto?: number | null;
      descuento_global_porcentaje?: number | null;
      recargo_global_porcentaje?: number | null;
    },
    settings: AppConfig
  ): CalculatePedidoResult {
    const {
      paginas,
      copias,
      tipo,
      doble_faz,
      idAni,
      solo_ani,
      descuento_porcentaje,
      descuento_monto,
      recargo_porcentaje,
      recargo_monto,
      descuento_global_porcentaje,
      recargo_global_porcentaje
    } = params;

    const p = paginas || 0;
    const c = copias || 1;
    const hojas = doble_faz ? Math.ceil(p / 2) : p;

    const t_bn_s = parseFloat(settings.t_bn_s) || 35;
    const t_bn_d = parseFloat(settings.t_bn_d) || 55;
    const t_col_s = parseFloat(settings.t_col_s) || 70;
    const t_col_d = parseFloat(settings.t_col_d) || 110;

    const precio_anillado =
      idAni !== "0" ? parseFloat(settings[idAni]) || 0 : 0;
    const precioH =
      tipo === "bn"
        ? doble_faz
          ? t_bn_d
          : t_bn_s
        : doble_faz
          ? t_col_d
          : t_col_s;

    // (impresión por hoja × hojas + anillado) × copias
    let totalUnitario =
      (!solo_ani && p > 0 ? hojas * precioH : 0) + precio_anillado;
    // Aplicar descuento por ítem
    if (descuento_porcentaje) {
      totalUnitario -= totalUnitario * (descuento_porcentaje / 100);
    }
    if (descuento_monto) {
      totalUnitario -= descuento_monto;
    }
    // Aplicar recargo por ítem
    if (recargo_porcentaje) {
      totalUnitario += totalUnitario * (recargo_porcentaje / 100);
    }
    if (recargo_monto) {
      totalUnitario += recargo_monto;
    }
    let total = Math.round(totalUnitario * c);
    // Aplicar descuento global
    if (descuento_global_porcentaje) {
      total -= Math.round(total * (descuento_global_porcentaje / 100));
    }
    // Aplicar recargo global
    if (recargo_global_porcentaje) {
      total += Math.round(total * (recargo_global_porcentaje / 100));
    }
    const sena = Math.round(total * 0.5);

    return { total, sena };
  },

  calculateResumen(pedidos: Pedido[], settings: AppConfig): ResumenResult {
    const total = pedidos.reduce(
      (acc, p) => acc + Number(p.total || p.total_pedido || 0),
      0
    );
    const mkp = parseFloat(settings.markup) || 1.6;
    const porcCom = parseFloat(settings.comision_sobrina) || 10;

    const comisionTotal = pedidos.reduce((acc, p) => {
      const comisionPedido = (p.pedido_items || []).reduce((accIt, it) => {
        const esSobrina =
          it._sobrina ||
          (it.observaciones && it.observaciones.includes("[AVRU]"));
        return (
          accIt + (esSobrina ? (it.precio_unitario || 0) * (porcCom / 100) : 0)
        );
      }, 0);
      return acc + comisionPedido;
    }, 0);

    const gananciaBruta = total - total / mkp;
    const gananciaLimpiaMoni = Math.round(gananciaBruta - comisionTotal);

    return {
      total: Math.round(total),
      comisionTotal: Math.round(comisionTotal),
      gananciaLimpiaMoni
    };
  }
};
