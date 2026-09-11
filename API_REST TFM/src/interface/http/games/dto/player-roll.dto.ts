import { IsOptional, IsString, Matches } from 'class-validator';
import { PLAYER_ROLL_NOTATION } from '../../../../application/use-cases/player-roll.use-case';

export class PlayerRollDto {
  /** Necesario para atribuir la tirada a un jugador en el narrativeLog (ver PlayerRollUseCase) y para
   * comprobar que el personaje pertenece a quien pide la tirada. */
  @IsString()
  characterId!: string;

  /** Notación de dados (ej. "1d20", "2d6"; sin modificador, ver PLAYER_ROLL_NOTATION). Por defecto "1d20" — el botón "Tirar Dados" del móvil no obliga a elegir notación. */
  @IsOptional()
  @IsString()
  @Matches(PLAYER_ROLL_NOTATION, { message: 'notation debe ser de 1 a 10 dados estándar sin modificador (ej. "1d20", "2d6")' })
  notation?: string;
}
