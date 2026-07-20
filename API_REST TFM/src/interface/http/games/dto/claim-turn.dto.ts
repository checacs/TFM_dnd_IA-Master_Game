import { IsString } from 'class-validator';

export class ClaimTurnDto {
  @IsString()
  characterId!: string;
}
