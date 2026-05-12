import { apiRequest } from "@/lib/api";

export type ZabbixOverview = {
    group: string;
    totalHosts: number;
    hostsAtivos: number;
    hostsInativos: number;
    problemasAbertos: number;
    problemasAlta: number;
    problemasMedia: number;
};

export type ZabbixGroupOption = {
    groupid: string;
    name: string;
};

export type ZabbixHostGroupRef = {
    groupid?: string;
    name: string;
};

export type ZabbixTemplateRef = {
    templateid: string;
    host: string;
    name: string;
};

export type ZabbixInterfaceRef = {
    interfaceid?: string;
    ip?: string;
    dns?: string;
    port?: string;
    type?: string;
    main?: string;
    useip?: string;
    available?: string;
};

export type ZabbixTagRef = {
    tag: string;
    value: string;
};

export type ZabbixInventoryRef = {
    os?: string;
    hardware?: string;
    software?: string;
    location?: string;
    contact?: string;
};

export type ZabbixDetailedHost = {
    hostid: string;
    host: string;
    name: string;
    description?: string;
    status: string;
    maintenance_status?: string;
    groups: ZabbixHostGroupRef[];
    parentTemplates?: ZabbixTemplateRef[];
    interfaces?: ZabbixInterfaceRef[];
    tags?: ZabbixTagRef[];
    inventory?: ZabbixInventoryRef;
};

export type ZabbixTemplateSummary = {
    templateid: string;
    host: string;
    name: string;
    totalHosts: number;
};

export type ZabbixEventHostRef = {
    hostid: string;
    name: string;
};

export type ZabbixEvent = {
    eventid: string;
    objectid: string;
    clock: string;
    name?: string;
    severity?: string;
    value?: string;
    acknowledged?: string;
    hosts?: ZabbixEventHostRef[];
};

export type ZabbixDashboardDetails = {
    overview: ZabbixOverview;
    hosts: ZabbixDetailedHost[];
    templates: ZabbixTemplateSummary[];
    events: ZabbixEvent[];
    resumo: {
        totalTemplates: number;
        totalEventos: number;
        eventosProblema: number;
        eventosRecuperacao: number;
        eventosCriticos: number;
        eventosMedios: number;
    };
    periodo: {
        dias: number;
        de?: number;
        ate?: number;
    };
};

export function getZabbixOverview(group: string) {
    return apiRequest<ZabbixOverview>(
        `/zabbix/overview?group=${encodeURIComponent(group)}`,
    );
}

export function getZabbixGroups() {
    return apiRequest<ZabbixGroupOption[]>("/zabbix/groups");
}

export function getZabbixDashboardDetails(group: string, days = 7) {
    return apiRequest<ZabbixDashboardDetails>(
        `/zabbix/dashboard-details?group=${encodeURIComponent(group)}&days=${days}`,
    );
}

export function formatZabbixClock(clock?: string) {
    if (!clock) {
        return "--";
    }

    const timestamp = Number(clock);

    if (Number.isNaN(timestamp)) {
        return "--";
    }

    return new Date(timestamp * 1000).toLocaleString("pt-BR");
}

export function getSeverityLabel(severity?: string) {
    switch (Number(severity ?? -1)) {
        case 0:
            return "Não classificado";
        case 1:
            return "Informação";
        case 2:
            return "Atenção";
        case 3:
            return "Média";
        case 4:
            return "Alta";
        case 5:
            return "Desastre";
        default:
            return "--";
    }
}