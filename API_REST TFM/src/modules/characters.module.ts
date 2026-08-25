import { Module } from '@nestjs/common';
import { CharactersController } from '../interface/http/characters/characters.controller';
import { LevelUpUseCase } from '../application/use-cases/level-up.use-case';
import { AddToInventoryUseCase } from '../application/use-cases/add-to-inventory.use-case';
import { EquipWeaponUseCase } from '../application/use-cases/equip-weapon.use-case';
import { EquipItemUseCase } from '../application/use-cases/equip-item.use-case';
import { DeleteCharacterUseCase } from '../application/use-cases/delete-character.use-case';

// AdminGuard no se declara aquí como provider -- igual que en GamesModule
// (que ya lo usa en DELETE /games/:gameId sin declararlo), Nest lo resuelve
// igualmente porque USER_REPOSITORY (su única dependencia) es global
// (PersistenceModule).
@Module({
  controllers: [CharactersController],
  providers: [LevelUpUseCase, AddToInventoryUseCase, EquipWeaponUseCase, EquipItemUseCase, DeleteCharacterUseCase],
})
export class CharactersModule {}
