# Análise de Segurança e Performance — Alle One

## 🚨 Vulnerabilidades de Segurança Encontradas

### 1. **Uso de `$queryRawUnsafe` e `$executeRawUnsafe`** ⚠️ ALTA

**Localização:**
- `backend/src/modules/rendimento/rendimento.service.ts` (múltiplas ocorrências)
- `backend/src/modules/tickets/tickets.service.ts`
- `backend/src/modules/tickets/tickets-query.service.ts`
- `backend/src/common/cache/external-api-cache.cleanup.ts`

**Problema:**
Uso extensivo de queries SQL raw com parâmetros, o que aumenta o risco de SQL injection se não for implementado corretamente. Embora esteja usando parâmetros, o uso de "unsafe" indica que não há validação adicional.

**Exemplo:**
```typescript
const rows = await this.prisma.$queryRawUnsafe<ExistingDayEventRow[]>(`
  SELECT id, status, debit_protected, event_type
  FROM rendimento_day_events
  WHERE user_id = $1
    AND date_ref = $2::date
    AND event_type = $3
    AND appointment_external_id = $4
`, input.userId, dateRef, input.eventType, input.appointmentExternalId);
```

**O que faria diferente:**
- Usar `$queryRaw` em vez de `$queryRawUnsafe` quando possível
- Implementar validação adicional dos parâmetros antes da query
- Considerar usar o query builder do Prisma para casos complexos
- Adicionar testes específicos para SQL injection

**Por que:**
- `$queryRawUnsafe` não realiza validação de tipos
- Maior risco de erros de SQL injection se a validação falhar
- Dificulta manutenção e leitura do código

---

### 2. **Fallback Inseguro para TOTP Encryption Key** ⚠️ MÉDIA

**Localização:**
- `backend/src/modules/auth/totp.service.ts`
- `backend/src/modules/auth/totp-trust-cookie.helper.ts`

**Problema:**
Uso de fallback para `JWT_SECRET` ou valor padrão `'dev-totp-key'` quando `TOTP_ENCRYPTION_KEY` não está definido.

**Exemplo:**
```typescript
private encryptionKey(): Buffer {
  const raw =
    process.env.TOTP_ENCRYPTION_KEY?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    'dev-totp-key';  // ❌ Valor padrão inseguro
  return createHash('sha256').update(raw).digest();
}
```

**O que faria diferente:**
```typescript
private encryptionKey(): Buffer {
  const raw = process.env.TOTP_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      'TOTP_ENCRYPTION_KEY é obrigatório em produção. Defina no .env'
    );
  }
  return createHash('sha256').update(raw).digest();
}
```

**Por que:**
- Valor padrão 'dev-totp-key' é conhecido e compromete a segurança
- Reutilizar JWT_SECRET para múltiplos propósitos viola princípio de separação de concerns
- Em produção, sempre deve exigir configuração explícita

---

### 3. **Tratamento de HTML no Frontend** ⚠️ MÉDIA

**Localização:**
- `frontend/components/tickets/appointment-description-view.tsx`
- `frontend/lib/appointment-doc.ts`

**Problema:**
Componente renderiza HTML de descrições de appointments, o que pode expor a ataques XSS se o HTML não for devidamente sanitizado.

**Exemplo:**
```typescript
// Componente que renderiza HTML
<div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
```

**O que faria diferente:**
- Implementar sanitização rigorosa com DOMPurify ou biblioteca similar
- Usar apenas renderização text quando possível
- Implementar Content Security Policy mais restritiva
- Adicionar validação de whitelist de tags HTML permitidas

**Por que:**
- HTML de fontes externas (emails, integrations) pode conter scripts maliciosos
- Sanitização insuficiente pode levar a XSS
- CSP sozinho não protege contra todos os ataques XSS

---

### 4. **Ausência de Proteção CSRF Explícita** ⚠️ MÉDIA

**Localização:**
- Backend em geral (configuração de cookies)
- Frontend (falta de tokens CSRF)

**Problema:**
O sistema depende apenas de `SameSite=strict` para proteção CSRF, sem implementação de tokens CSRF adicionais.

