import { descConfig } from "./supabase.js";

const components = {
  badge(text, colorClass) {
    if (!text) return "";
    return `<span class="${colorClass} px-1.5 py-0.5 rounded-lg border border-current/10">${text}</span>`;
  },

  itemRow(item, index, onRemove) {
    return `
      <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group">
        <div class="flex-1">
          <p class="text-[10px] font-black text-slate-800 uppercase leading-none mb-1 text-ellipsis overflow-hidden">
            ${item.paginas} PAG | ${item.tipo_tinta === "bn" ? "B&N" : "COLOR"} ${
              item.doble_faz ? "(DF)" : "(SF)"
            }
          </p>
          <div class="flex gap-2 mb-1">
            ${
              item.anillado_costo > 0
                ? this.badge(
                    "ANILLADO",
                    "bg-amber-100 text-amber-700 text-[8px]"
                  )
                : ""
            }
            ${
              item.sobrina_trabajo
                ? this.badge("AVRU", "bg-purple-100 text-purple-700 text-[8px]")
                : ""
            }
          </div>
          ${
            item.observaciones
              ? `<p class="text-[8px] text-slate-400 italic font-medium leading-tight">"${item.observaciones}"</p>`
              : ""
          }
        </div>
        <div class="text-right flex items-center gap-3">
          <p class="font-black text-slate-900 text-sm">$${item.subtotal_item.toLocaleString(
            "es-AR"
          )}</p>
          <button onclick="${onRemove}(${index})" class="text-slate-300 hover:text-red-500 transition-colors p-1">
            <i class="fas fa-times-circle"></i>
          </button>
        </div>
      </div>`;
  },

  pedidoCard(p, vistaActual) {
    const esListo = p.estado === "Listo";
    const items = p.pedido_items || [];
    const cantArchivos = items.length;
    const fDate = p.fecha_entrega
      ? `${new Date(p.fecha_entrega + "T12:00:00").toLocaleDateString("es-AR")}`
      : "⏳";

    return `
      <div class="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 border-l-8 ${
        esListo ? "border-green-500" : "border-amber-400"
      } relative animate-in slide-in-from-right duration-300">
        <div class="flex justify-between items-start mb-4">
          <div class="flex-1 pr-8">
            <h3 class="font-black text-slate-800 text-lg uppercase tracking-tighter leading-none">${
              p.cliente
            }</h3>
            <div class="flex flex-wrap gap-2 mt-2 font-bold text-[9px] uppercase leading-none">
              ${this.badge(
                `${cantArchivos} ${cantArchivos === 1 ? "ARCHIVO" : "ARCHIVOS"}`,
                "bg-slate-100 text-slate-500"
              )}
              ${this.badge(fDate, "bg-blue-50 text-blue-600")}
            </div>
            ${
              p.observaciones
                ? `<p class="mt-3 text-[10px] font-bold text-amber-600 bg-amber-50 p-2 rounded-xl border border-amber-100 italic">
                  <i class="fas fa-sticky-note mr-1"></i> ${p.observaciones}
                </p>`
                : ""
            }
          </div>
          <div class="text-right flex flex-col items-end leading-none">
            <div class="flex gap-2">
              <button data-pedido='${JSON.stringify(
                p
              )}' class="btn-editar text-slate-200 hover:text-blue-500 transition-colors mb-2 p-1"><i class="fas fa-edit text-sm"></i></button>
              <button data-id="${
                p.id
              }" class="btn-borrar text-slate-200 hover:text-red-500 transition-colors mb-2 p-1"><i class="fas fa-trash-alt text-sm"></i></button>
            </div>
            <p class="text-2xl font-black text-slate-900 leading-none">$${p.total_pedido.toLocaleString(
              "es-AR"
            )}</p>
          </div>
        </div>

        <div class="space-y-1 mb-4 opacity-70">
          ${items
            .map(
              (it) => `
            <p class="text-[9px] font-bold text-slate-500 uppercase border-l-2 border-slate-100 pl-2">
              • ${it.paginas || 0} PAG ${it.tipo_impresion || "MIGRADO"}
              ${it.anillado || ""}
            </p>
          `
            )
            .join("")}
        </div>

        <div class="grid grid-cols-2 gap-3">
          ${
            vistaActual === "taller"
              ? `
              <div class="col-span-2 flex bg-slate-100 p-1 rounded-2xl mb-1">
                <button data-id-estado="${p.id}" data-estado-valor="Pendiente"
                  class="btn-estado flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-wider transition-all ${
                    !esListo
                      ? "bg-white text-amber-500 shadow-sm"
                      : "text-slate-400"
                  }">
                  <i class="fas fa-clock mr-1"></i> Pendiente
                </button>
                <button data-id-estado="${p.id}" data-estado-valor="Listo"
                  class="btn-estado flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-wider transition-all ${
                    esListo
                      ? "bg-green-500 text-white shadow-md scale-[1.02]"
                      : "text-slate-400"
                  }">
                  <i class="fas fa-check-circle mr-1"></i> Listo
                </button>
              </div>
              <button data-id="${
                p.id
              }" class="btn-entregar bg-blue-600 text-white p-3 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-blue-100 flex items-center justify-center gap-2">
                <i class="fas fa-hand-holding-usd"></i> Entregar
              </button>
              <button data-pedido='${JSON.stringify(
                p
              )}' class="btn-wa bg-slate-900 text-white p-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all">
                <i class="fab fa-whatsapp"></i> WhatsApp
              </button>
          `
              : `
              <button data-pedido='${JSON.stringify(
                p
              )}' class="btn-editar bg-slate-100 text-slate-600 p-2 rounded-xl text-[9px] font-black uppercase tracking-widest">Editar</button>
              <div class="text-center py-2 px-4 bg-green-50 rounded-xl leading-none flex-1">
                  <p class="text-[10px] font-black text-green-700 uppercase tracking-widest leading-none">COBRADO EL ${
                    p.fecha_pago
                      ? new Date(p.fecha_pago).toLocaleDateString("es-AR")
                      : "S/D"
                  }</p>
              </div>
          `
          }
        </div>
      </div>`;
  }
};

