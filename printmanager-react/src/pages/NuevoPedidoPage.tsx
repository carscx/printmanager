import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCartStore } from "../store/useCartStore";
import { usePedidos } from "../hooks/usePedidos";
import { usePrecios } from "../hooks/usePrecios";
import { costEngine } from "../services/costEngine";
import { Cart } from "../components/cart/Cart";
import { showToast } from "../components/ui/Toast";
import type { PedidoItem } from "../types/pedido";

export function NuevoPedidoPage() {
  const navigate = useNavigate();
  const { crear, actualizar } = usePedidos();
  const {
    preciosImpresion,
    preciosAnillado,
    loading: preciosLoading
  } = usePrecios();
  const cart = useCartStore();
  const [saving, setSaving] = useState(false);

  // Form state for current item being configured
  const [paginas, setPaginas] = useState(0);
  const [copias, setCopias] = useState(1);
  const [tipo, setTipo] = useState<"bn" | "color">("bn");
  const [dobleFaz, setDobleFaz] = useState(false);
  const [soloAni, setSoloAni] = useState(false);
  // ani = id de precioAnillado o "0" (sin anillar)
  const [ani, setAni] = useState("0");
  const [sobrinaCheck, setSobrinaCheck] = useState(false);
  const [itemNotas, setItemNotas] = useState("");

  // Descuento/recargo UI state
  const [showDescRec, setShowDescRec] = useState(false);
  const [descRecTipo, setDescRecTipo] = useState<"descuento" | "recargo">(
    "descuento"
  );
  const [descRecModo, setDescRecModo] = useState<"porcentaje" | "monto">(
    "porcentaje"
  );
  const [descRecValor, setDescRecValor] = useState("");

  const handleSoloAnilladoChange = (checked: boolean) => {
    setSoloAni(checked);
    if (checked) setPaginas(0);
  };

  const resetFormItem = () => {
    setPaginas(0);
    setCopias(1);
    setTipo("bn");
    setDobleFaz(false);
    setSoloAni(false);
    setAni("0");
    setSobrinaCheck(false);
    setItemNotas("");
    setShowDescRec(false);
    setDescRecTipo("descuento");
    setDescRecModo("porcentaje");
    setDescRecValor("");
  };

  const handleAgregarItem = () => {
    if (preciosLoading) return;
    // Buscar medida_mm del anillado seleccionado
    const anilladoSel = preciosAnillado.find((a) => a.id === ani);
    const anillado_mm =
      ani !== "0" && anilladoSel ? anilladoSel.medida_mm : null;
    // DRY: armar params con descuento/recargo si corresponde
    const params: any = {
      paginas,
      copias,
      tipo,
      doble_faz: dobleFaz,
      anillado_mm,
      solo_anillado: soloAni
    };
    if (showDescRec && descRecValor) {
      const val = Number(descRecValor);
      if (descRecTipo === "descuento") {
        if (descRecModo === "porcentaje") params.descuento_porcentaje = val;
        else params.descuento_monto = val;
      } else {
        if (descRecModo === "porcentaje") params.recargo_porcentaje = val;
        else params.recargo_monto = val;
      }
    }
    const venta = costEngine.calcularPrecioVenta(
      params,
      preciosImpresion,
      preciosAnillado
    );
    if (venta.total <= 0) return;
    const item: PedidoItem = {
      nombre_archivo: `Archivo ${cart.items.length + 1}`,
      paginas: params.paginas,
      copias: params.copias,
      tipo_impresion: `${tipo === "bn" ? "B/N" : "COLOR"} ${dobleFaz ? "DF" : "SF"}`,
      anillado: anilladoSel ? `${anilladoSel.medida_mm}mm` : null,
      precio_unitario: venta.total,
      observaciones: itemNotas.trim(),
      _sobrina: sobrinaCheck,
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
    cart.addItem(item);
    resetFormItem();
  };

  const handleFinalize = async () => {
    if (cart.items.length === 0) return;
    setSaving(true);

    const total = cart.getTotal();
    const sena = cart.getSena();

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

    const cabecera = {
      cliente: cart.clienteNombre || "General",
      fecha_entrega: cart.fechaEntrega || null,
      total,
      sena,
      observaciones: cart.observaciones.trim(),
      descuento_global_porcentaje,
      descuento_global_monto,
      recargo_global_porcentaje,
      recargo_global_monto
    };

    // Asegurar que los ítems tengan los campos correctos (ya se guardan al agregar)
    const items = cart.items;

    try {
      if (cart.editandoPedidoId) {
        await actualizar(
          cart.editandoPedidoId,
          {
            ...cabecera,
            estado: "pendiente",
            entregado: false,
            fecha_pago: null
          },
          items
        );
        showToast("PEDIDO ACTUALIZADO");
      } else {
        await crear(
          { ...cabecera, estado: "pendiente", entregado: false },
          items
        );
        showToast("PEDIDO GUARDADO CON ÉXITO");
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

  // Opciones de anillado desde preciosAnillado
  const anilladoOptions = [
    { value: "0", label: "SIN ANILLAR" },
    ...preciosAnillado.map((a) => ({
      value: a.id,
      label: `${a.medida_mm}mm${a.paginas_max ? ` (hasta ${a.paginas_max} hjs)` : ""} - $${a.precio_venta}`
    }))
  ];

  return (
    <section className="animate-slide-in-bottom space-y-4 lg:space-y-0">
      <div className="lg:grid lg:grid-cols-2 lg:gap-8 space-y-4 lg:space-y-0">
        {/* Item form */}
        <div className="bg-white p-4 lg:p-6 rounded-3xl shadow-xl border border-slate-100">
          <h2 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] mb-6 italic leading-none">
            Configurar Archivo
          </h2>
          <div className="space-y-4 lg:space-y-5">
            {/* Cliente */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">
                Nombre del Cliente
              </label>
              <input
                type="text"
                value={cart.clienteNombre}
                onChange={(e) => cart.setClienteNombre(e.target.value)}
                placeholder="¿A quién le pertenece este pedido?"
                className="w-full p-3.5 lg:p-4 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-blue-100 font-bold border border-slate-50 transition-all"
              />
            </div>

            {/* Pages + Copies + Ink type */}
            <div className="grid grid-cols-3 gap-3 lg:gap-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">
                  Páginas del PDF
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={paginas}
                  onChange={(e) => setPaginas(parseInt(e.target.value) || 0)}
                  disabled={soloAni}
                  className={`w-full p-3.5 lg:p-4 bg-slate-50 rounded-2xl font-black text-xl text-blue-600 border border-slate-100 focus:bg-white transition-colors ${soloAni ? "opacity-50" : ""}`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">
                  Copias
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={copias}
                  onChange={(e) =>
                    setCopias(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="w-full p-3.5 lg:p-4 bg-slate-50 rounded-2xl font-black text-xl text-blue-600 border border-slate-100 focus:bg-white transition-colors"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">
                  Tinta
                </label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as "bn" | "color")}
                  disabled={soloAni}
                  className={`w-full p-3.5 lg:p-4 bg-slate-50 rounded-2xl font-bold outline-none border border-slate-50 cursor-pointer ${soloAni ? "opacity-50" : ""}`}
                >
                  <option value="bn">B&N</option>
                  <option value="color">Color</option>
                </select>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="grid grid-cols-2 gap-3 lg:gap-5">
              <label
                className={`flex items-center cursor-pointer bg-slate-50 p-4 rounded-2xl border-2 transition-all shadow-sm ${
                  dobleFaz ? "border-blue-500" : "border-transparent"
                } ${soloAni ? "opacity-50" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={dobleFaz}
                  onChange={(e) => setDobleFaz(e.target.checked)}
                  disabled={soloAni}
                  className="w-6 h-6 text-blue-600 rounded"
                />
                <span className="ml-3 text-xs font-black text-slate-700 uppercase italic leading-none">
                  Doble Faz
                </span>
              </label>
              <label
                className={`flex items-center cursor-pointer bg-slate-50 p-4 rounded-2xl border-2 transition-all shadow-sm ${
                  soloAni ? "border-amber-500" : "border-transparent"
                }`}
              >
                <input
                  type="checkbox"
                  checked={soloAni}
                  onChange={(e) => handleSoloAnilladoChange(e.target.checked)}
                  className="w-6 h-6 text-amber-500 rounded"
                />
                <span className="ml-3 text-xs font-black text-slate-700 uppercase italic leading-none">
                  Solo Anillar
                </span>
              </label>
            </div>

            {/* Binding */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">
                Tipo de Anillado
              </label>
              <select
                value={ani}
                onChange={(e) => setAni(e.target.value)}
                className="w-full p-3.5 lg:p-4 bg-slate-50 rounded-2xl font-bold text-slate-600 outline-none text-[10px] border border-slate-50 cursor-pointer"
              >
                {anilladoOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date + Avru */}
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">
                  Fecha de Entrega
                </label>
                <input
                  type="date"
                  value={cart.fechaEntrega}
                  onChange={(e) => cart.setFechaEntrega(e.target.value)}
                  className="w-full p-4 bg-blue-50/30 rounded-2xl outline-none text-blue-900 font-bold border border-blue-100"
                />
              </div>
              <label
                className={`flex-1 flex items-center justify-center cursor-pointer bg-purple-50 p-4 rounded-2xl border-2 transition-all shadow-sm h-[58px] mt-[17px] ${
                  sobrinaCheck ? "border-purple-500" : "border-transparent"
                }`}
              >
                <input
                  type="checkbox"
                  checked={sobrinaCheck}
                  onChange={(e) => setSobrinaCheck(e.target.checked)}
                  className="w-6 h-6 text-purple-600 rounded"
                />
                <span className="ml-3 text-xs font-black text-purple-700 uppercase italic leading-none text-center">
                  Hecho por Avru
                </span>
              </label>
            </div>

            {/* Descuento/Recargo */}
            <div className="space-y-2">
              {!showDescRec ? (
                <button
                  type="button"
                  className="w-full bg-blue-50 text-blue-600 py-2 rounded-xl font-black uppercase text-xs tracking-widest shadow-sm border border-blue-100 hover:bg-blue-100 active:scale-95 transition"
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
                      className={`px-3 py-1 rounded-l-xl font-bold text-xs border ${descRecTipo === "descuento" ? "bg-green-100 text-green-700 border-green-300" : "bg-slate-50 text-slate-400 border-slate-200"}`}
                      onClick={() => setDescRecTipo("descuento")}
                    >
                      Descuento
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1 rounded-r-xl font-bold text-xs border ${descRecTipo === "recargo" ? "bg-red-100 text-red-700 border-red-300" : "bg-slate-50 text-slate-400 border-slate-200"}`}
                      onClick={() => setDescRecTipo("recargo")}
                    >
                      Recargo
                    </button>
                  </div>
                  {/* Switch modo */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={`px-3 py-1 rounded-l-xl font-bold text-xs border ${descRecModo === "porcentaje" ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-slate-50 text-slate-400 border-slate-200"}`}
                      onClick={() => setDescRecModo("porcentaje")}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1 rounded-r-xl font-bold text-xs border ${descRecModo === "monto" ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-slate-50 text-slate-400 border-slate-200"}`}
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
                    className="w-24 p-2 rounded-xl border border-slate-200 text-center font-black text-blue-700 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100"
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
                className="w-full p-4 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-blue-100 font-bold border border-slate-50 transition-all text-xs"
              />
            </div>

            {/* Add button */}
            <button
              onClick={handleAgregarItem}
              className="w-full bg-slate-900 text-white py-4 lg:py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl active:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <i className="fas fa-cart-plus" />
              Añadir este Archivo
            </button>
          </div>
        </div>

        {/* Cart */}
        <Cart onFinalize={handleFinalize} saving={saving} />
      </div>
    </section>
  );
}
