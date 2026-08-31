# Padrões de Desenvolvimento e Segurança — Alle One

Este documento descreve os padrões de segurança, arquitetura e desenvolvimento que devem ser seguidos ao criar novas funcionalidades no portal Alle One.

## 📋 Visão Geral da Arquitetura

### Estrutura do Monorepo
```
alle-one/
├── backend/          # API NestJS + Prisma + PostgreSQL
├── frontend/         # Next.js (App Router) + React + TypeScript
├── docs/            # Documentação técnica
└── deploy/          # Scripts e configurações de deploy
```

### Stack Tecnológica
- **Backend**: Node.js + TypeScript, NestJS, Prisma ORM, PostgreSQL
- **Frontend**: Next.js (App Router), React, TypeScript, shadcn/ui
- **Banco de Dados**: PostgreSQL 15+
- **Autenticação**: JWT com cookie httpOnly

## 🔒 Padrões de Segurança

### 1. Autenticação e Autorização

#### Backend (NestJS)

** Guards Implementados:**
- `JwtAuthGuard`: Guard básico JWT para rotas específicas
- `JwtGlobalAuthGuard`: Guard global aplicado em todas as rotas (exceto @Public)
- `RolesGuard`: Verifica roles do usuário (ADMIN, COLLABORATOR, etc.)
- `ModulePermissionGuard`: Verifica permissões granulares por módulo

**Decoradores:**
```typescript
@Public()                    // Rotas públicas (login, health, etc.)
@Roles('ADMIN')              // Restringe por role
@RequirePermission(PermissionModule.USERS, 'canView')  // Permissão granular
@AuditMeta({ entity: 'User', action: 'CREATE' })       // Auditoria
```

**Estrutura de Guards:**
- Guards são aplicados em cascata: `@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)`
- O `JwtGlobalAuthGuard` está registrado globalmente no `app.module.ts`
- Rotas públicas usam `@Public()` para bypass do guard global

#### Frontend (Next.js)

**Controle de Acesso:**
- `AuthProvider`: Contexto global de autenticação
- `ProtectedPage`: Componente que protege páginas não autenticadas
- `PermissionGate`: Componente que protege rotas por permissão
- `useAuth()`: Hook para acessar dados do usuário autenticado

**Funções de Controle de Acesso:**
```typescript
import { isAdmin, hasPermission, canAccessRelatorios } from '@/lib/access-control';

// Verifica roles
if (isAdmin()) { /* ... */ }

// Verifica permissões granulares
if (hasPermission(PermissionModule.USERS, 'canView')) { /* ... */ }
```

### 2. Validação de Dados e Sanitização

#### Backend

**ValidationPipe Global:**
```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,              // Remove propriedades não decoradas
    transform: true,              // Transforma tipos automaticamente
    forbidNonWhitelisted: true,   // Rejeita propriedades não permitidas
  }),
);
```

**DTOs com class-validator:**
```typescript
import { IsEmail, IsString, IsOptional, Transform } from 'class-validator';
import { IsStrongPassword } from '../../../common/validators/password-constraints';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email: string;

  @IsStrongPassword()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  password?: string;
}
```

**Política de Senhas:**
- Mínimo 8 caracteres
- Pelo menos 1 letra minúscula
- Pelo menos 1 letra maiúscula
- Pelo menos 1 número
- Pelo menos 1 caractere especial

#### Frontend

**Validação de Senha:**
```typescript
import { validatePassword } from '@/lib/password-policy';

const error = validatePassword(password);
if (error) {
  // Mostrar erro ao usuário
}
```

### 3. Headers de Segurança

#### Backend (Helmet + CSP)

**Configuração em main.ts:**
```typescript
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: isProd
      ? {
          useDefaults: false,
          directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            fontSrc: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'self'"],
            imgSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            scriptSrc: ["'self'"],
            scriptSrcAttr: ["'none'"],
            styleSrc: ["'self'"],
            upgradeInsecureRequests: [],
          },
        }
      : false,
    strictTransportSecurity: isProd
      ? { maxAge: 15_552_000, includeSubDomains: true }
      : false,
  }),
);
```

#### Nginx (Headers Adicionais)

**Security Headers:**
```
Strict-Transport-Security: max-age=15552000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
X-DNS-Prefetch-Control: on
```

**Content Security Policy (HTML):**
```
default-src 'self'; 
base-uri 'self'; 
object-src 'none'; 
frame-ancestors 'self'; 
form-action 'self'; 
img-src 'self' data: blob:; 
font-src 'self' data:; 
script-src 'self' 'unsafe-inline'; 
script-src-attr 'none'; 
style-src 'self' 'unsafe-inline'; 
connect-src 'self' https://*.ingest.sentry.io; 
worker-src 'self' blob:; 
upgrade-insecure-requests
```

