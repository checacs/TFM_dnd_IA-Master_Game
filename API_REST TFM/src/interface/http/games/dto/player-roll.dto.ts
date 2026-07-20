import { IsOptional, IsString } from 'class-validator';

export class PlayerRollDto {
  /** Necesario para atribuir la tirada a un jugador en el narrativeLog (ver PlayerRollUseCase) y para
   * comprobar que el personaje pertenece a quien pide la tirada. */
  @IsString()
  characterId!: string;

  /** Notación de dados (ej. "1d20", "2d6+3"). Por defecto "1d20" — el botón "Tirar Dados" del móvil no obliga a elegir notación. */
  @IsOptional()
  @IsString()
  notation?: string;
}
