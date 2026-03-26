import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/AuthContext";
import { useCartStore } from "../store/useCartStore";
import { usePedidos } from "../hooks/usePedidos";
import { usePrecios } from "../hooks/usePrecios";
import { useDatosCosto } from "../hooks/useDatosCosto";
import { costEngine, type CostoItemParams } from "../services/costEngine";
import { Cart } from "../components/cart/Cart";
import { FechaEntregaSelector } from "../components/pedidos/FechaEntregaSelector";
import { showToast } from "../components/ui/Toast";
import { NumberStepper } from "../components/ui/NumberStepper";
import { formatCurrency } from "../utils/formatters";
import type { EstadoPedido, Pedido, PedidoItem } from "../types/pedido";
import { cabeceraDesdeEstadoEdicion } from "../utils/pedidoCabeceraEdicion";
import { aplicarFormaPagoCabecera } from "../utils/pedidoFormaPago";
import { ActionSheet, ActionSheetTrigger } from "../components/ui/ActionSheet";
import {
  labelAnillado,
  labelSlugLineaImpresion,
  perfilTintaEfectivo,
  precioAnilladoParaEspiralInsumo,
  precioImpresionActivoParaTipo
} from "../types/precio";
import {
  comisionPctEfectivo,
  fetchProfileById
} from "../services/profilesApi";
import type { ProfileRow } from "../types/profile";
import { scrollFieldIntoView } from "../utils/scrollField";
import { normalizarEstadoPedido } from "../utils/pedidoEstado";
import {
  descRecStateFromItem,
  parseTipoImpresionFromItem
} from "../utils/pedidoItemForm";

const ESTADO_EDICION_OPTS: { value: EstadoPedido; label: string }[] = [
  { value: "presupuesto", label: "Presupuesto" },
  { value: "pendiente", label: "Pendiente (en producción)" },
  { value: "listo", label: "Listo para retirar" },
  { value: "pagado", label: "Pagado (cobrado total)" },
  { value: "entregado", label: "Entregado" },
  { value: "cancelado", label: "Cancelado" }
];

type NuevoPedidoLocationState = { modo?: "nuevo" };

