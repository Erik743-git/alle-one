"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Boxes,
  ExternalLink,
  Activity,
  BarChart3,
  LifeBuoy,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const aplicativos = [
  {
    nome: "Zabbix",
    descricao:
      "Monitoramento de hosts, triggers, disponibilidade e eventos.",
    href: "https://support.zabbix.com/servicedesk/customer/user/login?destination=portals",
    icon: Activity,
  },
  {
    nome: "Grafana",
    descricao:
      "Dashboards e métricas técnicas de infraestrutura e serviços.",
    href: "https://grafana.com/auth/sign-in/",
    icon: BarChart3,
  },
  {
    nome: "TiFlux",
    descricao:
      "Atendimento, chamados, SLA e gestão de suporte.",
    href: "https://app.tiflux.com/v/?_gl=1*xfsbng*_gcl_au*OTQwMjQyODg1LjE3NzQ0NDA3Njk.*_ga*MjExNjM1MjE4NS4xNzc0NDQwNzcw*_ga_EY9Q8KJXC2*czE3NzQ0NDA3NzAkbzEkZzEkdDE3NzQ0NDA3NzAkajYwJGwwJGgw",
    icon: LifeBuoy,
  },
];

export default function ModalAplicativos({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          font-sans
          !w-[min(96vw,1100px)]
          !max-w-[1100px]
          max-h-[92vh]
          overflow-hidden
          border border-border
          bg-card
          p-0
          text-card-foreground
        "
      >
        <div className="border-b border-border px-6 py-6 sm:px-8 sm:py-7">
          <DialogHeader className="space-y-4 text-left">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Boxes size={26} />
            </div>

            <div className="space-y-1">
              <DialogTitle className="text-2xl font-bold text-foreground sm:text-3xl">
                Aplicativos
              </DialogTitle>

              <DialogDescription className="text-sm leading-6 text-muted-foreground sm:text-base">
                Acesse rapidamente as ferramentas integradas ao ecossistema Alle
                One.
              </DialogDescription>
            </div>
          </DialogHeader>
        </div>

        <div className="overflow-y-auto px-6 py-6 sm:px-8 sm:py-8">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {aplicativos.map((app) => {
              const Icon = app.icon;

              return (
                <a
                  key={app.nome}
                  href={app.href}
                  target="_blank"
                  rel="noreferrer"
                  className="
                    group flex min-h-[260px] flex-col justify-between
                    rounded-2xl border border-border bg-muted/40
                    p-6 transition
                    hover:border-primary/40
                    hover:bg-muted/30
                    hover:shadow-[0_0_0_1px_rgba(18,181,217,0.10),0_18px_35px_rgba(0,0,0,0.32)]
                  "
                >
                  <div className="space-y-5">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon size={26} />
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-xl font-bold text-foreground">
                        {app.nome}
                      </h3>

                      <p className="text-sm leading-7 text-muted-foreground">
                        {app.descricao}
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    Abrir aplicativo
                    <ExternalLink
                      size={16}
                      className="transition group-hover:translate-x-0.5"
                    />
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}