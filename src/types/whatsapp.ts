export interface PlantillaWhatsapp {
  id: string;
  estado_destino: string;
  nombre: string;
  cuerpo: string;
  incluir_datos_pago: boolean;
  activo: boolean;
  orden: number;
  updated_at: string;
  updated_by: string | null;
}

/** Payload para crear o actualizar plantilla (admin) */
export type PlantillaWhatsappInput = Pick<
  PlantillaWhatsapp,
  "estado_destino" | "nombre" | "cuerpo" | "incluir_datos_pago" | "activo" | "orden"
>;

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
  "{{estado}}",
  "{{fecha_entrega}}",
  "{{alias_pago}}",
  "{{cbu}}",
  "{{titular_pago}}",
  "{{banco}}",
  "{{observaciones}}"
];

