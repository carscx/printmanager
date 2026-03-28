import { useState, useEffect, useMemo, useRef } from "react";
import type {
  Insumo,
  InsumoInput,
  InsumoCategoria,
  InsumoUnidad
} from "../../types/insumo";
import {
  INSUMO_CATEGORIAS,
  INSUMO_CATEGORIA_LABELS,
  INSUMO_UNIDADES,
  INSUMO_UNIDAD_LABELS
} from "../../types/insumo";
import { ActionSheet, ActionSheetTrigger } from "../ui/ActionSheet";
import { showToast } from "../ui/Toast";
import { ProductosAfectadosPanel } from "./ProductosAfectadosPanel";
import {
  etiquetaMinimoCategoria,
  etiquetaPrecioBulto,
  etiquetaStockCategoria
} from "../../utils/insumoStockHuman";
import {
  RENDIMIENTO_MAESTRO_ESPIRAL,
  RENDIMIENTO_MAESTRO_PAPEL,
  RENDIMIENTO_MAESTRO_TINTA,
  RENDIMIENTO_MAESTRO_TONER,
  ML_POR_LITRO_TINTA,
  rendimientoEfectivoInsumo
} from "../../services/bomCosto";
import { formatCurrency } from "../../utils/formatters";
import { InsumoValidacionError } from "../../utils/insumoValidacion";

interface InsumoFormProps {
  insumo?: Insumo | null;
  onSave: (data: InsumoInput) => Promise<void>;
  onCancel: () => void;
  /** Ocultar del catálogo sin borrar (referencias históricas) */
  onDesactivar?: () => Promise<void>;
  onReactivar?: () => Promise<void>;
  /** Abre confirmación de borrado físico (padre). */
  onDeleteFisico?: () => void;
}

const CATEGORIAS_CON_MEDIDA: InsumoCategoria[] = ["espiral"];
const CATEGORIAS_CON_COLOR: InsumoCategoria[] = [
  "espiral",
  "tapa_color",
  "tinta",
  "toner"
];
const CATEGORIAS_CON_PAPEL: InsumoCategoria[] = ["papel"];
const CATEGORIAS_COMPRA_SIMPLE: InsumoCategoria[] = ["papel", "tinta", "toner"];
/** Espiral y tapas: rendimiento / contenido del lote debe ser > 1 unidad. */
const CATEGORIAS_RENDIMIENTO_OBLIGA_CONTENIDO: InsumoCategoria[] = [
  "espiral",
  "tapa_transparente",
  "tapa_color"
];
const CATEGORIAS_CON_HOJAS: InsumoCategoria[] = ["papel"];

/** Rendimiento fijado por maestro (SQL + motor de costos); no editable salvo papel (hojas/resma). */
const CATEGORIAS_RENDIMIENTO_MAESTRO: InsumoCategoria[] = [
  "toner",
  "tinta",
  "espiral"
];

function rendimientoMaestroNum(cat: InsumoCategoria): number | null {
  switch (cat) {
    case "papel":
      return RENDIMIENTO_MAESTRO_PAPEL;
    case "toner":
      return RENDIMIENTO_MAESTRO_TONER;
    case "tinta":
      return RENDIMIENTO_MAESTRO_TINTA;
    case "espiral":
      return RENDIMIENTO_MAESTRO_ESPIRAL;
    default:
      return null;
  }
}

function stockHumanDesdeDb(ins: Insumo, key: "stock_actual" | "stock_minimo"): string {
  const v = Number(ins[key]) || 0;
  if (ins.categoria === "tinta") {
    return String(v);
  }
  if (ins.categoria === "papel" || ins.categoria === "toner") {
    const r = rendimientoEfectivoInsumo(ins);
    if (r <= 0) return "0";
    return String(v / r);
  }
  return String(v);
}

const DEFAULT_UNIDAD: Record<string, InsumoUnidad> = {
  espiral: "unidad",
  tapa_transparente: "unidad",
  tapa_color: "unidad",
  papel: "resma",
  tinta: "litro",
  toner: "cartucho",
  bolsa: "unidad",
  bolsa_propileno: "unidad",
  clip: "unidad",
  otro: "unidad"
};

