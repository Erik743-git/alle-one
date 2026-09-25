import { BadRequestException } from '@nestjs/common';

import { AuthOAuthService } from './auth-oauth.service';

/**
 * GET /auth/google sem o Google configurado derrubava a API: o erro saía de
 * uma promessa disparada com `void`, sem ninguém para tratar. Agora a
 * promessa volta para o controller e vira um 400 comum.
 */
describe('AuthOAuthService — início do login social', () => {
  const antes = { ...process.env };
  afterEach(() => {
    process.env = { ...antes };
  });

  const servico = () => new AuthOAuthService({} as never, {} as never);

  it('Google sem configuração rejeita a promessa devolvida', async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    await expect(servico().startGoogle({} as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('Microsoft sem configuração rejeita a promessa devolvida', async () => {
    delete process.env.MICROSOFT_OAUTH_CLIENT_ID;
    delete process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
    await expect(
      servico().startMicrosoft({} as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
