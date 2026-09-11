import { IsString, IsOptional } from 'class-validator';

export class CastSpellDto {
  @IsString()
  casterCharacterId!: string;

  @IsString()
  spellId!: string;

  @IsOptional()
  @IsString()
  targetId?: string;
}
