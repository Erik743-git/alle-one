import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Selo do usuário de cliente licenciado: símbolo da Alle num círculo escuro
 * e o texto "Licenciado Alle" num contorno com o gradiente da marca.
 */
export function SeloLicenciado({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 p-px shadow-[0_0_12px_rgba(56,189,248,0.25)]",
        className,
      )}
      title="Usuário licenciado: aponta sem limite por chamado"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#08182f] py-0.5 pl-0.5 pr-2.5">
        <span className="flex size-5 items-center justify-center rounded-full bg-white/10">
          <Image
            src="/alle-simbolo.png"
            alt=""
            width={14}
            height={14}
            className="size-3.5 object-contain"
          />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white">
          Licenciado Alle
        </span>
      </span>
    </span>
  );
}
