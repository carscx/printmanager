import { ADMIN_PASS } from "./supabase.js";
import { api } from "./api.js";
import { ui } from "./ui.js";
import { calculator } from "./services/calculator.js";

let settings = {};
let vistaActual = "taller";
let itemsPedidoNuevo = [];
let editandoPedidoId = null;

// --- Navegación ---
window.navigateTo = (view) => {
  const views = ["view-home", "view-nuevo-pedido"];
  views.forEach((v) => document.getElementById(v).classList.add("hidden"));
  document.getElementById(`view-${view}`).classList.remove("hidden");

  // Mostrar/Ocultar botón home en el header
  document
    .getElementById("btnViewHome")
    .classList.toggle("hidden", view === "home");

  if (view === "home") {
    refreshData();
    updateResumen();
    editandoPedidoId = null; // Limpiar estado al volver
  } else {
    // Si no estamos editando, resetear todo
    if (!editandoPedidoId) {
      itemsPedidoNuevo = [];
      document.getElementById("cliente").value = "";
      document.getElementById("fecha_entrega").value = "";
      document.getElementById("pedido_observaciones").value = "";
      resetFormItem();
      ui.renderItemsCarrito(itemsPedidoNuevo, "removerItem");
      actualizarTotalesNuevoPedido();
    }
  }
};

const resetFormItem = () => {
  document.getElementById("paginas").value = 0;
  document.getElementById("tipo").value = "bn";
  document.getElementById("df").checked = false;
  document.getElementById("solo_ani").checked = false;
  document.getElementById("ani").value = "0";
  document.getElementById("sobrina_check").checked = false;
  document.getElementById("item_notas").value = "";

  // Trigger visuals
  const inputsToToggle = ["paginas", "tipo", "df"];
  inputsToToggle.forEach((id) => {
    const el = document.getElementById(id);
    el.disabled = false;
    el.classList.remove("opacity-50");
  });
};

// --- Gestión de Pedido Múltiple ---
window.agregarItemALista = () => {
  const params = {
    paginas: parseInt(document.getElementById("paginas").value) || 0,
    tipo: document.getElementById("tipo").value,
    doble_faz: document.getElementById("df").checked,
    idAni: document.getElementById("ani").value,
    solo_ani: document.getElementById("solo_ani").checked
  };

  const { total } = calculator.calculatePedido(params, settings);

  if (total <= 0) return;

  const item = {
    nombre_archivo: `Archivo ${itemsPedidoNuevo.length + 1}`,
    paginas: params.paginas,
    tipo_tinta: params.tipo,
    doble_faz: params.doble_faz,
    anillado_costo:
      params.idAni !== "0" ? parseFloat(settings[params.idAni]) || 0 : 0,
    sobrina_trabajo: document.getElementById("sobrina_check").checked,
    observaciones: document.getElementById("item_notas").value.trim(),
    subtotal_item: total
  };

  itemsPedidoNuevo.push(item);
  ui.renderItemsCarrito(itemsPedidoNuevo, "removerItem");
  actualizarTotalesNuevoPedido();
  resetFormItem();
};

window.removerItem = (index) => {
  itemsPedidoNuevo.splice(index, 1);
  ui.renderItemsCarrito(itemsPedidoNuevo, "removerItem");
  actualizarTotalesNuevoPedido();
};

const actualizarTotalesNuevoPedido = () => {
  const total = itemsPedidoNuevo.reduce((acc, it) => acc + it.subtotal_item, 0);
  const sena = Math.round(total * 0.5);

  document.getElementById("t-total-nuevo").innerText =
    `$ ${total.toLocaleString("es-AR")}`;
  document.getElementById("t-sena-nuevo").innerText =
    `$ ${sena.toLocaleString("es-AR")}`;

  // Habilitar/Deshabilitar botón de guardar
  const btn = document.getElementById("btnGuardarPedido");
  if (itemsPedidoNuevo.length > 0) {
    btn.disabled = false;
    btn.classList.remove("opacity-50", "cursor-not-allowed");
  } else {
    btn.disabled = true;
    btn.classList.add("opacity-50", "cursor-not-allowed");
  }
};

window.finalizarPedidoMultiple = async () => {
  if (itemsPedidoNuevo.length === 0) return;

  const total = itemsPedidoNuevo.reduce((acc, it) => acc + it.subtotal_item, 0);

  const cabecera = {
    cliente: document.getElementById("cliente").value || "General",
    fecha_entrega: document.getElementById("fecha_entrega").value || null,
    total_pedido: total,
    pago_sena: Math.round(total * 0.5),
    observaciones: document.getElementById("pedido_observaciones").value.trim()
  };

  try {
    if (editandoPedidoId) {
      await api.actualizarPedidoCompleto(
        editandoPedidoId,
        cabecera,
        itemsPedidoNuevo
      );
      ui.showToast("PEDIDO ACTUALIZADO");
    } else {
      cabecera.estado = "Pendiente";
      cabecera.entregado = false;
      await api.crearPedidoCompleto(cabecera, itemsPedidoNuevo);
      ui.showToast("PEDIDO GUARDADO CON ÉXITO");
    }
    window.navigateTo("home");
  } catch (e) {
    ui.showToast("ERROR AL PROCESAR EL PEDIDO", "error");
    console.error(e);
  }
};

