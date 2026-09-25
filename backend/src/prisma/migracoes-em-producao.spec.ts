import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Trava contra renomear ou apagar migração que já rodou em produção.
 *
 * O Prisma reconhece migração pelo nome da pasta. Se uma que já rodou muda de
 * nome, o banco acha que é nova e roda o SQL de novo — e SQL velho quebra em
 * banco novo, porque as tabelas de que ele dependia já mudaram. Foi o que
 * derrubou o deploy da teste em 25/09, e teria derrubado o de produção.
 *
 * Para banco do zero, o jeito certo de corrigir ordem é uma migração NOVA,
 * idempotente, depois das dependências — nunca mexer no nome da antiga.
 */
describe('migrações que já rodaram em produção', () => {
  const raiz = join(__dirname, '..', '..', 'prisma');
  const lista = readFileSync(join(raiz, 'migracoes-em-producao.txt'), 'utf8')
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha && !linha.startsWith('#'));

  it('a lista não está vazia', () => {
    // Se o arquivo for esvaziado por engano, a trava passaria calada.
    expect(lista.length).toBeGreaterThan(80);
  });

  it.each(lista)('%s continua com o mesmo nome', (nome) => {
    expect(existsSync(join(raiz, 'migrations', nome, 'migration.sql'))).toBe(
      true,
    );
  });
});