**Configuração atual:**
```typescript
res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
  httpOnly: true,
  secure,
  sameSite: 'strict',  // Única proteção CSRF
  path: '/',
  maxAge: jwtCookieMaxAgeMs(),
});
```

**O que faria diferente:**
- Implementar tokens CSRF para operações de mutação
- Usar biblioteca como `csurf` ou implementação própria
- Validar tokens CSRF em todas as operações POST/PUT/DELETE/PATH
- Considerar implementação de Double Submit Cookie Pattern

**Por que:**
- `SameSite=strict` pode não funcionar em todos os cenários (browsers antigos, subdomínios)
- Tokens CSRF fornecem proteção adicional em depth
- Melhor alinhamento com OWASP recommendations

---

### 5. **Exposição de Informação em Logs** ⚠️ BAIXA

**Localização:**
- `backend/src/modules/tiflux/tiflux.service.ts`
- `backend/src/common/filters/global-exception.filter.ts`

**Problema:**
Logs podem conter informações sensíveis como URLs completas, bodies de requisições, e stack traces.

**Exemplo:**
```typescript
this.logger.error(
  `TiFlux respondeu erro status=${response.status} url=${url} body=${JSON.stringify(data)}`,
);
```

**O que faria diferente:**
- Implementar sanitização de logs para remover dados sensíveis
- Usar níveis de log apropriados (DEBUG para dados detalhados)
- Implementar masking de dados sensíveis (tokens, senhas, emails)
- Configurar log rotation e retenção adequada

**Por que:**
- Logs podem conter informações que ajudam atacantes
- Stack traces podem expor estrutura interna da aplicação
- Compliance com LGPD/GDPR requer proteção de dados pessoais

---

### 6. **Console.log em Produção** ⚠️ BAIXA

**Localização:**
- `backend/src/main.ts` (linhas 146, 151)

**Problema:**
Uso de `console.log` que pode expor informações em produção.

**Exemplo:**
```typescript
console.log(
  `TICKETS flags: CANONICAL=${process.env.TICKETS_PORTAL_CANONICAL ?? ''} WRITE=${process.env.TICKETS_TIFLUX_WRITE ?? ''} DISCONNECTED=${process.env.TIFLUX_DISCONNECTED ?? ''} port=${port}`,
);
```

**O que faria diferente:**
```typescript
if (process.env.NODE_ENV !== 'production') {
  console.log(`TICKETS flags: ...`);
}
// Ou usar Logger do NestJS
this.logger.log(`TICKETS flags: ...`);
```

**Por que:**
- `console.log` não é controlado pelo sistema de logging
- Pode expor informações sensíveis em logs de produção
- Logger do NestJS fornece melhor controle e estruturação

---

## 🐌 Problemas de Performance

### 1. **N+1 Query Problem em Rendimento** ⚠️ ALTA

**Localização:**
- `backend/src/modules/rendimento/rendimento.service.ts`

**Problema:**
Múltiplas queries são executadas dentro de loops, causando o problema N+1.

**Exemplo:**
```typescript
// Para cada usuário, faz uma query separada
for (const n of unique) {
  const limit = 200;
  const maxPages = 50;
  let offset = 1;
  
  while (offset <= maxPages) {
    // Query dentro de loop
    const pageData = await this.tifluxService.requestResource(path);
    // ...
  }
}
```

**O que faria diferente:**
- Implementar batch loading de dados
- Usar queries agregadas para buscar múltiplos registros de uma vez
- Implementar cache inteligente para reduzir chamadas externas
- Considerar implementação de data loader pattern

**Por que:**
- N+1 queries causam degradação significativa de performance
- Aumenta carga no banco de dados e APIs externas
- Impacta diretamente a experiência do usuário

---

### 2. **Paginação Ineficiente em Contracts** ⚠️ MÉDIA

**Localização:**
- `backend/src/modules/contracts/contracts.service.ts`

**Problema:**
Implementação de pagination carrega todos os dados na memória antes de aplicar offset/limit.