// --- Lógica de Negocio Adaptada (Para el Resumen / Historial) ---
const refreshData = async () => {
  const { data: pedidos } = await api.fetchPedidos(vistaActual === "historial");
  ui.renderPedidos(pedidos, vistaActual, {
    onBorrar: (id) =>
      ui.abrirConfirm(
        "danger",
        "¿Borrar pedido?",
        "Se eliminara permanentemente.",
        async () => {
          await api.borrarPedido(id);
          ui.showToast("PEDIDO ELIMINADO");
          refreshData();
        }
      ),
    onEditar: (p) => {
      editandoPedidoId = p.id;
      itemsPedidoNuevo = [...p.pedido_items];
      window.navigateTo("nuevo-pedido");
      document.getElementById("cliente").value = p.cliente;
      document.getElementById("fecha_entrega").value = p.fecha_entrega || "";
      document.getElementById("pedido_observaciones").value =
        p.observaciones || "";
      ui.renderItemsCarrito(itemsPedidoNuevo, "removerItem");
      actualizarTotalesNuevoPedido();
    },
    onEstado: async (id, nuevoEst) => {
      try {
        console.log("Cambiando:", id, nuevoEst);
        const res = await api.cambiarEstadoPedido(id, nuevoEst);
        if (res.error) throw res.error;

        ui.showToast(`PEDIDO MARCADO COMO ${nuevoEst.toUpperCase()}`);
        console.log("Refrescando...");
        await refreshData();
        await updateResumen();
        console.log("Refrescado.");
      } catch (err) {
        console.error("Error completo Supabase:", err);
        ui.showToast("ERROR AL CAMBIAR ESTADO", "error");
      }
    },
    onEntregar: (id) =>
      ui.abrirConfirm(
        "success",
        "¿Pedido entregado?",
        "Se cobrara y pasara al historial de hoy.",
        async () => {
          await api.entregarPedido(id);
          ui.showToast("PEDIDO ENTREGADO");
          refreshData();
          updateResumen();
        }
      ),
    onWA: (p) => {
      const itemsText = p.pedido_items
        .map(
          (it) =>
            `- ${it.paginas} pág ${(it.tipo_tinta || "B/N").toUpperCase()} ${it.doble_faz ? "DF" : "SF"} ${it.anillado_costo > 0 ? "+ Anillado" : ""}`
        )
        .join("\n");

      const msj = `Hola *${p.cliente}*,\n${
        p.estado === "Listo"
          ? "Tu pedido está listo para retirar"
          : "Te paso el presupuesto:"
      }\n\nDetalle:\n${itemsText}\n\n*Total: $${p.total_pedido.toLocaleString("es-AR")}*\n\nPagos:\nAlias: *${settings.pago_alias || "S/D"}*`;
      window.open(`https://wa.me/?text=${encodeURIComponent(msj)}`, "_blank");
    }
  });
};

const updateResumen = async () => {
  const { data: pedidosHoy } = await api.fetchResumenHoy();
  if (pedidosHoy) {
    // Necesitamos adaptar el cálculo del resumen porque ahora usamos 'total_pedido'
    const resumen = {
      total: pedidosHoy.reduce((acc, p) => acc + Number(p.total_pedido), 0),
      comisionTotal: pedidosHoy.reduce((acc, p) => {
        const comisionPedido = (p.pedido_items || []).reduce((accIt, it) => {
          return (
            accIt +
            (it.sobrina_trabajo
              ? it.subtotal_item * (parseFloat(settings.comision_sobrina) / 100)
              : 0)
          );
        }, 0);
        return acc + comisionPedido;
      }, 0)
    };

    // Calcular ganancia neta
    const mkp = parseFloat(settings.markup) || 1.6;
    const gananciaBruta = resumen.total - resumen.total / mkp;
    resumen.gananciaLimpiaMoni = Math.round(
      gananciaBruta - resumen.comisionTotal
    );
    resumen.total = Math.round(resumen.total);
    resumen.comisionTotal = Math.round(resumen.comisionTotal);

    ui.renderResumen(resumen);
  }
};

