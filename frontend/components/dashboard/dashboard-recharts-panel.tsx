import { DeferredResponsiveContainer } from "@/components/charts/deferred-responsive-container";
import { useChartTheme, useChartTooltipProps } from "@/lib/chart-theme";
import { useIsMobileChart } from "@/lib/use-media-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
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

export type DashboardDeskRow = {
  deskName: string;
  totalTickets: number;
};

type Props =
  | {
      kind: "chamados";
      data: DashboardBarRow[];
      chartType?: "bar" | "line" | "pie";
      deskData?: DashboardDeskRow[];
    }
  | { kind: "horas"; data: DashboardBarRow[] }
  | { kind: "alertas"; data: DashboardAlertRow[] };

const BAR_SERIES = [
  { key: "Infraestrutura", fill: "#4f8bd6" },
  { key: "Sistema", fill: "#d85c57" },
  { key: "NOC", fill: "#8c6fd1" },
  { key: "Rotinas", fill: "#9bc45b" },
  { key: "Consult", fill: "#ed7d31" },
] as const;

const PIE_COLORS = [
  "#4f8bd6",
  "#d85c57",
  "#8c6fd1",
  "#9bc45b",
  "#ed7d31",
  "#57c1d9",
  "#6b7280",
];

function chartMargins(compact: boolean) {
  return compact
    ? { top: 8, right: 4, left: -18, bottom: 56 }
    : { top: 8, right: 12, left: 0, bottom: 8 };
}

function legendProps(compact: boolean, tickColor: string) {
  return {
    verticalAlign: "bottom" as const,
    align: "center" as const,
    iconSize: compact ? 8 : 12,
    wrapperStyle: {
      color: tickColor,
      fontSize: compact ? 10 : 12,
      paddingTop: compact ? 8 : 4,
      lineHeight: 1.3,
    },
    formatter: (value: string) => (
      <span style={{ color: tickColor, fontSize: compact ? 10 : 12 }}>
        {value}
      </span>
    ),
  };
}

