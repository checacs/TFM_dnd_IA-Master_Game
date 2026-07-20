import { IsString, MinLength } from 'class-validator';

export class AddToInventoryDto {
  @IsString()
  @MinLength(1)
  equipmentId!: string;
}
