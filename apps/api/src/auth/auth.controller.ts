import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  ConfiguracaoCookie,
  REFRESH_COOKIE,
  definirCookiesDeSessao,
  lerCookie,
  limparCookiesDeSessao,
} from './auth-cookies';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from './types/jwt-payload.type';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { TwoFactorCodeDto } from './dto/two-factor-code.dto';

/**
 * Tentativas de login por minuto, por IP.
 *
 * Antes valia só o limite global de 100/min, o que dava 144 mil chutes de
 * senha por dia contra a conta de um balconista. Vinte por minuto derruba a
 * viabilidade do chute em massa sem atrapalhar quem só errou a senha.
 *
 * Duas ressalvas honestas:
 *
 * 1. O balde é por IP. Uma loja inteira atrás da mesma internet divide o
 *    mesmo limite — por isso o número não é mais apertado que isto, e por
 *    isso ele é configurável: quem tem muita gente no balcão sobe, quem
 *    expõe o painel na internet aberta desce.
 * 2. Justamente por ser por IP, um atacante insistente também consome o
 *    limite do dono. Isto reduz o chute em massa; não substitui senha
 *    decente nem 2FA para quem mexe com dinheiro.
 *
 * Lido de `process.env` e não do ConfigService porque o decorador é avaliado
 * quando a classe é montada, antes de existir injeção de dependência. A
 * variável está declarada em env.validation.ts junto com as outras.
 */
const LIMITE_DE_LOGIN = Number(process.env.LOGIN_RATE_LIMIT ?? 20);

/**
 * Quantos pedidos de redefinição de senha por quarto de hora.
 *
 * Cinco é o certo em produção: a rota é pública e dispara e-mail, então sem
 * freio ela vira metralhadora de spam contra a caixa de alguém. Mas é apertado
 * demais para a suíte de testes, que exercita o fluxo inteiro a cada execução —
 * rodar a suíte duas vezes em quinze minutos estoura o limite, e os dois testes
 * de senha falham como se o sistema estivesse quebrado. Configurável pelo mesmo
 * motivo e do mesmo jeito que o limite de login.
 */
const LIMITE_DE_REDEFINICAO = Number(process.env.PASSWORD_RESET_RATE_LIMIT ?? 5);

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private get configCookie(): ConfiguracaoCookie {
    return {
      producao: this.config.get<string>('NODE_ENV') === 'production',
      duracaoAccess: this.config.get<string>('JWT_ACCESS_EXPIRES_IN'),
      duracaoRefresh: this.config.get<string>('JWT_REFRESH_EXPIRES_IN'),
    };
  }

  /**
   * Grava a sessão nos cookies e devolve a mesma resposta de antes.
   *
   * Os tokens continuam no corpo porque nem todo cliente é navegador: a suíte
   * de ponta a ponta, scripts e qualquer integração usam o header Authorization.
   * Para o painel eles passaram a ser ignorados — quem manda é o cookie.
   */
  private comSessao<T extends { accessToken: string; refreshToken: string }>(res: Response, resultado: T): T {
    definirCookiesDeSessao(res, resultado, this.configCookie);
    return resultado;
  }

  @Public()
  @Post('register-tenant')
  async registerTenant(@Body() dto: RegisterTenantDto, @Res({ passthrough: true }) res: Response) {
    return this.comSessao(res, await this.authService.registerTenant(dto));
  }

  @Throttle({ default: { limit: LIMITE_DE_LOGIN, ttl: 60_000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    // Com 2FA ativo e código ausente ou errado, o serviço lança 401 — nunca
    // chega aqui sem token, então não existe caminho de "sessão pela metade".
    return this.comSessao(res, await this.authService.login(dto));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = dto.refreshToken ?? lerCookie(req, REFRESH_COOKIE);
    return this.comSessao(res, await this.authService.refresh({ refreshToken }));
  }

  // Limite bem mais apertado que o global (100/min): estas duas rotas são
  // públicas e disparam e-mail. Sem o freio, dá para usar o sistema como
  // metralhadora de spam contra o e-mail de alguém, e para tentar adivinhar
  // token de redefinição por força bruta.
  @Public()
  @Throttle({ default: { limit: LIMITE_DE_REDEFINICAO, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  // O dobro do pedido: cada redefinição pedida pode ter uma tentativa que
  // erra a senha nova e outra que acerta.
  @Throttle({ default: { limit: LIMITE_DE_REDEFINICAO * 2, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Os cookies saem mesmo que a revogação não ache o token: o objetivo de
    // quem clicou em "sair" é encerrar a sessão NESTE navegador, e isso não
    // pode depender de o refresh token ainda existir no banco.
    limparCookiesDeSessao(res, this.configCookie.producao);
    await this.authService.logout(user.sub, dto.refreshToken ?? lerCookie(req, REFRESH_COOKIE));
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.sub);
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch('password')
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    await this.authService.changePassword(user.sub, dto);
  }

  @ApiBearerAuth()
  @Post('2fa/generate')
  generateTwoFactor(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.generateTwoFactorSecret(user.sub);
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('2fa/enable')
  async enableTwoFactor(@CurrentUser() user: AuthenticatedUser, @Body() dto: TwoFactorCodeDto) {
    await this.authService.enableTwoFactor(user.sub, user.tenantId, dto.code);
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('2fa/disable')
  async disableTwoFactor(@CurrentUser() user: AuthenticatedUser, @Body() dto: TwoFactorCodeDto) {
    await this.authService.disableTwoFactor(user.sub, user.tenantId, dto.code);
  }
}