**Exemplo:**
```typescript
const filtered = statusList?.length
  ? mapped.filter((m) => statusList.includes(m.status))
  : mapped;

const start = Math.max(0, (offset - 1) * limit);
const page = filtered.slice(start, start + limit);  // ❌ Carrega tudo na memória
```

**O que faria diferente:**
- Implementar paginação no nível do banco de dados
- Usar `skip` e `take` do Prisma
- Adicionar índices apropriados no banco
- Implementar cursor-based pagination para grandes conjuntos

**Por que:**
- Carregar todos os dados na memória é ineficiente
- Escala mal com grandes volumes de dados
- Pode causar problemas de memória (OOM)

---

### 3. **Limite Defensivo Insuficiente em Dashboard** ⚠️ MÉDIA

**Localização:**
- `backend/src/modules/dashboard/dashboard.service.ts`

**Problema:**
Limite de 1200 tickets pode ainda ser insuficiente para prevenir problemas de performance.

**Exemplo:**
```typescript
const unique = Array.from(new Set(ticketNumbers)).slice(0, 1200);
```

**O que faria diferente:**
- Implementar paginação obrigatória
- Adicionar rate limiting mais agressivo
- Implementar cache distribuído (Redis)
- Usar filas para processamento assíncrono de grandes volumes

**Por que:**
- 1200 tickets ainda podem causar timeout
- Processamento síncrono de grandes volumes bloqueia a API
- Melhor UX com processamento assíncrono

---

### 4. **Memory Leaks Potenciais no Frontend** ⚠️ BAIXA

**Localização:**
- `frontend/app/dashboard/page.tsx`
- `frontend/app/apontamentos/page.tsx`

**Problema:**
Alguns `useEffect` podem causar memory leaks se não limparem recursos adequadamente.

**Exemplo:**
```typescript
useEffect(() => {
  autoRefreshTimerRef.current = setInterval(() => {
    void loadDashboard("auto");
  }, AUTO_REFRESH_INTERVAL_MS);

  return () => {
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);  // ✅ Cleanup correto
    }
  };
}, [loadDashboard]);
```

**O que faria diferente:**
- Revisar todos os useEffect para garantir cleanup adequado
- Implementar abort controllers para fetch requests
- Usar React Query ou SWR para cache e cleanup automático
- Adicionar monitoramento de memory leaks em desenvolvimento

**Por que:**
- Memory leaks causam degradação gradual de performance
- Pode causar crashes em sessões longas
- Impacta experiência do usuário em navegadores mobile

---

## 🔧 Problemas de Configuração

### 1. **Variáveis de Ambiente Obrigatórias Sem Validação** ⚠️ MÉDIA

**Problema:**
Algumas variáveis de ambiente críticas não têm validação suficiente na inicialização.

**Exemplo:**
```typescript
// TOTP service tem fallback inseguro
const raw = process.env.TOTP_ENCRYPTION_KEY?.trim() || process.env.JWT_SECRET?.trim() || 'dev-totp-key';
```

**O que faria diferente:**
- Implementar validação estrita de todas as variáveis obrigatórias
- Criar schema de validação com Zod ou similar
- Falhar fast na inicialização se configuração estiver inválida
- Documentar claramente todas as variáveis obrigatórias

**Por que:**
- Configuração inválida em produção pode ser catastrófica
- Falhar fast é melhor que falhar em runtime
- Facilita debugging e manutenção

---

### 2. **Configuração de CORS Permissiva em Desenvolvimento** ⚠️ BAIXA

**Problema:**
Em desenvolvimento, CORS pode estar muito permissivo.

**O que faria diferente:**
- Manter configuração de CORS restrita mesmo em desenvolvimento
- Usar variáveis de ambiente específicas por ambiente
- Implementar whitelist de domains permitidos
- Adicionar logging de requisições CORS rejeitadas

**Por que:**
- Hábitos de desenvolvimento seguros se traduzem em produção segura
- Reduz risco de acidentes em ambientes de homologação
- Facilita detecção de problemas de CORS cedo

---

## 📊 Recomendações Prioritárias

### 🔴 Urgente (Alto Risco)

