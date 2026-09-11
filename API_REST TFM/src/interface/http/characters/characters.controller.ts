import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { LevelUpUseCase } from '../../../application/use-cases/level-up.use-case';
import { AddToInventoryUseCase } from '../../../application/use-cases/add-to-inventory.use-case';
import { EquipItemUseCase } from '../../../application/use-cases/equip-item.use-case';
import { DeleteCharacterUseCase } from '../../../application/use-cases/delete-character.use-case';
import { GetCharacterUseCase } from '../../../application/use-cases/get-character.use-case';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
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
    // Renombrado de EquipWeaponUseCase a EquipItemUseCase (mismo endpoint
    // REST /equip): antes solo sabía equipar armas: ahora decide por la
    // categoría real del catálogo si lo que se equipa es un arma, una
    // armadura (recalculando la CA real) o un objeto mágico -- el móvil sigue
    // llamando al mismo endpoint sin tener que saber de antemano qué tipo de
    // objeto es.
    private readonly equipItem: EquipItemUseCase,
    private readonly deleteCharacter: DeleteCharacterUseCase,
    private readonly getCharacter: GetCharacterUseCase,
  ) {}

  /** Ficha del personaje -- el HP actual sale de la partida en curso (ver GetCharacterUseCase). */
  @Get(':id')
  get(@Param('id') id: string) {
    return this.getCharacter.execute({ characterId: id });
  }

  /** Borrado individual desde el panel de administración de usuarios — solo admin (mismo patrón que DELETE /games/:gameId). */
  @Delete(':id')
  @UseGuards(AdminGuard)
  delete(@Param('id') id: string) {
    return this.deleteCharacter.execute({ characterId: id });
  }

  @Post(':id/assign-skill-point')
  assignSkillPoint(@Param('id') id: string, @Body() dto: LevelUpDto, @CurrentUserId() requestingUserId: string) {
    return this.levelUp.execute({ characterId: id, requestingUserId, attribute: dto.attribute });
  }

  /**
   * Añade un objeto del catálogo SIN cobrarlo. Ningún cliente lo usa (el
   * móvil compra con buy_item vía DM, y el DM regala con grant_item): abierto
   * a cualquier jugador permitía conseguir armadura de placas gratis. Queda
   * solo para administración/pruebas.
   */
  @Post(':id/inventory')
  @UseGuards(AdminGuard)
  addItem(@Param('id') id: string, @Body() dto: AddToInventoryDto, @CurrentUserId() requestingUserId: string) {
    return this.addToInventory.execute({ characterId: id, requestingUserId, equipmentId: dto.equipmentId });
  }

  @Post(':id/equip')
  equip(@Param('id') id: string, @Body() dto: EquipWeaponDto, @CurrentUserId() requestingUserId: string) {
    return this.equipItem.execute({ characterId: id, requestingUserId, equipmentId: dto.equipmentId });
  }
}
