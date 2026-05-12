export type TifluxTicket = {
  ticket_number: number;
  title?: string;
  created_at?: string;
  updated_at?: string;
  is_closed?: boolean;
  client?: {
    id: number;
    name: string;
  } | null;
  desk?: {
    id: number;
    name: string;
  } | null;
  priority?: {
    id: number;
    name: string;
  } | null;
  status?: {
    id: number;
    name: string;
  } | null;
  stage?: {
    id: number;
    name: string;
  } | null;
  responsible?: {
    id: number;
    name: string;
  } | null;
  requestor?: {
    id?: number | null;
    email?: string | null;
    name?: string | null;
    ramal?: string | null;
    telephone?: string | null;
  } | null;
  sla_info?: {
    attend_expiration?: string | null;
    attend_sla?: boolean | null;
    attend_sla_solution?: boolean | null;
    solve_expiration?: string | null;
    solved_in_time?: boolean | null;
    stage_expiration?: string | null;
    stopped?: boolean | null;
  } | null;
  [key: string]: unknown;
};

export function mapTicket(apiData: any): TifluxTicket {
  return {
    ticket_number: Number(apiData.ticket_number ?? apiData.id ?? 0),
    title: apiData.title,
    created_at: apiData.created_at,
    updated_at: apiData.updated_at,
    is_closed: apiData.is_closed,
    client: apiData.client ?? null,
    desk: apiData.desk ?? null,
    priority: apiData.priority ?? null,
    status: apiData.status ?? null,
    stage: apiData.stage ?? null,
    responsible: apiData.responsible ?? null,
    requestor: apiData.requestor ?? null,
    sla_info: apiData.sla_info ?? null,
  };
}
