import { apiDelete, apiGet, apiPatch, apiPost } from "../config/apiClient";
import type { TonerModeloReferencia } from "../types/tonerModelo";

export async function fetchTonerModelosActivos(): Promise<TonerModeloReferencia[]> {
  return apiGet("/toner-modelos");
}

export async function fetchTonerModelosTodos(): Promise<TonerModeloReferencia[]> {
  return apiGet("/toner-modelos?todos=true");
}

export type TonerModeloUpsert = {
  codigo: string | null;
  nombre: string;
  notas: string | null;
  gramos_por_cartucho: number;
  mg_por_cara: number;
  activo: boolean;
  orden: number;
};

export async function insertTonerModelo(
  payload: TonerModeloUpsert
): Promise<TonerModeloReferencia> {
  return apiPost("/toner-modelos", {
    codigo: payload.codigo,
    nombre: payload.nombre.trim(),
    notas: payload.notas,
    gramos_por_cartucho: payload.gramos_por_cartucho,
    mg_por_cara: payload.mg_por_cara,
    activo: payload.activo,
    orden: payload.orden
  });
}

export async function updateTonerModelo(
  id: string,
  payload: TonerModeloUpsert
): Promise<TonerModeloReferencia> {
  return apiPatch(`/toner-modelos/${id}`, {
    codigo: payload.codigo,
    nombre: payload.nombre.trim(),
    notas: payload.notas,
    gramos_por_cartucho: payload.gramos_por_cartucho,
    mg_por_cara: payload.mg_por_cara,
    activo: payload.activo,
    orden: payload.orden
  });
}

export async function deleteTonerModelo(id: string): Promise<void> {
  await apiDelete(`/toner-modelos/${id}`);
}
