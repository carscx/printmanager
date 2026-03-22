import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Pedido } from "../types/pedido";
import type { PlantillaWhatsapp } from "../types/whatsapp";
import { api } from "../services/api";
import { whatsappApi } from "../services/whatsappApi";
import { renderWhatsappMensaje } from "../services/whatsappService";
import { showToast } from "../components/ui/Toast";

export function WhatsappPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [plantilla, setPlantilla] = useState<PlantillaWhatsapp | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(true);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const emojiPanelRef = useRef<HTMLDivElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const EMOJIS = [
    "🙂",
    "😀",
    "😅",
    "😂",
    "😉",
    "😍",
    "🥳",
    "🤝",
    "🙏",
    "👍",
    "👎",
    "✅",
    "❌",
    "⚠️",
    "🕒",
    "📌",
    "📎",
    "📄",
    "🧾",
    "💰",
    "💳",
    "🏦",
    "📦",
    "🖨️",
    "🎉"
  ];

  useEffect(() => {
    async function load() {
      if (!id) return;
      setLoading(true);
      try {
        const [p, datosPagoResp] = await Promise.all([
          api.fetchPedidoById(id),
          whatsappApi.fetchDatosPago()
        ]);
        if (!p) {
          showToast("PEDIDO NO ENCONTRADO", "error");
          navigate("/");
          return;
        }
        setPedido(p);

        const plantillas = await whatsappApi.fetchPlantillasByEstado(
          (p.estado || "presupuesto").toLowerCase()
        );
        const plant = plantillas[0] ?? null;
        setPlantilla(plant);
        if (plant) {
          const msg = renderWhatsappMensaje({
            pedido: p,
            items: p.pedido_items || [],
            plantilla: plant,
            datosPago: datosPagoResp
          });
          setMensaje(msg);
        } else {
          setMensaje("");
        }
      } catch (err) {
        console.error("Error loading WhatsApp preview:", err);
        showToast("ERROR AL CARGAR WHATSAPP", "error");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, navigate]);

  const handleAbrirWhatsapp = async () => {
    if (!mensaje || !id) return;
    const url = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
    try {
      await whatsappApi.logMensajeEnviado(
        id,
        plantilla?.id ?? null,
        mensaje
      );
    } catch {
      // Log opcional: si falla (ej. tabla no creada) no bloquear al usuario
    }
  };

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(mensaje);
      showToast("MENSAJE COPIADO");
    } catch {
      showToast("NO SE PUDO COPIAR", "error");
    }
  };

  const handleEditorInput = (e: React.FormEvent<HTMLDivElement>) => {
    const text = e.currentTarget.innerText;
    setMensaje(text);
  };

  const focusEditor = () => {
    editorRef.current?.focus();
  };

  const getEditorSelectionRange = (): Range | null => {
    const editor = editorRef.current;
    if (!editor) return null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return null;
    return range;
  };

  const replaceRangeText = (range: Range, text: string) => {
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    // Dejar cursor al final del nodo insertado
    range.setStartAfter(node);
    range.setEndAfter(node);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const wrapSelection = (left: string, right = left) => {
    focusEditor();
    const range = getEditorSelectionRange();
    if (!range) return;
    const selected = range.toString();
    if (selected.length === 0) {
      // Insertar marcadores y dejar el cursor entre ellos
      const text = `${left}${right}`;
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);

      const cursorPos = left.length;
      const newRange = document.createRange();
      newRange.setStart(node, cursorPos);
      newRange.setEnd(node, cursorPos);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(newRange);
    } else {
      replaceRangeText(range, `${left}${selected}${right}`);
    }

    // Sincronizar estado con el contenido del editor
    if (editorRef.current) setMensaje(editorRef.current.innerText);
  };

  const insertAtCursor = (text: string) => {
    focusEditor();
    const range = getEditorSelectionRange();
    if (!range) return;
    replaceRangeText(range, text);
    if (editorRef.current) setMensaje(editorRef.current.innerText);
  };

  // Mantener el contenido del contentEditable sincronizado
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerText !== mensaje) {
      editorRef.current.innerText = mensaje;
    }
  }, [mensaje]);

  // Cerrar el panel de emojis al clickear fuera
  useEffect(() => {
    if (!emojiOpen) return;
    const onDown = (ev: MouseEvent) => {
      const panel = emojiPanelRef.current;
      const target = ev.target as Node | null;
      if (!panel || !target) return;
      if (!panel.contains(target)) {
        setEmojiOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [emojiOpen]);

  if (loading) {
    return (
      <section className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center text-slate-400 text-xs font-bold uppercase tracking-[0.2em]">
          Cargando mensaje de WhatsApp...
        </div>
      </section>
    );
  }

  if (!pedido) {
    return null;
  }

  return (
    <section className="space-y-4 lg:max-w-2xl lg:mx-auto pb-24">
      <header className="mt-2 mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2 cursor-pointer"
        >
          <i className="fas fa-arrow-left" />
          Volver
        </button>
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
            WhatsApp para
          </p>
          <p className="text-sm font-black text-slate-800 uppercase">
            {pedido.cliente}
          </p>
        </div>
      </header>

      {plantilla && (
        <div className="bg-slate-900 text-white rounded-sm p-4 text-[10px] font-mono uppercase tracking-[0.2em] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <i className="fab fa-whatsapp text-green-400" />
            <span className="font-black">Plantilla: {plantilla.nombre}</span>
          </div>
          <span className="text-[8px] text-slate-400">
            Estado: {pedido.estado}
          </span>
        </div>
      )}

      <div className="bg-white rounded-sm shadow-sm border border-slate-100 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
            Mensaje (WYSIWYG básico)
          </span>
          <span className="text-[9px] text-slate-400">
            Formato WhatsApp: * _ ~ `
          </span>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => wrapSelection("*")}
            className="px-3 py-2 rounded-sm bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-[0.2em] cursor-pointer"
            title="Negrita (*texto*)"
          >
            <span className="font-black">B</span>
          </button>
          <button
            type="button"
            onClick={() => wrapSelection("_")}
            className="px-3 py-2 rounded-sm bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-[0.2em] cursor-pointer"
            title="Cursiva (_texto_)"
          >
            <span className="italic font-black">I</span>
          </button>
          <button
            type="button"
            onClick={() => wrapSelection("~")}
            className="px-3 py-2 rounded-sm bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-[0.2em] cursor-pointer"
            title="Tachado (~texto~)"
          >
            <span className="line-through font-black">S</span>
          </button>
          <button
            type="button"
            onClick={() => wrapSelection("`")}
            className="px-3 py-2 rounded-sm bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-[0.2em] cursor-pointer"
            title="Monoespacio (`texto`)"
          >
            <span className="font-mono font-black">{"</>"}</span>
          </button>
          <button
            type="button"
            onClick={() => insertAtCursor("\n")}
            className="px-3 py-2 rounded-sm bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-[0.2em] cursor-pointer"
            title="Salto de línea"
          >
            ↵
          </button>

          {/* Emoji picker */}
          <div className="relative" ref={emojiPanelRef}>
            <button
              type="button"
              onClick={() => setEmojiOpen((v) => !v)}
              className="px-3 py-2 rounded-sm bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-[0.2em] cursor-pointer"
              title="Insertar emoji"
            >
              😊
            </button>
            {emojiOpen && (
              <div className="absolute z-40 mt-2 w-64 rounded-sm border border-slate-200 bg-white shadow-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    Emojis
                  </span>
                  <button
                    type="button"
                    onClick={() => setEmojiOpen(false)}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    title="Cerrar"
                  >
                    <i className="fas fa-times" />
                  </button>
                </div>
                <div className="grid grid-cols-8 gap-2">
                  {EMOJIS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => {
                        insertAtCursor(em);
                        setEmojiOpen(false);
                      }}
                      className="h-8 w-8 rounded-sm bg-slate-50 hover:bg-slate-100 active:scale-95 transition cursor-pointer flex items-center justify-center text-base"
                      title={em}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Editor WYSIWYG muy básico basado en contentEditable */}
        <div
          ref={editorRef}
          contentEditable
          onInput={handleEditorInput}
          className="min-h-[220px] w-full rounded-sm border border-slate-200 p-3 text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none whitespace-pre-wrap break-words"
          spellCheck={false}
        />

        <p className="mt-1 text-[10px] text-slate-400">
          El texto se envía tal cual lo ves aquí. WhatsApp aplicará formato a
          *negrita*, _cursiva_, ~tachado~ y `monoespacio`.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handleCopiar}
          className="py-3 rounded-sm bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 cursor-pointer"
        >
          <i className="fas fa-copy" />
          Copiar texto
        </button>
        <button
          type="button"
          onClick={handleAbrirWhatsapp}
          className="py-3 rounded-sm bg-emerald-500 text-white text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-95 transition-transform"
        >
          <i className="fab fa-whatsapp" />
          Abrir WhatsApp
        </button>
      </div>
    </section>
  );
}
