import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { decryptSecret } from '../../common/security/secret-box';
import {
  grafanaApiUrl,
  grafanaCacheMs,
  grafanaDemoToken,
  grafanaPublicUrl,
  grafanaTimeoutMs,
  isGrafanaConfigured,
} from './grafana.config';

export type GrafanaBoard = {
  /** Identificador do painel publicado, usado como chave na tela. */
  id: string;
  title: string;
  /** Endereço que o navegador abre dentro do quadro. */
  url: string;
};

export type GrafanaBoardsResponse = {
  configured: boolean;
  /** true quando os painéis vêm da organização de demonstração. */
  demo: boolean;
  /** Nome da organização no Grafana, quando conhecido. */
  orgName: string | null;
  boards: GrafanaBoard[];
};

/** O que a API do Grafana devolve em /api/dashboards/public-dashboards. */
type PublicDashboardRow = {
  uid?: string;
  accessToken?: string;
  title?: string;
  isEnabled?: boolean;
};

type CacheEntry = { valor: GrafanaBoardsResponse; expiraEm: number };

@Injectable()
export class GrafanaService {
  private readonly logger = new Logger(GrafanaService.name);
  /** Chave: token usado. Empresas diferentes nunca compartilham entrada. */
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  isConfigured(): boolean {
    return isGrafanaConfigured();
  }

  /**
   * Painéis que a pessoa pode ver.
   *
   * A empresa sai do usuário logado, nunca da requisição: assim ninguém
   * pede os painéis de outra empresa trocando um parâmetro.
   */
  async listBoardsForUser(
    actor: AuthenticatedRequestUser,
  ): Promise<GrafanaBoardsResponse> {
    if (!isGrafanaConfigured()) {
      return { configured: false, demo: false, orgName: null, boards: [] };
    }

    const empresa = await this.resolveCompany(actor);
    const tokenProprio = empresa?.grafanaTokenEncrypted
      ? this.safeDecrypt(empresa.grafanaTokenEncrypted, empresa.name)
      : null;

    const demo = !tokenProprio;
    const token = tokenProprio ?? grafanaDemoToken();
    if (!token) {
      // Sem token da empresa e sem o de demonstração: nada a mostrar.
      return {
        configured: true,
        demo: true,
        orgName: null,
        boards: [],
      };
    }

    const cacheKey = token;
    const emCache = this.cache.get(cacheKey);
    if (emCache && emCache.expiraEm > Date.now()) return emCache.valor;

    const boards = await this.fetchPublicDashboards(token);
    const valor: GrafanaBoardsResponse = {
      configured: true,
      demo,
      orgName: demo ? null : (empresa?.grafanaOrgName ?? null),
      boards,
    };
    this.cache.set(cacheKey, {
      valor,
      expiraEm: Date.now() + grafanaCacheMs(),
    });
    return valor;
  }

  /** Confere o token e devolve o nome da organização, para o cadastro. */
  async describeToken(token: string): Promise<{ orgName: string }> {
    const res = await this.callGrafana('/api/org', token);
    const org = (await res.json()) as { name?: string };
    const nome = org?.name?.trim();
    if (!nome) {
      throw new ServiceUnavailableException(
        'O Grafana respondeu, mas não informou a organização do token.',
      );
    }
    return { orgName: nome };
  }

  /** Esquece o que estava em cache para o token de uma empresa. */
  invalidate(tokenEncrypted?: string | null, companyName?: string) {
    if (!tokenEncrypted) {
      this.cache.clear();
      return;
    }
    const token = this.safeDecrypt(tokenEncrypted, companyName);
    if (token) this.cache.delete(token);
  }

  private async resolveCompany(actor: AuthenticatedRequestUser) {
    // Cliente vê a própria empresa. Time interno também tem empresa (a Alle),
    // então a mesma regra atende os dois sem caso especial.
    const companyId = actor.companyId ?? null;
    if (!companyId) return null;
    return this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: {
        name: true,
        grafanaTokenEncrypted: true,
        grafanaOrgName: true,
      },
    });
  }

  private safeDecrypt(payload: string, contexto?: string): string | null {
    try {
      return decryptSecret(payload) || null;
    } catch {
      // Chave de criptografia trocada entre ambientes, por exemplo.
      this.logger.warn(
        `Token do Grafana ilegível${contexto ? ` para "${contexto}"` : ''}; tratando como não configurado.`,
      );
      return null;
    }
  }

  private async fetchPublicDashboards(token: string): Promise<GrafanaBoard[]> {
    const res = await this.callGrafana(
      '/api/dashboards/public-dashboards',
      token,
    );
    const body = (await res.json()) as
      | { publicDashboards?: PublicDashboardRow[] }
      | PublicDashboardRow[];
    const linhas = Array.isArray(body) ? body : (body.publicDashboards ?? []);

    const base = grafanaPublicUrl();
    return linhas
      .filter((row) => row.isEnabled !== false && row.accessToken)
      .map((row) => ({
        id: row.uid ?? row.accessToken ?? '',
        title: row.title?.trim() || 'Painel',
        url: `${base}/public-dashboards/${row.accessToken}`,
      }))
      .filter((board) => board.id);
  }

  private async callGrafana(path: string, token: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), grafanaTimeoutMs());
    try {
      const res = await fetch(`${grafanaApiUrl()}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`Grafana respondeu HTTP ${res.status} em ${path}.`);
        throw new ServiceUnavailableException(
          res.status === 401 || res.status === 403
            ? 'O Grafana recusou o token desta empresa.'
            : 'O Grafana não respondeu como esperado.',
        );
      }
      return res;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      const motivo =
        err instanceof Error && err.name === 'AbortError'
          ? 'demorou demais para responder'
          : err instanceof Error
            ? err.message
            : String(err);
      this.logger.warn(`Falha ao falar com o Grafana (${path}): ${motivo}.`);
      throw new ServiceUnavailableException(
        'Não foi possível falar com o Grafana agora.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
