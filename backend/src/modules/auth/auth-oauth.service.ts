import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';
import { attachAccessTokenCookie } from './auth-cookie.helper';
import {
  attachOAuthStateCookie,
  clearOAuthStateCookie,
  createOAuthState,
  oauthCallbackUrl,
  oauthEmailsMatch,
  oauthLoginRedirect,
  OAUTH_STATE_COOKIE,
  parseOAuthState,
  type OAuthProvider,
} from './auth-oauth.helper';

type OAuthTokenResponse = {
  access_token?: string;
  id_token?: string;
  token_type?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
};

type MicrosoftIdTokenClaims = {
  oid?: string;
  sub?: string;
  email?: string;
  preferred_username?: string;
  upn?: string;
  unique_name?: string;
};

type MicrosoftGraphMe = {
  id?: string;
  mail?: string | null;
  userPrincipalName?: string | null;
};

@Injectable()
export class AuthOAuthService {
  private readonly logger = new Logger(AuthOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  getProvidersStatus() {
    return {
      google: this.isGoogleConfigured(),
      microsoft: this.isMicrosoftConfigured(),
    };
  }

  isGoogleConfigured(): boolean {
    return Boolean(
      process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
        process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim(),
    );
  }

  isMicrosoftConfigured(): boolean {
    return Boolean(
      process.env.MICROSOFT_OAUTH_CLIENT_ID?.trim() &&
        process.env.MICROSOFT_OAUTH_CLIENT_SECRET?.trim(),
    );
  }

  startGoogle(res: Response, emailHint?: string): void {
    void this.startProvider(res, 'google', emailHint);
  }

  startMicrosoft(res: Response, emailHint?: string): void {
    void this.startProvider(res, 'microsoft', emailHint);
  }

  private async startProvider(
    res: Response,
    provider: OAuthProvider,
    emailHint?: string,
  ): Promise<void> {
    if (provider === 'google' && !this.isGoogleConfigured()) {
      throw new BadRequestException('Login com Google não está configurado.');
    }
    if (provider === 'microsoft' && !this.isMicrosoftConfigured()) {
      throw new BadRequestException('Login com Microsoft não está configurado.');
    }

    const email = emailHint?.trim();
    if (!email) {
      res.redirect(oauthLoginRedirect('oauth_email_required'));
      return;
    }
    if (!(await this.assertOAuthUserAvailable(email))) {
      res.redirect(oauthLoginRedirect('oauth_not_registered'));
      return;
    }

    const state = createOAuthState(provider, email);
    attachOAuthStateCookie(res, state);

    if (provider === 'google') {
      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!.trim(),
        redirect_uri: oauthCallbackUrl('google'),
        response_type: 'code',
        scope: 'openid email profile',
        state,
        access_type: 'online',
        prompt: 'select_account',
        login_hint: email,
      });
      res.redirect(
        `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      );
      return;
    }

    const tenant =
      process.env.MICROSOFT_OAUTH_TENANT_ID?.trim() || 'common';
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_OAUTH_CLIENT_ID!.trim(),
      redirect_uri: oauthCallbackUrl('microsoft'),
      response_type: 'code',
      scope: 'openid profile email User.Read offline_access',
      state,
      response_mode: 'query',
      prompt: 'select_account',
      login_hint: email,
    });
    res.redirect(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`,
    );
  }

  async handleGoogleCallback(req: Request, res: Response): Promise<void> {
    await this.handleCallback(req, res, 'google', async (code) => {
      const token = await this.exchangeGoogleCode(code);
      const profile = await this.fetchGoogleProfile(token.access_token!);
      return {
        providerId: profile.sub ?? '',
        email: profile.email ?? '',
        emailVerified: profile.email_verified === true,
      };
    });
  }

  async handleMicrosoftCallback(req: Request, res: Response): Promise<void> {
    await this.handleCallback(req, res, 'microsoft', async (code) => {
      const token = await this.exchangeMicrosoftCode(code);
      return this.resolveMicrosoftProfile(token);
    });
  }

