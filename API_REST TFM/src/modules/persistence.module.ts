import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GAME_REPOSITORY } from '../domain/ports/game.repository.port';
import { CHARACTER_REPOSITORY } from '../domain/ports/character.repository.port';
import { ENEMY_REPOSITORY } from '../domain/ports/enemy.repository.port';
import { MAP_REPOSITORY } from '../domain/ports/map.repository.port';
import { USER_REPOSITORY } from '../domain/ports/user.repository.port';
import { SPELL_REPOSITORY } from '../domain/ports/spell.repository.port';
import { RULES_REFERENCE_REPOSITORY } from '../domain/ports/rules-reference.repository.port';
import { EQUIPMENT_REPOSITORY } from '../domain/ports/equipment.repository.port';
import { MAGIC_ITEM_REPOSITORY } from '../domain/ports/magic-item.repository.port';
import { DICE_ROLLER } from '../domain/ports/dice-roller.port';
import { gameMongooseSchema } from '../infrastructure/persistence/mongoose/schemas/game.schema';
import { characterMongooseSchema } from '../infrastructure/persistence/mongoose/schemas/character.schema';
import { enemyMongooseSchema } from '../infrastructure/persistence/mongoose/schemas/enemy.schema';
import { mapMongooseSchema } from '../infrastructure/persistence/mongoose/schemas/map.schema';
import { userMongooseSchema } from '../infrastructure/persistence/mongoose/schemas/user.schema';
import { spellMongooseSchema } from '../infrastructure/persistence/mongoose/schemas/spell.schema';
import { rulesReferenceMongooseSchema } from '../infrastructure/persistence/mongoose/schemas/rules-reference.schema';
import { equipmentMongooseSchema } from '../infrastructure/persistence/mongoose/schemas/equipment.schema';
import { magicItemMongooseSchema } from '../infrastructure/persistence/mongoose/schemas/magic-item.schema';
import { MongooseGameRepository } from '../infrastructure/persistence/mongoose/repositories/mongoose-game.repository';
import { MongooseCharacterRepository } from '../infrastructure/persistence/mongoose/repositories/mongoose-character.repository';
import { MongooseEnemyRepository } from '../infrastructure/persistence/mongoose/repositories/mongoose-enemy.repository';
import { MongooseMapRepository } from '../infrastructure/persistence/mongoose/repositories/mongoose-map.repository';
import { MongooseUserRepository } from '../infrastructure/persistence/mongoose/repositories/mongoose-user.repository';
import { MongooseSpellRepository } from '../infrastructure/persistence/mongoose/repositories/mongoose-spell.repository';
import { MongooseRulesReferenceRepository } from '../infrastructure/persistence/mongoose/repositories/mongoose-rules-reference.repository';
import { MongooseEquipmentRepository } from '../infrastructure/persistence/mongoose/repositories/mongoose-equipment.repository';
import { MongooseMagicItemRepository } from '../infrastructure/persistence/mongoose/repositories/mongoose-magic-item.repository';
import { RandomDiceRoller } from '../infrastructure/dice/random-dice-roller';

const MONGODB_URI = process.env.URL;

if (!MONGODB_URI) {
  throw new Error(
    'Falta la variable de entorno MONGODB_URI. Crea un archivo .env en la raíz del proyecto ' +
      '(puedes partir de .env.example) con tu cadena de conexión real a MongoDB.',
  );
}

/**
 * @Global() para que cualquier módulo de features (games, characters, auth...)
 * reciba la MISMA instancia de cada repositorio.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forRoot(MONGODB_URI),
    MongooseModule.forFeature([
      { name: 'Game', schema: gameMongooseSchema },
      { name: 'Character', schema: characterMongooseSchema },
      { name: 'Enemy', schema: enemyMongooseSchema },
      { name: 'Map', schema: mapMongooseSchema },
      { name: 'User', schema: userMongooseSchema },
      { name: 'Spell', schema: spellMongooseSchema },
      { name: 'RulesReference', schema: rulesReferenceMongooseSchema },
      { name: 'Equipment', schema: equipmentMongooseSchema },
      { name: 'MagicItem', schema: magicItemMongooseSchema },
    ]),
  ],
  providers: [
    { provide: GAME_REPOSITORY, useClass: MongooseGameRepository },
    { provide: CHARACTER_REPOSITORY, useClass: MongooseCharacterRepository },
    { provide: ENEMY_REPOSITORY, useClass: MongooseEnemyRepository },
    { provide: MAP_REPOSITORY, useClass: MongooseMapRepository },
    { provide: USER_REPOSITORY, useClass: MongooseUserRepository },
    { provide: SPELL_REPOSITORY, useClass: MongooseSpellRepository },
    { provide: RULES_REFERENCE_REPOSITORY, useClass: MongooseRulesReferenceRepository },
    { provide: EQUIPMENT_REPOSITORY, useClass: MongooseEquipmentRepository },
    { provide: MAGIC_ITEM_REPOSITORY, useClass: MongooseMagicItemRepository },
    { provide: DICE_ROLLER, useClass: RandomDiceRoller },
  ],
  exports: [
    GAME_REPOSITORY,
    CHARACTER_REPOSITORY,
    ENEMY_REPOSITORY,
    MAP_REPOSITORY,
    USER_REPOSITORY,
    SPELL_REPOSITORY,
    RULES_REFERENCE_REPOSITORY,
    EQUIPMENT_REPOSITORY,
    MAGIC_ITEM_REPOSITORY,
    DICE_ROLLER,
  ],
})
export class PersistenceModule {}
