// ── Precios de impresión ─────────────────────────────────────────────────────

export const TIPO_IMPRESION = ["bn", "color"] as const;
export type TipoImpresion = (typeof TIPO_IMPRESION)[number];

export const TIPO_IMPRESION_LABELS: Record<TipoImpresion, string> = {
  bn: "B&N",
  color: "Color"
};

export interface PrecioImpresion {
  id: string;
  tipo: TipoImpresion;
  doble_faz: boolean;
  /** Etiqueta opcional (varias tarifas por tipo/faz; solo una activa). */
  nombre?: string | null;
  precio_venta: number;
  /** Costo variable insumos/hoja (antes factores); alimenta vistas SQL de margen. */
  costo_insumo_directo?: number | null;
  activo: boolean;
  updated_at: string;
  updated_by: string | null;
}

export type PrecioImpresionInput = Pick<
  PrecioImpresion,
  "tipo" | "doble_faz" | "precio_venta"
>;

// ── Precios de anillado ─────────────────────────────────────────────────────

export const NOMBRE_CATEGORIA_ANILLADO = [
  "Chico",
  "Mediano",
  "Grande"
] as const;
export type NombreCategoriaAnillado =
  (typeof NOMBRE_CATEGORIA_ANILLADO)[number];

export interface PrecioAnillado {
  id: string;
  /** Rango de tarifa (alinea con espiral.rango_anillado). */
  nombre_categoria: NombreCategoriaAnillado;
  medida_mm: number;
  paginas_max: number | null;
  precio_venta: number;
  costo_insumo_directo?: number | null;
  activo: boolean;
  updated_at: string;
  updated_by: string | null;
}

export type PrecioAnilladoInput = Pick<
  PrecioAnillado,
  "nombre_categoria" | "medida_mm" | "paginas_max" | "precio_venta"
>;

// ── Config de costos ────────────────────────────────────────────────────────

export interface ConfigCosto {
  key: string;
  value: string;
  descripcion: string | null;
  updated_at: string;
  updated_by: string | null;
}

export const CONFIG_COSTO_LABELS: Record<string, string> = {
  markup_general: "Divisor Ganancia",
  comision_sobrina: "% Comisión Avru",
  // Datos de pago (WhatsApp / transferencia)
  pago_alias: "Alias (Mercado Pago / transferencia)",
  pago_cbu: "CBU",
  pago_titular: "Titular de la cuenta",
  pago_banco: "Banco"
};

/** Orden fijo en la pestaña Pagos / resumen; alinea con seed `08_seed_datos_prueba`. */
export const CONFIG_COSTO_ORDER: readonly string[] = [
  "markup_general",
  "comision_sobrina",
  "pago_alias",
  "pago_cbu",
  "pago_titular",
  "pago_banco"
] as const;

/** Descripciones por defecto al insertar filas que aún no existen en BD. */
export const CONFIG_COSTO_DESCRIPCIONES: Record<string, string> = {
  markup_general: "Divisor ganancia bruta",
  comision_sobrina: "% comisión Avru",
  pago_alias: "Alias Mercado Pago",
  pago_cbu: "CBU",
  pago_titular: "Titular cuenta",
  pago_banco: "Banco"
};

/**
 * Asegura que aparezcan todas las claves conocidas (p. ej. pago_* para WhatsApp)
 * aunque en `config_costos` solo existan markup/comisión.
 */
export function mergeConfigCostosRows(fetched: ConfigCosto[]): ConfigCosto[] {
  const byKey = new Map(fetched.map((c) => [c.key, c]));
  const orderSet = new Set<string>(CONFIG_COSTO_ORDER);
  const ordered: ConfigCosto[] = CONFIG_COSTO_ORDER.map((key) => {
    const existing = byKey.get(key);
    if (existing) return existing;
    return {
      key,
      value: "",
      descripcion: CONFIG_COSTO_DESCRIPCIONES[key] ?? null,
      updated_at: "",
      updated_by: null
    };
  });
  const extras = fetched
    .filter((c) => !orderSet.has(c.key))
    .sort((a, b) => a.key.localeCompare(b.key));
  return [...ordered, ...extras];
}

