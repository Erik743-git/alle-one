"use client";

import * as React from "react";
import { ResponsiveContainer } from "recharts";

import { useSidebar } from "@/components/layout/sidebar-context";

type DeferredResponsiveContainerProps = React.ComponentProps<
  typeof ResponsiveContainer
>;

/**
 * Evita dezenas de redraws do Recharts enquanto o menu lateral anima a largura.
 */
export function DeferredResponsiveContainer({
  children,
  width = "100%",
  height = "100%",
  ...props
}: DeferredResponsiveContainerProps) {
  const { isLayoutAnimating } = useSidebar();
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(
    null,
  );
  const [frozenSize, setFrozenSize] = React.useState<{
    width: number;
    height: number;
  } | null>(null);

  const measure = React.useCallback(() => {
    const el = hostRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setSize({ width: rect.width, height: rect.height });
    }
  }, []);

  React.useLayoutEffect(() => {
    measure();
    const el = hostRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      if (isLayoutAnimating) return;
      measure();
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [isLayoutAnimating, measure]);

  React.useEffect(() => {
    if (!isLayoutAnimating) {
      measure();
    }
  }, [isLayoutAnimating, measure]);

  React.useEffect(() => {
    if (isLayoutAnimating) {
      if (size) {
        setFrozenSize((prev) => prev ?? size);
      }
      return;
    }
    setFrozenSize(null);
  }, [isLayoutAnimating, size]);

  const renderWidth = isLayoutAnimating
    ? (frozenSize?.width ?? size?.width ?? 0)
    : (size?.width ?? 0);
  const renderHeight = isLayoutAnimating
    ? (frozenSize?.height ?? size?.height ?? 0)
    : (size?.height ?? 0);

  return (
    <div ref={hostRef} className="h-full w-full" style={{ width, height }}>
      {renderWidth > 0 && renderHeight > 0 ? (
        <ResponsiveContainer
          width={renderWidth}
          height={renderHeight}
          {...props}
        >
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