const init = async () => {
  const { data } = await api.fetchConfig();
  if (data) {
    data.forEach((item) => (settings[item.id] = item.valor));
    const aniS = document.getElementById("ani");
    if (aniS) {
      aniS.options[1].text = `ANILLADO CHICO (1-70 hjs) - $${parseFloat(settings.esp_s) || 700}`;
      aniS.options[2].text = `ANILLADO MEDIANO (71-150 hjs) - $${parseFloat(settings.esp_m) || 1000}`;
      aniS.options[3].text = `ANILLADO GRANDE (151-500 hjs) - $${parseFloat(settings.esp_l) || 1400}`;
    }
  }
  refreshData();
  updateResumen();
};

// --- Event Listeners Globales ---
document.getElementById("solo_ani").onchange = () => {
  const isSolo = document.getElementById("solo_ani").checked;
  ["paginas", "tipo", "df"].forEach((id) => {
    const el = document.getElementById(id);
    el.disabled = isSolo;
    if (isSolo) el.classList.add("opacity-50");
    else el.classList.remove("opacity-50");
  });
  if (isSolo) document.getElementById("paginas").value = 0;
};

window.cambiarVista = (v) => {
  vistaActual = v;
  document.getElementById("tabTaller").className =
    `flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
      v === "taller" ? "bg-slate-900 text-white shadow-sm" : "text-slate-400"
    }`;
  document.getElementById("tabHistorial").className =
    `flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
      v === "historial" ? "bg-slate-900 text-white shadow-sm" : "text-slate-400"
    }`;
  refreshData();
};

window.abrirAjustes = () => {
  document.getElementById("modalAjustes").classList.remove("hidden");
  document.getElementById("modalAjustes").classList.add("flex");

  const sesionAdmin = sessionStorage.getItem("adminSession");
  const ahora = Date.now();

  // Si hay sesión y no pasaron más de 10 minutos (600,000 ms)
  if (sesionAdmin && ahora - parseInt(sesionAdmin) < 600000) {
    document.getElementById("modalAuth").classList.add("hidden");
    document.getElementById("modalForm").classList.remove("hidden");
    ui.renderInputsConfig(settings);
  } else {
    document.getElementById("modalAuth").classList.remove("hidden");
    document.getElementById("modalForm").classList.add("hidden");
    document.getElementById("adminPass").value = "";
    document.getElementById("adminPass").focus();
  }
};

window.cerrarModal = () => {
  document.getElementById("modalAjustes").classList.remove("flex");
  document.getElementById("modalAjustes").classList.add("hidden");
};

window.cerrarConfirm = () => {
  document.getElementById("modalConfirm").classList.remove("flex");
  document.getElementById("modalConfirm").classList.add("hidden");
};

window.validarAcceso = () => {
  if (document.getElementById("adminPass").value === ADMIN_PASS) {
    sessionStorage.setItem("adminSession", Date.now().toString());
    document.getElementById("modalAuth").classList.add("hidden");
    document.getElementById("modalForm").classList.remove("hidden");
    ui.renderInputsConfig(settings);
  } else {
    ui.showToast("CONTRASEÑA INCORRECTA", "error");
  }
};

window.guardarCambiosConfig = async () => {
  const btn = document.getElementById("btnGuardar");
  const originalText = btn.innerText;

  try {
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-2"></i> GUArdando...`;

    const ins = document.querySelectorAll("#inputsConfig input");
    for (let i of ins) {
      await api.updateConfig(i.dataset.key, i.value);
    }
    await init();
    window.cerrarModal();
    ui.showToast("CONFIGURACIÓN GUARDADA");
  } catch (error) {
    console.error("Error al guardar config:", error);
    ui.showToast("ERROR AL GUARDAR CONFIG", "error");
  } finally {
    btn.disabled = false;
    btn.innerText = originalText;
  }
};

window.enviarPedido = async () => {
  const tStr = document.getElementById("t-total").innerText.replace(/\D/g, "");
  if (!tStr || tStr === "0") return;

  await api.crearPedido({
    cliente: document.getElementById("cliente").value || "General",
    paginas: parseInt(document.getElementById("paginas").value),
    tipo: document.getElementById("tipo").value,
    doble_faz: document.getElementById("df").checked,
    anillado_costo:
      parseFloat(settings[document.getElementById("ani").value]) || 0,
    fecha_entrega: document.getElementById("fecha_entrega").value || null,
    sobrina_trabajo: document.getElementById("sobrina_check").checked,
    total: parseInt(tStr),
    sena: Math.round(parseInt(tStr) * 0.5),
    entregado: false,
    estado: "Pendiente"
  });

  document.getElementById("cliente").value = "";
  document.getElementById("paginas").value = 0;
  document.getElementById("df").checked = false;
  document.getElementById("sobrina_check").checked = false;
  calc();
  refreshData();
};

document.addEventListener("DOMContentLoaded", init);

// --- Service Worker Registration ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("Service Worker registrado", reg))
      .catch((err) => console.error("Error al registrar Service Worker", err));
  });
}
