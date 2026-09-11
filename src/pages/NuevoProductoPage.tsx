import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/AuthContext";
import { usePedidos } from "../hooks/usePedidos";
import { useCartStore } from "../store/useCartStore";
import { FechaEntregaSelector } from "../components/pedidos/FechaEntregaSelector";
import { NumberStepper } from "../components/ui/NumberStepper";
import { showToast } from "../components/ui/Toast";
import { formatCurrency } from "../utils/formatters";
import { scrollFieldIntoView } from "../utils/scrollField";
import { productosApi } from "../services/productosApi";
import type { EstadoPedido, Pedido, PedidoItem } from "../types/pedido";
import type { Producto } from "../types/producto";
import { productoListoParaVender } from "../types/producto";
import { ActionSheet, ActionSheetTrigger } from "../components/ui/ActionSheet";
import { VolverButton } from "../components/ui/VolverButton";
import { Cart } from "../components/cart/Cart";
import { cabeceraDesdeEstadoEdicion } from "../utils/pedidoCabeceraEdicion";
import { aplicarFormaPagoCabecera } from "../utils/pedidoFormaPago";
import { normalizarEstadoPedido } from "../utils/pedidoEstado";
import { descRecStateFromItem } from "../utils/pedidoItemForm";
import {
  camposDescRecItem,
  precioLineaProductoCerrado
} from "../utils/pedidoItemProducto";

type LocationState = { modo?: "nuevo" };

const ESTADO_EDICION_OPTS: { value: EstadoPedido; label: string }[] = [
  { value: "presupuesto", label: "Presupuesto" },
  { value: "pendiente", label: "Pendiente (en producción)" },
  { value: "listo", label: "Listo para retirar" },
  { value: "pagado", label: "Pagado (cobrado total)" },
  { value: "entregado", label: "Entregado" },
  { value: "cancelado", label: "Cancelado" }
];

