"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type {
  PermissionFlag,
  PermissionModuleKey,
} from "@/lib/permission-modules";
import { hasPermission } from "@/lib/access-control";

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
  const allowed = hasPermission(module, flag);

  useEffect(() => {
    if (!allowed) {
      router.replace("/dashboard");
    }
  }, [allowed, router]);

  if (!allowed) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 font-sans text-white">
        <Loader2 className="h-7 w-7 animate-spin text-[#12b5d9]" />
        <p className="text-sm text-slate-400">Verificando permissões…</p>
      </div>
    );
  }

  return <>{children}</>;
}
