"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Paperclip, User2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  ticketsService,
  type AppointmentCatalogs,
  type CreateAppointmentPayload,
} from "@/lib/services/tickets.service";
import { useAuth } from "@/lib/use-auth";

const SERVICE_TYPES = ["HORA NORMAL", "HORA EXTRA", "PLANTÃO"] as const;

const ATTENDANCE_OPTIONS = [
  { value: "Remote", label: "Remoto" },
  { value: "External", label: "Externo" },
  { value: "Internal", label: "Interno" },
] as const;

const FIELD_LABEL = "font-sans text-sm font-semibold text-foreground";
const FIELD_INPUT = "font-sans h-11";

type Props = {
  ticketNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
};

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function TicketAppointmentModal({
  ticketNumber,
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const { user } = useAuth();
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ticketMeta, setTicketMeta] = useState<AppointmentCatalogs["ticket"] | null>(null);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [initTime, setInitTime] = useState(nowTime);
  const [endTime, setEndTime] = useState(nowTime);
  const [serviceName, setServiceName] = useState("");
  const [attendance, setAttendance] = useState("Remote");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const serviceTypeOptions = useMemo(
    () => SERVICE_TYPES.map((s) => ({ value: s, label: s })),
    [],
  );

  const attendanceOptions = useMemo(
    () => ATTENDANCE_OPTIONS.map((a) => ({ value: a.value, label: a.label })),
    [],
  );

  const loadTicketMeta = useCallback(async () => {
    try {
      setLoadingMeta(true);
      const data = await ticketsService.appointmentCatalogs(ticketNumber);
      setTicketMeta(data.ticket);
    } catch {
      setTicketMeta(null);
    } finally {
      setLoadingMeta(false);
    }
  }, [ticketNumber]);

  useEffect(() => {
    if (open) {
      setInitTime(nowTime());
      setEndTime(nowTime());
      setFiles([]);
      void loadTicketMeta();
    }
  }, [open, loadTicketMeta]);

  function onPickFiles(list: FileList | null) {
    if (!list?.length) return;
    setFiles((prev) => {
      const merged = [...prev, ...Array.from(list)];
      const seen = new Set<string>();
      const unique = merged.filter((file) => {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return unique.slice(0, 10);
    });
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!serviceName.trim()) {
      notifyError("Selecione o tipo de atendimento.");
      return;
    }
    if (!description.trim()) {
      notifyError("Informe a descrição do apontamento.");
      return;
    }

    const payload: CreateAppointmentPayload = {
      date,
      initTime,
      endTime,
      description: description.trim(),
      serviceName: serviceName.trim(),
      attendance: attendance as CreateAppointmentPayload["attendance"],
    };

    try {
      setSaving(true);
      const res = await ticketsService.createAppointment(ticketNumber, payload, files);
      notifySuccess(res.message);
      setDescription("");
      setServiceName("");
      setFiles([]);
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível criar o apontamento.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        aria-describedby={undefined}
        className="flex h-full w-full max-w-none flex-col gap-0 p-0 sm:max-w-none md:w-[min(960px,68vw)] lg:w-[min(1100px,72vw)]"
      >
        <SheetHeader className="shrink-0 space-y-3 border-b border-border px-6 py-5 pr-14">
          <SheetTitle className="text-lg font-bold">
            Apontar no ticket #{ticketNumber}
          </SheetTitle>
          {loadingMeta ? (
            <SheetDescription>Carregando dados do ticket…</SheetDescription>
          ) : ticketMeta ? (
            <SheetDescription>
              {ticketMeta.clientName ?? "—"} · {ticketMeta.deskName ?? "—"}
            </SheetDescription>
          ) : null}

          {user ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <User2 className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Você está apontando como</p>
                <p className="truncate text-sm font-bold text-foreground">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>
          ) : null}
        </SheetHeader>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className={FIELD_LABEL}>Dia *</Label>
                <DatePickerField
                  value={date}
                  onChange={setDate}
                  modal
                  className="h-11 rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className={FIELD_LABEL}>Início *</Label>
                <Input
                  type="time"
                  value={initTime}
                  onChange={(e) => setInitTime(e.target.value)}
                  className={FIELD_INPUT}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className={FIELD_LABEL}>Fim *</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={FIELD_INPUT}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className={FIELD_LABEL}>Tipo de atendimento *</Label>
                <SearchableSelectField
                  value={serviceName}
                  onChange={setServiceName}
                  options={serviceTypeOptions}
                  placeholder="Selecione"
                  emptyLabel="Selecione"
                  modal
                />
              </div>
              <div className="space-y-2">
                <Label className={FIELD_LABEL}>Atendimento *</Label>
                <SearchableSelectField
                  value={attendance}
                  onChange={setAttendance}
                  options={attendanceOptions}
                  placeholder="Selecione"
                  modal
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className={FIELD_LABEL}>Descrição *</Label>
              <Textarea
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[140px] font-sans text-sm"
                required
              />
            </div>

            <div className="space-y-3 rounded-xl border border-dashed border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Label className={`${FIELD_LABEL} mb-0`}>Anexos do portal</Label>
                <span className="text-xs text-muted-foreground">
                  até 10 arquivos × 25MB — ficam só no Alle One
                </span>
              </div>
              <Button type="button" variant="outline" size="sm" className="h-10" asChild>
                <label className="cursor-pointer">
                  <Paperclip className="mr-2 size-4" />
                  Adicionar arquivos
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      onPickFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </Button>
              {files.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2"
                    >
                      <span className="truncate">
                        {file.name} ({Math.round(file.size / 1024)} KB)
                      </span>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => removeFile(index)}
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          <SheetFooter className="shrink-0 flex-row justify-end gap-2 border-t border-border px-6 py-4">
            <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="h-11 min-w-[120px]" disabled={saving}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Salvar
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
