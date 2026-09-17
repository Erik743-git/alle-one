import { reportCompanyFilenamePart } from './reports.service';

describe('reportCompanyFilenamePart', () => {
  it('"Todas as empresas" não usa o nome da empresa representante', () => {
    expect(
      reportCompanyFilenamePart({
        filters: { allCompanies: true, companyLabel: 'Todas as empresas' },
        companyName: 'ACP Bioenergia',
      }),
    ).toBe('todas-empresas');
  });

  it('várias empresas', () => {
    expect(
      reportCompanyFilenamePart({
        filters: { multiCompany: true },
        companyName: 'ACP Bioenergia',
      }),
    ).toBe('multiplas-empresas');
  });

  it('empresa única usa o nome dela', () => {
    expect(
      reportCompanyFilenamePart({
        filters: { companyLabel: 'Fluidra Brasil' },
        companyName: 'Fluidra Brasil',
      }),
    ).toBe('fluidra-brasil');
    expect(
      reportCompanyFilenamePart({ filters: null, companyName: 'Tuper S/A' }),
    ).toBe('tuper-s-a');
  });
});
