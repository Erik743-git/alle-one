export type TicketStageGroupKey = 'pendente' | 'aguardando' | 'execucao' | 'outros';

export type TicketStageGroupDef = {
  key: TicketStageGroupKey;
  label: string;
  order: number;
};

export const TICKET_STAGE_GROUPS: TicketStageGroupDef[] = [
  { key: 'pendente', label: 'Pendente', order: 1 },
  { key: 'aguardando', label: 'Aguardando usuário', order: 2 },
  { key: 'execucao', label: 'Em execução', order: 3 },
  { key: 'outros', label: 'Outros estágios', order: 4 },
];

export function resolveTicketStageGroup(
  stageName: string | null | undefined,
): TicketStageGroupKey {
  const normalized = String(stageName ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (!normalized) return 'outros';
  if (normalized.includes('pendente')) return 'pendente';
  if (normalized.includes('aguardando')) return 'aguardando';
  if (normalized.includes('execuc')) return 'execucao';
  return 'outros';
}