**Content Security Policy (API):**
```
default-src 'self'; 
base-uri 'self'; 
object-src 'none'; 
frame-ancestors 'self'; 
form-action 'self'; 
img-src 'self' data:; 
font-src 'self'; 
script-src 'self'; 
script-src-attr 'none'; 
style-src 'self'; 
upgrade-insecure-requests
```

### 4. CORS

**Configuração em main.ts:**
```typescript
const corsOriginsRaw = process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? '';
const origins = corsOriginsRaw.split(',').map(s => s.trim()).filter(Boolean);

app.enableCors({
  origin: origins.length ? origins : false,
  credentials: true,
  exposedHeaders: ['Content-Disposition'],
});

if (isProd && !origins.length) {
  throw new Error('Em produção defina CORS_ORIGINS ou FRONTEND_URL');
}
```

### 5. Rate Limiting

**Throttler Global:**
```typescript
ThrottlerModule.forRoot([
  {
    ttl: 60_000,    // 1 minuto
    limit: 200,     // 200 requisições por minuto
  },
])
```

**Rate Limiting Específico:**
```typescript
@Throttle({ default: { limit: 5, ttl: 3_600_000 } })  // 5 tentativas em 1 hora
@Post('esqueci-senha')
forgotPassword(@Body() data: ForgotPasswordDto) {
  return this.authService.forgotPassword(data);
}
```

### 6. Auditoria

**AuditInterceptor Global:**
- Intercepta todas as requisições `POST|PUT|PATCH|DELETE`
- Registra ações de usuários autenticados
- Com `@AuditMeta`: audita qualquer role autenticada
- Sem `@AuditMeta`: audita apenas ADMIN

**Exemplo de Uso:**
```typescript
@Post()
@RequirePermission(PermissionModule.USERS, 'canCreate')
@AuditMeta({ entity: 'User', action: 'CREATE' })
create(
  @CurrentUser() actor: AuthenticatedRequestUser,
  @Body() data: CreateUserDto,
) {
  return this.usersService.create(actor, data);
}
```

### 7. Cookies de Sessão

**Configuração:**
- `AUTH_COOKIE_SAMESITE=strict` (produção)
- `AUTH_COOKIE_SECURE=true` (produção, HTTPS)
- Cookie httpOnly (JWT não exposto ao JavaScript)
- Token version para invalidação em massa

### 8. Interceptors Adicionais

**PresenceInterceptor:**
- Registra atividade do usuário (last seen)
- Atualiza timestamp de presença em cada requisição autenticada

## 🏗️ Padrões de Código

### Estrutura de Módulos Backend

**Padrão de Módulo:**
```
backend/src/modules/<nome>/
  <nome>.module.ts      # Imports, controllers, providers, exports
  <nome>.controller.ts  # Rotas REST + guards
  <nome>.service.ts     # Regras de negócio + Prisma
  dto/                  # DTOs de entrada/saída
  *.types.ts            # Tipos internos (opcional)
```

**Exemplo de Module:**
```typescript
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

**Exemplo de Controller:**
```typescript
@Controller('users')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  @Get()
  @RequirePermission(PermissionModule.USERS, 'canView')
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  @RequirePermission(PermissionModule.USERS, 'canCreate')
  @AuditMeta({ entity: 'User', action: 'CREATE' })
  create(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Body() data: CreateUserDto,
  ) {
    return this.usersService.create(actor, data);
  }
}
```

### Estrutura de Componentes Frontend

**Organização:**
```
frontend/
├── app/                    # Rotas (App Router)
│   ├── dashboard/
│   ├── gmud/
│   └── auth/
├── components/
│   ├── layout/            # Layout components (AppShell, Sidebar)
│   ├── ui/                # Design system (shadcn/ui)
│   ├── auth/              # Auth components (ProtectedPage, PermissionGate)
│   └── modals/            # Dialogs reutilizáveis
└── lib/
    ├── services/          # Clientes HTTP da API
    ├── auth.ts            # Funções de autenticação
    └── access-control.ts  # Controle de permissões
```

**Exemplo de Página Protegida:**
```typescript
"use client";

import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { PermissionModule } from "@/lib/permission-modules";

export default function NovaFuncionalidadePage() {
  return (
    <ProtectedPage>
      <PermissionGate module={PermissionModule.NOVO_MODULO} flag="canView">
        {/* Conteúdo da página */}
      </PermissionGate>
    </ProtectedPage>
  );
}
```

### Serviços HTTP (Frontend)

**Padrão de Service:**
```typescript
import { apiRequest } from "@/lib/api";

