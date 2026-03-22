import { useEffect, useRef, useState, type ReactNode } from "react";

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

const DEFAULT_FOOTER = (
  <p className="mt-1 text-[10px] text-slate-400">
    El texto se envía tal cual lo ves aquí. WhatsApp aplicará formato a *negrita*,
    _cursiva_, ~tachado~ y `monoespacio`.
  </p>
);

export interface WhatsappMensajeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Texto de la cabecera sobre el editor */
  title?: string;
  /** `undefined`: pie por defecto (formato WA). `null`: sin pie. Otro: contenido custom. */
  footer?: ReactNode | null;
  className?: string;
  editorMinHeightClass?: string;
}

/**
 * Editor WYSIWYG básico (contentEditable + toolbar) usado en vista previa de WhatsApp por pedido
 * y en el formulario de plantillas.
 */
export function WhatsappMensajeEditor({
  value,
  onChange,
  title = "Mensaje (WYSIWYG básico)",
  footer,
  className = "",
  editorMinHeightClass = "min-h-[220px]"
}: WhatsappMensajeEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const emojiPanelRef = useRef<HTMLDivElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const handleEditorInput = (e: React.FormEvent<HTMLDivElement>) => {
    onChange(e.currentTarget.innerText);
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

    if (editorRef.current) onChange(editorRef.current.innerText);
  };

  const insertAtCursor = (text: string) => {
    focusEditor();
    const range = getEditorSelectionRange();
    if (!range) return;
    replaceRangeText(range, text);
    if (editorRef.current) onChange(editorRef.current.innerText);
  };

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerText !== value) {
      editorRef.current.innerText = value;
    }
  }, [value]);

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

  const footerNode =
    footer === undefined ? DEFAULT_FOOTER : footer === null ? null : footer;

  return (
    <div
      className={`bg-white rounded-sm shadow-sm border border-slate-100 p-4 space-y-3 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
          {title}
        </span>
        <span className="text-[9px] text-slate-400">
          Formato WhatsApp: * _ ~ `
        </span>
      </div>

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

      <div
        ref={editorRef}
        contentEditable
        onInput={handleEditorInput}
        className={`${editorMinHeightClass} w-full rounded-sm border border-slate-200 p-3 text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none whitespace-pre-wrap break-words`}
        spellCheck={false}
      />

      {footerNode}
    </div>
  );
}
