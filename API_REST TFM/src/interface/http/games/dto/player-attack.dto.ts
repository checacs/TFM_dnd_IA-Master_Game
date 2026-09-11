import { IsString } from 'class-validator';

/**
 * La CA del objetivo ya no la manda el cliente (ver ResolvePlayerAttackUseCase):
 * se lee del enemigo del combate activo. Un targetArmorClass enviado por un
 * cliente antiguo lo descarta el ValidationPipe (whitelist: true).
 */
export class PlayerAttackDto {
  @IsString()
  attackerCharacterId!: string;

  @IsString()
  targetId!: string;
}
