import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { LoginUseCase } from '../../../application/use-cases/login.use-case';
import { CreateUserUseCase } from '../../../application/use-cases/create-user.use-case';
import { ChangePasswordUseCase } from '../../../application/use-cases/change-password.use-case';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { CurrentUserId } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly createUser: CreateUserUseCase,
    private readonly changePassword: ChangePasswordUseCase,
  ) {}

  @Post('login')
  execute(@Body() dto: LoginDto) {
    return this.login.execute(dto);
  }

  /**
   * Sin registro público (docs/10) — solo un usuario ya autenticado con
   * role: 'admin' puede crear cuentas nuevas, para no montar un panel de
   * administración aparte y a la vez poder dar de alta jugadores de prueba
   * sin tocar la base de datos a mano.
   */
  @Post('users')
  @UseGuards(JwtAuthGuard, AdminGuard)
  createAccount(@CurrentUserId() requestingUserId: string, @Body() dto: CreateUserDto) {
    return this.createUser.execute({ requestingUserId, ...dto });
  }

  /**
   * Reseteo de contraseña: solo un admin, y puede cambiar la de cualquier
   * usuario (incluida la suya) sin necesidad de la contraseña actual.
   */
  @Patch('users/:userId/password')
  @UseGuards(JwtAuthGuard, AdminGuard)
  changeUserPassword(
    @CurrentUserId() requestingUserId: string,
    @Param('userId') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.changePassword.execute({
      requestingUserId,
      targetUserId: userId,
      newPassword: dto.newPassword,
    });
  }
}
