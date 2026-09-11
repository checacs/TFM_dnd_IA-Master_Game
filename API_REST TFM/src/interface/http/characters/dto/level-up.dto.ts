import { IsIn } from 'class-validator';
import { AttributeKey } from '../../../../domain/entities/character.entity';

const ATTRIBUTE_KEYS: AttributeKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export class LevelUpDto {
  @IsIn(ATTRIBUTE_KEYS)
  attribute!: AttributeKey;
}
