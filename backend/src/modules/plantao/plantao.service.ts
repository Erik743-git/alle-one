import { Injectable, Logger } from '@nestjs/common';
import { MicrosoftGraphMailClient } from '../email-inbound/microsoft-graph-mail.client';
import {
  calendariosDePlantao,
  plantaoCacheMs,
  plantaoConfigurado,
  PLANTAO_TIMEZONE,
  type CalendarioPlantao,
} from './plantao.config';

export type TurnoPlantao = {
  /** Texto do compromisso no Outlook, como está escrito lá. */
  titulo: string;
  /** ISO local (sem Z): o Graph devolve no fuso que pedimos. */
  inicio: string;
  fim: string;
  /** O turno cobre o instante da consulta. */
  agora: boolean;
};

export type EscalaPlantao = {
  rotulo: string;
  turnos: TurnoPlantao[];
  /** Mensagem quando a leitura falhou; a tela não mostra cache calado. */
  erro: string | null;
};

export type PlantaoResposta = {
  configurado: boolean;
  atualizadoEm: string;
  escalas: EscalaPlantao[];
};

type GraphEvento = {
  subject?: string | null;
  start?: { dateTime?: string | null } | null;
  end?: { dateTime?: string | null } | null;
};

/** O Graph devolve "2026-09-19T18:00:00.0000000" sem fuso: já é local. */
function paraData(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const limpo = valor.replace(/\.\d+$/, '');
  const data = new Date(limpo);
  return Number.isNaN(data.getTime()) ? null : data;
}

@Injectable()
export class PlantaoService {
  private readonly logger = new Logger(PlantaoService.name);
  private cache: { em: number; dados: PlantaoResposta } | null = null;

  constructor(private readonly graph: MicrosoftGraphMailClient) {}

  async escalas(params?: { dias?: number }): Promise<PlantaoResposta> {
    const ttl = plantaoCacheMs();
    if (this.cache && Date.now() - this.cache.em < ttl) {
      return this.cache.dados;
    }

    const dias = Math.min(Math.max(params?.dias ?? 21, 1), 90);
    const agora = new Date();
    // Começa ontem para o turno que virou a noite não sumir da tela de manhã.
    const de = new Date(agora);
    de.setDate(de.getDate() - 1);
    de.setHours(0, 0, 0, 0);
    const ate = new Date(agora);
    ate.setDate(ate.getDate() + dias);
    ate.setHours(23, 59, 59, 0);

    const calendarios = calendariosDePlantao();
    const escalas = await Promise.all(
      calendarios.map((cal) => this.lerCalendario(cal, de, ate, agora)),
    );

    const dados: PlantaoResposta = {
      configurado: plantaoConfigurado(),
      atualizadoEm: new Date().toISOString(),
      escalas,
    };
    this.cache = { em: Date.now(), dados };
    return dados;
  }

  private async lerCalendario(
    cal: CalendarioPlantao,
    de: Date,
    ate: Date,
    agora: Date,
  ): Promise<EscalaPlantao> {
    try {
      // calendarView (e não /events) porque ele expande a recorrência: a
      // escala é semanal e /events devolveria só a regra, deixando o cálculo
      // das datas por nossa conta — que é onde se erra.
      const caminho =
        `/users/${encodeURIComponent(cal.caixa)}` +
        `/calendars/${encodeURIComponent(cal.calendarioId)}/calendarView` +
        `?startDateTime=${iso(de)}&endDateTime=${iso(ate)}` +
        `&$select=subject,start,end&$orderby=start/dateTime&$top=100`;

      const resposta = await this.graph.getJson<{ value?: GraphEvento[] }>(
        caminho,
        // Sem isto o Graph responde em UTC e a tela erraria em 3 horas.
        { headers: { Prefer: `outlook.timezone="${PLANTAO_TIMEZONE}"` } },
      );

      const turnos: TurnoPlantao[] = [];
      for (const ev of resposta.value ?? []) {
        const inicio = paraData(ev.start?.dateTime);
        const fim = paraData(ev.end?.dateTime);
        if (!inicio || !fim) continue;
        turnos.push({
          titulo: ev.subject?.trim() || '(sem título)',
          inicio: ev.start!.dateTime!,
          fim: ev.end!.dateTime!,
          // Turnos têm formatos diferentes — Infra começa sexta 18h, Sistemas cobre
          // sábado 06h a domingo 22h. Por isso compara com o intervalo, sem
          // supor duração nem dia de início.
          agora: inicio <= agora && agora < fim,
        });
      }

      return { rotulo: cal.rotulo, turnos, erro: null };
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Escala "${cal.rotulo}" não pôde ser lida: ${motivo}`);
      return {
        rotulo: cal.rotulo,
        turnos: [],
        erro: 'Não foi possível ler esta escala agora.',
      };
    }
  }
}

/** O calendarView quer data local sem fuso, no mesmo fuso do cabeçalho. */
function iso(data: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}` +
    `T${p(data.getHours())}:${p(data.getMinutes())}:${p(data.getSeconds())}`
  );
}