export const ui = {
  renderResumen(resumen) {
    document.getElementById("resumen-hoy").innerHTML = `
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div class="bg-blue-50 p-3 rounded-xl text-center border border-blue-100">
          <p class="text-[8px] font-black text-blue-400 uppercase tracking-widest leading-none mb-1">Cobrado</p>
          <p class="text-lg font-black text-blue-700 leading-none">$${resumen.total.toLocaleString(
            "es-AR"
          )}</p>
        </div>
        <div class="bg-purple-50 p-3 rounded-xl text-center border border-purple-100">
          <p class="text-[8px] font-black text-purple-400 uppercase tracking-widest leading-none mb-1">Avru</p>
          <p class="text-lg font-black text-purple-700 leading-none">$${resumen.comisionTotal.toLocaleString(
            "es-AR"
          )}</p>
        </div>
      </div>
      <div class="bg-green-50 p-4 rounded-2xl text-center border border-green-100">
        <p class="text-[9px] font-black text-green-400 uppercase mb-1 tracking-widest leading-none">Ganancia Neta Moni</p>
        <p class="text-2xl font-black text-green-700 leading-none">$${resumen.gananciaLimpiaMoni.toLocaleString(
          "es-AR"
        )}</p>
      </div>`;
  },

  renderItemsCarrito(items, onRemoveName) {
    const container = document.getElementById("items-pedido-nuevo");
    if (items.length === 0) {
      container.innerHTML = `<div class="text-center py-10 text-slate-300 italic text-sm">Aún no hay archivos sumados</div>`;
      return;
    }
    container.innerHTML = items
      .map((it, idx) => components.itemRow(it, idx, onRemoveName))
      .join("");
  },

  renderPedidos(data, vistaActual, handlers) {
    document.getElementById("lista").innerHTML = data
      .map((p) => components.pedidoCard(p, vistaActual))
      .join("");

    // Attach local listeners
    document.querySelectorAll(".btn-borrar").forEach(
      (b) =>
        (b.onclick = () => {
          console.log("Borrar ID:", b.dataset.id);
          handlers.onBorrar(b.dataset.id, b.dataset.cliente);
        })
    );
    document.querySelectorAll(".btn-estado").forEach((b) => {
      b.onclick = async () => {
        const id = b.getAttribute("data-id-estado");
        const estado = b.getAttribute("data-estado-valor");
        console.log("Cambio solicitado para ID:", id, "Estado:", estado);
        await handlers.onEstado(id, estado);
      };
    });
    document.querySelectorAll(".btn-entregar").forEach(
      (b) =>
        (b.onclick = () => {
          console.log("Entregar ID:", b.dataset.id);
          handlers.onEntregar(b.dataset.id);
        })
    );
    document
      .querySelectorAll(".btn-wa")
      .forEach(
        (b) => (b.onclick = () => handlers.onWA(JSON.parse(b.dataset.pedido)))
      );
    document
      .querySelectorAll(".btn-editar")
      .forEach(
        (b) =>
          (b.onclick = () => handlers.onEditar(JSON.parse(b.dataset.pedido)))
      );
  },

  showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `p-4 mb-2 rounded-2xl shadow-2xl text-white font-black uppercase text-[10px] tracking-widest text-center animate-in slide-in-from-bottom duration-300 pointer-events-auto ${
      type === "success" ? "bg-green-500" : "bg-red-500"
    }`;
    toast.innerHTML = `<i class="fas ${type === "success" ? "fa-check-circle" : "fa-exclamation-triangle"} mr-2"></i> ${message}`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("animate-out", "fade-out", "slide-out-to-bottom");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  renderInputsConfig(settings) {
    const c = document.getElementById("inputsConfig");
    c.innerHTML = Object.entries(settings)
      .map(
        ([k, v]) => `
      <div class="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
        <label class="block text-[8px] font-black text-blue-600 uppercase mb-0.5 tracking-widest leading-none">${
          descConfig[k] || k
        }</label>
        <input type="text" data-key="${k}" value="${v}" class="w-full bg-slate-50 p-2 rounded font-black text-slate-800 outline-none">
      </div>`
      )
      .join("");
  },

  abrirConfirm(tipo, titulo, texto, callback) {
    const m = document.getElementById("modalConfirm");
    document.getElementById("confirmTitle").innerText = titulo;
    document.getElementById("confirmText").innerText = texto;
    const b = document.getElementById("confirmBtnAction");
    b.className = `flex-1 py-4 text-white font-bold rounded-2xl shadow-lg ${
      tipo === "danger" ? "bg-red-500" : "bg-green-500"
    } uppercase text-[10px] tracking-widest font-black`;
    m.classList.remove("hidden");
    m.classList.add("flex");
    b.onclick = async () => {
      await callback();
      m.classList.remove("flex");
      m.classList.add("hidden");
    };
  }
};