const OPTS_CAT = INSUMO_CATEGORIAS.map((c) => ({
  value: c,
  label: INSUMO_CATEGORIA_LABELS[c]
}));
const OPTS_UNIDAD = INSUMO_UNIDADES.map((u) => ({
  value: u,
  label: INSUMO_UNIDAD_LABELS[u]
}));

export function InsumoForm({
  insumo,
  onSave,
  onCancel,
  onDesactivar,
  onReactivar,
  onDeleteFisico
}: InsumoFormProps) {
  const isEdit = !!insumo;

  const [categoria, setCategoria] = useState<InsumoCategoria>(
    insumo?.categoria ?? "espiral"
  );
  const [nombre, setNombre] = useState(insumo?.nombre ?? "");
  const [unidad, setUnidad] = useState<InsumoUnidad>(
    insumo?.unidad ?? "unidad"
  );
  const [medidaMm, setMedidaMm] = useState<string>(
    insumo?.medida_mm?.toString() ?? ""
  );
  const [rangoAnillado, setRangoAnillado] = useState<string>(
    insumo?.rango_anillado ?? ""
  );
  const [color, setColor] = useState(insumo?.color ?? "");
  const [tipoPapel, setTipoPapel] = useState(insumo?.tipo_papel ?? "");
  const [rendimiento, setRendimiento] = useState<string>(() => {
    const cat = insumo?.categoria ?? "espiral";
    if (cat === "papel") {
      const uve =
        insumo?.unidad_venta_equivalente ??
        insumo?.hojas_por_unidad ??
        insumo?.rendimiento;
      if (uve != null && Number(uve) > 0) return String(Math.round(Number(uve)));
      return String(RENDIMIENTO_MAESTRO_PAPEL);
    }
    const m = rendimientoMaestroNum(cat);
    if (m != null) return String(m);
    return insumo?.rendimiento != null ? String(insumo.rendimiento) : "";
  });
  const [precioCompra, setPrecioCompra] = useState<string>(
    insumo?.precio_compra?.toString() ?? "0"
  );
  const [equivVenta, setEquivVenta] = useState<string>(() => {
    const cat = insumo?.categoria ?? "espiral";
    if (cat === "papel") {
      const uve =
        insumo?.unidad_venta_equivalente ??
        insumo?.hojas_por_unidad ??
        insumo?.rendimiento;
      if (uve != null && Number(uve) > 0) return String(Math.round(Number(uve)));
      return String(RENDIMIENTO_MAESTRO_PAPEL);
    }
    const m = rendimientoMaestroNum(cat);
    if (m != null) return String(m);
    if (insumo?.unidad_venta_equivalente != null)
      return String(insumo.unidad_venta_equivalente);
    if (insumo?.rendimiento != null) return String(insumo.rendimiento);
    if (insumo?.hojas_por_unidad != null) return String(insumo.hojas_por_unidad);
    return "1";
  });
  const [stockActual, setStockActual] = useState<string>(() =>
    insumo ? stockHumanDesdeDb(insumo, "stock_actual") : "0"
  );
  const [stockMinimo, setStockMinimo] = useState<string>(() =>
    insumo ? stockHumanDesdeDb(insumo, "stock_minimo") : "0"
  );
  const [saving, setSaving] = useState(false);
  const [sheetCat, setSheetCat] = useState(false);
  const [sheetUnidad, setSheetUnidad] = useState(false);
  const prevCategoriaRef = useRef(categoria);

  // Auto-set unidad cuando cambia categoría (solo en creación)
  useEffect(() => {
    if (!isEdit) {
      setUnidad(DEFAULT_UNIDAD[categoria] ?? "unidad");
    }
  }, [categoria, isEdit]);

  /** Maestros de rendimiento (tóner/tinta/espiral). Papel: solo default al pasar a “papel” en alta. */
  useEffect(() => {
    if (categoria === "papel") {
      if (!isEdit && prevCategoriaRef.current !== "papel") {
        setEquivVenta(String(RENDIMIENTO_MAESTRO_PAPEL));
      }
      prevCategoriaRef.current = categoria;
      return;
    }
    prevCategoriaRef.current = categoria;
    if (categoria === "toner") {
      setRendimiento(String(RENDIMIENTO_MAESTRO_TONER));
      setEquivVenta(String(RENDIMIENTO_MAESTRO_TONER));
    } else if (categoria === "tinta") {
      setRendimiento(String(RENDIMIENTO_MAESTRO_TINTA));
      setEquivVenta(String(RENDIMIENTO_MAESTRO_TINTA));
    } else if (categoria === "espiral") {
      setRendimiento(String(RENDIMIENTO_MAESTRO_ESPIRAL));
      setEquivVenta(String(RENDIMIENTO_MAESTRO_ESPIRAL));
    } else if (!isEdit) {
      setEquivVenta((v) =>
        v === "500" ||
          v === "1800" ||
          v === "30000" ||
          v === "30" ||
          v === "25" ||
          v === "50"
          ? "1"
          : v
      );
    }
  }, [categoria, isEdit]);

  useEffect(() => {
    if (isEdit) return;
    setStockActual("0");
    setStockMinimo("0");
  }, [categoria, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      showToast("EL NOMBRE ES OBLIGATORIO", "error");
      return;
    }

    let rendimientoOut: number;
    if (categoria === "papel") {
      const ev = parseFloat(equivVenta.replace(",", "."));
      const hojas = Number.isFinite(ev) && ev > 0 ? Math.round(ev) : RENDIMIENTO_MAESTRO_PAPEL;
      if (hojas < 1 || hojas > 100_000) {
        showToast(
          "HOJAS POR RESMA: INDICÁ UN VALOR ENTRE 1 Y 100000 (EJ. 500, 100, 20)",
          "error"
        );
        return;
      }
      rendimientoOut = hojas;
    } else if (categoria === "tinta") {
      rendimientoOut = RENDIMIENTO_MAESTRO_TINTA;
    } else if (categoria === "toner") {
      rendimientoOut = RENDIMIENTO_MAESTRO_TONER;
    } else if (categoria === "espiral") {
      rendimientoOut = RENDIMIENTO_MAESTRO_ESPIRAL;
    } else {
      const ev = parseFloat(equivVenta.replace(",", "."));
      const rn = parseInt(rendimiento, 10);
      if (Number.isFinite(ev) && ev > 0) rendimientoOut = Math.max(1, ev);
      else if (Number.isFinite(rn) && rn > 0) rendimientoOut = rn;
      else rendimientoOut = 1;
    }

    if (
      CATEGORIAS_RENDIMIENTO_OBLIGA_CONTENIDO.includes(categoria) &&
      rendimientoOut <= 1
    ) {
      showToast(
        "INDICÁ EL RENDIMIENTO REAL DEL LOTE (CONTENIDO > 1 UNIDAD)",
        "error"
      );
      return;
    }

    const precioNum = parseFloat(precioCompra.replace(",", ".")) || 0;
    if (precioNum <= 0) {
      showToast("EL COSTO BASE (COMPRA) DEBE SER MAYOR QUE 0", "error");
      return;
    }

    let stAct = parseFloat(stockActual.replace(",", ".")) || 0;
    let stMin = parseFloat(stockMinimo.replace(",", ".")) || 0;
    if (!Number.isFinite(stAct) || stAct < 0) {
      showToast("STOCK ACTUAL INVÁLIDO", "error");
      return;
    }
    if (!Number.isFinite(stMin) || stMin < 0) {
      showToast("STOCK MÍNIMO INVÁLIDO", "error");
      return;
    }

    if (categoria === "papel") {
      stAct *= rendimientoOut;
      stMin *= rendimientoOut;
    } else if (categoria === "toner") {
      stAct *= RENDIMIENTO_MAESTRO_TONER;
      stMin *= RENDIMIENTO_MAESTRO_TONER;
    }
    /** Tinta: stock en ml en BD (sin × rendimiento). */

    const unidadOut: InsumoUnidad = CATEGORIAS_COMPRA_SIMPLE.includes(categoria)
      ? (DEFAULT_UNIDAD[categoria] as InsumoUnidad)
      : unidad;

    setSaving(true);
    try {
      await onSave({
        categoria,
        nombre: nombre.trim(),
        unidad: unidadOut,
        medida_mm: CATEGORIAS_CON_MEDIDA.includes(categoria)
          ? parseInt(medidaMm) || null
          : null,
        rango_anillado:
          categoria === "espiral" && rangoAnillado.trim()
            ? rangoAnillado.trim()
            : null,
        color:
          CATEGORIAS_CON_COLOR.includes(categoria) && color.trim()
            ? color.trim()
            : null,
        tipo_papel:
          CATEGORIAS_CON_PAPEL.includes(categoria) && tipoPapel.trim()
            ? tipoPapel.trim()
            : null,
        rendimiento: rendimientoOut,
        hojas_por_unidad: CATEGORIAS_CON_HOJAS.includes(categoria)
          ? rendimientoOut
          : null,
        precio_compra: precioNum,
        costo_base: precioNum,
        costo_compra: precioNum,
        unidades_por_compra: rendimientoOut,
        unidad_medida: unidadOut,
        unidad_venta_equivalente: rendimientoOut,
        stock_actual: stAct,
        stock_minimo: stMin,
        activo: true,
        updated_by: null
      });
    } catch (e) {
      if (e instanceof InsumoValidacionError) {
        showToast(
          "VALOR DE STOCK O PRECIO FUERA DE RANGO — REVISÁ LAS CANTIDADES",
          "error"
        );
      } else {
        showToast("NO SE PUDO GUARDAR", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const showMedida = CATEGORIAS_CON_MEDIDA.includes(categoria);
  const showColor = CATEGORIAS_CON_COLOR.includes(categoria);
  const showPapel = CATEGORIAS_CON_PAPEL.includes(categoria);
  const compraSimple = CATEGORIAS_COMPRA_SIMPLE.includes(categoria);
  const showContenidoGenerico =
    !["papel", "tinta", "toner", "espiral"].includes(categoria);

  const rendimientoDistintoAlMaestro =
    isEdit &&
    insumo &&
    CATEGORIAS_RENDIMIENTO_MAESTRO.includes(categoria) &&
    rendimientoMaestroNum(categoria) != null &&
    Number(insumo.rendimiento) !== rendimientoMaestroNum(categoria);

  const hojasPapelPreview =
    categoria === "papel"
      ? (() => {
          const ev = parseFloat(equivVenta.replace(",", ".")) || 0;
          return Number.isFinite(ev) && ev > 0
            ? Math.round(ev)
            : RENDIMIENTO_MAESTRO_PAPEL;
        })()
      : RENDIMIENTO_MAESTRO_PAPEL;

  const equivalenciaCompra = useMemo(() => {
    if (!compraSimple) return null;
    const precio = parseFloat(precioCompra.replace(",", ".")) || 0;
    const cant = parseFloat(stockActual.replace(",", ".")) || 0;
    if (precio <= 0 || cant < 0) return null;
    if (categoria === "papel") {
      const h = hojasPapelPreview;
      const u = cant * h;
      const cu = precio / h;
      return { unidades: u, cu, detalle: "hojas" as const };
    }
    if (categoria === "toner") {
      const r = RENDIMIENTO_MAESTRO_TONER;
      const u = cant * r;
      const cu = precio / r;
      return { unidades: u, cu, detalle: "carillas" as const };
    }
    if (categoria === "tinta") {
      const ml = cant;
      const cu = precio / ML_POR_LITRO_TINTA;
      return { unidades: ml, cu, detalle: "ml" as const };
    }
    return null;
  }, [compraSimple, categoria, precioCompra, stockActual, hojasPapelPreview]);

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] italic">
        {isEdit ? "Editar Insumo" : "Nuevo Insumo"}
      </h2>

      {isEdit && insumo && <ProductosAfectadosPanel insumoId={insumo.id} />}

      {/* Categoría + Unidad */}
      <div className="grid grid-cols-2 gap-3">
        <div className={isEdit ? "opacity-60 pointer-events-none" : ""}>
          <ActionSheetTrigger
            label="Categoría"
            displayValue={INSUMO_CATEGORIA_LABELS[categoria]}
            onClick={() => !isEdit && setSheetCat(true)}
            disabled={isEdit}
          />
        </div>
        {compraSimple ? (
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
              Unidad de compra
            </label>
            <p className="w-full p-3 bg-slate-50 rounded-sm font-bold text-sm border border-slate-100 text-slate-600">
              {INSUMO_UNIDAD_LABELS[DEFAULT_UNIDAD[categoria] as InsumoUnidad]}
            </p>
          </div>
        ) : (
          <ActionSheetTrigger
            label="Unidad"
            displayValue={INSUMO_UNIDAD_LABELS[unidad]}
            onClick={() => setSheetUnidad(true)}
          />
        )}
      </div>

      {/* Nombre */}
      <div className="space-y-1">
        <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
          Nombre <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Espiral 12mm Negro"
          required
          className="w-full p-3 bg-slate-50 rounded-sm font-bold border border-slate-100 focus:ring-2 focus:ring-blue-100 outline-none"
        />
      </div>

      {/* Campos condicionales */}
      <div className="grid grid-cols-2 gap-3">
        {showMedida && (
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
              Medida (mm)
            </label>
            <input
              type="number"
              value={medidaMm}
              onChange={(e) => setMedidaMm(e.target.value)}
              placeholder="12"
              className="w-full p-3 bg-slate-50 rounded-sm font-bold border border-slate-100 outline-none"
            />
          </div>
        )}
        {categoria === "espiral" && (
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
              Rango (tarifa)
            </label>
            <select
              value={rangoAnillado}
              onChange={(e) => setRangoAnillado(e.target.value)}
              className="w-full p-3 bg-slate-50 rounded-sm font-bold border border-slate-100 outline-none cursor-pointer"
            >
              <option value="">Coincide con tarifa (opcional)</option>
              <option value="Chico">Chico</option>
              <option value="Mediano">Mediano</option>
              <option value="Grande">Grande</option>
            </select>
          </div>
        )}
        {showColor && (
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
              Color
            </label>
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Negro, Azul..."
              className="w-full p-3 bg-slate-50 rounded-sm font-bold border border-slate-100 outline-none"
            />
          </div>
        )}
        {showPapel && (
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
              Tipo de papel
            </label>
            <input
              type="text"
              value={tipoPapel}
              onChange={(e) => setTipoPapel(e.target.value)}
              placeholder="A4 75g"
              className="w-full p-3 bg-slate-50 rounded-sm font-bold border border-slate-100 outline-none"
            />
          </div>
        )}
      </div>

      {compraSimple && categoria !== "tinta" && categoria !== "papel" && (
        <p className="text-[9px] text-slate-500 font-semibold leading-snug -mt-1">
          Cargá bultos y precio de esa compra. El sistema convierte a carillas
          (tóner) según el maestro.
        </p>
      )}
      {compraSimple && categoria === "papel" && (
        <p className="text-[9px] text-slate-500 font-semibold leading-snug -mt-1">
          Indicá <strong>hojas por resma</strong> abajo. El stock en depósito se
          guarda en <strong>hojas</strong> (resmas × hojas/resma).
        </p>
      )}
      {compraSimple && categoria === "tinta" && (
        <p className="text-[9px] text-slate-500 font-semibold leading-snug -mt-1">
          <strong>Tinta:</strong> stock en <strong>ml</strong> en depósito;{" "}
          <strong>precio por litro</strong> de compra ($15.000 = un litro). El valor
          del inventario = (ml ÷ 1000) × precio litro. El maestro{" "}
          <strong>
            {RENDIMIENTO_MAESTRO_TINTA} páginas por ml
          </strong>{" "}
          (conservador) aplica al costo de impresión y al descuento de stock por
          pedido; no cambia el valor de inventario en ml.
        </p>
      )}

      {categoria === "papel" && (
        <div className="rounded-sm border border-amber-300 bg-amber-50/50 px-3 py-3 space-y-2">
          <label className="text-[10px] font-black text-amber-900 ml-0.5 uppercase">
            Hojas por resma (o paquete) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={1}
            max={100000}
            step={1}
            value={equivVenta}
            onChange={(e) => {
              const v = e.target.value;
              setEquivVenta(v);
              setRendimiento(v);
            }}
            className="w-full max-w-[220px] p-3 bg-white rounded-sm font-black text-amber-950 border border-amber-200 outline-none"
          />
          <p className="text-[9px] text-amber-800 font-semibold leading-snug">
            Típico: <strong>500</strong> hojas. Especiales: <strong>100</strong>,{" "}
            <strong>20</strong>, etc. El precio de compra es por{" "}
            <strong>resma/paquete</strong>; costo/hoja = precio ÷ hojas.
          </p>
        </div>
      )}

      {CATEGORIAS_RENDIMIENTO_MAESTRO.includes(categoria) && (
        <div className="space-y-2">
          {rendimientoDistintoAlMaestro && insumo && (
            <div className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-950 leading-snug">
              <i className="fas fa-triangle-exclamation mr-1" />
              En la base este insumo tiene rendimiento{" "}
              <strong>{insumo.rendimiento}</strong>. Al guardar se reemplazará por el
              maestro <strong>{rendimientoMaestroNum(categoria)}</strong> para que
              costos y stock sigan las reglas del sistema.
            </div>
          )}
          <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-1">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-wide">
              Rendimiento (maestro — no editable)
            </p>
            <p className="text-sm font-black text-slate-900">
              {categoria === "toner" && (
                <>
                  {RENDIMIENTO_MAESTRO_TONER}{" "}
                  <span className="text-slate-600 font-bold text-xs">
                    páginas por cartucho
                  </span>
                </>
              )}
              {categoria === "tinta" && (
                <>
                  {RENDIMIENTO_MAESTRO_TINTA}{" "}
                  <span className="text-slate-600 font-bold text-xs">
                    páginas impresas por ml (costo de impresión; stock en ml)
                  </span>
                </>
              )}
              {categoria === "espiral" && (
                <>
                  {RENDIMIENTO_MAESTRO_ESPIRAL}{" "}
                  <span className="text-slate-600 font-bold text-xs">
                    unidades por paquete (lote estándar)
                  </span>
                </>
              )}
            </p>
            <p className="text-[9px] text-slate-600 font-semibold leading-snug">
              Valor fijado por el sistema (misma base que SQL y reglas de negocio). No
              se puede cambiar acá para evitar errores de costo (ej. espiral con
              rendimiento 100 por accidente).
            </p>
          </div>
        </div>
      )}

      {/* Costo base + Stock */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
            {compraSimple ? etiquetaPrecioBulto(categoria) : "Costo base (compra)"}{" "}
            <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={precioCompra}
            onChange={(e) => setPrecioCompra(e.target.value)}
            className="w-full p-3 bg-slate-50 rounded-sm font-black text-green-700 border border-slate-100 outline-none"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
            {compraSimple ? etiquetaStockCategoria(categoria) : "Stock actual"}{" "}
            <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={stockActual}
            onChange={(e) => setStockActual(e.target.value)}
            className="w-full p-3 bg-slate-50 rounded-sm font-black text-blue-700 border border-slate-100 outline-none"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
            {compraSimple
              ? etiquetaMinimoCategoria(categoria)
              : "Stock mínimo"}{" "}
            <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={stockMinimo}
            onChange={(e) => setStockMinimo(e.target.value)}
            className="w-full p-3 bg-slate-50 rounded-sm font-black text-amber-700 border border-slate-100 outline-none"
            required
          />
        </div>
      </div>

      {compraSimple && equivalenciaCompra && (
        <p className="text-[10px] text-slate-600 font-semibold leading-snug rounded-sm bg-slate-50 border border-slate-100 px-3 py-2">
          {categoria === "tinta" ? (
            <>
              <strong>
                {equivalenciaCompra.unidades.toLocaleString("es-AR", {
                  maximumFractionDigits: 1
                })}
              </strong>{" "}
              ml en depósito · costo{" "}
              <strong>{formatCurrency(equivalenciaCompra.cu)}</strong> por ml (precio
              litro ÷ 1000).
            </>
          ) : (
            <>
              Esto equivale a{" "}
              <strong>
                {equivalenciaCompra.unidades.toLocaleString("es-AR", {
                  maximumFractionDigits: 1
                })}
              </strong>{" "}
              unidades de consumo ({equivalenciaCompra.detalle}) a un costo de{" "}
              <strong>{formatCurrency(equivalenciaCompra.cu)}</strong> cada una.
            </>
          )}
        </p>
      )}

      {showContenidoGenerico && (
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
            Rendimiento / unidades por lote <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="1"
            min="1"
            value={equivVenta}
            onChange={(e) => setEquivVenta(e.target.value)}
            placeholder="1"
            className="w-full p-3 bg-slate-50 rounded-sm font-bold border border-slate-100 outline-none"
          />
          <p className="text-[9px] text-slate-400 font-semibold leading-snug">
            Costo real = costo compra ÷ rendimiento del lote. Papel, tóner, tinta y
            espiral usan maestros fijos en otra sección.
          </p>
        </div>
      )}

      {isEdit && insumo && (
        <div className="pt-1 space-y-2">
            {insumo.activo ? (
              onDesactivar && (
                <button
                  type="button"
                  onClick={() => void onDesactivar()}
                  className="w-full py-3 rounded-sm border border-amber-200 bg-amber-50 text-amber-900 text-[10px] font-black uppercase tracking-wider"
                >
                  Desactivar insumo (oculto del catálogo; datos históricos se conservan)
                </button>
              )
            ) : (
              onReactivar && (
                <button
                  type="button"
                  onClick={() => void onReactivar()}
                  className="w-full py-3 rounded-sm border border-emerald-200 bg-emerald-50 text-emerald-900 text-[10px] font-black uppercase tracking-wider"
                >
                  Reactivar insumo
                </button>
              )
            )}
            {onDeleteFisico && insumo.activo && (
              <button
                type="button"
                onClick={onDeleteFisico}
                className="w-full py-3 rounded-sm border border-red-200 bg-red-50 text-red-800 text-[10px] font-black uppercase tracking-wider"
              >
                Eliminar del sistema (borrado físico)
              </button>
            )}
          </div>
      )}

      {/* Botones */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-4 font-bold text-slate-400 text-sm cursor-pointer bg-slate-50 rounded-sm"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving || !nombre.trim()}
          className="flex-1 py-4 bg-blue-600 text-white font-black uppercase text-[10px] tracking-widest rounded-sm shadow-lg cursor-pointer disabled:opacity-50"
        >
          {saving ? (
            <>
              <i className="fas fa-circle-notch fa-spin mr-2" />
              Guardando...
            </>
          ) : isEdit ? (
            "Guardar Cambios"
          ) : (
            "Crear Insumo"
          )}
        </button>
      </div>
    </form>
    <ActionSheet
      open={sheetCat}
      onClose={() => setSheetCat(false)}
      title="Categoría"
      options={OPTS_CAT}
      value={categoria}
      onChange={(v) => setCategoria(v as InsumoCategoria)}
    />
    <ActionSheet
      open={sheetUnidad}
      onClose={() => setSheetUnidad(false)}
      title="Unidad"
      options={OPTS_UNIDAD}
      value={unidad}
      onChange={(v) => setUnidad(v as InsumoUnidad)}
    />
    </>
  );
}
