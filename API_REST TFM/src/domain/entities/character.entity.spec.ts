import { Character } from './character.entity';
import { DomainError } from '../errors/domain-error';

function buildCharacter(overrides: Partial<Parameters<typeof Character.create>[0]> = {}) {
  return Character.create({
    ownerId: 'user-1',
    gameId: 'game-1',
    name: 'Elyndra',
    class: 'mago',
    attributes: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 11 },
    hp: { current: 11, max: 14 },
    ac: 12,
    unassignedSkillPoints: 2,
    ...overrides,
  });
}

describe('Character', () => {
  describe('inventario y arma equipada', () => {
    it('empieza con el inventario vacío y sin arma equipada', () => {
      const character = buildCharacter();
      expect(character.toSnapshot().inventory).toEqual([]);
      expect(character.toSnapshot().equippedWeaponId).toBeNull();
    });

    it('addToInventory añade un objeto a la mochila', () => {
      const character = buildCharacter();
      character.addToInventory({ equipmentId: 'dagger', name: 'Dagger' });

      expect(character.toSnapshot().inventory).toEqual([{ equipmentId: 'dagger', name: 'Dagger' }]);
    });

    it('equipWeapon fija el arma activa si está en el inventario', () => {
      const character = buildCharacter();
      character.addToInventory({ equipmentId: 'dagger', name: 'Dagger' });
      character.equipWeapon('dagger');

      expect(character.toSnapshot().equippedWeaponId).toBe('dagger');
    });

    it('equipWeapon lanza DomainError si el objeto no está en el inventario', () => {
      const character = buildCharacter();
      expect(() => character.equipWeapon('dagger')).toThrow(DomainError);
    });
  });

  describe('createNew', () => {
    it('asigna la matriz de atributos base según la clase', () => {
      const guerrero = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Thane', class: 'guerrero' });
      expect(guerrero.attributeModifier('str')).toBe(3); // 16 -> +3

      const mago = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Elyndra', class: 'mago' });
      expect(mago.attributeModifier('int')).toBe(3); // 16 -> +3
    });

    it('calcula el HP inicial como base de clase + modificador de constitución', () => {
      // Guerrero: base 12, con 14 -> mod +2 => HP 14
      const guerrero = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Thane', class: 'guerrero' });
      expect(guerrero.toSnapshot().hp).toEqual({ current: 14, max: 14 });
    });

    it('calcula la CA inicial como 10 + modificador de destreza', () => {
      // Pícaro: dex 16 -> mod +3 => CA 13
      const picaro = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Mira', class: 'picaro' });
      expect(picaro.toSnapshot().ac).toBe(13);
    });

    it('empieza en nivel 1, sin XP y sin puntos de habilidad sin asignar', () => {
      const character = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Thane', class: 'guerrero' });
      const snapshot = character.toSnapshot();
      expect(snapshot.level).toBe(1);
      expect(snapshot.xp).toBe(0);
      expect(snapshot.unassignedSkillPoints).toBe(0);
    });

    it('un mago empieza con 2 conjuros conocidos (docs/01, tabla de progresión nivel 1) y 2 slots de nivel 1', () => {
      // Antes esto era [] -- se detectó en partida real que un jugador de mago
      // entraba en su primer combate sin ningún hechizo ni cómo lanzarlo, pese
      // a que la spec dice "2 conjuros conocidos" para un conjurador de nivel 1.
      const mago = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Elyndra', class: 'mago' });
      expect(mago.toSnapshot().spells).toEqual({
        known: ['magic-missile', 'mage-armor'],
        slots: { level1: { max: 2, used: 0 }, level2: { max: 0, used: 0 } },
      });
    });

    it('un clérigo empieza con sus propios 2 conjuros conocidos (distintos a los del mago)', () => {
      const clerigo = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Bram', class: 'clerigo' });
      expect(clerigo.toSnapshot().spells).toEqual({
        known: ['guiding-bolt', 'bless'],
        slots: { level1: { max: 2, used: 0 }, level2: { max: 0, used: 0 } },
      });
    });

    it('las clases no conjuradoras no tienen conjuros', () => {
      const guerrero = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Thane', class: 'guerrero' });
      expect(guerrero.toSnapshot().spells).toBeNull();
    });
  });

  describe('gainXp', () => {
    it('sube de nivel cuando la XP alcanza el umbral y otorga 2 puntos de habilidad', () => {
      const character = buildCharacter({ class: 'guerrero', xp: 0, unassignedSkillPoints: 0 });
      character.gainXp(300); // umbral de nivel 2
      const snapshot = character.toSnapshot();
      expect(snapshot.level).toBe(2);
      expect(snapshot.xp).toBe(300);
      expect(snapshot.unassignedSkillPoints).toBe(2);
    });

    it('no sube de nivel si la XP no alcanza el umbral', () => {
      const character = buildCharacter({ xp: 0 });
      character.gainXp(100);
      expect(character.toSnapshot().level).toBe(1);
    });

    it('sube varios niveles de golpe si la XP alcanza para más de un salto', () => {
      const character = buildCharacter({ class: 'guerrero', xp: 0, unassignedSkillPoints: 0 });
      character.gainXp(1000); // supera el umbral de nivel 2 (300) y el de nivel 3 (900)
      const snapshot = character.toSnapshot();
      expect(snapshot.level).toBe(3);
      expect(snapshot.unassignedSkillPoints).toBe(4); // 2 puntos por cada uno de los 2 niveles
    });

    it('no sube más allá del nivel máximo (5) del MVP', () => {
      const character = buildCharacter({ class: 'guerrero', xp: 6500, unassignedSkillPoints: 0 });
      character.gainXp(999999);
      expect(character.toSnapshot().level).toBe(5);
    });

    it('un conjurador gana slots de conjuro al subir de nivel, según la tabla de progresión', () => {
      const clerigo = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Bram', class: 'clerigo' });
      clerigo.gainXp(300); // nivel 2 -> +1 slot nivel 1
      expect(clerigo.toSnapshot().spells?.slots.level1.max).toBe(3); // 2 iniciales + 1
    });

    it('una clase no conjuradora no ve afectados sus conjuros (siguen siendo null)', () => {
      const guerrero = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Thane', class: 'guerrero' });
      guerrero.gainXp(300);
      expect(guerrero.toSnapshot().spells).toBeNull();
    });
  });

  describe('attributeModifier', () => {
    it('calcula el modificador con la fórmula floor((valor - 10) / 2)', () => {
      const character = buildCharacter();
      expect(character.attributeModifier('int')).toBe(3); // (16-10)/2 = 3
      expect(character.attributeModifier('str')).toBe(-1); // floor(-2/2) = -1
      expect(character.attributeModifier('wis')).toBe(0); // (10-10)/2 = 0
    });
  });

  describe('assignSkillPoint', () => {
    it('incrementa el atributo y descuenta un punto disponible', () => {
      const character = buildCharacter({ unassignedSkillPoints: 2 });
      character.assignSkillPoint('con');
      expect(character.attributeModifier('con')).toBe(1); // 12 -> 13, floor(3/2)=1
      expect(character.toSnapshot().unassignedSkillPoints).toBe(1);
    });

    it('lanza DomainError si no hay puntos disponibles', () => {
      const character = buildCharacter({ unassignedSkillPoints: 0 });
      expect(() => character.assignSkillPoint('con')).toThrow(DomainError);
    });
  });

  describe('receiveDamage', () => {
    it('resta el daño al HP actual', () => {
      const character = buildCharacter({ hp: { current: 11, max: 14 } });
      character.receiveDamage(4);
      expect(character.toSnapshot().hp.current).toBe(7);
    });

    it('nunca baja el HP por debajo de 0', () => {
      const character = buildCharacter({ hp: { current: 3, max: 14 } });
      character.receiveDamage(999);
      expect(character.toSnapshot().hp.current).toBe(0);
    });
  });

  describe('isDefeated', () => {
    it('es true cuando el HP actual llega a 0', () => {
      const character = buildCharacter({ hp: { current: 5, max: 14 } });
      character.receiveDamage(5);
      expect(character.isDefeated()).toBe(true);
    });

    it('es false mientras el HP sea mayor que 0', () => {
      const character = buildCharacter({ hp: { current: 5, max: 14 } });
      character.receiveDamage(4);
      expect(character.isDefeated()).toBe(false);
    });
  });
});
