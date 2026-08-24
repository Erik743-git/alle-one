"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type {
  PermissionFlag,
  PermissionModuleKey,
} from "@/lib/permission-modules";
import { canAccessRelatorios, getDefaultAppRoute, hasPermission } from "@/lib/access-control";

type Props = {
  module: PermissionModuleKey;
  /** Padrão: visualizar o módulo */
  flag?: PermissionFlag;
  children: ReactNode;
};

export default function PermissionGate({
  module,
  flag = "canView",
  children,
}: Props) {
  const router = useRouter();
  const allowed =
    module === "REPORTS" && flag === "canView"
      ? canAccessRelatorios()
      : hasPermission(module, flag);

  useEffect(() => {
    if (!allowed) {
      router.replace(getDefaultAppRoute());
    }
  }, [allowed, router]);

  if (!allowed) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 text-center font-sans text-foreground">
        <p className="text-sm font-medium">Sem permissão para este módulo</p>
        <p className="text-sm text-muted-foreground">
          Você será redirecionado para a primeira área disponível. Peça acesso
          ao administrador se precisar desta área.
        </p>
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