// ── Consumo congelado por item ──────────────────────────────────────────────

export interface PedidoItemInsumo {
  id: string;
  pedido_item_id: string;
  insumo_id: string;
  equipo_id: string | null;
  cantidad: number;
  costo_unitario_congelado: number;
  costo_total: number;
  created_at: string;
}

// ── Helpers para etiquetas en UI ────────────────────────────────────────────

export function labelPrecioImpresion(
  tipo: TipoImpresion,
  dobleFaz: boolean
): string {
  return `${TIPO_IMPRESION_LABELS[tipo]} ${dobleFaz ? "Doble Faz" : "Simple Faz"}`;
}

/** Etiqueta en listados (nombre + tipo/faz). */
export function labelPrecioImpresionTarifa(p: PrecioImpresion): string {
  const base = labelPrecioImpresion(p.tipo, p.doble_faz);
  const n = (p.nombre ?? "").trim();
  return n ? `${n} · ${base}` : base;
}

/** Tarifa usada en cotización: una activa por (tipo, doble_faz). */
export function precioImpresionActivoParaTipo(
  precios: PrecioImpresion[],
  tipo: TipoImpresion,
  dobleFaz: boolean
): PrecioImpresion | undefined {
  return precios.find(
    (p) =>
      p.activo !== false &&
      p.tipo === tipo &&
      p.doble_faz === dobleFaz
  );
}

export function labelAnillado(
  medidaMm: number,
  paginasMax: number | null,
  nombreCategoria?: NombreCategoriaAnillado
): string {
  const hojas = paginasMax ? ` (hasta ${paginasMax} hjs)` : "";
  const cat = nombreCategoria ? `${nombreCategoria} · ` : "";
  return `${cat}${medidaMm}mm${hojas}`;
}

/**
 * Elige tarifa según rango (Chico/Mediano/Grande) y hojas del PDF.
 * Si `nombreCategoria` es null, filtra solo por paginas_max / medida.
 */
export function precioAnilladoParaPaginas(
  precios: PrecioAnillado[],
  paginas: number,
  nombreCategoria?: NombreCategoriaAnillado | null
): PrecioAnillado | null {
  if (paginas < 1) return null;
  let activos = precios.filter((p) => p.activo !== false);
  if (nombreCategoria) {
    activos = activos.filter((p) => p.nombre_categoria === nombreCategoria);
  }
  if (activos.length === 0) return null;
  const valid = activos.filter(
    (p) => p.paginas_max == null || paginas <= p.paginas_max
  );
  if (valid.length === 0) {
    const sorted = [...activos].sort(
      (a, b) => (b.paginas_max ?? 999999) - (a.paginas_max ?? 999999)
    );
    return sorted[0] ?? null;
  }
  return [...valid].sort((a, b) => a.medida_mm - b.medida_mm)[0];
}

/**
 * Tarifa al elegir un insumo espiral: prioriza `rango_anillado` = nombre_categoria de la tarifa;
 * si no hay rango, usa `medida_mm` igual a la tarifa.
 */
export function precioAnilladoParaEspiralInsumo(
  precios: PrecioAnillado[],
  paginas: number,
  espiral: {
    medida_mm: number | null;
    rango_anillado: string | null;
  } | null
): PrecioAnillado | null {
  if (!espiral || paginas < 1) return null;
  if (espiral.rango_anillado) {
    const porRango = precioAnilladoParaPaginas(
      precios,
      paginas,
      espiral.rango_anillado as NombreCategoriaAnillado
    );
    if (porRango) return porRango;
  }
  const activos = precios.filter((p) => p.activo !== false);
  const porMedida = activos.filter(
    (p) =>
      espiral.medida_mm != null &&
      p.medida_mm === espiral.medida_mm &&
      (p.paginas_max == null || paginas <= p.paginas_max)
  );
  if (porMedida.length) {
    return [...porMedida].sort((a, b) => a.medida_mm - b.medida_mm)[0];
  }
  return precioAnilladoParaPaginas(precios, paginas);
}
