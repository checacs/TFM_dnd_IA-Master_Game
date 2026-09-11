import { IsString, IsInt, Min, Max, MinLength, MaxLength } from 'class-validator';

export class CreateGameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  /** 2-4, igual que Game.create (antes @Min(1): el DTO aceptaba 1 y el dominio lo rechazaba después). */
  @IsInt()
  @Min(2)
  @Max(4)
  maxPlayers!: number;
}