1. **Remover fallback inseguro de TOTP_ENCRYPTION_KEY**
   - Impacto: Segurança crítica de 2FA
   - Esforço: Baixo
   - Timeline: Imediato

2. **Implementar sanitização de HTML no frontend**
   - Impacto: Prevenção de XSS
   - Esforço: Médio
   - Timeline: 1 semana

3. **Resolver N+1 query problem em rendimento**
   - Impacto: Performance crítica
   - Esforço: Alto
   - Timeline: 2 semanas

### 🟡 Importante (Médio de Risco)

4. **Implementar proteção CSRF adicional**
   - Impacto: Segurança adicional
   - Esforço: Médio
   - Timeline: 2 semanas

5. **Melhorar paginação em contracts**
   - Impacto: Performance
   - Esforço: Médio
   - Timeline: 1 semana

6. **Implementar sanitização de logs**
   - Impacto: Compliance e segurança
   - Esforço: Médio
   - Timeline: 1 semana

### 🟢 Melhoria (Baixo Risco)

7. **Remover console.log de produção**
   - Impacto: Boas práticas
   - Esforço: Baixo
   - Timeline: Imediato

8. **Implementar validação estrita de environment variables**
   - Impacto: Estabilidade
   - Esforço: Médio
   - Timeline: 1 semana

9. **Revisar memory leaks no frontend**
   - Impacto: Performance UX
   - Esforço: Médio
   - Timeline: 2 semanas

---

## 🛡️ Melhorias de Segurança Adicionais

### Implementação Sugerida

1. **Content Security Policy Mais Restritiva**
   ```typescript
   // Implementar nonce-based CSP
   const nonce = crypto.randomBytes(16).toString('base64');
   res.setHeader('Content-Security-Policy', 
     `default-src 'self'; script-src 'self' 'nonce-${nonce}'; ...`
   );
   ```

2. **Rate Limiting Granular**
   ```typescript
   // Implementar rate limiting por endpoint
   @Throttle({ default: { limit: 10, ttl: 60_000 } })  // Login
   @Throttle({ default: { limit: 100, ttl: 60_000 } })  // Dashboard
   ```

3. **Implementar Security Headers Middleware**
   ```typescript
   // Adicionar headers específicos por rota
   @UseInterceptors(SecurityHeadersInterceptor)
   ```

4. **Implementar Audit Logging Detalhado**
   - Log de todas as tentativas de login falhas
   - Log de mudanças de permissões
   - Log de acesso a dados sensíveis

---

## 📈 Monitoramento e Alertas

### Métricas de Segurança

1. **Implementar alertas para:**
   - Tentativas de login falhas consecutivas
   - Acesso de IPs suspeitos
   - Queries anormalmente lentas
   - Erros de validação em massa

2. **Monitorar:**
   - Taxa de erros 4xx/5xx
   - Tempo de resposta de endpoints críticos
   - Uso de memória e CPU
   - Tamanho de logs

---

## 🧪 Testes de Segurança Sugeridos

1. **Testes Automatizados:**
   - Testes de SQL injection
   - Testes de XSS
   - Testes de CSRF
   - Testes de rate limiting
   - Testes de autenticação/autorização

2. **Testes Manuais:**
   - Penetration testing trimestral
   - Code review focado em segurança
   - Análise de dependências (Snyk, Dependabot)
   - Scan OWASP ZAP regular

---

## 📚 Conclusão

O projeto Alle One tem uma base sólida de segurança com boas práticas implementadas como JWT, guards, validação de DTOs, e headers de segurança. No entanto, existem áreas que precisam de atenção:

**Pontos Fortes:**
- Arquitetura de segurança bem estruturada
- Implementação de guards e permissões granulares
- Validação de dados com class-validator
- Headers de segurança configurados
- Auditoria implementada

**Pontos de Melhoria:**
- Eliminar fallbacks inseguros de configuração
- Implementar sanitização mais rigorosa de HTML
- Resolver problemas de N+1 queries
- Adicionar proteção CSRF explícita
- Melhorar paginação e cache

As recomendações priorizam segurança e performance, com foco em mitigar riscos altos primeiro e melhorar a experiência do usuário através de melhorias de performance.