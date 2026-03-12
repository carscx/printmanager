export const calculator = {
  calculatePedido(params, settings) {
    const { paginas, tipo, doble_faz, idAni, solo_ani } = params;

    const p = parseInt(paginas) || 0;
    const df = doble_faz;
    const isSolo = solo_ani;

    const hojas = df ? Math.ceil(p / 2) : p;

    // Tarifas desde settings
    const t_bn_s = parseFloat(settings.t_bn_s) || 35;
    const t_bn_d = parseFloat(settings.t_bn_d) || 55;
    const t_col_s = parseFloat(settings.t_col_s) || 70;
    const t_col_d = parseFloat(settings.t_col_d) || 110;

    const precio_anillado =
      idAni !== "0" ? parseFloat(settings[idAni]) || 0 : 0;
    let precioH =
      tipo === "bn" ? (df ? t_bn_d : t_bn_s) : df ? t_col_d : t_col_s;

    const total = Math.round(
      (!isSolo && p > 0 ? hojas * precioH : 0) + precio_anillado
    );
    const sena = Math.round(total * 0.5);

    return { total, sena };
  },

  calculateResumen(pedidos, settings) {
    const total = pedidos.reduce((acc, p) => acc + p.total, 0);
    const mkp = parseFloat(settings.markup) || 1.6;
    const porcCom = parseFloat(settings.comision_sobrina) || 10;

    const comisionTotal = pedidos.reduce((acc, p) => {
      return acc + (p.sobrina_trabajo ? p.total * (porcCom / 100) : 0);
    }, 0);

    const gananciaBruta = total - total / mkp;
    const gananciaLimpiaMoni = gananciaBruta - comisionTotal;

    return {
      total,
      comisionTotal: Math.round(comisionTotal),
      gananciaLimpiaMoni: Math.round(gananciaLimpiaMoni)
    };
  }
};
