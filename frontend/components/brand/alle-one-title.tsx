import { cn } from "@/lib/utils";

type AlleOneTitleProps = {
  className?: string;
};

/** Título “Alle One” com a mesma família do wordmark Alle Tecnologia (Montserrat). */
export function AlleOneTitle({ className }: AlleOneTitleProps) {
  return (
    <h1
      className={cn(
        "font-alle-brand text-3xl tracking-[-0.02em] text-white sm:text-[2.1rem] lg:text-4xl",
        className,
      )}
    >
      <span className="font-extrabold">Alle</span>
      <span className="font-semibold"> One</span>
    </h1>
  );
}
