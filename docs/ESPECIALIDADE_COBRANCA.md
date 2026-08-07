# Especialidade + cobrança financeira

## Decisões fechadas (2026-08-06)

### Domínio
- **Mesa de serviço → Especialidade** (`specialties` no banco; sem nome TiFlux no domínio novo).
- **Classificação**: 2 níveis *dentro* da especialidade (detalhe do chamado).
- **Usuário**: exatamente **1** especialidade (pode criar/apontar em qualquer uma).
- **Ticket**: escolhe **especialidade** + classificação (2 níveis).
- **Contrato**: 1+ especialidades (`contract_specialties`), cada linha com:
  - `monthlyHours` (horas contratadas)
  - `contractValue` (valor do contrato / pacote)
  - `excessHourPrice` (valor hora excedente)
  - `unlimited` (sem teto de horas)
  - `hourlyRate` **calculado** = `contractValue / monthlyHours` (quando horas > 0 e não ilimitado)

### Relatórios
| Relatório | Agrupamento de horas |
|-----------|----------------------|
| Estatística geral (cliente) | Especialidade do **ticket** |
| Cobrança / pagamento | Especialidade do **usuário que apontou** |

### Fórmulas cobrança (por cliente × especialidade × período)
- **B** = horas contratadas (param da linha do contrato)
- **C** = horas gastas (soma apontamentos de usuários daquela especialidade na empresa)
- **D** = B − C (saldo; **negativo** se estourou)
- **E** = D × valor hora excedente (pode ser **negativo**)
- **F** = C × valor hora calculado (custo teórico)
- **Ilimitado**: sem teto → D/E = 0; cobra valor do contrato
- **A cobrar (final)**:
  - ilimitado → valor contrato
  - C ≤ B → valor contrato
  - C > B → valor contrato + \|E\|

### Filtros do relatório de cobrança
1. Visão: **tudo** \| **só excedente** (E &lt; 0 / C &gt; B)
2. Especialidade(s) (multi)
3. Empresa(s) (multi — não só uma ou “todas”)

### Legado
- `PortalTicket.desk_name` / `desk_external_id` permanecem como legado até cutover total.
- Preferir `specialty_id` em tickets novos.
