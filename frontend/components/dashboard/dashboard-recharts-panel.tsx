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

/** Campos fixos mais uma chave por mesa ("Projetos", "NOC"...). */
export type DashboardBarRow = {
  monthKey: string;
  monthLabel: string;
  Total: number;
  [deskName: string]: string | number;
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
      /** Mesas a desenhar, na ordem. Sem isso, nenhuma série aparece. */
      deskNames: string[];
    }
  | {
      kind: "horas";
      data: DashboardBarRow[];
      chartType?: "bar" | "line";
      deskNames: string[];
    }
  | {
      kind: "alertas";
      data: DashboardAlertRow[];
      chartType?: "bar" | "line";
    };

/**
 * Cores das mesas. As cinco primeiras são as que o dashboard já usava,
 * então quem está acostumado com Infraestrutura azul continua vendo azul.
 */
const DESK_PALETTE = [
  "#4f8bd6",
  "#d85c57",
  "#8c6fd1",
  "#9bc45b",
  "#ed7d31",
  // Nada de #57c1d9 aqui: é a cor da barra "Total" no gráfico de barras.
  "#e0699a",
  "#c9a227",
  "#4bb894",
  "#a0522d",
  "#7b8794",
] as const;

/** Cores herdadas, para a mesa não mudar de cor ao lado de outra nova. */
const CORES_FIXAS: Record<string, string> = {
  Infraestrutura: "#4f8bd6",
  Sistema: "#d85c57",
  Sistemas: "#d85c57",
  NOC: "#8c6fd1",
  Rotinas: "#9bc45b",
  Consult: "#ed7d31",
};

/**
 * Cor de cada mesa exibida. A mesa conhecida mantém a cor de sempre; a
 * nova pega a próxima cor livre da paleta, sem repetir no mesmo gráfico.
 */
function buildDeskSeries(
  deskNames: string[],
): Array<{ key: string; fill: string }> {
  const usadas = new Set<string>();
  const series = deskNames.map((key) => {
    const fixa = CORES_FIXAS[key];
    if (fixa && !usadas.has(fixa)) {
      usadas.add(fixa);
      return { key, fill: fixa };
    }
    return { key, fill: "" };
  });

  let proxima = 0;
  for (const item of series) {
    if (item.fill) continue;
    while (
      proxima < DESK_PALETTE.length &&
      usadas.has(DESK_PALETTE[proxima])
    ) {
      proxima += 1;
    }
    const cor = DESK_PALETTE[proxima % DESK_PALETTE.length];
    usadas.add(cor);
    proxima += 1;
    item.fill = cor;
  }

  return series;
}

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
  const deskSeries = buildDeskSeries(
    props.kind === "alertas" ? [] : props.deskNames,
  );

  if (props.kind === "alertas") {
    const data = props.data;
    const tiltLabels = compact || data.length > 4;
    const alertChartType = props.chartType === "bar" ? "bar" : "line";
    const ChartCmp = alertChartType === "bar" ? BarChart : LineChart;

    return (
      <div className={chartHeight}>
        <DeferredResponsiveContainer width="100%" height="100%">
          <ChartCmp data={data} margin={margins}>
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
            {alertChartType === "bar" ? (
              <>
                <Bar dataKey="High" fill="#4f8bd6" radius={[4, 4, 0, 0]} maxBarSize={48} />
                <Bar dataKey="Disaster" fill="#d85c57" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </>
            ) : (
              <>
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
              </>
            )}
          </ChartCmp>
        </DeferredResponsiveContainer>
      </div>
    );
  }

  const data = props.data;
  const chartType =
    props.kind === "chamados"
      ? props.chartType ?? "bar"
      : props.chartType === "line"
        ? "line"
        : "bar";
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

  if (
    (props.kind === "chamados" || props.kind === "horas") &&
    chartType === "line"
  ) {
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
            {deskSeries.map((series) => (
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
            deskSeries.map((series) => (
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
              {deskSeries.map((series) => (
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