export const novoModuloService = {
  async list() {
    return apiRequest<Item[]>('/novo-modulo');
  },

  async create(data: CreateItemDto) {
    return apiRequest<Item>('/novo-modulo', {
      method: 'POST',
      body: data,
    });
  },

  async update(id: string, data: UpdateItemDto) {
    return apiRequest<Item>(`/novo-modulo/${id}`, {
      method: 'PATCH',
      body: data,
    });
  },
};
```

## 🔐 Variáveis de Ambiente

### Backend (.env.example)

**Obrigatórias em Produção:**
```bash
NODE_ENV=production
PORT=3002
TRUST_PROXY=1
SWAGGER_ENABLED=false

# Segurança
JWT_SECRET=32+ caracteres aleatórios
JWT_EXPIRES_IN=1d
CORS_ORIGINS=https://seu-dominio.com
FRONTEND_URL=https://seu-dominio.com

# Cookies
AUTH_COOKIE_SAMESITE=strict
AUTH_COOKIE_SECURE=true

# Banco
DATABASE_URL=postgresql://user:pass@host:5432/alleone
```

### Frontend (.env.example)

```bash
NEXT_PUBLIC_API_URL=https://seu-dominio.com/api
```

## 📝 Checklist para Novas Funcionalidades

### Backend

1. **Criar estrutura do módulo:**
   - [ ] Criar pasta `backend/src/modules/<nome>/`
   - [ ] Criar `<nome>.module.ts`
   - [ ] Criar `<nome>.controller.ts`
   - [ ] Criar `<nome>.service.ts`
   - [ ] Criar DTOs em `dto/`

2. **Segurança:**
   - [ ] Aplicar guards apropriados (`@UseGuards`)
   - [ ] Adicionar `@RequirePermission` para rotas restritas
   - [ ] Adicionar `@AuditMeta` para operações de mutação
   - [ ] Validar DTOs com class-validator
   - [ ] Sanitizar inputs com `@Transform`

3. **Integração:**
   - [ ] Registrar módulo em `app.module.ts`
   - [ ] Adicionar permissão em `permissions.types.ts`
   - [ ] Atualizar seed se necessário

4. **Testes:**
   - [ ] Escrever testes unitários para o service
   - [ ] Testar validação de DTOs
   - [ ] Testar guards e permissões

### Frontend

1. **Criar estrutura:**
   - [ ] Criar rota em `app/<rota>/page.tsx`
   - [ ] Criar service em `lib/services/<nome>.service.ts`
   - [ ] Criar componentes UI se necessário

2. **Segurança:**
   - [ ] Envolver página com `ProtectedPage`
   - [ ] Adicionar `PermissionGate` para controle de acesso
   - [ ] Validar dados no frontend antes de enviar
   - [ ] Usar `apiRequest` para chamadas autenticadas

3. **UI/UX:**
   - [ ] Seguir design system (shadcn/ui)
   - [ ] Usar componentes existentes quando possível
   - [ ] Implementar loading states
   - [ ] Tratar erros adequadamente

4. **Testes:**
   - [ ] Testar fluxo completo
   - [ ] Verificar permissões
   - [ ] Testar validação de formulários

## 🚀 Deploy

### Produção

1. **Configurar variáveis de ambiente:**
   - `JWT_SECRET` forte e único
   - `CORS_ORIGINS` com domínio exato
   - `DATABASE_URL` com credenciais seguras
   - `SWAGGER_ENABLED=false`

2. **Configurar Nginx:**
   - Aplicar security headers
   - Configurar CSP apropriada
   - Habilitar HTTPS
   - Configurar rate limiting

3. **Backup:**
   - Configurar backup automático do PostgreSQL
   - Testar restore regularmente

## 📚 Referências

- [Arquitetura](./ARCHITECTURE.md)
- [Segurança](./SECURITY.md)
- [Versionamento](./VERSIONING.md)
- [README Principal](../README.md)

## ⚠️ Ponto de Atenção

**Nunca:**
- Comitar `.env` ou `.env.local` no repositório
- Usar segredos fracos ou padrão
- Desabilitar segurança em produção
- Expor dados sensíveis em logs
- Ignorar validação de inputs

**Sempre:**
- Usar `.env.example` para documentação
- Validar e sanitizar todos os inputs
- Aplicar guards apropriados
- Auditoriar operações críticas
- Manter dependências atualizadas
- Seguir princípio de menor privilégio