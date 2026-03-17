import { useEffect, useState } from "react";

interface ToastMessage {
  id: number;
  text: string;
  type: "success" | "error";
}

let addToastFn: ((text: string, type?: "success" | "error") => void) | null =
  null;

export function showToast(text: string, type: "success" | "error" = "success") {
  addToastFn?.(text, type);
}

let nextId = 0;

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    addToastFn = (text, type = "success") => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, text, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    };
    return () => {
      addToastFn = null;
    };
  }, []);

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-xs pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`p-4 mb-2 rounded-2xl shadow-2xl text-white font-black uppercase text-[10px] tracking-widest text-center animate-slide-in-bottom pointer-events-auto ${
            t.type === "success" ? "bg-green-500" : "bg-red-500"
          }`}
        >
          <i
            className={`fas ${t.type === "success" ? "fa-check-circle" : "fa-exclamation-triangle"} mr-2`}
          />
          {t.text}
        </div>
      ))}
    </div>
  );
}
