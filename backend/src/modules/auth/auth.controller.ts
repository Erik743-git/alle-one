import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
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

type AuthenticatedRequest = Request & {
  user: AuthenticatedRequestUser;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() data: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(data);
    attachAccessTokenCookie(res, result.accessToken);
    const { accessToken: _omit, ...safe } = result;
    return safe;
  }

  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post('primeiro-acesso')
  firstAccess(@Body() data: FirstAccessDto) {
    return this.authService.firstAccess(data);
  }

  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('esqueci-senha')
  forgotPassword(@Body() data: ForgotPasswordDto) {
    return this.authService.forgotPassword(data);
  }

  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('validar-token-redefinicao')
  validateResetToken(@Body() data: ValidateResetTokenDto) {
    return this.authService.validateResetToken(data);
  }

  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('redefinir-senha')
  resetPassword(@Body() data: ResetPasswordDto) {
    return this.authService.resetPassword(data);
  }

  @HttpCode(200)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    clearAccessTokenCookie(res);
    return { message: 'Sessão encerrada' };
  }

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: AuthenticatedRequest) {
    return this.authService.me(req.user.userId);
  }
}
