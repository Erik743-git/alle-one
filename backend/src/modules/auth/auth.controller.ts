import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuthOAuthService } from './auth-oauth.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { FirstAccessDto } from './dto/first-access.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ValidateResetTokenDto } from './dto/validate-reset-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedRequestUser } from './auth-request-user';
import {
  attachAccessTokenCookie,
  clearAccessTokenCookie,
} from './auth-cookie.helper';
import {
  TOTP_TRUST_COOKIE,
  attachTotpTrustCookie,
  clearTotpTrustCookie,
} from './totp-trust-cookie.helper';
import { Public } from '../../common/decorators/public.decorator';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { SwitchCompanyDto } from './dto/switch-company.dto';

class TotpCodeDto {
  @IsString()
  code!: string;
}

class OAuthComplete2faDto {
  @IsString()
  code!: string;

  @IsOptional()
  @IsBoolean()
  rememberDevice?: boolean;
}

class DisableTotpDto {
  @IsString()
  code!: string;

  @IsString()
  password!: string;
}

type AuthenticatedRequest = Request & {
  user: AuthenticatedRequestUser;
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authOAuth: AuthOAuthService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get('oauth/providers')
  oauthProviders() {
    return this.authOAuth.getProvidersStatus();
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('google')
  googleLogin(@Res() res: Response, @Query('email') email?: string): void {
    this.authOAuth.startGoogle(res, email);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('google/callback')
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.authOAuth.handleGoogleCallback(req, res);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('microsoft')
  microsoftLogin(@Res() res: Response, @Query('email') email?: string): void {
    this.authOAuth.startMicrosoft(res, email);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('microsoft/callback')
  async microsoftCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.authOAuth.handleMicrosoftCallback(req, res);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('oauth/complete-2fa')
  async completeOAuth2fa(
    @Body() body: OAuthComplete2faDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authOAuth.completeOAuth2fa(req, res, body);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() data: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const headerTrust = req.headers['x-alleone-device-trust'];
    const trustCookie =
      (typeof req.cookies?.[TOTP_TRUST_COOKIE] === 'string'
        ? req.cookies[TOTP_TRUST_COOKIE]
        : undefined) ||
      (typeof data.deviceTrustToken === 'string' && data.deviceTrustToken
        ? data.deviceTrustToken
        : undefined) ||
      (typeof headerTrust === 'string' && headerTrust.trim()
        ? headerTrust.trim()
        : undefined);
    const result = await this.authService.login(data, { trustCookie });
    attachAccessTokenCookie(res, result.accessToken);
    if (result.totpTrustToken) {
      attachTotpTrustCookie(res, result.totpTrustToken);
    }
    const { accessToken: _omit, totpTrustToken, ...safe } = result;
    return {
      ...safe,
      ...(totpTrustToken ? { deviceTrustToken: totpTrustToken } : {}),
    };
  }

  @Public()
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post('primeiro-acesso')
  firstAccess(@Body() data: FirstAccessDto) {
    return this.authService.firstAccess(data);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('esqueci-senha')
  forgotPassword(@Body() data: ForgotPasswordDto) {
    return this.authService.forgotPassword(data);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('validar-token-redefinicao')
  validateResetToken(@Body() data: ValidateResetTokenDto) {
    return this.authService.validateResetToken(data);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('redefinir-senha')
  resetPassword(@Body() data: ResetPasswordDto) {
    return this.authService.resetPassword(data);
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    // Não limpa alleone_totp_trust — “lembrar dispositivo” deve sobreviver ao logout.
    clearAccessTokenCookie(res);
    return { message: 'Sessão encerrada' };
  }

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: AuthenticatedRequest) {
    return this.authService.me(req.user.userId);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Post('switch-company')
  async switchCompany(
    @Req() req: AuthenticatedRequest,
    @Body() body: SwitchCompanyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.switchCompany(
      req.user.userId,
      body.companyId,
    );
    attachAccessTokenCookie(res, session.accessToken);
    return session;
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  setup2fa(@Req() req: AuthenticatedRequest) {
    return this.authService.beginTotpSetup(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/confirm')
  async confirm2fa(
    @Req() req: AuthenticatedRequest,
    @Body() body: TotpCodeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.confirmTotpSetup(
      req.user.userId,
      body.code,
    );
    // Novo totpEnabledAt invalida tokens antigos; limpa cookie residual.
    clearTotpTrustCookie(res);
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  async disable2fa(
    @Req() req: AuthenticatedRequest,
    @Body() body: DisableTotpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.disableTotp(
      req.user.userId,
      body.code,
      body.password,
    );
    clearTotpTrustCookie(res);
    return result;
  }
}
