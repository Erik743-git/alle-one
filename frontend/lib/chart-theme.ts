"use client";

import { useMemo } from "react";
import { useIsDarkMode } from "@/lib/use-app-theme";

export type ChartTheme = {
  grid: string;
  tick: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
};

export function getChartTheme(isDarkMode: boolean): ChartTheme {
  if (isDarkMode) {
    return {
      grid: "rgba(255,255,255,0.12)",
      tick: "rgba(226,232,240,0.88)",
      tooltipBg: "#020b1b",
      tooltipBorder: "rgba(255,255,255,0.12)",
      tooltipText: "rgba(226,232,240,0.95)",
    };
  }
  return {
    grid: "rgba(7,18,37,0.16)",
    tick: "rgba(7,18,37,0.78)",
    tooltipBg: "#f7fbff",
    tooltipBorder: "rgba(7,18,37,0.14)",
    tooltipText: "rgba(7,18,37,0.92)",
  };
}

export function useChartTheme() {
  const isDarkMode = useIsDarkMode();
  return useMemo(() => getChartTheme(isDarkMode), [isDarkMode]);
}

export function useChartTooltipProps(chartTheme: ChartTheme) {
  return useMemo(
    () => ({
      contentStyle: {
        background: chartTheme.tooltipBg,
        border: `1px solid ${chartTheme.tooltipBorder}`,
        borderRadius: 12,
        color: chartTheme.tooltipText,
      } as const,
      labelStyle: { color: chartTheme.tooltipText } as const,
      itemStyle: { color: chartTheme.tooltipText } as const,
    }),
    [chartTheme],
  );
}
