import { IsString, IsInt, Min, Max, MinLength } from 'class-validator';

export class CreateGameDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(4)
  maxPlayers!: number;
}
