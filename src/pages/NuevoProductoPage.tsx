import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/AuthContext";
import { usePedidos } from "../hooks/usePedidos";
import { FechaEntregaSelector } from "../components/pedidos/FechaEntregaSelector";
import { NumberStepper } from "../components/ui/NumberStepper";
import { showToast } from "../components/ui/Toast";
import { formatCurrency } from "../utils/formatters";
import { scrollFieldIntoView } from "../utils/scrollField";
import { productosApi } from "../services/productosApi";
import { api } from "../services/api";
import type { Pedido, PedidoItem } from "../types/pedido";
import type { Producto } from "../types/producto";
import { productoListoParaVender } from "../types/producto";
import { ActionSheet, ActionSheetTrigger } from "../components/ui/ActionSheet";
import { VolverButton } from "../components/ui/VolverButton";

type LocationState = { modo?: "nuevo"; editandoPedidoId?: string };

export function NuevoProductoPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState | null) ?? null;
  const { user } = useAuth();
  const { crear, actualizar } = usePedidos();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editandoPedidoId, setEditandoPedidoId] = useState<string | null>(
    state?.editandoPedidoId ?? null
  );
  const [pedidoEdit, setPedidoEdit] = useState<Pedido | null>(null);

  const [cliente, setCliente] = useState("");
  const [productoId, setProductoId] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [sheetProducto, setSheetProducto] = useState(false);
  const [errCliente, setErrCliente] = useState(false);
  const [errFecha, setErrFecha] = useState(false);

  const clienteFieldRef = useRef<HTMLDivElement>(null);
  const clienteInputRef = useRef<HTMLInputElement>(null);
  const fechaFieldRef = useRef<HTMLDivElement>(null);
  const fechaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    productosApi
      .fetchAll(true)
      .then((rows) => {
        if (!alive) return;
        setProductos(rows);
      })
      .catch((e) => {
        console.error(e);
        if (alive) {
          setProductos([]);
          showToast("ERROR AL CARGAR PRODUCTOS", "error");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (state?.modo === "nuevo") {
      setEditandoPedidoId(null);
      setPedidoEdit(null);
      setCliente("");
      setFechaEntrega("");
      setCantidad(1);
      setErrCliente(false);
      setErrFecha(false);
    }
  }, [state?.modo, location.key]);

  useEffect(() => {
    const id = state?.editandoPedidoId;
    if (!id) return;
    let alive = true;
    api
      .fetchPedidoById(id)
      .then((p) => {
        if (!alive || !p) return;
        setPedidoEdit(p);
        setEditandoPedidoId(p.id);
        setCliente(p.cliente ?? "");
        setFechaEntrega(p.fecha_entrega ?? "");
        const item = p.pedido_items?.[0];
        if (item) {
          setProductoId(item.producto_id ?? "");
          setCantidad(Math.max(1, item.copias ?? 1));
        }
      })
      .catch((e) => {
        console.error(e);
        showToast("ERROR AL CARGAR EL PEDIDO", "error");
      });
    return () => {
      alive = false;
    };
  }, [state?.editandoPedidoId]);

  useEffect(() => {
    if (productoId) return;
    if (productos.length === 1) setProductoId(productos[0].id);
  }, [productos, productoId]);

  const producto = productos.find((p) => p.id === productoId) ?? null;
  const listo = producto ? productoListoParaVender(producto) : false;
  const total = listo
    ? Math.round(Number(producto?.precio_venta ?? 0) * cantidad)
    : 0;
  const productoLabel =
    productos.find((p) => p.id === productoId)?.nombre ?? "Elegir producto…";

  const handleSave = async () => {
    const okCliente = Boolean(cliente.trim());
    const okFecha = Boolean(fechaEntrega);
    if (!okCliente) {
      setErrCliente(true);
      setErrFecha(false);
      scrollFieldIntoView(clienteFieldRef.current, {
        offsetTop: 100,
        thenFocus: () =>
          clienteInputRef.current?.focus({ preventScroll: true })
      });
      showToast("EL NOMBRE DEL CLIENTE ES OBLIGATORIO", "error");
      return;
    }
    if (!okFecha) {
      setErrFecha(true);
      setErrCliente(false);
      scrollFieldIntoView(fechaFieldRef.current, { offsetTop: 100 });
      showToast("LA FECHA DE ENTREGA ES OBLIGATORIA", "error");
      return;
    }
    if (!producto) {
      showToast("ELEGÍ UN PRODUCTO", "error");
      return;
    }
    if (!productoListoParaVender(producto)) {
      showToast("FALTAN PRECIO U HOJAS EN PRECIOS", "error");
      return;
    }

    setErrCliente(false);
    setErrFecha(false);
    setSaving(true);

    const copias = Math.max(1, cantidad);
    const precioLinea = Math.round(Number(producto.precio_venta) * copias);
    const item: PedidoItem = {
      nombre_archivo: producto.nombre,
      paginas: 0,
      copias,
      tipo_impresion: producto.nombre,
      anillado: null,
      precio_unitario: precioLinea,
      observaciones: "",
      producto_id: producto.id,
      precio_impresion_id: null,
      precio_anillado_id: null,
      solo_anillado: false,
      doble_faz: false
    };

    const cabeceraBase = {
      cliente: cliente.trim(),
      fecha_entrega: fechaEntrega,
      total: precioLinea,
      total_pedido: precioLinea,
      observaciones: "",
      vendedor_id: editandoPedidoId
        ? (pedidoEdit?.vendedor_id ?? user?.id ?? null)
        : (user?.id ?? null)
    };

    try {
      if (editandoPedidoId && pedidoEdit) {
        await actualizar(editandoPedidoId, cabeceraBase, [item]);
        showToast("PRESUPUESTO ACTUALIZADO");
      } else {
        const cabecera = {
          ...cabeceraBase,
          modalidad: "presupuesto",
          estado: "presupuesto",
          sena: 0,
          tipo_pago: null,
          stock_descontado: false,
          entregado: false,
          fecha_pago: null
        };
        const creados = (await crear(cabecera, [item])) as Pedido[] | undefined;
        const num = creados?.[0]?.numero_publico;
        showToast(
          num != null
            ? `PRESUPUESTO #${num} GUARDADO`
            : "PRESUPUESTO GUARDADO"
        );
      }
      navigate("/pedidos");
    } catch (e) {
      console.error(e);
      showToast("ERROR AL GUARDAR EL PRESUPUESTO", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <i className="fas fa-circle-notch fa-spin fa-2x text-blue-600" />
      </div>
    );
  }

  return (
    <section className="animate-fade-in max-w-xl mx-auto pb-28 space-y-5">
      <VolverButton onClick={() => navigate("/pedidos")} />
      <div>
        <h1 className="text-lg font-black uppercase tracking-tight text-slate-900">
          {editandoPedidoId ? "Editar producto cerrado" : "Producto cerrado"}
        </h1>
        <p className="text-[11px] font-semibold text-slate-500 mt-1">
          Presupuesto simple: cliente, producto y fecha de entrega.
        </p>
      </div>

      {productos.length === 0 && (
        <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-100 rounded-sm px-3 py-2.5">
          No hay productos cerrados. Ejecutá el script 61 en Supabase y
          configurá precio y hojas en Precios → Productos.
        </p>
      )}

      <div ref={clienteFieldRef} className="space-y-1 scroll-mt-28">
        <label
          htmlFor="producto-cliente-nombre"
          className="text-[10px] font-black text-slate-400 ml-2 uppercase"
        >
          Nombre del cliente{" "}
          <span className="text-red-500" aria-hidden>
            *
          </span>
        </label>
        <input
          ref={clienteInputRef}
          id="producto-cliente-nombre"
          type="text"
          name="cliente"
          required
          autoComplete="name"
          value={cliente}
          onChange={(e) => {
            setCliente(e.target.value);
            if (errCliente && e.target.value.trim()) setErrCliente(false);
          }}
          placeholder="¿A quién le pertenece este pedido?"
          aria-invalid={errCliente}
          className={`w-full p-3.5 lg:p-4 rounded-sm outline-none font-bold border-2 transition-all ${
            errCliente
              ? "bg-red-50 border-red-400 focus:ring-2 focus:ring-red-200 text-red-900 placeholder:text-red-300"
              : "bg-slate-50 border-slate-100 focus:ring-2 focus:ring-blue-100"
          }`}
        />
      </div>

      <ActionSheetTrigger
        label="Producto"
        displayValue={productoLabel}
        onClick={() => setSheetProducto(true)}
      />
      <ActionSheet
        open={sheetProducto}
        onClose={() => setSheetProducto(false)}
        title="Producto"
        options={productos.map((p) => ({ value: p.id, label: p.nombre }))}
        value={productoId}
        onChange={setProductoId}
      />

      {producto && !listo && (
        <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-100 rounded-sm px-3 py-2.5">
          Faltan precio u hojas en Precios. Configuralo en Precios → Productos
          antes de guardar.
        </p>
      )}

      <div>
        <span className="text-[10px] font-black text-slate-400 ml-2 uppercase block mb-1">
          Cantidad
        </span>
        <NumberStepper
          value={cantidad}
          onChange={setCantidad}
          min={1}
          max={999}
          clearOnFocusWhen={1}
        />
      </div>

      <div ref={fechaFieldRef} className="space-y-2 scroll-mt-28">
        <span className="text-[10px] font-black text-slate-400 ml-2 uppercase">
          Fecha de entrega{" "}
          <span className="text-red-500" aria-hidden>
            *
          </span>
        </span>
        <FechaEntregaSelector
          value={fechaEntrega}
          onChange={setFechaEntrega}
          error={errFecha}
          fechaInputRef={fechaInputRef}
          onClearError={() => setErrFecha(false)}
        />
      </div>

      <div className="bg-white border border-slate-100 rounded-sm p-4 flex items-center justify-between">
        <span className="text-[10px] font-black text-slate-400 uppercase">
          Total
        </span>
        <span className="text-xl font-black text-slate-900">
          {formatCurrency(total)}
        </span>
      </div>

      <button
        type="button"
        disabled={saving || productos.length === 0}
        onClick={() => void handleSave()}
        className="w-full min-h-12 py-3.5 rounded-sm bg-blue-600 text-white font-black uppercase tracking-wider text-sm shadow-lg shadow-blue-200 disabled:opacity-50"
      >
        {saving
          ? "Guardando…"
          : editandoPedidoId
            ? "Guardar cambios"
            : "Guardar presupuesto"}
      </button>
    </section>
  );
}