  private async handleCallback(
    req: Request,
    res: Response,
    provider: OAuthProvider,
    resolveProfile: (code: string) => Promise<{
      providerId: string;
      email: string;
      emailVerified: boolean;
    }>,
  ): Promise<void> {
    clearOAuthStateCookie(res);

    const error = typeof req.query.error === 'string' ? req.query.error : null;
    if (error) {
      res.redirect(oauthLoginRedirect('oauth_cancelled'));
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    const cookieState = req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;

    const parsedState =
      parseOAuthState(state ?? undefined) ??
      parseOAuthState(cookieState ?? undefined);
    if (!parsedState || parsedState.provider !== provider) {
      res.redirect(oauthLoginRedirect('oauth_invalid_state'));
      return;
    }

    if (!code) {
      res.redirect(oauthLoginRedirect('oauth_failed'));
      return;
    }

    try {
      const profile = await resolveProfile(code);
      if (!profile.providerId || !profile.email) {
        throw new UnauthorizedException('oauth_profile');
      }

      if (!oauthEmailsMatch(parsedState.emailHint, profile.email)) {
        throw new UnauthorizedException('oauth_email_mismatch');
      }

      const session = await this.authService.loginWithOAuth({
        provider,
        providerId: profile.providerId,
        email: profile.email,
        emailVerified: profile.emailVerified,
      });

      attachAccessTokenCookie(res, session.accessToken);
      res.redirect(oauthLoginRedirect(undefined, session.user.firstAccess));
    } catch (err) {
      this.logger.warn(
        `OAuth ${provider} falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
      const message = err instanceof Error ? err.message : String(err);
      const code =
        err instanceof UnauthorizedException
          ? this.mapOAuthError(err.message)
          : this.mapOAuthProviderError(provider, message);
      res.redirect(oauthLoginRedirect(code));
    }
  }

  private mapOAuthError(message: string): string {
    if (message === 'oauth_not_registered') return 'oauth_not_registered';
    if (message === 'oauth_email_mismatch') return 'oauth_email_mismatch';
    if (message === 'oauth_not_verified') return 'oauth_not_verified';
    if (message === 'oauth_inactive') return 'oauth_inactive';
    if (message === 'oauth_provider_mismatch') return 'oauth_provider_mismatch';
    if (message === 'oauth_profile') return 'oauth_microsoft_profile';
    return 'oauth_failed';
  }

  private mapOAuthProviderError(
    provider: OAuthProvider,
    message: string,
  ): string {
    const normalized = message.toLowerCase();
    if (
      provider === 'microsoft' &&
      (normalized.includes('invalid_client') ||
        normalized.includes('microsoft_token_exchange'))
    ) {
      return 'oauth_microsoft_secret';
    }
    if (
      provider === 'microsoft' &&
      (normalized.includes('oauth_profile') ||
        normalized.includes('microsoft_profile') ||
        normalized.includes('microsoft_missing_id_token'))
    ) {
      return 'oauth_microsoft_profile';
    }
    return 'oauth_failed';
  }

  private async resolveMicrosoftProfile(token: OAuthTokenResponse): Promise<{
    providerId: string;
    email: string;
    emailVerified: boolean;
  }> {
    const claims = this.decodeIdTokenClaims(token.id_token);
    let email = (
      claims.email ||
      claims.preferred_username ||
      claims.upn ||
      claims.unique_name ||
      ''
    ).trim();

    let providerId = claims.oid || claims.sub || '';

    if ((!email || !providerId) && token.access_token) {
      const me = await this.fetchMicrosoftGraphMe(token.access_token);
      if (!email) {
        email = (me.mail || me.userPrincipalName || '').trim();
      }
      if (!providerId && me.id) {
        providerId = me.id;
      }
    }

    if (!providerId || !email) {
      throw new UnauthorizedException('oauth_profile');
    }

    return {
      providerId,
      email,
      emailVerified: email.includes('@'),
    };
  }

  private async fetchMicrosoftGraphMe(
    accessToken: string,
  ): Promise<MicrosoftGraphMe> {
    const response = await fetch(
      'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const data = (await response.json()) as MicrosoftGraphMe & {
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(
        data.error?.message || 'microsoft_graph_me_failed',
      );
    }
    return data;
  }

  private async exchangeGoogleCode(code: string): Promise<OAuthTokenResponse> {
    const body = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!.trim(),
      redirect_uri: oauthCallbackUrl('google'),
      grant_type: 'authorization_code',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const data = (await response.json()) as OAuthTokenResponse & {
      error?: string;
    };
    if (!response.ok || !data.access_token) {
      throw new Error(data.error || 'google_token_exchange_failed');
    }
    return data;
  }

  private async fetchGoogleProfile(accessToken: string): Promise<GoogleUserInfo> {
    const response = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const data = (await response.json()) as GoogleUserInfo & { error?: string };
    if (!response.ok) {
      throw new Error(data.error || 'google_userinfo_failed');
    }
    return data;
  }

  private async exchangeMicrosoftCode(code: string): Promise<OAuthTokenResponse> {
    const tenant =
      process.env.MICROSOFT_OAUTH_TENANT_ID?.trim() || 'common';
    const body = new URLSearchParams({
      code,
      client_id: process.env.MICROSOFT_OAUTH_CLIENT_ID!.trim(),
      client_secret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET!.trim(),
      redirect_uri: oauthCallbackUrl('microsoft'),
      grant_type: 'authorization_code',
    });

    const response = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );

    const data = (await response.json()) as OAuthTokenResponse & {
      error?: string;
      error_description?: string;
    };
    if (!response.ok || !data.id_token) {
      const detail = [data.error, data.error_description]
        .filter(Boolean)
        .join(': ');
      throw new Error(detail || 'microsoft_token_exchange_failed');
    }
    return data;
  }

  private decodeIdTokenClaims(idToken?: string): MicrosoftIdTokenClaims {
    if (!idToken) {
      throw new Error('microsoft_missing_id_token');
    }
    const parts = idToken.split('.');
    if (parts.length < 2) {
      throw new Error('microsoft_invalid_id_token');
    }
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as MicrosoftIdTokenClaims;
    return payload;
  }

  async assertOAuthUserAvailable(email: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: email.trim(), mode: 'insensitive' },
        deletedAt: null,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    return Boolean(user);
  }
}
