/**
 * Cómo se elige la plantilla para un pedido (además de estado_destino).
 * `any` = respaldo si no hay otra que coincida con el criterio calculado del pedido.
 */
export type MatchCriterioPlantilla =
  | "any"
  | "pago_total"
  | "con_sena"
  | "sin_sena";

export interface PlantillaWhatsapp {
  id: string;
  estado_destino: string;
  nombre: string;
  cuerpo: string;
  incluir_datos_pago: boolean;
  activo: boolean;
  /** Legacy; ya no se usa para elegir plantilla. */
  orden: number;
  /** Si falta (BD antigua), se trata como `any`. */
  match_criterio?: MatchCriterioPlantilla;
  updated_at: string;
  updated_by: string | null;
}

/** Payload para crear o actualizar plantilla (admin). `match_criterio` es obligatorio al guardar. */
export type PlantillaWhatsappInput = Omit<
  Pick<
    PlantillaWhatsapp,
    | "estado_destino"
    | "nombre"
    | "cuerpo"
    | "incluir_datos_pago"
    | "activo"
    | "orden"
    | "match_criterio"
  >,
  "match_criterio"
> & { match_criterio: MatchCriterioPlantilla };

export const MATCH_CRITERIO_LABELS: Record<MatchCriterioPlantilla, string> = {
  any: "Cualquier caso (respaldo)",
  pago_total: "Pagó el total (seña ≥ total)",
  con_sena: "Con seña (pago parcial)",
  sin_sena: "Sin seña"
};

export const MATCH_CRITERIO_OPTS: { value: MatchCriterioPlantilla; label: string }[] =
  [
    { value: "any", label: MATCH_CRITERIO_LABELS.any },
    { value: "pago_total", label: MATCH_CRITERIO_LABELS.pago_total },
    { value: "con_sena", label: MATCH_CRITERIO_LABELS.con_sena },
    { value: "sin_sena", label: MATCH_CRITERIO_LABELS.sin_sena }
  ];

/** Estados de pedido que pueden tener plantilla asociada (alineados con la máquina de estados) */
export const ESTADOS_DESTINO_WHATSAPP = [
  "presupuesto",
  "pendiente",
  "listo",
  "pagado",
  "entregado",
  "cancelado"
] as const;

export type EstadoDestinoWhatsapp =
  (typeof ESTADOS_DESTINO_WHATSAPP)[number];

export const ESTADO_DESTINO_LABELS: Record<EstadoDestinoWhatsapp, string> = {
  presupuesto: "Presupuesto",
  pendiente: "Pendiente (en producción / seña)",
  listo: "Listo para retirar",
  pagado: "Pagado",
  entregado: "Entregado",
  cancelado: "Cancelado"
};

/** Variables que se reemplazan en el cuerpo del mensaje */
export const VARIABLES_PLANTILLA = [
  "{{cliente}}",
  "{{detalle}}",
  "{{total}}",
  "{{sena}}",
  "{{resta}}",
  "{{linea_sena}}",
  "{{estado}}",
  "{{fecha_entrega}}",
  "{{alias_pago}}",
  "{{cbu}}",
  "{{titular_pago}}",
  "{{banco}}",
  "{{observaciones}}"
];

