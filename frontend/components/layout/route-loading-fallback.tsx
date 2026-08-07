export function RouteLoadingFallback({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-3 p-8">
      <div className="h-10 w-10 animate-pulse rounded-2xl bg-primary/20" />
      <div className="h-3 w-40 animate-pulse rounded bg-muted" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