export function NuevoProductoPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { crear, actualizar } = usePedidos();
  const cart = useCartStore();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [sheetProducto, setSheetProducto] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [showDescRec, setShowDescRec] = useState(false);
  const [descRecTipo, setDescRecTipo] = useState<"descuento" | "recargo">(
    "descuento"
  );
  const [descRecModo, setDescRecModo] = useState<"porcentaje" | "monto">(
    "porcentaje"
  );
  const [descRecValor, setDescRecValor] = useState("");
  const [errCliente, setErrCliente] = useState(false);
  const [errFecha, setErrFecha] = useState(false);
  const [openEstadoEdicion, setOpenEstadoEdicion] = useState(false);

  const clienteFieldRef = useRef<HTMLDivElement>(null);
  const clienteInputRef = useRef<HTMLInputElement>(null);
  const fechaFieldRef = useRef<HTMLDivElement>(null);
  const fechaInputRef = useRef<HTMLInputElement>(null);

  const resetLinea = () => {
    setCantidad(1);
    setShowDescRec(false);
    setDescRecTipo("descuento");
    setDescRecModo("porcentaje");
    setDescRecValor("");
    setEditingItemIndex(null);
  };

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

  useLayoutEffect(() => {
    const state = location.state as LocationState | null;
    if (state?.modo !== "nuevo") return;
    useCartStore.getState().reset();
    resetLinea();
    setErrCliente(false);
    setErrFecha(false);
    setOpenEstadoEdicion(false);
    navigate("/nuevo-producto", { replace: true, state: {} });
  }, [location.key, location.state, navigate]);

  useEffect(() => {
    if (productoId) return;
    if (productos.length === 1) setProductoId(productos[0].id);
  }, [productos, productoId]);

  const producto = productos.find((p) => p.id === productoId) ?? null;
  const listo = producto ? productoListoParaVender(producto) : false;
  const descRec = camposDescRecItem(
    showDescRec,
    descRecTipo,
    descRecModo,
    descRecValor
  );
  const previewLinea =
    listo && producto
      ? precioLineaProductoCerrado(
          Number(producto.precio_venta),
          cantidad,
          descRec
        )
      : 0;
  const productoLabel = producto?.nombre ?? "Elegir producto…";

  const handleAgregar = () => {
    const okCliente = Boolean(cart.clienteNombre?.trim());
    const okFecha = Boolean(cart.fechaEntrega?.trim());
    if (!okCliente) {
      setErrCliente(true);
      setErrFecha(false);
      scrollFieldIntoView(clienteFieldRef.current, {
        offsetTop: 100,
        thenFocus: () =>
          clienteInputRef.current?.focus({ preventScroll: true })
      });
      showToast("COMPLETÁ EL NOMBRE DEL CLIENTE ANTES DE AGREGAR", "error");
      return;
    }
    if (!okFecha) {
      setErrFecha(true);
      setErrCliente(false);
      scrollFieldIntoView(fechaFieldRef.current, { offsetTop: 100 });
      showToast("INDICÁ LA FECHA DE ENTREGA ANTES DE AGREGAR", "error");
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

    const copias = Math.max(1, cantidad);
    const precioLinea = precioLineaProductoCerrado(
      Number(producto.precio_venta),
      copias,
      descRec
    );
    if (precioLinea <= 0) {
      showToast("EL PRECIO DE LA LÍNEA QUEDÓ EN CERO", "error");
      return;
    }

    const prev =
      editingItemIndex !== null ? cart.items[editingItemIndex] : undefined;
    const item: PedidoItem = {
      ...(prev?.id ? { id: prev.id, pedido_id: prev.pedido_id } : {}),
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
      doble_faz: false,
      ...descRec
    };
    if (editingItemIndex !== null) {
      cart.replaceItemAt(editingItemIndex, item);
    } else {
      cart.addItem(item);
    }
    setErrCliente(false);
    setErrFecha(false);
    resetLinea();
  };

  const startEditItem = (index: number) => {
    const it = cart.items[index];
    if (!it) return;
    setEditingItemIndex(index);
    setProductoId(it.producto_id ?? "");
    setCantidad(Math.max(1, it.copias ?? 1));
    const dr = descRecStateFromItem(it);
    setShowDescRec(dr.showDescRec);
    setDescRecTipo(dr.descRecTipo);
    setDescRecModo(dr.descRecModo);
    setDescRecValor(dr.descRecValor);
  };

  const handleRemoveItem = (index: number) => {
    if (editingItemIndex === index) {
      resetLinea();
    } else if (editingItemIndex !== null && index < editingItemIndex) {
      setEditingItemIndex(editingItemIndex - 1);
    }
    cart.removeItem(index);
  };

  const handleFinalize = async () => {
    if (cart.items.length === 0) return;
    const okCliente = Boolean(cart.clienteNombre?.trim());
    const okFecha = Boolean(cart.fechaEntrega?.trim());
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

    setErrCliente(false);
    setErrFecha(false);
    setSaving(true);

    const total = cart.getTotal();
    const sena = cart.getSena();
    const estadoObjetivo =
      cart.estadoEdicion ??
      (cart.pedidoEditSnapshot
        ? (normalizarEstadoPedido(
            cart.pedidoEditSnapshot.estado
          ) as EstadoPedido)
        : null);
    const esPresupuesto =
      cart.editandoPedidoId && estadoObjetivo
        ? estadoObjetivo === "presupuesto"
        : sena === 0;

    let descuento_global_porcentaje = null;
    let descuento_global_monto = null;
    let recargo_global_porcentaje = null;
    let recargo_global_monto = null;
    if (cart.descRecGlobalValor) {
      const val = Number(cart.descRecGlobalValor);
      if (cart.descRecGlobalTipo === "descuento") {
        if (cart.descRecGlobalModo === "porcentaje")
          descuento_global_porcentaje = val;
        else descuento_global_monto = val;
      } else if (cart.descRecGlobalModo === "porcentaje") {
        recargo_global_porcentaje = val;
      } else {
        recargo_global_monto = val;
      }
    }

    const cabeceraBase = {
      cliente: cart.clienteNombre || "General",
      fecha_entrega: cart.fechaEntrega || null,
      total,
      total_pedido: total,
      observaciones: cart.observaciones.trim(),
      vendedor_id: cart.editandoPedidoId
        ? cart.vendedorId
        : (user?.id ?? null),
      descuento_global_porcentaje,
      descuento_global_monto,
      recargo_global_porcentaje,
      recargo_global_monto
    };

    const cabeceraPresupuesto = {
      ...cabeceraBase,
      modalidad: "presupuesto",
      estado: "presupuesto",
      sena: 0,
      tipo_pago: null,
      stock_descontado: false,
      entregado: false,
      fecha_pago: null
    };
    const cabeceraPedido = {
      ...cabeceraBase,
      modalidad: "pedido",
      estado: "pendiente",
      sena,
      tipo_pago: cart.tipoPago,
      stock_descontado: false,
      entregado: false,
      fecha_pago: null
    };

    let cabecera: Record<string, unknown>;
    if (cart.editandoPedidoId && cart.pedidoEditSnapshot && estadoObjetivo) {
      cabecera = cabeceraDesdeEstadoEdicion(estadoObjetivo, cabeceraBase, {
        senaFromCart: sena,
        tipoPago: cart.tipoPago,
        totalPedido: total,
        snap: cart.pedidoEditSnapshot
      });
    } else {
      cabecera = esPresupuesto ? cabeceraPresupuesto : cabeceraPedido;
    }
    cabecera = aplicarFormaPagoCabecera(cabecera, cart, sena);

    try {
      if (cart.editandoPedidoId) {
        await actualizar(cart.editandoPedidoId, cabecera, cart.items);
        showToast(
          String(cabecera.estado) === "presupuesto"
            ? "PRESUPUESTO ACTUALIZADO"
            : "PEDIDO ACTUALIZADO"
        );
      } else {
        const creados = (await crear(cabecera, cart.items)) as
          | Pedido[]
          | undefined;
        const num = creados?.[0]?.numero_publico;
        if (esPresupuesto) {
          showToast(
            num != null
              ? `PRESUPUESTO #${num} GUARDADO`
              : "PRESUPUESTO GUARDADO"
          );
        } else {
          showToast(
            num != null ? `PEDIDO #${num} GUARDADO` : "PEDIDO GUARDADO CON ÉXITO"
          );
        }
      }
      cart.reset();
      navigate("/pedidos");
    } catch (e) {
      console.error(e);
      showToast("ERROR AL GUARDAR EL PRESUPUESTO", "error");
    } finally {
      setSaving(false);
    }
  };

  const volverSinGuardar = () => {
    cart.reset();
    navigate("/pedidos");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <i className="fas fa-circle-notch fa-spin fa-2x text-blue-600" />
      </div>
    );
  }

  return (
    <section className="animate-fade-in space-y-4 lg:space-y-0 pb-28">
      <VolverButton onClick={volverSinGuardar} />

      {cart.editandoPedidoId && (
        <div className="space-y-3 mb-4">
          <div className="rounded-sm border-2 border-amber-400 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-950 shadow-sm leading-snug">
            <i className="fas fa-pen-to-square mr-2 opacity-70" aria-hidden />
            Editando un pedido guardado: podés cambiar el{" "}
            <strong>estado</strong>, la <strong>seña</strong> y agregar o quitar
            productos.
          </div>
          <div className="bg-white p-4 rounded-sm border-2 border-slate-200 shadow-sm">
            <ActionSheetTrigger
              label="Estado al guardar"
              displayValue={
                ESTADO_EDICION_OPTS.find((o) => o.value === cart.estadoEdicion)
                  ?.label ?? "—"
              }
              onClick={() => setOpenEstadoEdicion(true)}
            />
          </div>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-2 lg:gap-8 space-y-4 lg:space-y-0">
        <div className="bg-white p-4 lg:p-6 rounded-sm shadow-xl border border-slate-100 space-y-4">
          <h1 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] italic leading-none">
            {editingItemIndex !== null
              ? "Editar producto"
              : "Agregar producto"}
          </h1>

          {productos.length === 0 && (
            <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-100 rounded-sm px-3 py-2.5">
              No hay productos cerrados. Configuralos en Precios → Productos.
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
              value={cart.clienteNombre}
              onChange={(e) => {
                cart.setClienteNombre(e.target.value);
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

          <div ref={fechaFieldRef} className="space-y-2 scroll-mt-28">
            <span className="text-[10px] font-black text-slate-400 ml-2 uppercase">
              Fecha de entrega{" "}
              <span className="text-red-500" aria-hidden>
                *
              </span>
            </span>
            <FechaEntregaSelector
              variante="producto"
              value={cart.fechaEntrega}
              onChange={(f) => {
                cart.setFechaEntrega(f);
                setErrFecha(false);
              }}
              error={errFecha}
              fechaInputRef={fechaInputRef}
              onClearError={() => setErrFecha(false)}
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
              Faltan precio u hojas en Precios.
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

          <div>
            {!showDescRec ? (
              <button
                type="button"
                className="w-full bg-blue-50 text-blue-600 py-2 rounded-sm font-black uppercase text-xs tracking-widest shadow-sm border border-blue-100 hover:bg-blue-100"
                onClick={() => setShowDescRec(true)}
              >
                <i className="fas fa-percent mr-2" />
                Descuento o recargo en esta línea
              </button>
            ) : (
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex items-center">
                  <button
                    type="button"
                    className={`px-3 py-1 rounded-l-sm font-bold text-xs border ${
                      descRecTipo === "descuento"
                        ? "bg-green-100 text-green-700 border-green-300"
                        : "bg-slate-50 text-slate-400 border-slate-200"
                    }`}
                    onClick={() => setDescRecTipo("descuento")}
                  >
                    Descuento
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 rounded-r-sm font-bold text-xs border ${
                      descRecTipo === "recargo"
                        ? "bg-red-100 text-red-700 border-red-300"
                        : "bg-slate-50 text-slate-400 border-slate-200"
                    }`}
                    onClick={() => setDescRecTipo("recargo")}
                  >
                    Recargo
                  </button>
                </div>
                <div className="flex items-center">
                  <button
                    type="button"
                    className={`px-3 py-1 rounded-l-sm font-bold text-xs border ${
                      descRecModo === "porcentaje"
                        ? "bg-blue-100 text-blue-700 border-blue-300"
                        : "bg-slate-50 text-slate-400 border-slate-200"
                    }`}
                    onClick={() => setDescRecModo("porcentaje")}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 rounded-r-sm font-bold text-xs border ${
                      descRecModo === "monto"
                        ? "bg-blue-100 text-blue-700 border-blue-300"
                        : "bg-slate-50 text-slate-400 border-slate-200"
                    }`}
                    onClick={() => setDescRecModo("monto")}
                  >
                    $ fijo
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  value={descRecValor}
                  onChange={(e) => setDescRecValor(e.target.value)}
                  placeholder={descRecModo === "porcentaje" ? "%" : "$"}
                  className="w-24 p-2 rounded-sm border border-slate-200 text-center font-black text-blue-700 bg-slate-50"
                />
                <button
                  type="button"
                  className="text-xs text-slate-400 hover:text-red-500"
                  onClick={() => {
                    setShowDescRec(false);
                    setDescRecValor("");
                  }}
                >
                  <i className="fas fa-times-circle" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-sm px-3 py-2.5">
            <span className="text-[10px] font-black text-slate-400 uppercase">
              Esta línea
            </span>
            <span className="text-base font-black text-slate-900">
              {formatCurrency(previewLinea)}
            </span>
          </div>

          <button
            type="button"
            disabled={productos.length === 0}
            onClick={handleAgregar}
            className="w-full bg-slate-900 text-white py-4 rounded-sm font-black uppercase text-xs tracking-[0.2em] shadow-xl active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <i
              className={
                editingItemIndex !== null ? "fas fa-save" : "fas fa-cart-plus"
              }
            />
            {editingItemIndex !== null
              ? "Guardar cambios de la línea"
              : "Añadir al pedido"}
          </button>
          {editingItemIndex !== null && (
            <button
              type="button"
              onClick={resetLinea}
              className="w-full text-slate-500 py-2 text-xs font-bold uppercase tracking-wider"
            >
              Cancelar edición
            </button>
          )}
        </div>

        <Cart
          onFinalize={() => void handleFinalize()}
          saving={saving}
          editingItemIndex={editingItemIndex}
          onEditItem={startEditItem}
          onRemoveItem={handleRemoveItem}
          emptyMessage="Aún no hay productos sumados"
        />
      </div>

      <ActionSheet
        open={openEstadoEdicion}
        onClose={() => setOpenEstadoEdicion(false)}
        title="Estado del pedido"
        options={ESTADO_EDICION_OPTS}
        value={cart.estadoEdicion ?? "pendiente"}
        onChange={(v) => {
          cart.setEstadoEdicion(v as EstadoPedido);
          setOpenEstadoEdicion(false);
        }}
      />
    </section>
  );
}
