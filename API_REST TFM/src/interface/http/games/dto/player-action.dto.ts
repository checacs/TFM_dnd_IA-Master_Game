import { IsString } from 'class-validator';

export class PlayerActionDto {
  @IsString()
  characterId!: string;

  @IsString()
  content!: string;
}
