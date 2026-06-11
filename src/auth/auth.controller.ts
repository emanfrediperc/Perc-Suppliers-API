import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfirmarTotpDto } from './dto/confirmar-totp.dto';
import { LoginTotpDto } from './dto/login-totp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  /** Paso 2 del login 2FA: validar código TOTP (o de recuperación). */
  @Post('login/totp')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  loginTotp(@Body() dto: LoginTotpDto) {
    return this.authService.loginVerificarTotp(dto.challengeToken, dto.codigo);
  }

  /** Paso 2 del login 2FA cuando el usuario aún no tiene TOTP: confirmar enrolamiento. */
  @Post('login/totp-enrolar')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  loginTotpEnrolar(@Body() dto: LoginTotpDto) {
    return this.authService.loginEnrolarTotp(dto.challengeToken, dto.codigo);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getProfile(@CurrentUser() user: any) {
    return this.authService.getProfile(user.userId);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  findAllUsers() {
    return this.authService.findAllUsers();
  }

  @Patch('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.authService.updateUser(id, dto);
  }

  @Patch('users/:id/reset-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  resetPassword(@Param('id') id: string) {
    return this.authService.resetPassword(id);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(
      user.userId,
      dto.oldPassword,
      dto.newPassword,
    );
  }

  // ── TOTP (segundo factor para step-up de aprobaciones) ─────────────────────

  @Post('totp/enrolar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  enrolarTotp(@CurrentUser() user: any) {
    return this.authService.enrolarTotp(user.userId);
  }

  @Post('totp/confirmar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  confirmarTotp(@CurrentUser() user: any, @Body() dto: ConfirmarTotpDto) {
    return this.authService.confirmarTotp(user.userId, dto.codigo);
  }

  @Delete('totp')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  revocarTotp(@CurrentUser() user: any) {
    return this.authService.revocarTotp(user.userId);
  }

  /** Revocación administrativa (ej. el aprobador perdió el dispositivo). */
  @Delete('users/:id/totp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  revocarTotpAdmin(@Param('id') id: string) {
    return this.authService.revocarTotp(id);
  }
}
