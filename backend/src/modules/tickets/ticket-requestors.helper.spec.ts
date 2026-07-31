import {
  isAlleInternalClientName,
  portalRequestorSyntheticId,
  sanitizeTicketRequestors,
} from './ticket-requestors.helper';

describe('ticket-requestors.helper', () => {
  it('detecta clientes Alle Tecnologia / Infra', () => {
    expect(isAlleInternalClientName('Alle Tecnologia')).toBe(true);
    expect(isAlleInternalClientName('ALLE INFRA')).toBe(true);
    expect(isAlleInternalClientName('Cliente Fake')).toBe(false);
  });

  it('remove e-mails duplicados e prefer nome legível', () => {
    const rows = sanitizeTicketRequestors(
      [
        {
          id: 1,
          name: 'suporte@alletecnologia.com',
          email: 'suporte@alletecnologia.com',
          telephone: null,
        },
        {
          id: 2,
          name: 'Alle',
          email: 'Suporte@AlleTecnologia.com',
          telephone: '119999',
        },
      ],
      { clientName: 'Alle Tecnologia' },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Alle');
    expect(rows[0].email).toBe('Suporte@AlleTecnologia.com');
    expect(rows[0].telephone).toBe('119999');
  });

  it('filtra domínios externos para Alle Tecnologia', () => {
    const rows = sanitizeTicketRequestors(
      [
        {
          id: 1,
          name: 'Alle',
          email: 'suporte@alletecnologia.com',
          telephone: null,
        },
        {
          id: 2,
          name: 'Roberto',
          email: 'rgdelimafilho@gmail.com',
          telephone: null,
        },
        {
          id: 3,
          name: 'noreply',
          email: 'noreply-gzc@info.bitdefender.com',
          telephone: null,
        },
      ],
      { clientName: 'Alle Infra' },
    );
    expect(rows.map((r) => r.email)).toEqual(['suporte@alletecnologia.com']);
  });

  it('em cliente externo só deduplica, sem filtro de domínio', () => {
    const rows = sanitizeTicketRequestors(
      [
        {
          id: 1,
          name: 'A',
          email: 'a@cliente.com',
          telephone: null,
        },
        {
          id: 2,
          name: 'A2',
          email: 'a@cliente.com',
          telephone: null,
        },
        {
          id: 3,
          name: 'B',
          email: 'b@gmail.com',
          telephone: null,
        },
      ],
      { clientName: 'Cliente XPTO' },
    );
    expect(rows).toHaveLength(2);
  });

  it('gera id sintético estável', () => {
    expect(portalRequestorSyntheticId('a@b.com')).toBe(
      portalRequestorSyntheticId('A@b.com'),
    );
  });
});
