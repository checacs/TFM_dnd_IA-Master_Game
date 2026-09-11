import { IsString, IsInt, IsOptional, Min, Max, Matches } from 'class-validator';

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
  @Min(-10)
  @Max(20)
  attackerModifier!: number;

  @IsInt()
  @Min(1)
  targetArmorClass!: number;

  @Matches(/^\d{1,3}d\d{1,4}([+-]\d{1,4})?$/, { message: 'damageDice debe tener el formato "1d6+2"' })
  damageDice!: string;
}
