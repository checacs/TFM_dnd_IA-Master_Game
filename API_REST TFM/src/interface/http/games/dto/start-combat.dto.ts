import { IsArray, IsString, IsOptional } from 'class-validator';

export class StartCombatDto {
  @IsArray()
  @IsString({ each: true })
  enemyIds!: string[];

  @IsOptional()
  @IsString()
  mapId?: string;
}
