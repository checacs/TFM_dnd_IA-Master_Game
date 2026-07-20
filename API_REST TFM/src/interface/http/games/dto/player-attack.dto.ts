import { IsString, IsInt } from 'class-validator';

export class PlayerAttackDto {
  @IsString()
  attackerCharacterId!: string;

  @IsString()
  targetId!: string;

  @IsInt()
  targetArmorClass!: number;
}
