import { useState, useCallback, useEffect, useMemo } from "react";
import { useEquipos } from "../hooks/useEquipos";
import { equiposApi, type EquipoResumenRoi } from "../services/equiposApi";
import { EquiposList } from "../components/equipos/EquiposList";
import { EquipoForm } from "../components/equipos/EquipoForm";
import type { Equipo, EquipoInput } from "../types/equipo";

type Vista = "lista" | "formulario";

export function EquiposPage() {
  const { equipos, loading, reload, mostrarInactivos, setMostrarInactivos } =
    useEquipos(true);
  const [roiRows, setRoiRows] = useState<EquipoResumenRoi[]>([]);
  const [vista, setVista] = useState<Vista>("lista");
  const [equipoSeleccionado, setEquipoSeleccionado] = useState<Equipo | null>(
    null
  );

  const reloadRoi = useCallback(async () => {
    try {
      setRoiRows(await equiposApi.fetchResumenRoi());
    } catch {
      setRoiRows([]);
    }
  }, []);

  useEffect(() => {
    void reloadRoi();
  }, [reloadRoi]);

  const roiById = useMemo(() => {
    const m = new Map<string, EquipoResumenRoi>();
    for (const r of roiRows) {
      m.set(r.equipo_id, r);
    }
    return m;
  }, [roiRows]);

  const handleNuevo = useCallback(() => {
    setEquipoSeleccionado(null);
    setVista("formulario");
  }, []);

  const handleSelect = useCallback((equipo: Equipo) => {
    setEquipoSeleccionado(equipo);
    setVista("formulario");
  }, []);

  const handleSave = useCallback(
    async (data: EquipoInput) => {
      if (equipoSeleccionado) {
        await equiposApi.actualizar(equipoSeleccionado.id, data);
      } else {
        await equiposApi.crear(data);
      }
      setVista("lista");
      setEquipoSeleccionado(null);
      await reload();
      await reloadRoi();
    },
    [equipoSeleccionado, reload, reloadRoi]
  );

  const handleClose = useCallback(() => {
    setVista("lista");
    setEquipoSeleccionado(null);
  }, []);

  return (
    <div className="max-w-2xl lg:mx-auto pb-4">
      {vista === "lista" && (
        <EquiposList
          equipos={equipos}
          roiById={roiById}
          loading={loading}
          mostrarInactivos={mostrarInactivos}
          setMostrarInactivos={setMostrarInactivos}
          onSelect={handleSelect}
          onNuevo={handleNuevo}
        />
      )}

      {vista === "formulario" && (
        <EquipoForm
          equipo={equipoSeleccionado}
          onSave={handleSave}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