export function DashboardLazyChart(props: Props) {
  const compact = useIsMobileChart();
  const chartTheme = useChartTheme();
  const TOOLTIP_PROPS = useChartTooltipProps(chartTheme);
  const margins = chartMargins(compact);
  const legend = legendProps(compact, chartTheme.tick);
  const chartHeight = compact ? "min-h-[380px] h-[380px]" : "h-[360px]";

  if (props.kind === "alertas") {
    const data = props.data;
    const tiltLabels = compact || data.length > 4;

    return (
      <div className={chartHeight}>
        <DeferredResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={margins}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis
              dataKey="weekLabel"
              stroke={chartTheme.tick}
              tick={{ fill: chartTheme.tick, fontSize: compact ? 9 : 11 }}
              tickLine={{ stroke: chartTheme.tick }}
              axisLine={{ stroke: chartTheme.grid }}
              interval={compact ? "preserveStartEnd" : 0}
              angle={tiltLabels ? -35 : 0}
              textAnchor={tiltLabels ? "end" : "middle"}
              height={tiltLabels ? 52 : 30}
            />
            <YAxis
              width={compact ? 28 : 40}
              stroke={chartTheme.tick}
              tick={{ fill: chartTheme.tick, fontSize: compact ? 9 : 11 }}
              tickLine={{ stroke: chartTheme.tick }}
              axisLine={{ stroke: chartTheme.grid }}
            />
            <Tooltip {...TOOLTIP_PROPS} />
            <Legend {...legend} />
            <Line
              type="monotone"
              dataKey="High"
              stroke="#4f8bd6"
              strokeWidth={compact ? 1.5 : 2}
              dot={{ r: compact ? 3 : 5, strokeWidth: 2, fill: "#4f8bd6" }}
              activeDot={{ r: compact ? 5 : 6 }}
            />
            <Line
              type="monotone"
              dataKey="Disaster"
              stroke="#d85c57"
              strokeWidth={compact ? 1.5 : 2}
              dot={{ r: compact ? 3 : 5, strokeWidth: 2, fill: "#d85c57" }}
              activeDot={{ r: compact ? 5 : 6 }}
            />
          </LineChart>
        </DeferredResponsiveContainer>
      </div>
    );
  }

  const data = props.data;
  const chartType = props.kind === "chamados" ? props.chartType ?? "bar" : "bar";
  const deskData = props.kind === "chamados" ? props.deskData ?? [] : [];

  if (props.kind === "chamados" && chartType === "pie") {
    const pieRows =
      deskData.length > 0
        ? deskData.map((d) => ({ name: d.deskName, value: d.totalTickets }))
        : data.map((row) => ({ name: row.monthLabel, value: row.Total }));
    return (
      <div className={chartHeight}>
        <DeferredResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip {...TOOLTIP_PROPS} />
            <Legend {...legend} />
            <Pie
              data={pieRows}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="45%"
              outerRadius={compact ? 90 : 120}
              label={!compact}
            >
              {pieRows.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={PIE_COLORS[index % PIE_COLORS.length]}
                />
              ))}
            </Pie>
          </PieChart>
        </DeferredResponsiveContainer>
      </div>
    );
  }

  if (props.kind === "chamados" && chartType === "line") {
    return (
      <div className={chartHeight}>
        <DeferredResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={margins}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis
              dataKey="monthLabel"
              stroke={chartTheme.tick}
              tick={{ fill: chartTheme.tick, fontSize: compact ? 9 : 11 }}
              tickLine={{ stroke: chartTheme.tick }}
              axisLine={{ stroke: chartTheme.grid }}
            />
            <YAxis
              width={compact ? 28 : 40}
              stroke={chartTheme.tick}
              tick={{ fill: chartTheme.tick, fontSize: compact ? 9 : 11 }}
              tickLine={{ stroke: chartTheme.tick }}
              axisLine={{ stroke: chartTheme.grid }}
            />
            <Tooltip {...TOOLTIP_PROPS} />
            <Legend {...legend} />
            {BAR_SERIES.map((series) => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                stroke={series.fill}
                strokeWidth={compact ? 1.5 : 2}
                dot={{ r: compact ? 2 : 3 }}
              />
            ))}
          </LineChart>
        </DeferredResponsiveContainer>
      </div>
    );
  }

  return (
    <div className={chartHeight}>
      {compact ? (
        <p className="mb-2 text-center text-[10px] text-muted-foreground">
          Barras empilhadas no celular — detalhe completo na tabela acima.
        </p>
      ) : null}
      <DeferredResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={margins}
          barCategoryGap={compact ? "18%" : "20%"}
          barGap={compact ? 1 : 4}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
          <XAxis
            dataKey="monthLabel"
            stroke={chartTheme.tick}
            tick={{ fill: chartTheme.tick, fontSize: compact ? 9 : 11 }}
            tickLine={{ stroke: chartTheme.tick }}
            axisLine={{ stroke: chartTheme.grid }}
            interval={compact ? "preserveStartEnd" : 0}
            angle={compact ? -30 : 0}
            textAnchor={compact ? "end" : "middle"}
            height={compact ? 48 : 30}
          />
          <YAxis
            width={compact ? 28 : 40}
            stroke={chartTheme.tick}
            tick={{ fill: chartTheme.tick, fontSize: compact ? 9 : 11 }}
            tickLine={{ stroke: chartTheme.tick }}
            axisLine={{ stroke: chartTheme.grid }}
          />
          <Tooltip {...TOOLTIP_PROPS} />
          <Legend {...legend} />
          {compact ? (
            BAR_SERIES.map((series) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                stackId="mes"
                fill={series.fill}
                maxBarSize={32}
              />
            ))
          ) : (
            <>
              {BAR_SERIES.map((series) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  fill={series.fill}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
              ))}
              <Bar
                dataKey="Total"
                fill="#57c1d9"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              />
            </>
          )}
        </BarChart>
      </DeferredResponsiveContainer>
    </div>
  );
}
