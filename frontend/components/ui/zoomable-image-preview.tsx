"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const MIN_SCALE = 1;
const MAX_SCALE = 5;

type Props = {
  src: string;
  alt: string;
  className?: string;
  imageClassName?: string;
};

function ZoomableImagePreviewInner({
  src,
  alt,
  className,
  imageClassName,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    dragRef.current = null;
    setDragging(false);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      setScale((prev) => {
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * factor));
        if (next <= MIN_SCALE) {
          setOffset({ x: 0, y: 0 });
        }
        return next;
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function handlePointerDown(event: React.PointerEvent<HTMLImageElement>) {
    if (scale <= MIN_SCALE) return;
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLImageElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLImageElement>) {
    if (dragRef.current) {
      dragRef.current = null;
      setDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex min-h-[240px] w-full flex-1 touch-none items-center justify-center overflow-hidden",
        className,
      )}
    >
      <p className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background/85 px-2.5 py-0.5 text-[11px] text-muted-foreground shadow-sm ring-1 ring-border/40">
        Scroll para zoom · arraste para mover · duplo clique para resetar
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={resetView}
        className={cn(
          "max-h-[min(62vh,560px)] max-w-full select-none object-contain will-change-transform",
          scale > MIN_SCALE ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
          imageClassName,
        )}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        }}
      />
    </div>
  );
}

export function ZoomableImagePreview(props: Props) {
  return <ZoomableImagePreviewInner key={props.src} {...props} />;
}
