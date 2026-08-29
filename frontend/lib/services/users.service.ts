import { apiRequest } from "@/lib/api";

export type UserRole =
  | "ADMIN"
  | "COLLABORATOR"
  | "PJ"
  | "CLIENT"
  | "CLIENT_GESTOR"
  | "CLIENT_MEMBER";
export type UserStatus = "ACTIVE" | "INACTIVE";

export type UserCompany = {
  id: string;
  name: string;
};

export type UserCompanyMembership = {
  companyId: string;
  companyName: string;
  clientRole: "CLIENT_GESTOR" | "CLIENT_MEMBER";
};

export type Specialty = {
  id: string;
  name: string;
  externalId: number | null;
};

/** @deprecated Prefer Specialty */
export type ServiceDesk = Specialty;

export type User = {
  id: string;
  name: string;
  email: string;
  /** Não é retornado pela API por segurança. */
  passwordHash?: string | null;
  role: UserRole;
  status: UserStatus;
  firstAccess: boolean;
  responsible: boolean;
  companyId: string | null;
  specialtyId?: string | null;
  specialty?: Specialty | null;
  specialties?: Specialty[];
  googleId: string | null;
  provider: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  company?: UserCompany | null;
  companyMemberships?: UserCompanyMembership[];
  /** @deprecated Prefer specialty / specialties */
  serviceDesks: Specialty[];
  rendimentoCustomSchedule?: boolean;
  rendimentoDailyWorkMinutes?: number | null;
  rendimentoLunchMinutes?: number | null;
};

export type CreateUserPayload = {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  status?: UserStatus;
  companyId?: string | null;
  firstAccess?: boolean;
  responsible?: boolean;
  specialtyId?: string | null;
  specialtyIds?: string[];
  /** @deprecated Prefer specialtyIds */
  serviceDeskIds?: string[];
  rendimentoCustomSchedule?: boolean;
  rendimentoDailyWorkMinutes?: number | null;
  rendimentoLunchMinutes?: number | null;
};

export type UpdateUserPayload = {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  status?: UserStatus;
  companyId?: string | null;
  firstAccess?: boolean;
  responsible?: boolean;
  specialtyId?: string | null;
  specialtyIds?: string[];
  /** @deprecated Prefer specialtyIds */
  serviceDeskIds?: string[];
  rendimentoCustomSchedule?: boolean;
  rendimentoDailyWorkMinutes?: number | null;
  rendimentoLunchMinutes?: number | null;
};

export const usersService = {
  async list() {
    return apiRequest<User[]>("/users");
  },

  async getById(id: string) {
    return apiRequest<User>(`/users/${id}`);
  },

  async create(payload: CreateUserPayload) {
    return apiRequest<User>("/users", {
      method: "POST",
      body: payload,
    });
  },

  async update(id: string, payload: UpdateUserPayload) {
    return apiRequest<User>(`/users/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async remove(id: string) {
    return apiRequest<User>(`/users/${id}`, {
      method: "DELETE",
    });
  },

  async upsertCompanyMembership(
    userId: string,
    payload: { companyId: string; clientRole: "CLIENT_GESTOR" | "CLIENT_MEMBER" },
  ) {
    return apiRequest<{
      companyId: string;
      companyName: string;
      clientRole: "CLIENT_GESTOR" | "CLIENT_MEMBER";
    }>(`/users/${userId}/memberships`, {
      method: "PUT",
      body: payload,
    });
  },

  async listSpecialties() {
    return apiRequest<Specialty[]>("/users/specialties");
  },

  /** @deprecated Prefer listSpecialties */
  async listServiceDesks() {
    return this.listSpecialties();
  },
};
