import { describe, expect, it } from "vitest";

import {
  assignTimelineColumns,
  buildTimelineMarks,
  formatTimelineMark,
  intervalMinutes,
  layoutTimelineBlockRect,
  resolveTimelineRange,
  TIMELINE_EDGE_PADDING_MIN,
  workdayFillPercent,
  type TimelineBlock,
} from "@/lib/rendimento/timeline";

describe("intervalMinutes", () => {
  it("mantém intervalo no mesmo dia", () => {
    expect(intervalMinutes("10:00", "12:30")).toEqual({
      startMin: 10 * 60,
      endMin: 12 * 60 + 30,
    });
  });

  it("trata fim após meia-noite como dia seguinte", () => {
    expect(intervalMinutes("20:00", "00:30")).toEqual({
      startMin: 20 * 60,
      endMin: 20 * 60 + 4 * 60 + 30,
    });
  });
});

describe("resolveTimelineRange", () => {
  it("usa 08h–20h quando não há blocos", () => {
    expect(resolveTimelineRange([])).toEqual({
      startMin: 8 * 60,
      endMin: 20 * 60,
      spanMin: 12 * 60,
    });
  });

  it("corta no primeiro/último bloco com 1h de margem", () => {
    const blocks: TimelineBlock[] = [
      {
        startMin: 10 * 60,
        endMin: 12 * 60,
        label: "a",
        tone: "work",
      },
      {
        startMin: 18 * 60,
        endMin: 19 * 60 + 35,
        label: "b",
        tone: "gap",
      },
    ];

    expect(resolveTimelineRange(blocks)).toEqual({
      startMin: 10 * 60 - TIMELINE_EDGE_PADDING_MIN,
      endMin: 19 * 60 + 35 + TIMELINE_EDGE_PADDING_MIN,
      spanMin:
        19 * 60 + 35 + TIMELINE_EDGE_PADDING_MIN - (10 * 60 - TIMELINE_EDGE_PADDING_MIN),
    });
  });

  it("inclui lacuna após almoço que passa da meia-noite", () => {
    const blocks: TimelineBlock[] = [
      { startMin: 15 * 60, endMin: 18 * 60 + 30, label: "w", tone: "work" },
      { startMin: 18 * 60 + 30, endMin: 20 * 60, label: "l", tone: "lunch" },
      { startMin: 20 * 60, endMin: 24 * 60 + 30, label: "g", tone: "gap" },
    ];

    const range = resolveTimelineRange(blocks);
    expect(range.startMin).toBe(15 * 60 - TIMELINE_EDGE_PADDING_MIN);
    expect(range.endMin).toBe(24 * 60 + 30 + TIMELINE_EDGE_PADDING_MIN);
  });
});

describe("formatTimelineMark", () => {
  it("formata hora cheia", () => {
    expect(formatTimelineMark(10 * 60)).toBe("10h");
  });

  it("formata horário com minutos e após 24h", () => {
    expect(formatTimelineMark(19 * 60 + 35)).toBe("19:35");
    expect(formatTimelineMark(24 * 60 + 30)).toBe("24:30");
  });
});

describe("buildTimelineMarks", () => {
  it("inclui início e fim do intervalo", () => {
    const range = resolveTimelineRange([
      { startMin: 600, endMin: 900, label: "x", tone: "work" },
    ]);
    const marks = buildTimelineMarks(range);
    expect(marks[0]).toBe(range.startMin);
    expect(marks[marks.length - 1]).toBe(range.endMin);
  });
});

describe("assignTimelineColumns", () => {
  it("mantém um bloco em coluna única", () => {
    const blocks: TimelineBlock[] = [
      { startMin: 600, endMin: 720, label: "a", tone: "work" },
    ];
    expect(assignTimelineColumns(blocks)).toEqual({
      items: [{ block: blocks[0], column: 0, columns: 1 }],
    });
  });

  it("divide blocos sobrepostos em colunas lado a lado", () => {
    const blocks: TimelineBlock[] = [
      { startMin: 14 * 60, endMin: 14 * 60 + 30, label: "a", tone: "work" },
      { startMin: 14 * 60, endMin: 15 * 60, label: "b", tone: "work" },
    ];
    const result = assignTimelineColumns(blocks);
    expect(result.items.map((item) => item.columns)).toEqual([2, 2]);
    expect(result.items.map((item) => item.column)).toEqual([0, 1]);
  });

  it("reutiliza coluna quando não há sobreposição", () => {
    const blocks: TimelineBlock[] = [
      { startMin: 10 * 60, endMin: 11 * 60, label: "a", tone: "work" },
      { startMin: 11 * 60, endMin: 12 * 60, label: "b", tone: "work" },
    ];
    const result = assignTimelineColumns(blocks);
    expect(result.items.every((item) => item.column === 0)).toBe(true);
    expect(result.items.every((item) => item.columns === 1)).toBe(true);
  });
});

describe("layoutTimelineBlockRect", () => {
  const range = { startMin: 480, endMin: 960, spanMin: 480 };

  it("usa largura total sem conflito", () => {
    const block: TimelineBlock = {
      startMin: 600,
      endMin: 720,
      label: "a",
      tone: "work",
    };
    expect(layoutTimelineBlockRect(block, range, 0, 1)).toEqual({
      leftPct: 25,
      widthPct: 25,
    });
  });

  it("divide largura entre colunas em conflito", () => {
    const block: TimelineBlock = {
      startMin: 600,
      endMin: 720,
      label: "a",
      tone: "work",
    };
    const first = layoutTimelineBlockRect(block, range, 0, 2);
    const second = layoutTimelineBlockRect(block, range, 1, 2);
    expect(first.leftPct).toBeLessThan(second.leftPct);
    expect(first.widthPct).toBeCloseTo(second.widthPct, 1);
    expect(first.widthPct).toBeLessThan(25);
  });
});

describe("workdayFillPercent", () => {
  it("calcula percentual da meta de 8h", () => {
    expect(workdayFillPercent(240)).toBe(50);
    expect(workdayFillPercent(8 * 60)).toBe(100);
    expect(workdayFillPercent(10 * 60)).toBe(100);
    expect(workdayFillPercent(0)).toBe(0);
  });
});
