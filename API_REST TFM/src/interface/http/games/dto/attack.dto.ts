import { IsString, IsInt, IsOptional, Min, Matches } from 'class-validator';

export class AttackDto {
  @IsString()
  targetId!: string;

  /** Nombre real del atacante -- ver comentario de ResolveAttackInput.attackerName. */
  @IsString()
  attackerName!: string;

  @IsOptional()
  @IsString()
  weaponName?: string;

  @IsInt()
  attackerModifier!: number;

  @IsInt()
  @Min(1)
  targetArmorClass!: number;

  @Matches(/^\d+d\d+(\+\d+)?$/, { message: 'damageDice debe tener el formato "1d6+2"' })
  damageDice!: string;
}
