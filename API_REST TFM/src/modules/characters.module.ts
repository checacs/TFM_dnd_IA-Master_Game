import { Module } from '@nestjs/common';
import { CharactersController } from '../interface/http/characters/characters.controller';
import { LevelUpUseCase } from '../application/use-cases/level-up.use-case';
import { AddToInventoryUseCase } from '../application/use-cases/add-to-inventory.use-case';
import { EquipWeaponUseCase } from '../application/use-cases/equip-weapon.use-case';

@Module({
  controllers: [CharactersController],
  providers: [LevelUpUseCase, AddToInventoryUseCase, EquipWeaponUseCase],
})
export class CharactersModule {}
