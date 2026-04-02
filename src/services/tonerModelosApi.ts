import { sb } from "../config/supabase";
import type { TonerModeloReferencia } from "../types/tonerModelo";

const SELECT_TONER_MODELO =
  "id, codigo, nombre, notas, gramos_por_cartucho, mg_por_cara, activo, orden, created_at";

export async function fetchTonerModelosActivos(): Promise<TonerModeloReferencia[]> {
  const { data, error } = await sb
    .from("toner_modelos")
    .select(SELECT_TONER_MODELO)
    .eq("activo", true)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TonerModeloReferencia[];
}

/** ABM admin: todos los perfiles (activos e inactivos). */
export async function fetchTonerModelosTodos(): Promise<TonerModeloReferencia[]> {
  const { data, error } = await sb
    .from("toner_modelos")
    .select(SELECT_TONER_MODELO)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TonerModeloReferencia[];
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
  const { data, error } = await sb
    .from("toner_modelos")
    .insert({
      codigo: payload.codigo,
      nombre: payload.nombre.trim(),
      notas: payload.notas,
      gramos_por_cartucho: payload.gramos_por_cartucho,
      mg_por_cara: payload.mg_por_cara,
      activo: payload.activo,
      orden: payload.orden
    })
    .select(SELECT_TONER_MODELO)
    .single();

  if (error) throw error;
  return data as TonerModeloReferencia;
}

export async function updateTonerModelo(
  id: string,
  payload: TonerModeloUpsert
): Promise<TonerModeloReferencia> {
  const { data, error } = await sb
    .from("toner_modelos")
    .update({
      codigo: payload.codigo,
      nombre: payload.nombre.trim(),
      notas: payload.notas,
      gramos_por_cartucho: payload.gramos_por_cartucho,
      mg_por_cara: payload.mg_por_cara,
      activo: payload.activo,
      orden: payload.orden
    })
    .eq("id", id)
    .select(SELECT_TONER_MODELO)
    .single();

  if (error) throw error;
  return data as TonerModeloReferencia;
}

export async function deleteTonerModelo(id: string): Promise<void> {
  const { error } = await sb.from("toner_modelos").delete().eq("id", id);
  if (error) throw error;
}
