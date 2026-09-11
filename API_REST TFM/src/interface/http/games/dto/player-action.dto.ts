import { IsString, MaxLength, MinLength } from 'class-validator';

export class PlayerActionDto {
  @IsString()
  characterId!: string;

  /** Tope de longitud: el texto va al narrativeLog y al historial que se manda a dm-engine en cada turno. */
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}
