import { ForbiddenException } from '@nestjs/common';
import { ProjetosService } from './projetos.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';

/**
 * Escopo por empresa em Projetos.
 *
 * O RolesGuard deixa CLIENT_GESTOR e CLIENT_MEMBER passarem em rotas que
 * listam CLIENT. Antes, o serviço comparava `role === CLIENT` (exato), então
 * esses dois caiam no ramo de staff e recebiam TODAS as empresas — podendo
 * inclusive criar, editar e excluir projeto de qualquer cliente.
 */
describe('ProjetosService — escopo por empresa', () => {
  const todasAsEmpresas = [
    { id: 'empresa-a' },
    { id: 'empresa-b' },
    { id: 'empresa-c' },
  ];

  function criarServico() {
    const prisma = {
      company: { findMany: jest.fn().mockResolvedValue(todasAsEmpresas) },
    };
    return new ProjetosService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  function usuario(
    role: AuthenticatedRequestUser['role'],
  ): AuthenticatedRequestUser {
    return {
      userId: 'u1',
      email: 'u1@cliente.com',
      role,
      companyId: 'empresa-a',
      permissions: [],
    } as AuthenticatedRequestUser;
  }

  const papeisDeCliente = ['CLIENT', 'CLIENT_GESTOR', 'CLIENT_MEMBER'] as const;

  it.each(papeisDeCliente)(
    '%s enxerga apenas a propria empresa',
    async (role) => {
      const service = criarServico();
      const escopo = await service.getAccessibleCompanyIds(usuario(role));
      expect(escopo).toEqual(['empresa-a']);
    },
  );

  it.each(papeisDeCliente)('%s nao pode alterar projeto', (role) => {
    const service = criarServico();
    expect(() =>
      (
        service as never as { assertCanMutate: (u: unknown) => void }
      ).assertCanMutate(usuario(role)),
    ).toThrow(ForbiddenException);
  });

  it('ADMIN continua enxergando todas as empresas', async () => {
    const service = criarServico();
    const escopo = await service.getAccessibleCompanyIds(usuario('ADMIN'));
    expect(escopo).toEqual(['empresa-a', 'empresa-b', 'empresa-c']);
  });

  it('COLLABORATOR continua enxergando todas as empresas', async () => {
    const service = criarServico();
    const escopo = await service.getAccessibleCompanyIds(
      usuario('COLLABORATOR'),
    );
    expect(escopo).toHaveLength(3);
  });
});
