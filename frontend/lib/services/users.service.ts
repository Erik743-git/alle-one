import { apiRequest } from "@/lib/api";

export type UserRole = "ADMIN" | "COLLABORATOR" | "PJ" | "CLIENT";
export type UserStatus = "ACTIVE" | "INACTIVE";

export type UserCompany = {
  id: string;
  name: string;
};

export type ServiceDesk = {
  id: string;
  name: string;
  externalId: number | null;
};

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
  googleId: string | null;
  provider: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  company?: UserCompany | null;
  serviceDesks: ServiceDesk[];
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
  serviceDeskIds?: string[];
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
  serviceDeskIds?: string[];
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

  async listServiceDesks() {
    return apiRequest<ServiceDesk[]>("/users/service-desks");
  },
};
