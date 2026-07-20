import { Body, Controller, Get, Inject, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { LevelUpUseCase } from '../../../application/use-cases/level-up.use-case';
import { AddToInventoryUseCase } from '../../../application/use-cases/add-to-inventory.use-case';
import { EquipWeaponUseCase } from '../../../application/use-cases/equip-weapon.use-case';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../../domain/ports/character.repository.port';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { LevelUpDto } from './dto/level-up.dto';
import { AddToInventoryDto } from './dto/add-to-inventory.dto';
import { EquipWeaponDto } from './dto/equip-weapon.dto';

@UseGuards(JwtAuthGuard)
@Controller('characters')
export class CharactersController {
  constructor(
    private readonly levelUp: LevelUpUseCase,
    private readonly addToInventory: AddToInventoryUseCase,
    private readonly equipWeapon: EquipWeaponUseCase,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
  ) {}

  @Get(':id')
  async get(@Param('id') id: string) {
    const character = await this.characters.findById(id);
    if (!character) {
      throw new NotFoundException('Personaje no encontrado');
    }
    return character.toSnapshot();
  }

  @Post(':id/assign-skill-point')
  assignSkillPoint(@Param('id') id: string, @Body() dto: LevelUpDto, @CurrentUserId() requestingUserId: string) {
    return this.levelUp.execute({ characterId: id, requestingUserId, attribute: dto.attribute });
  }

  @Post(':id/inventory')
  addItem(@Param('id') id: string, @Body() dto: AddToInventoryDto, @CurrentUserId() requestingUserId: string) {
    return this.addToInventory.execute({ characterId: id, requestingUserId, equipmentId: dto.equipmentId });
  }

  @Post(':id/equip')
  equip(@Param('id') id: string, @Body() dto: EquipWeaponDto, @CurrentUserId() requestingUserId: string) {
    return this.equipWeapon.execute({ characterId: id, requestingUserId, equipmentId: dto.equipmentId });
  }
}
