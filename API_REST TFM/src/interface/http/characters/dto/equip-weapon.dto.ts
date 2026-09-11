import { IsString, MinLength } from 'class-validator';

export class EquipWeaponDto {
  @IsString()
  @MinLength(1)
  equipmentId!: string;
}
