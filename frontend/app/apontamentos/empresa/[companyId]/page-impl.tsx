"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

function ApontamentosEmpresaRedirectPageImpl() {
  const router = useRouter();
  const params = useParams<{ companyId: string }>();

  useEffect(() => {
    router.replace("/financeiro");
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="size-8 animate-spin text-primary" />
      <span className="sr-only">
        Redirecionando para financeiro (empresa {params.companyId})
      </span>
    </div>
  );
}

export { ApontamentosEmpresaRedirectPageImpl as PortalPageComponent };
