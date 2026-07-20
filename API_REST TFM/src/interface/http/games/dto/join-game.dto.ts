import { IsString, MinLength, IsIn } from 'class-validator';
import { CharacterClass } from '../../../../domain/entities/character.entity';

const CHARACTER_CLASSES: CharacterClass[] = ['guerrero', 'picaro', 'mago', 'clerigo'];

export class JoinGameDto {
  @IsString()
  @MinLength(1)
  characterName!: string;

  @IsIn(CHARACTER_CLASSES)
  characterClass!: CharacterClass;
}