export function NuevoPedidoPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { crear, actualizar } = usePedidos();
  const {
    preciosImpresion,
    preciosAnillado,
    loading: preciosLoading
  } = usePrecios();
  const { insumos, loading: costosLoading } = useDatosCosto();
  const cart = useCartStore();
  const [saving, setSaving] = useState(false);
  const [errCliente, setErrCliente] = useState(false);
  const [errFecha, setErrFecha] = useState(false);
  const [errPaginas, setErrPaginas] = useState(false);
  const clienteFieldRef = useRef<HTMLDivElement>(null);
  const clienteInputRef = useRef<HTMLInputElement>(null);
  const fechaFieldRef = useRef<HTMLDivElement>(null);
  const fechaInputRef = useRef<HTMLInputElement>(null);
  const paginasFieldRef = useRef<HTMLDivElement>(null);
  const paginasInputRef = useRef<HTMLInputElement>(null);

  // Form state for current item being configured
  const [paginas, setPaginas] = useState(0);
  const [copias, setCopias] = useState(1);
  const [tipo, setTipo] = useState<string>("bn");
  const [dobleFaz, setDobleFaz] = useState(false);
  /** Incluye espiral; elegís el insumo (medida + rango) y el precio sigue la tarifa. */
  const [conAnillado, setConAnillado] = useState(false);
  /** Cliente trae copias ya impresas: solo se cobra anillado (sin tarifa de impresión). */
  const [soloAnillado, setSoloAnillado] = useState(false);
  const [espiralInsumoId, setEspiralInsumoId] = useState<string | null>(null);
  const [itemNotas, setItemNotas] = useState("");
  const [perfilComision, setPerfilComision] = useState<ProfileRow | null>(
    null
  );
  const [openEstadoEdicion, setOpenEstadoEdicion] = useState(false);
  /** Índice del ítem cuyo formulario se está editando (reemplazo al guardar línea). */
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

  // Descuento/recargo UI state
  const [showDescRec, setShowDescRec] = useState(false);
  const [descRecTipo, setDescRecTipo] = useState<"descuento" | "recargo">(
    "descuento"
  );
  const [descRecModo, setDescRecModo] = useState<"porcentaje" | "monto">(
    "porcentaje"
  );
  const [descRecValor, setDescRecValor] = useState("");

  const espirales = useMemo(
    () =>
      [...insumos.filter((i) => i.categoria === "espiral" && i.activo)].sort(
        (a, b) =>
          (a.medida_mm ?? 0) - (b.medida_mm ?? 0) ||
          (a.nombre ?? "").localeCompare(b.nombre ?? "", "es")
      ),
    [insumos]
  );

  const espiralSel = useMemo(
    () => espirales.find((e) => e.id === espiralInsumoId) ?? null,
    [espirales, espiralInsumoId]
  );

  const tarifaAnillado = useMemo(() => {
    if (!conAnillado || paginas < 1) return null;
    return precioAnilladoParaEspiralInsumo(
      preciosAnillado,
      paginas,
      espiralSel
        ? {
            medida_mm: espiralSel.medida_mm,
            rango_anillado: espiralSel.rango_anillado ?? null
          }
        : null
    );
  }, [conAnillado, paginas, preciosAnillado, espiralSel]);

  useEffect(() => {
    if (!conAnillado || espirales.length === 0) return;
    if (
      espiralInsumoId != null &&
      espirales.some((e) => e.id === espiralInsumoId)
    )
      return;
    setEspiralInsumoId(espirales[0].id);
  }, [conAnillado, espirales, espiralInsumoId]);

  /** Líneas con al menos una tarifa activa (slug + etiqueta para el cotizador). */
  const lineasImpresionOpciones = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of preciosImpresion) {
      if (p.activo === false) continue;
      const slug = p.tipo;
      if (!m.has(slug)) {
        m.set(
          slug,
          (p.nombre ?? "").trim() || labelSlugLineaImpresion(slug)
        );
      }
    }
    return [...m.entries()]
      .map(([slug, label]) => ({ slug, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [preciosImpresion]);

  useEffect(() => {
    if (preciosLoading) return;
    const slugs = new Set(lineasImpresionOpciones.map((o) => o.slug));
    if (slugs.size === 0) return;
    if (slugs.has(tipo)) return;
    setTipo(lineasImpresionOpciones[0]?.slug ?? "bn");
  }, [preciosLoading, lineasImpresionOpciones, tipo]);

  const lineParams = useMemo((): CostoItemParams | null => {
    if (preciosLoading || costosLoading) return null;
    const anilladoSel = tarifaAnillado;
    const anillado_mm =
      anilladoSel?.medida_mm ?? espiralSel?.medida_mm ?? null;
    const tarifaImp = soloAnillado
      ? null
      : precioImpresionActivoParaTipo(
          preciosImpresion,
          tipo,
          soloAnillado ? false : dobleFaz
        );
    const params: CostoItemParams = {
      paginas,
      copias,
      tipo,
      perfil_tinta: perfilTintaEfectivo(tarifaImp),
      doble_faz: soloAnillado ? false : dobleFaz,
      anillado_mm,
      precio_anillado_id: anilladoSel?.id ?? null,
      solo_anillado: soloAnillado
    };
    if (showDescRec && descRecValor) {
      const val = Number(descRecValor);
      if (Number.isFinite(val)) {
        if (descRecTipo === "descuento") {
          if (descRecModo === "porcentaje")
            params.descuento_porcentaje = val;
          else params.descuento_monto = val;
        } else {
          if (descRecModo === "porcentaje")
            params.recargo_porcentaje = val;
          else params.recargo_monto = val;
        }
      }
    }
    return params;
  }, [
    preciosLoading,
    costosLoading,
    tarifaAnillado,
    espiralSel,
    preciosImpresion,
    paginas,
    copias,
    tipo,
    dobleFaz,
    showDescRec,
    descRecValor,
    descRecTipo,
    descRecModo,
    soloAnillado
  ]);

  /** Perfil del usuario logueado (nuevo pedido) o del vendedor del pedido (edición). */
  useEffect(() => {
    const id = cart.editandoPedidoId
      ? cart.vendedorId
      : user?.id ?? null;
    if (!id) {
      setPerfilComision(null);
      return;
    }
    let cancelled = false;
    fetchProfileById(id)
      .then((p) => {
        if (!cancelled) setPerfilComision(p);
      })
      .catch(() => {
        if (!cancelled) setPerfilComision(null);
      });
    return () => {
      cancelled = true;
    };
  }, [cart.editandoPedidoId, cart.vendedorId, user?.id]);

  /** Alinea tipo de pago al estado elegido en modo edición (seña / cobro total). */
  useEffect(() => {
    if (!cart.editandoPedidoId || !cart.estadoEdicion) return;
    const setTipo = useCartStore.getState().setTipoPago;
    if (cart.estadoEdicion === "presupuesto") setTipo("sin_pago");
    else if (
      cart.estadoEdicion === "pagado" ||
      cart.estadoEdicion === "entregado"
    )
      setTipo("pago_total");
  }, [cart.editandoPedidoId, cart.estadoEdicion]);

  const comisionEstimada = useMemo(() => {
    const total = cart.getTotal();
    const pct = comisionPctEfectivo(perfilComision);
    const tieneVendedorContexto = cart.editandoPedidoId
      ? Boolean(cart.vendedorId)
      : Boolean(user?.id);
    if (!tieneVendedorContexto || total <= 0) return 0;
    return Math.round(total * (pct / 100) * 100) / 100;
  }, [
    cart.items,
    cart.descRecGlobalValor,
    cart.descRecGlobalTipo,
    cart.descRecGlobalModo,
    cart.editandoPedidoId,
    cart.vendedorId,
    user?.id,
    perfilComision
  ]);

  const resetFormItemFieldsOnly = () => {
    setPaginas(0);
    setCopias(1);
    const first =
      preciosImpresion.find((p) => p.activo !== false)?.tipo ?? "bn";
    setTipo(first);
    setDobleFaz(false);
    setConAnillado(false);
    setSoloAnillado(false);
    setEspiralInsumoId(null);
    setItemNotas("");
    setShowDescRec(false);
    setDescRecTipo("descuento");
    setDescRecModo("porcentaje");
    setDescRecValor("");
  };

  const resetFormItem = () => {
    resetFormItemFieldsOnly();
    setEditingItemIndex(null);
  };

  /**
   * Entrada explícita a “nuevo pedido” (barra inferior / menú) debe vaciar el carrito
   * persistido y el formulario; si no, tras editar un pedido se seguía viendo esa edición.
   */
  useLayoutEffect(() => {
    const state = location.state as NuevoPedidoLocationState | null;
    if (state?.modo !== "nuevo") return;
    useCartStore.getState().reset();
    resetFormItemFieldsOnly();
    setEditingItemIndex(null);
    setErrCliente(false);
    setErrFecha(false);
    setErrPaginas(false);
    setOpenEstadoEdicion(false);
    navigate("/nuevo-pedido", { replace: true, state: {} });
  }, [location.key, location.state, navigate]);

  const startEditItem = (index: number) => {
    const it = cart.items[index];
    if (!it) return;
    setEditingItemIndex(index);
    setPaginas(it.paginas);
    setCopias(it.copias ?? 1);
    const { tipo: t, dobleFaz: df } = parseTipoImpresionFromItem(
      it,
      preciosImpresion
    );
    setTipo(t);
    setDobleFaz(df);
    if (it.solo_anillado) {
      setSoloAnillado(true);
      setConAnillado(true);
    } else {
      setSoloAnillado(false);
      setConAnillado(Boolean(it.anillado));
    }
    const needsSpiral = Boolean(it.solo_anillado || it.anillado);
    if (needsSpiral) {
      const mm = it.anillado_medida_mm;
      const eid =
        mm != null
          ? espirales.find((e) => e.medida_mm === mm)?.id ?? null
          : null;
      setEspiralInsumoId(eid ?? espirales[0]?.id ?? null);
    } else {
      setEspiralInsumoId(null);
    }
    const dr = descRecStateFromItem(it);
    setShowDescRec(dr.showDescRec);
    setDescRecTipo(dr.descRecTipo);
    setDescRecModo(dr.descRecModo);
    setDescRecValor(dr.descRecValor);
    setItemNotas(it.observaciones || "");
    setErrPaginas(false);
    scrollFieldIntoView(paginasFieldRef.current, {
      offsetTop: 100,
      thenFocus: () => paginasInputRef.current?.focus({ preventScroll: true })
    });
  };

  const handleRemoveItem = (index: number) => {
    if (editingItemIndex === index) {
      resetFormItemFieldsOnly();
      setEditingItemIndex(null);
    } else if (editingItemIndex !== null && index < editingItemIndex) {
      setEditingItemIndex(editingItemIndex - 1);
    }
    cart.removeItem(index);
  };

  const handleAgregarItem = () => {
    if (preciosLoading || !lineParams) return;

    const okClienteCabecera = Boolean(cart.clienteNombre?.trim());
    const okFechaCabecera = Boolean(cart.fechaEntrega?.trim());

    if (!okClienteCabecera) {
      setErrCliente(true);
      setErrFecha(false);
      setErrPaginas(false);
      scrollFieldIntoView(clienteFieldRef.current, {
        offsetTop: 100,
        thenFocus: () =>
          clienteInputRef.current?.focus({ preventScroll: true })
      });
      showToast("COMPLETÁ EL NOMBRE DEL CLIENTE ANTES DE AGREGAR ARCHIVOS", "error");
      return;
    }

    if (paginas < 1) {
      setErrPaginas(true);
      setErrCliente(false);
      setErrFecha(false);
      scrollFieldIntoView(paginasFieldRef.current, {
        offsetTop: 100,
        thenFocus: () => paginasInputRef.current?.focus({ preventScroll: true })
      });
      showToast("INDICÁ LA CANTIDAD DE PÁGINAS DEL PDF", "error");
      return;
    }
    const anilladoSel = tarifaAnillado;
    const requiereTarifaAnillado = conAnillado || soloAnillado;
    if (requiereTarifaAnillado && !anilladoSel) {
      setErrPaginas(true);
      setErrCliente(false);
      setErrFecha(false);
      scrollFieldIntoView(paginasFieldRef.current, {
        offsetTop: 100,
        thenFocus: () => paginasInputRef.current?.focus({ preventScroll: true })
      });
      showToast(
        "NO HAY PRECIO DE ESPIRAL CONFIGURADO PARA ESA CANTIDAD DE HOJAS",
        "error"
      );
      return;
    }

    if (!okFechaCabecera) {
      setErrFecha(true);
      setErrCliente(false);
      setErrPaginas(false);
      scrollFieldIntoView(fechaFieldRef.current, { offsetTop: 100 });
      showToast("INDICÁ LA FECHA DE ENTREGA ANTES DE AGREGAR ARCHIVOS", "error");
      return;
    }
    const precioImp = soloAnillado
      ? null
      : precioImpresionActivoParaTipo(preciosImpresion, tipo, dobleFaz);
    if (!soloAnillado && !precioImp) {
      showToast(
        "NO HAY TARIFA ACTIVA PARA ESA LÍNEA DE PRODUCTO Y CARA (REVISÁ PRECIOS)",
        "error"
      );
      return;
    }
    const venta = costEngine.calcularPrecioVenta(
      lineParams,
      preciosImpresion,
      preciosAnillado
    );
    if (venta.total <= 0) return;
    const prevLine =
      editingItemIndex !== null ? cart.items[editingItemIndex] : undefined;
    const item: PedidoItem = {
      ...(prevLine?.id
        ? { id: prevLine.id, pedido_id: prevLine.pedido_id }
        : {}),
      nombre_archivo:
        editingItemIndex !== null && prevLine
          ? prevLine.nombre_archivo?.trim() ||
            `Archivo ${editingItemIndex + 1}`
          : `Archivo ${cart.items.length + 1}`,
      paginas: lineParams.paginas,
      copias: lineParams.copias,
      tipo_impresion: soloAnillado
        ? "Solo anillado (copias del cliente)"
        : (() => {
            const label =
              (precioImp?.nombre ?? "").trim() ||
              labelSlugLineaImpresion(tipo);
            return `${label} ${dobleFaz ? "DF" : "SF"}`;
          })(),
      anillado: anilladoSel
        ? labelAnillado(
            anilladoSel.medida_mm,
            anilladoSel.paginas_max,
            anilladoSel.nombre_categoria
          )
        : null,
      precio_unitario: venta.total,
      solo_anillado: soloAnillado,
      precio_impresion_id: precioImp?.id ?? null,
      precio_anillado_id: anilladoSel?.id ?? null,
      anillado_medida_mm:
        espiralSel?.medida_mm ?? anilladoSel?.medida_mm ?? null,
      doble_faz: soloAnillado ? false : dobleFaz,
      impreso: prevLine?.impreso ?? false,
      observaciones: itemNotas.trim(),
      _anillado_costo: anilladoSel ? anilladoSel.precio_venta : 0,
      // Guardar descuento/recargo en el ítem
      ...(showDescRec && descRecValor
        ? descRecTipo === "descuento"
          ? descRecModo === "porcentaje"
            ? { descuento_porcentaje: Number(descRecValor) }
            : { descuento_monto: Number(descRecValor) }
          : descRecModo === "porcentaje"
            ? { recargo_porcentaje: Number(descRecValor) }
            : { recargo_monto: Number(descRecValor) }
        : {})
    };
    if (editingItemIndex !== null) {
      cart.replaceItemAt(editingItemIndex, item);
    } else {
      cart.addItem(item);
    }
    setErrPaginas(false);
    resetFormItem();
  };

  const handleFinalize = async () => {
    if (cart.items.length === 0) return;

    const okCliente = Boolean(cart.clienteNombre?.trim());
    const okFecha = Boolean(cart.fechaEntrega?.trim());

    if (!okCliente) {
      setErrCliente(true);
      setErrFecha(false);
      setErrPaginas(false);
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
      setErrPaginas(false);
      scrollFieldIntoView(fechaFieldRef.current, { offsetTop: 100 });
      showToast("LA FECHA DE ENTREGA ES OBLIGATORIA", "error");
      return;
    }

    setErrCliente(false);
    setErrFecha(false);
    setErrPaginas(false);
    setSaving(true);

    const total = cart.getTotal();
    const sena = cart.getSena();
    const estadoObjetivo =
      cart.estadoEdicion ??
      (cart.pedidoEditSnapshot
        ? (normalizarEstadoPedido(cart.pedidoEditSnapshot.estado) as EstadoPedido)
        : null);
    /** Nuevo pedido: sin seña → presupuesto. Edición: selector de estado (o snapshot). */
    const esPresupuesto =
      cart.editandoPedidoId && estadoObjetivo
        ? estadoObjetivo === "presupuesto"
        : sena === 0;

    // Descuento/recargo global
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
      } else {
        if (cart.descRecGlobalModo === "porcentaje")
          recargo_global_porcentaje = val;
        else recargo_global_monto = val;
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
        : user?.id ?? null,
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

    // Asegurar que los ítems tengan los campos correctos (ya se guardan al agregar)
    const items = cart.items;

    try {
      if (cart.editandoPedidoId) {
        await actualizar(cart.editandoPedidoId, cabecera, items);
        const guardadoComoPresupuesto = String(cabecera.estado) === "presupuesto";
        showToast(
          guardadoComoPresupuesto
            ? "PRESUPUESTO ACTUALIZADO"
            : "PEDIDO ACTUALIZADO"
        );
      } else {
        const creados = (await crear(cabecera, items)) as Pedido[] | undefined;
        const num = creados?.[0]?.numero_publico;
        if (esPresupuesto) {
          showToast(
            num != null
              ? `PRESUPUESTO #${num} GUARDADO`
              : "PRESUPUESTO GUARDADO"
          );
        } else {
          showToast(
            num != null
              ? `PEDIDO #${num} GUARDADO`
              : "PEDIDO GUARDADO CON ÉXITO"
          );
        }
      }
      cart.reset();
      navigate("/");
    } catch (e) {
      showToast("ERROR AL PROCESAR EL PEDIDO", "error");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const finalizeRef = useRef(handleFinalize);
  finalizeRef.current = handleFinalize;

  /** Desktop: Ctrl+Shift+Enter / Cmd+Shift+Enter = finalizar pedido */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.key !== "Enter") return;
      if (useCartStore.getState().items.length === 0) return;
      e.preventDefault();
      void finalizeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);


  return (
    <section className="animate-slide-in-bottom space-y-4 lg:space-y-0">
      {cart.editandoPedidoId && (
        <div className="space-y-3">
          <div className="rounded-sm border-2 border-amber-400 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-950 shadow-sm leading-snug">
            <i className="fas fa-pen-to-square mr-2 opacity-70" aria-hidden />
            Editando un pedido guardado: podés cambiar el{" "}
            <strong>estado</strong> (incl. descancelar), la <strong>seña</strong> en
            el resumen y los <strong>ítems</strong> (agregar o quitar líneas).
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
            <p className="text-[10px] text-slate-500 font-bold mt-2 px-1 leading-relaxed">
              Ej.: de cancelado → pendiente; de listo → pagado; ajustá seña con “50%”,
              “Libre” o “Total” a la derecha.
            </p>
          </div>
        </div>
      )}
      <div className="lg:grid lg:grid-cols-2 lg:gap-8 space-y-4 lg:space-y-0">
        {/* Item form */}
        <div className="bg-white p-4 lg:p-6 rounded-sm shadow-xl border border-slate-100">
          <h2 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] mb-5 italic leading-none">
            Configurar Archivo
          </h2>
          <div className="space-y-4 lg:space-y-5">
            {/* Cliente */}
            <div
              ref={clienteFieldRef}
              className="space-y-1 scroll-mt-28"
            >
              <label
                htmlFor="pedido-cliente-nombre"
                className="text-[10px] font-black text-slate-400 ml-2 uppercase"
              >
                Nombre del cliente{" "}
                <span className="text-red-500" aria-hidden>
                  *
                </span>
              </label>
              <input
                ref={clienteInputRef}
                id="pedido-cliente-nombre"
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
                aria-describedby={errCliente ? "err-cliente" : undefined}
                className={`w-full p-3.5 lg:p-4 rounded-sm outline-none font-bold border-2 transition-all ${
                  errCliente
                    ? "bg-red-50 border-red-400 focus:ring-2 focus:ring-red-200 text-red-900 placeholder:text-red-300"
                    : "bg-slate-50 border-slate-100 focus:ring-2 focus:ring-blue-100"
                }`}
              />
              {errCliente && (
                <p
                  id="err-cliente"
                  role="alert"
                  className="text-[10px] text-red-600 font-bold ml-2"
                >
                  Este campo es obligatorio
                </p>
              )}
            </div>

            {cart.items.length > 0 &&
              (cart.editandoPedidoId ? cart.vendedorId : user?.id) && (
                <p className="text-[10px] text-violet-700 font-bold ml-2">
                  {comisionEstimada > 0 ? (
                    <>
                      Comisión estimada (solo vendedores externos):{" "}
                      {formatCurrency(comisionEstimada)}
                    </>
                  ) : (
                    <>Sin comisión (admin u operador interno)</>
                  )}
                </p>
              )}

            {/* Pages + Copies + Ink type */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-5">
              <div
                ref={paginasFieldRef}
                className="space-y-1 scroll-mt-28 min-w-0"
              >
                <label
                  htmlFor="pedido-paginas"
                  className="text-[10px] font-black text-slate-400 ml-2 uppercase block"
                >
                  {soloAnillado ? "Páginas a anillar" : "Páginas del PDF"}{" "}
                  <span className="text-red-500" aria-hidden>
                    *
                  </span>
                </label>
                <NumberStepper
                  id="pedido-paginas"
                  inputRef={paginasInputRef}
                  value={paginas}
                  onChange={(n) => {
                    setPaginas(n);
                    if (!errPaginas) return;
                    if (n < 1) return;
                    const spiralOk =
                      !conAnillado ||
                      precioAnilladoParaEspiralInsumo(
                        preciosAnillado,
                        n,
                        espiralSel
                          ? {
                              medida_mm: espiralSel.medida_mm,
                              rango_anillado: espiralSel.rango_anillado ?? null
                            }
                          : null
                      ) != null;
                    if (spiralOk) setErrPaginas(false);
                  }}
                  min={0}
                  max={5000}
                  disabled={false}
                  clearOnFocusWhen={0}
                  error={errPaginas}
                  aria-invalid={errPaginas}
                  aria-describedby={errPaginas ? "err-paginas" : undefined}
                />
                {errPaginas && (
                  <p
                    id="err-paginas"
                    role="alert"
                    className="text-[10px] text-red-600 font-bold ml-2 leading-snug"
                  >
                    {paginas < 1
                      ? "Indicá al menos 1 página del PDF"
                      : "No hay precio de espiral para esa cantidad de hojas (revisá el tarifario)."}
                  </p>
                )}
              </div>
              <NumberStepper
                label="Copias"
                value={copias}
                onChange={(n) => setCopias(Math.max(1, n))}
                min={1}
                max={500}
                clearOnFocusWhen={1}
              />
              <div className="space-y-1">
                <span className="text-[10px] font-black text-slate-400 ml-2 uppercase block">
                  Línea de impresión
                </span>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  disabled={soloAnillado || lineasImpresionOpciones.length === 0}
                  className={`w-full min-h-12 rounded-sm border border-slate-200 bg-slate-50 px-3 font-black text-xs uppercase text-slate-800 cursor-pointer ${
                    soloAnillado ? "opacity-45 pointer-events-none" : ""
                  }`}
                >
                  {lineasImpresionOpciones.length === 0 ? (
                    <option value="">Sin tarifas activas</option>
                  ) : (
                    lineasImpresionOpciones.map((o) => (
                      <option key={o.slug} value={o.slug}>
                        {o.label}
                      </option>
                    ))
                  )}
                </select>
                <p className="text-[9px] text-slate-400 font-semibold ml-2 leading-snug">
                  Definí líneas nuevas en Precios → tarifas; después cargá reglas e
                  insumos para cada tarifa.
                </p>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-5">
              <label
                className={`flex items-center cursor-pointer bg-slate-50 p-4 rounded-sm border-2 transition-all shadow-sm ${
                  dobleFaz && !soloAnillado ? "border-blue-500" : "border-transparent"
                } ${soloAnillado ? "opacity-45 pointer-events-none" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={soloAnillado ? false : dobleFaz}
                  onChange={(e) => setDobleFaz(e.target.checked)}
                  disabled={soloAnillado}
                  className="w-6 h-6 text-blue-600 rounded"
                />
                <span className="ml-3 text-xs font-black text-slate-700 uppercase italic leading-none">
                  Doble faz
                </span>
              </label>
              <label
                className={`flex items-center justify-between gap-3 cursor-pointer bg-slate-50 p-4 rounded-sm border-2 transition-all shadow-sm ${
                  conAnillado ? "border-amber-500" : "border-transparent"
                }`}
              >
                <span className="text-xs font-black text-slate-700 uppercase italic leading-none">
                  Anillado
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={conAnillado}
                  onClick={() => {
                    setConAnillado((v) => {
                      const next = !v;
                      if (!next) setSoloAnillado(false);
                      if (!next && paginas >= 1) setErrPaginas(false);
                      return next;
                    });
                  }}
                  className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${
                    conAnillado ? "bg-amber-500" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                      conAnillado ? "translate-x-6" : ""
                    }`}
                  />
                </button>
              </label>
            </div>

            <label
              className={`flex flex-col gap-1.5 cursor-pointer bg-slate-50 p-4 rounded-sm border-2 transition-all shadow-sm ${
                soloAnillado ? "border-emerald-500 ring-1 ring-emerald-100" : "border-transparent"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={soloAnillado}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setSoloAnillado(on);
                    if (on) setConAnillado(true);
                  }}
                  className="w-6 h-6 text-emerald-600 rounded shrink-0 mt-0.5"
                />
                <div className="min-w-0">
                  <span className="text-xs font-black text-slate-800 uppercase italic leading-tight block">
                    Solo anillado
                  </span>
                  <span className="text-[10px] text-slate-500 font-semibold leading-snug block mt-1">
                    El cliente trae las copias ya impresas. No aplica tarifa de
                    impresión; solo se cotiza el anillado según páginas y espiral.
                  </span>
                </div>
              </div>
            </label>

            {conAnillado && (
              <div className="space-y-2 px-1 -mt-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 ml-1 uppercase block">
                    Espiral (stock)
                  </label>
                  <select
                    value={espiralInsumoId ?? ""}
                    onChange={(e) =>
                      setEspiralInsumoId(e.target.value || null)
                    }
                    disabled={espirales.length === 0}
                    className="w-full p-3 bg-amber-50/80 rounded-sm font-bold text-sm border border-amber-100 text-slate-800 cursor-pointer"
                  >
                    {espirales.length === 0 ? (
                      <option value="">Sin espirales en catálogo</option>
                    ) : (
                      espirales.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nombre}
                          {e.medida_mm != null ? ` · ${e.medida_mm} mm` : ""}
                          {e.rango_anillado
                            ? ` · ${e.rango_anillado}`
                            : ""}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <p className="text-[10px] text-slate-500 font-semibold">
                  {paginas < 1 ? (
                    <>Indicá páginas del PDF para validar la tarifa.</>
                  ) : tarifaAnillado ? (
                    <>
                      Tarifa:{" "}
                      <strong className="text-amber-800">
                        {tarifaAnillado.nombre_categoria}
                        {tarifaAnillado.medida_mm > 0
                          ? ` · ${tarifaAnillado.medida_mm} mm`
                          : ""}
                      </strong>{" "}
                      — venta {formatCurrency(tarifaAnillado.precio_venta)} (por
                      trabajo).
                    </>
                  ) : (
                    <>No hay tarifa de anillado que coincida (rango + hojas).</>
                  )}
                </p>
              </div>
            )}

            {/* Date */}
            <div className="space-y-1 scroll-mt-28">
              <label className="text-[10px] font-black text-slate-400 ml-2 uppercase block">
                Fecha de entrega{" "}
                <span className="text-red-500" aria-hidden>
                  *
                </span>
              </label>
              <FechaEntregaSelector
                ref={fechaFieldRef}
                value={cart.fechaEntrega}
                onChange={(fecha) => {
                  cart.setFechaEntrega(fecha);
                  if (errFecha && fecha.trim()) setErrFecha(false);
                }}
                error={errFecha}
                fechaInputRef={fechaInputRef}
                onClearError={() => setErrFecha(false)}
              />
              {errFecha && (
                <p
                  id="err-fecha"
                  role="alert"
                  className="text-[10px] text-red-600 font-bold ml-2"
                >
                  Este campo es obligatorio
                </p>
              )}
            </div>

            {/* Descuento/Recargo */}
            <div className="space-y-2">
              {!showDescRec ? (
                <button
                  type="button"
                  className="w-full bg-blue-50 text-blue-600 py-2 rounded-sm font-black uppercase text-xs tracking-widest shadow-sm border border-blue-100 hover:bg-blue-100 active:scale-95 transition"
                  onClick={() => setShowDescRec(true)}
                >
                  <i className="fas fa-percent mr-2" />
                  Agregar descuento o recargo
                </button>
              ) : (
                <div className="flex flex-col lg:flex-row gap-2 items-center">
                  {/* Switch tipo */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={`px-3 py-1 rounded-l-sm font-bold text-xs border ${descRecTipo === "descuento" ? "bg-green-100 text-green-700 border-green-300" : "bg-slate-50 text-slate-400 border-slate-200"}`}
                      onClick={() => setDescRecTipo("descuento")}
                    >
                      Descuento
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1 rounded-r-sm font-bold text-xs border ${descRecTipo === "recargo" ? "bg-red-100 text-red-700 border-red-300" : "bg-slate-50 text-slate-400 border-slate-200"}`}
                      onClick={() => setDescRecTipo("recargo")}
                    >
                      Recargo
                    </button>
                  </div>
                  {/* Switch modo */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={`px-3 py-1 rounded-l-sm font-bold text-xs border ${descRecModo === "porcentaje" ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-slate-50 text-slate-400 border-slate-200"}`}
                      onClick={() => setDescRecModo("porcentaje")}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1 rounded-r-sm font-bold text-xs border ${descRecModo === "monto" ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-slate-50 text-slate-400 border-slate-200"}`}
                      onClick={() => setDescRecModo("monto")}
                    >
                      $ fijo
                    </button>
                  </div>
                  {/* Input valor */}
                  <input
                    type="number"
                    min="0"
                    value={descRecValor}
                    onChange={(e) => setDescRecValor(e.target.value)}
                    placeholder={descRecModo === "porcentaje" ? "%" : "$"}
                    className="w-24 p-2 rounded-sm border border-slate-200 text-center font-black text-blue-700 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    className="text-xs text-slate-400 hover:text-red-500 ml-2"
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

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">
                Notas del Archivo
              </label>
              <input
                type="text"
                value={itemNotas}
                onChange={(e) => setItemNotas(e.target.value)}
                placeholder="Ej: Anillado azul, cartulina roja..."
                className="w-full p-4 bg-slate-50 rounded-sm outline-none focus:ring-2 focus:ring-blue-100 font-bold border border-slate-50 transition-all text-xs"
              />
            </div>

            {/* Add button */}
            <button
              type="button"
              onClick={handleAgregarItem}
              className="w-full bg-slate-900 text-white py-4 lg:py-5 rounded-sm font-black uppercase text-xs tracking-[0.2em] shadow-xl active:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <i
                className={
                  editingItemIndex !== null ? "fas fa-save" : "fas fa-cart-plus"
                }
              />
              {editingItemIndex !== null
                ? "Guardar cambios del archivo"
                : "Añadir este Archivo"}
            </button>
            {editingItemIndex !== null && (
              <button
                type="button"
                onClick={() => resetFormItem()}
                className="w-full mt-2 text-slate-500 py-2 text-xs font-bold uppercase tracking-wider hover:text-slate-800"
              >
                Cancelar edición
              </button>
            )}
          </div>
        </div>

        {/* Cart */}
        <Cart
          onFinalize={handleFinalize}
          saving={saving}
          editingItemIndex={editingItemIndex}
          onEditItem={startEditItem}
          onRemoveItem={handleRemoveItem}
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
