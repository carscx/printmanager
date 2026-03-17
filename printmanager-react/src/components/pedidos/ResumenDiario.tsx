import type { ResumenResult } from "../../hooks/useResumen";
import { formatCurrency } from "../../utils/formatters";

interface ResumenDiarioProps {
  resumen: ResumenResult;
}

export function ResumenDiario({ resumen }: ResumenDiarioProps) {
  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
      <h2 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-4 italic text-center leading-none">
        Resumen Hoy
      </h2>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-blue-50 p-3 rounded-xl text-center border border-blue-100">
          <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest leading-none mb-1">
            Cobrado
          </p>
          <p className="text-lg font-black text-blue-700 leading-none">
            {formatCurrency(resumen.total)}
          </p>
        </div>
        <div className="bg-purple-50 p-3 rounded-xl text-center border border-purple-100">
          <p className="text-[8px] font-black text-purple-400 uppercase tracking-widest leading-none mb-1">
            Avru
          </p>
          <p className="text-lg font-black text-purple-700 leading-none">
            {formatCurrency(resumen.comisionTotal)}
          </p>
        </div>
      </div>
      <div className="bg-green-50 p-4 rounded-2xl text-center border border-green-100">
        <p className="text-[9px] font-black text-green-400 uppercase mb-1 tracking-widest leading-none">
          Ganancia Neta Moni
        </p>
        <p className="text-2xl font-black text-green-700 leading-none">
          {formatCurrency(resumen.gananciaLimpia)}
        </p>
      </div>
    </div>
  );
}
