"use client";

import { DeferredResponsiveContainer } from "@/components/charts/deferred-responsive-container";
import { useChartTheme, useChartTooltipProps } from "@/lib/chart-theme";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type DashboardBarRow = {
  monthKey: string;
  monthLabel: string;
  Infraestrutura: number;
  Sistema: number;
  NOC: number;
  Rotinas: number;
  Consult?: number;
  Total: number;
};

export type DashboardAlertRow = {
  weekKey: string;
  weekLabel: string;
  High: number;
  Disaster: number;
  Total: number;
};

type Props =
  | { kind: "chamados"; data: DashboardBarRow[] }
  | { kind: "horas"; data: DashboardBarRow[] }
  | { kind: "alertas"; data: DashboardAlertRow[] };

export function DashboardLazyChart(props: Props) {
  const chartTheme = useChartTheme();
  const TOOLTIP_PROPS = useChartTooltipProps(chartTheme);

  if (props.kind === "alertas") {
    const data = props.data;
    return (
      <div className="h-[360px]">
        <DeferredResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis
              dataKey="weekLabel"
              stroke={chartTheme.tick}
              tick={{ fill: chartTheme.tick, fontSize: 11 }}
              tickLine={{ stroke: chartTheme.tick }}
              axisLine={{ stroke: chartTheme.grid }}
              interval={0}
              angle={data.length > 4 ? -25 : 0}
              textAnchor={data.length > 4 ? "end" : "middle"}
              height={data.length > 4 ? 56 : 30}
            />
            <YAxis
              stroke={chartTheme.tick}
              tick={{ fill: chartTheme.tick }}
              tickLine={{ stroke: chartTheme.tick }}
              axisLine={{ stroke: chartTheme.grid }}
            />
            <Tooltip {...TOOLTIP_PROPS} />
            <Legend
              wrapperStyle={{ color: chartTheme.tick }}
              formatter={(value: string) => (
                <span style={{ color: chartTheme.tick }}>{value}</span>
              )}
            />
            <Line
              type="monotone"
              dataKey="High"
              stroke="#4f8bd6"
              strokeWidth={2}
              dot={{ r: 5, strokeWidth: 2, fill: "#4f8bd6" }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="Disaster"
              stroke="#d85c57"
              strokeWidth={2}
              dot={{ r: 5, strokeWidth: 2, fill: "#d85c57" }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </DeferredResponsiveContainer>
      </div>
    );
  }

  const data = props.data;
  return (
    <div className="h-[360px]">
      <DeferredResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
          <XAxis
            dataKey="monthLabel"
            stroke={chartTheme.tick}
            tick={{ fill: chartTheme.tick }}
            tickLine={{ stroke: chartTheme.tick }}
            axisLine={{ stroke: chartTheme.grid }}
          />
          <YAxis
            stroke={chartTheme.tick}
            tick={{ fill: chartTheme.tick }}
            tickLine={{ stroke: chartTheme.tick }}
            axisLine={{ stroke: chartTheme.grid }}
          />
          <Tooltip {...TOOLTIP_PROPS} />
          <Legend
            wrapperStyle={{ color: chartTheme.tick }}
            formatter={(value: string) => (
              <span style={{ color: chartTheme.tick }}>{value}</span>
            )}
          />
          <Bar dataKey="Infraestrutura" fill="#4f8bd6" radius={[6, 6, 0, 0]} />
          <Bar dataKey="Sistema" fill="#d85c57" radius={[6, 6, 0, 0]} />
          <Bar dataKey="NOC" fill="#8c6fd1" radius={[6, 6, 0, 0]} />
          <Bar dataKey="Rotinas" fill="#9bc45b" radius={[6, 6, 0, 0]} />
          <Bar dataKey="Consult" fill="#ed7d31" radius={[6, 6, 0, 0]} />
          <Bar dataKey="Total" fill="#57c1d9" radius={[6, 6, 0, 0]} />
        </BarChart>
      </DeferredResponsiveContainer>
    </div>
  );
}
