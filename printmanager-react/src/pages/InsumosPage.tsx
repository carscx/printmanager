import { useState, useCallback } from "react";
import { useInsumos } from "../hooks/useInsumos";
import { insumosApi } from "../services/insumosApi";
import { InsumoForm } from "../components/insumos/InsumoForm";
import { InsumosList } from "../components/insumos/InsumosList";
import { StockModal } from "../components/insumos/StockModal";
import type {
  Insumo,
  InsumoInput,
  StockTipo,
  StockMotivo
} from "../types/insumo";

type Vista = "lista" | "formulario" | "stock";

export function InsumosPage() {
  const {
    insumos,
    loading,
    filtroCategoria: categoriaFiltro,
    setFiltroCategoria: setCategoriaFiltro,
    busqueda,
    setBusqueda,
    mostrarInactivos,
    setMostrarInactivos,
    reload: refetch
  } = useInsumos(true);

  const [vista, setVista] = useState<Vista>("lista");
  const [insumoSeleccionado, setInsumoSeleccionado] = useState<Insumo | null>(
    null
  );

  // Nuevo insumo
  const handleNuevo = useCallback(() => {
    setInsumoSeleccionado(null);
    setVista("formulario");
  }, []);

  // Editar insumo
  const handleSelect = useCallback((insumo: Insumo) => {
    setInsumoSeleccionado(insumo);
    setVista("formulario");
  }, []);

  // Abrir modal de stock
  const handleStock = useCallback((insumo: Insumo) => {
    setInsumoSeleccionado(insumo);
    setVista("stock");
  }, []);

  // Guardar (crear o editar)
  const handleSave = useCallback(
    async (data: InsumoInput) => {
      if (insumoSeleccionado) {
        await insumosApi.actualizar(insumoSeleccionado.id, data);
      } else {
        await insumosApi.crear(data);
      }
      setVista("lista");
      setInsumoSeleccionado(null);
      refetch();
    },
    [insumoSeleccionado, refetch]
  );

  // Registrar movimiento de stock
  const handleStockSave = useCallback(
    async (data: {
      tipo: StockTipo;
      motivo: StockMotivo;
      cantidad: number;
      notas: string;
    }) => {
      if (!insumoSeleccionado) return;
      await insumosApi.registrarMovimiento({
        insumo_id: insumoSeleccionado.id,
        tipo: data.tipo,
        motivo: data.motivo,
        cantidad: data.cantidad,
        notas: data.notas || undefined
      });
      setVista("lista");
      setInsumoSeleccionado(null);
      refetch();
    },
    [insumoSeleccionado, refetch]
  );

  const handleCancel = useCallback(() => {
    setVista("lista");
    setInsumoSeleccionado(null);
  }, []);

  return (
    <div className="max-w-2xl lg:mx-auto pb-4">
      {vista === "lista" && (
        <InsumosList
          insumos={insumos}
          loading={loading}
          categoriaFiltro={categoriaFiltro}
          setCategoriaFiltro={setCategoriaFiltro}
          busqueda={busqueda}
          setBusqueda={setBusqueda}
          mostrarInactivos={mostrarInactivos}
          setMostrarInactivos={setMostrarInactivos}
          onSelect={handleSelect}
          onNuevo={handleNuevo}
          onStock={handleStock}
        />
      )}

      {vista === "formulario" && (
        <InsumoForm
          insumo={insumoSeleccionado}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}

      {vista === "stock" && insumoSeleccionado && (
        <StockModal
          insumo={insumoSeleccionado}
          onSave={handleStockSave}
          onClose={handleCancel}
        />
      )}
    </div>
  );
}
