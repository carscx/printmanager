import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import type { SerieDiaria } from "../../services/rentabilidadReport";
import { formatCurrency } from "../../utils/formatters";

interface Props {
  data: SerieDiaria[];
}

function fmt(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`;
  return formatCurrency(v);
}

export function EvolucionRentabilidadChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <p className="text-center text-slate-400 text-sm py-8">
        Sin datos diarios en el período (o sin pedidos con totales).
      </p>
    );
  }

  return (
    <div className="w-full h-[280px] min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="fecha"
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => v.slice(5)}
          />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} width={48} />
          <Tooltip
            formatter={(value) =>
              formatCurrency(typeof value === "number" ? value : Number(value))
            }
            labelFormatter={(l) => `Fecha: ${l}`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="ingresos"
            name="Ingresos"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="costos"
            name="Costo total (insumos + comisiones)"
            stroke="#dc2626"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="ganancia"
            name="Ganancia neta"
            stroke="#16a34a"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
