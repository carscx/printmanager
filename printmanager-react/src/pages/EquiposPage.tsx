import { useState, useCallback } from "react";
import { useEquipos } from "../hooks/useEquipos";
import { equiposApi } from "../services/equiposApi";
import { EquiposList } from "../components/equipos/EquiposList";
import { EquipoForm } from "../components/equipos/EquipoForm";
import type { Equipo, EquipoInput } from "../types/equipo";

type Vista = "lista" | "formulario";

export function EquiposPage() {
  const { equipos, loading, reload, mostrarInactivos, setMostrarInactivos } =
    useEquipos(true);
  const [vista, setVista] = useState<Vista>("lista");
  const [equipoSeleccionado, setEquipoSeleccionado] = useState<Equipo | null>(
    null
  );

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
      reload();
    },
    [equipoSeleccionado, reload]
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
