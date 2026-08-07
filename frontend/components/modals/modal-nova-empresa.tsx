'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { companiesService } from '@/lib/services/companies.service';
import { ZabbixGroupMultiSelectField } from '@/components/ui/zabbix-group-select-field';
import { TifluxClientSelectField } from '@/components/ui/tiflux-client-select-field';
import { getTifluxClients, type TifluxClient } from '@/lib/services/tiflux.service';
import { Building2, Upload } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ModalNovaEmpresa({ open, onOpenChange }: Props) {
  const [nome, setNome] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [email, setEmail] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [address, setAddress] = useState('');
  const [zabbixGroupName, setZabbixGroupName] = useState('');
  const [monitoringPriority, setMonitoringPriority] = useState(false);
  const [tifluxClientId, setTifluxClientId] = useState<number | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [carregandoTiflux, setCarregandoTiflux] = useState(false);
  const [tifluxClients, setTifluxClients] = useState<TifluxClient[]>([]);

  useEffect(() => {
    async function carregarTifluxClients() {
      if (!open) {
        return;
      }

      try {
        setCarregandoTiflux(true);
        const data = await getTifluxClients();
        setTifluxClients(
          Array.isArray(data)
            ? [...data].sort((a, b) =>
                String(a.name ?? "").localeCompare(String(b.name ?? ""), "pt-BR"),
              )
            : [],
        );
      } catch (error) {
        console.error(error);
        setTifluxClients([]);
      } finally {
        setCarregandoTiflux(false);
      }
    }

    void carregarTifluxClients();
  }, [open]);

  async function handleCriarEmpresa() {
    if (!nome || !responsavel || !email) {
      setErro('Preencha todos os campos obrigatórios.');
      return;
    }

    try {
      setLoading(true);
      setErro('');

      const created = await companiesService.create({
        name: nome,
        responsibleName: responsavel,
        email,
        cnpj: cnpj.trim() || undefined,
        address: address.trim() || undefined,
        zabbixGroupName: zabbixGroupName.trim() || undefined,
        monitoringPriority,
        tifluxClientId: tifluxClientId ?? undefined,
      });

      if (logoFile) {
        await companiesService.uploadLogo(created.id, logoFile);
      }

      setNome('');
      setResponsavel('');
      setEmail('');
      setCnpj('');
      setAddress('');
      setZabbixGroupName('');
      setMonitoringPriority(false);
      setTifluxClientId(null);
      setLogoFile(null);
      setLogoPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });

      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro ao criar empresa.';

      setErro(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          font-sans
          flex max-h-[90vh] w-[95vw] max-w-[580px] flex-col overflow-hidden
          border border-border bg-card p-0 text-card-foreground
          sm:max-w-[680px]
        "
      >
        <div className="shrink-0 border-b border-border px-5 py-5 sm:px-6">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:h-12 sm:w-12">
              <Building2 size={22} />
            </div>

            <div className="space-y-1">
              <DialogTitle className="font-sans text-xl font-bold text-foreground sm:text-2xl">
                Nova empresa
              </DialogTitle>

              <DialogDescription className="font-sans text-sm text-muted-foreground">
                Cadastre uma nova empresa para liberar acesso ao portal,
                contratos e documentos.
              </DialogDescription>
            </div>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label className="font-sans text-sm font-semibold text-foreground">
                Nome da empresa
              </Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Tuper S.A."
                className="font-sans h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-sans text-sm font-semibold text-foreground">
                Responsável
              </Label>
              <Input
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
                placeholder="Nome do responsável"
                className="font-sans h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-sans text-sm font-semibold text-foreground">
                E-mail de contato
              </Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@empresa.com"
                className="font-sans h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-sans text-sm font-semibold text-foreground">
                CNPJ
              </Label>
              <Input
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
                className="font-sans h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-sans text-sm font-semibold text-foreground">
                Endereço
              </Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Rua, número, bairro, cidade"
                className="font-sans h-11"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label className="font-sans text-sm font-semibold text-foreground">
                Grupos Zabbix
              </Label>

              <ZabbixGroupMultiSelectField
                value={zabbixGroupName}
                onChange={setZabbixGroupName}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <button
                type="button"
                onClick={() => setMonitoringPriority((prev) => !prev)}
                className={`font-sans flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                  monitoringPriority
                    ? "border-destructive/40 bg-destructive/10"
                    : "border-border bg-muted/30 hover:bg-muted/50"
                }`}
              >
                <span
                  className={`inline-flex size-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${
                    monitoringPriority
                      ? "border-destructive bg-destructive text-destructive-foreground"
                      : "border-border bg-background"
                  }`}
                  aria-hidden
                >
                  {monitoringPriority ? "★" : ""}
                </span>
                <span>
                  <span className="block font-semibold text-foreground">
                    Empresa prioritária no Console
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Alertas aparecem primeiro no painel de monitoramento.
                  </span>
                </span>
              </button>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label className="font-sans text-sm font-semibold text-foreground">
                Cliente vinculado
              </Label>

              <TifluxClientSelectField
                value={tifluxClientId}
                onChange={(clientId) => setTifluxClientId(clientId)}
                clients={tifluxClients}
                loading={carregandoTiflux}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label className="font-sans text-sm font-semibold text-foreground">
                Logo da empresa
              </Label>

              <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-4 text-center transition hover:border-primary/40 hover:bg-muted/30">
                {logoPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoPreviewUrl}
                    alt="Prévia da logo"
                    className="h-14 w-auto max-w-[220px] rounded-lg object-contain"
                  />
                ) : (
                  <>
                    <Upload size={20} className="text-primary" />
                    <span className="font-sans text-sm font-semibold text-foreground">
                      Clique para enviar a logo
                    </span>
                    <span className="font-sans text-xs text-muted-foreground">
                      PNG, JPG ou SVG
                    </span>
                  </>
                )}

                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setLogoFile(f);
                    setLogoPreviewUrl((prev) => {
                      if (prev) URL.revokeObjectURL(prev);
                      return f ? URL.createObjectURL(f) : null;
                    });
                  }}
                />
              </label>
            </div>
          </div>

          {erro && (
            <div className="mt-4 alle-alert-error rounded-lg p-3 text-sm">
              {erro}
            </div>
          )}
        </div>

        <DialogFooter className="!mx-0 !mb-0 shrink-0 gap-0 border-t border-border bg-card px-5 pt-4 pb-6 sm:px-6 sm:pb-6">
          <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="font-sans h-11"
            >
              Cancelar
            </Button>

            <Button
              onClick={handleCriarEmpresa}
              disabled={loading}
              className="font-sans h-11"
            >
              {loading ? 'Criando...' : 'Criar empresa'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}