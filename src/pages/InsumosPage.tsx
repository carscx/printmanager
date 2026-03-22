import { useState, useCallback, useEffect } from "react";
import { useInsumos } from "../hooks/useInsumos";
import { insumosApi } from "../services/insumosApi";
import { InsumoForm } from "../components/insumos/InsumoForm";
import { InsumosList } from "../components/insumos/InsumosList";
import { StockModal } from "../components/insumos/StockModal";
import { showToast } from "../components/ui/Toast";
import { ConfirmSheet, useConfirmSheet } from "../components/ui/ConfirmSheet";
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
  const {
    state: confirmDeleteState,
    abrir: abrirConfirmDelete,
    cerrar: cerrarConfirmDelete
  } = useConfirmSheet();

  const [impactoReglas, setImpactoReglas] = useState<
    Record<string, { lineas: number; tarifas: number }>
  >({});

  const loadImpactoReglas = useCallback(() => {
    insumosApi
      .fetchReglasImpactoResumen()
      .then(setImpactoReglas)
      .catch(() => setImpactoReglas({}));
  }, []);

  useEffect(() => {
    if (vista !== "lista" || loading) return;
    loadImpactoReglas();
  }, [vista, loading, loadImpactoReglas]);

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
      precioCompraBulto?: number;
    }) => {
      if (!insumoSeleccionado) return;
      await insumosApi.registrarMovimiento({
        insumo_id: insumoSeleccionado.id,
        tipo: data.tipo,
        motivo: data.motivo,
        cantidad: data.cantidad,
        notas: data.notas || undefined,
        precioCompraBulto: data.precioCompraBulto
      });
      setVista("lista");
      setInsumoSeleccionado(null);
      refetch();
      loadImpactoReglas();
    },
    [insumoSeleccionado, refetch, loadImpactoReglas]
  );

  const handleCancel = useCallback(() => {
    setVista("lista");
    setInsumoSeleccionado(null);
  }, []);

  const handleDesactivar = useCallback(async () => {
    if (!insumoSeleccionado) return;
    try {
      await insumosApi.desactivar(insumoSeleccionado.id);
      showToast("INSUMO DESACTIVADO");
      setVista("lista");
      setInsumoSeleccionado(null);
      refetch();
    } catch {
      showToast("NO SE PUDO DESACTIVAR", "error");
    }
  }, [insumoSeleccionado, refetch]);

  const handleDeleteFisico = useCallback(() => {
    if (!insumoSeleccionado) return;
    abrirConfirmDelete(
      "danger",
      "¿Eliminar insumo del sistema?",
      "Las reglas de costo que lo usen quedarán sin insumo (ese componente cuenta $0). Pedidos y stock se actualizan según la base de datos.",
      async () => {
        try {
          await insumosApi.rpcDeleteInsumoFisico(insumoSeleccionado.id);
          showToast("INSUMO ELIMINADO");
          setVista("lista");
          setInsumoSeleccionado(null);
          refetch();
          loadImpactoReglas();
        } catch (e: unknown) {
          const msg =
            e && typeof e === "object" && "message" in e
              ? String((e as { message?: string }).message)
              : "";
          showToast(msg || "NO SE PUDO ELIMINAR", "error");
        }
      }
    );
  }, [insumoSeleccionado, abrirConfirmDelete, refetch, loadImpactoReglas]);

  const handleReactivar = useCallback(async () => {
    if (!insumoSeleccionado) return;
    try {
      await insumosApi.activar(insumoSeleccionado.id);
      showToast("INSUMO REACTIVADO");
      setVista("lista");
      setInsumoSeleccionado(null);
      refetch();
    } catch {
      showToast("NO SE PUDO REACTIVAR", "error");
    }
  }, [insumoSeleccionado, refetch]);

  return (
    <div className="max-w-6xl lg:mx-auto pb-4">
      {vista === "lista" && (
        <InsumosList
          insumos={insumos}
          loading={loading}
          impactoPorInsumo={impactoReglas}
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
          onDesactivar={handleDesactivar}
          onReactivar={handleReactivar}
          onDeleteFisico={handleDeleteFisico}
        />
      )}

      <ConfirmSheet {...confirmDeleteState} onClose={cerrarConfirmDelete} />

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
