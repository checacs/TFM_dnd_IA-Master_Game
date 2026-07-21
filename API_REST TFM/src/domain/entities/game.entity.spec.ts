import { Game } from './game.entity';
import { DomainError } from '../errors/domain-error';

function buildGame(overrides: Partial<Parameters<typeof Game.create>[0]> = {}) {
  return Game.create({
    name: 'La torre olvidada',
    hostUserId: 'host-1',
    maxPlayers: 4,
    ...overrides,
  });
}

describe('Game', () => {
  describe('condiciones activas', () => {
    it('un jugador y un enemigo empiezan sin condiciones', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 9 });
      expect(game.getConditions('char-1')).toEqual([]);
    });

    it('applyCondition añade una condición a un jugador', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 9 });
      game.applyCondition('char-1', 'frightened');

      expect(game.getConditions('char-1')).toEqual(['frightened']);
    });

    it('applyCondition no duplica la misma condición dos veces', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 9 });
      game.applyCondition('char-1', 'frightened');
      game.applyCondition('char-1', 'frightened');

      expect(game.getConditions('char-1')).toEqual(['frightened']);
    });

    it('applyCondition añade una condición a un enemigo del combate activo', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 9 });
      game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 14 });
      game.launch('host-1');
      game.startEncounter({
        enemies: [{ instanceId: 'enc-1-goblin-a', enemyRefId: 'enemy-1', name: 'Goblin explorador', currentHp: 7, ac: 15 }],
      });

      game.applyCondition('enc-1-goblin-a', 'blinded');
      expect(game.getConditions('enc-1-goblin-a')).toEqual(['blinded']);
    });

    it('removeCondition quita una condición ya aplicada', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 9 });
      game.applyCondition('char-1', 'frightened');
      game.removeCondition('char-1', 'frightened');

      expect(game.getConditions('char-1')).toEqual([]);
    });

    it('applyCondition lanza DomainError si el participante no existe', () => {
      const game = buildGame();
      expect(() => game.applyCondition('no-existe', 'frightened')).toThrow(DomainError);
    });
  });

  describe('reconstitute', () => {
    it('rehidrata una partida ya existente sin pasar por las reglas de creación', () => {
      const original = buildGame();
      original.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 14 });

      const rehydrated = Game.reconstitute(original.id, original.toSnapshot());

      expect(rehydrated.id).toBe(original.id);
      expect(rehydrated.toSnapshot()).toEqual(original.toSnapshot());
    });
  });

  describe('create', () => {
    it('lanza DomainError si maxPlayers está fuera del rango 1-4', () => {
      expect(() => buildGame({ maxPlayers: 0 })).toThrow(DomainError);
      expect(() => buildGame({ maxPlayers: 5 })).toThrow(DomainError);
    });
  });

  describe('setBattleMap', () => {
    it('actualiza filas, columnas e imagen de fondo del tablero', () => {
      const game = buildGame();
      game.setBattleMap({ rows: 10, cols: 14, imageUrl: '/maps/taberna-jabali.png' });

      expect(game.toSnapshot().board).toEqual({
        rows: 10,
        cols: 14,
        imageUrl: '/maps/taberna-jabali.png',
        combatPoint: null,
        zones: [],
      });
    });

    it('resetea el punto de combate anterior, porque las dimensiones pueden haber cambiado', () => {
      const game = buildGame();
      game.setCombatPoint({ row: 3, col: 5 });

      game.setBattleMap({ rows: 6, cols: 6, imageUrl: '/maps/otra-sala.png' });

      expect(game.toSnapshot().board.combatPoint).toBeNull();
    });

    it('guarda las zonas del mapa aplicado', () => {
      const game = buildGame();
      const zones = [{ name: 'Sala principal', cells: [{ rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 5 }] }];

      game.setBattleMap({ rows: 10, cols: 14, imageUrl: '/maps/taberna-jabali.png', zones });

      expect(game.toSnapshot().board.zones).toEqual(zones);
    });

    it('zones queda vacío si no se indica al aplicar el mapa', () => {
      const game = buildGame();
      game.setBattleMap({ rows: 10, cols: 14, imageUrl: '/maps/taberna-jabali.png' });

      expect(game.toSnapshot().board.zones).toEqual([]);
    });

    describe('mapHistory (para que el DM-IA pueda evitar repetir mapas ya usados)', () => {
      it('empieza vacío en una partida nueva', () => {
        const game = buildGame();
        expect(game.toSnapshot().mapHistory).toEqual([]);
      });

      it('registra el mapId cada vez que se aplica un mapa del catálogo', () => {
        const game = buildGame();
        game.setBattleMap({ rows: 10, cols: 14, imageUrl: '/maps/taberna.png', mapId: 'tavernaMercenarios' });
        game.setBattleMap({ rows: 34, cols: 18, imageUrl: '/maps/ruinas.png', mapId: 'ruinas-bosque' });

        expect(game.toSnapshot().mapHistory).toEqual(['tavernaMercenarios', 'ruinas-bosque']);
      });

      it('no duplica el mismo mapId si se reaplica dos veces seguidas', () => {
        const game = buildGame();
        game.setBattleMap({ rows: 10, cols: 14, imageUrl: '/maps/taberna.png', mapId: 'tavernaMercenarios' });
        game.setBattleMap({ rows: 10, cols: 14, imageUrl: '/maps/taberna.png', mapId: 'tavernaMercenarios' });

        expect(game.toSnapshot().mapHistory).toEqual(['tavernaMercenarios']);
      });

      it('no registra nada si setBattleMap se llama sin mapId (compatibilidad hacia atrás)', () => {
        const game = buildGame();
        game.setBattleMap({ rows: 10, cols: 14, imageUrl: '/maps/taberna.png' });

        expect(game.toSnapshot().mapHistory).toEqual([]);
      });

      it('toSnapshot devuelve una copia, no la referencia interna', () => {
        const game = buildGame();
        game.setBattleMap({ rows: 10, cols: 14, imageUrl: '/maps/taberna.png', mapId: 'tavernaMercenarios' });
        const snapshot = game.toSnapshot();
        snapshot.mapHistory.push('intruso');

        expect(game.toSnapshot().mapHistory).toEqual(['tavernaMercenarios']);
      });
    });
  });

  describe('clearBattleMap', () => {
    it('quita la imagen y las zonas, volviendo a la cuadrícula plana por defecto', () => {
      const game = buildGame();
      game.setBattleMap({
        rows: 10,
        cols: 14,
        imageUrl: '/maps/taberna-jabali.png',
        zones: [{ name: 'Sala', cells: [{ rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 }] }],
      });

      game.clearBattleMap();

      expect(game.toSnapshot().board).toEqual({ rows: 8, cols: 8, imageUrl: null, combatPoint: null, zones: [] });
    });

    it('resetea el punto de combate anterior', () => {
      const game = buildGame();
      game.setBattleMap({ rows: 10, cols: 14, imageUrl: '/maps/taberna-jabali.png' });
      game.setCombatPoint({ row: 3, col: 5 });

      game.clearBattleMap();

      expect(game.toSnapshot().board.combatPoint).toBeNull();
    });
  });

  describe('board', () => {
    it('empieza con un tablero 8x8 por defecto y sin punto de combate', () => {
      const game = buildGame();
      expect(game.toSnapshot().board).toEqual({ rows: 8, cols: 8, imageUrl: null, combatPoint: null, zones: [] });
    });

    it('permite fijar un tamaño de tablero distinto al crear la partida', () => {
      const game = buildGame({ board: { rows: 6, cols: 6 } });
      expect(game.toSnapshot().board).toEqual({ rows: 6, cols: 6, imageUrl: null, combatPoint: null, zones: [] });
    });

    it('setCombatPoint fija el punto de combate dentro de los límites del tablero', () => {
      const game = buildGame();
      game.setCombatPoint({ row: 3, col: 5 });
      expect(game.toSnapshot().board.combatPoint).toEqual({ row: 3, col: 5 });
    });

    it('lanza DomainError si el punto de combate cae fuera del tablero', () => {
      const game = buildGame({ board: { rows: 4, cols: 4 } });
      expect(() => game.setCombatPoint({ row: 9, col: 0 })).toThrow(DomainError);
    });
  });

  describe('addPlayer', () => {
    it('añade un jugador cuando hay hueco', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      expect(game.toSnapshot().players).toHaveLength(1);
    });

    it('lanza DomainError si la partida ya está completa', () => {
      const game = buildGame({ maxPlayers: 1 });
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      expect(() =>
        game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 12 }),
      ).toThrow(DomainError);
    });

    it('lanza DomainError si el usuario ya está en la partida', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      expect(() =>
        game.addPlayer({ userId: 'user-1', characterId: 'char-2', name: 'Otro personaje', class: 'guerrero', currentHp: 10 }),
      ).toThrow(DomainError);
    });

    it('lanza DomainError si la partida ya ha empezado', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
      game.launch('host-1');
      expect(() =>
        game.addPlayer({ userId: 'user-3', characterId: 'char-3', name: 'Mira', class: 'guerrero', currentHp: 10 }),
      ).toThrow(DomainError);
    });
  });

  describe('launch', () => {
    it('lanza DomainError si quien lo pide no es el host', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
      expect(() => game.launch('user-1')).toThrow(DomainError);
    });

    it('lanza DomainError si hay 0 jugadores', () => {
      const game = buildGame();
      expect(() => game.launch('host-1')).toThrow(DomainError);
    });

    it('pasa la partida a en_curso cuando el host la lanza con jugadores suficientes', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
      game.launch('host-1');
      expect(game.toSnapshot().status).toBe('en_curso');
    });
  });

  describe('applyDamageToParticipant', () => {
    it('reduce el HP de un jugador', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      game.applyDamageToParticipant('char-1', 5);
      const player = game.toSnapshot().players.find((p) => p.characterId === 'char-1');
      expect(player?.currentHp).toBe(9);
    });

    it('nunca baja el HP de un jugador por debajo de 0', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      game.applyDamageToParticipant('char-1', 999);
      const player = game.toSnapshot().players.find((p) => p.characterId === 'char-1');
      expect(player?.currentHp).toBe(0);
    });

    it('reduce el HP de un enemigo dentro del combate activo', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
      game.launch('host-1');
      game.startEncounter({
        enemies: [{ instanceId: 'enc-1-goblin-a', enemyRefId: 'enemy-1', name: 'Goblin explorador', currentHp: 7, ac: 15 }],
      });

      game.applyDamageToParticipant('enc-1-goblin-a', 4);

      const enemy = game.toSnapshot().activeEncounter?.enemies.find((e) => e.instanceId === 'enc-1-goblin-a');
      expect(enemy?.currentHp).toBe(3);
    });

    it('lanza DomainError si el participante no existe en la partida', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      expect(() => game.applyDamageToParticipant('inexistente', 5)).toThrow(DomainError);
    });
  });

  describe('placeParticipant', () => {
    function buildGameWithEncounter() {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      game.launch('host-1');
      game.startEncounter({
        enemies: [{ instanceId: 'enc-1-goblin-a', enemyRefId: 'enemy-1', name: 'Goblin explorador', currentHp: 7, ac: 15 }],
      });
      return game;
    }

    it('un jugador recién añadido empieza sin posición', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      expect(game.toSnapshot().players[0].position).toBeNull();
    });

    it('un enemigo recién creado empieza sin posición', () => {
      const game = buildGameWithEncounter();
      expect(game.toSnapshot().activeEncounter?.enemies[0].position).toBeNull();
    });

    it('coloca a un jugador dentro de los límites del tablero', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });

      game.placeParticipant('char-1', { row: 2, col: 3 });

      expect(game.toSnapshot().players[0].position).toEqual({ row: 2, col: 3 });
    });

    it('coloca a un enemigo del combate activo', () => {
      const game = buildGameWithEncounter();

      game.placeParticipant('enc-1-goblin-a', { row: 1, col: 1 });

      expect(game.toSnapshot().activeEncounter?.enemies[0].position).toEqual({ row: 1, col: 1 });
    });

    it('lanza DomainError si el participante no existe', () => {
      const game = buildGame();
      expect(() => game.placeParticipant('inexistente', { row: 0, col: 0 })).toThrow(DomainError);
    });

    it('lanza DomainError si la posición cae fuera del tablero', () => {
      const game = buildGame({ board: { rows: 4, cols: 4 } });
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });

      expect(() => game.placeParticipant('char-1', { row: 9, col: 0 })).toThrow(DomainError);
    });

    it('sin zonas catalogadas en el mapa, acepta cualquier posición dentro del tablero (compatibilidad hacia atrás)', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      game.setBattleMap({ rows: 8, cols: 8, imageUrl: '/maps/sin-zonas.png' });

      expect(() => game.placeParticipant('char-1', { row: 7, col: 7 })).not.toThrow();
    });

    it('con zonas catalogadas, lanza DomainError si la posición cae fuera de todas las zonas', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      game.setBattleMap({
        rows: 8,
        cols: 8,
        imageUrl: '/maps/con-zonas.png',
        zones: [{ name: 'Sala', cells: [{ rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 }] }],
      });

      expect(() => game.placeParticipant('char-1', { row: 5, col: 5 })).toThrow(DomainError);
    });

    it('con zonas catalogadas, acepta una posición dentro de alguna zona', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      game.setBattleMap({
        rows: 8,
        cols: 8,
        imageUrl: '/maps/con-zonas.png',
        zones: [{ name: 'Sala', cells: [{ rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 }] }],
      });

      game.placeParticipant('char-1', { row: 1, col: 1 });

      expect(game.toSnapshot().players[0].position).toEqual({ row: 1, col: 1 });
    });

    describe('con zoneName (validacion de zona exacta)', () => {
      function buildGameWithTwoZones() {
        const game = buildGame();
        game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
        // Mismo caso real detectado en partida: dos zonas vecinas que comparten el
        // rango de filas y solo difieren en columnas -- faciles de confundir.
        game.setBattleMap({
          rows: 34,
          cols: 18,
          imageUrl: '/maps/ruinas-bosque.png',
          zones: [
            { name: 'Coto de Caza de los Trasgos', cells: [{ rowStart: 20, rowEnd: 28, colStart: 0, colEnd: 9 }] },
            { name: 'Viejo Roble Resonante', cells: [{ rowStart: 20, rowEnd: 28, colStart: 9, colEnd: 17 }] },
          ],
        });
        return game;
      }

      it('acepta la posicion si cae dentro de la zona nombrada', () => {
        const game = buildGameWithTwoZones();
        game.placeParticipant('char-1', { row: 24, col: 12 }, 'Viejo Roble Resonante');
        expect(game.toSnapshot().players[0].position).toEqual({ row: 24, col: 12 });
      });

      it('lanza DomainError si la posicion cae en OTRA zona (el bug real: narrar una zona y colocar en la vecina)', () => {
        const game = buildGameWithTwoZones();
        expect(() =>
          game.placeParticipant('char-1', { row: 24, col: 3 }, 'Viejo Roble Resonante'),
        ).toThrow(DomainError);
      });

      it('lanza DomainError si la zona nombrada no existe en el mapa actual', () => {
        const game = buildGameWithTwoZones();
        expect(() =>
          game.placeParticipant('char-1', { row: 24, col: 12 }, 'Zona que no existe'),
        ).toThrow(DomainError);
      });

      it('sin zoneName, mantiene el comportamiento anterior (acepta cualquier zona)', () => {
        const game = buildGameWithTwoZones();
        expect(() => game.placeParticipant('char-1', { row: 24, col: 3 })).not.toThrow();
      });
    });
  });

  describe('startEncounter — nuevo modelo de rondas', () => {
    it('empieza en fase de jugadores, sin candado y sin nadie que haya actuado', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      game.launch('host-1');

      game.startEncounter({
        enemies: [{ instanceId: 'enc-1-goblin-a', enemyRefId: 'enemy-1', name: 'Goblin explorador', currentHp: 7, ac: 15 }],
      });

      const encounter = game.toSnapshot().activeEncounter;
      expect(encounter?.roundPhase).toBe('jugadores');
      expect(encounter?.turnClaim).toBeNull();
      expect(encounter?.actedThisRound).toEqual([]);
    });
  });

  describe('claimTurn / releaseTurnAfterAction', () => {
    function buildGameInCombat() {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
      game.launch('host-1');
      game.startEncounter({
        enemies: [{ instanceId: 'enc-1-goblin-a', enemyRefId: 'enemy-1', name: 'Goblin explorador', currentHp: 7, ac: 15 }],
      });
      return game;
    }

    it('lanza DomainError si se reclama el turno sin combate activo', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      expect(() => game.claimTurn('char-1')).toThrow(DomainError);
    });

    it('un jugador reclama el turno libremente', () => {
      const game = buildGameInCombat();
      game.claimTurn('char-1');
      expect(game.toSnapshot().activeEncounter?.turnClaim).toBe('char-1');
    });

    it('lanza DomainError si otro jugador ya tiene el turno', () => {
      const game = buildGameInCombat();
      game.claimTurn('char-1');
      expect(() => game.claimTurn('char-2')).toThrow(DomainError);
    });

    it('reclamar el turno dos veces el mismo jugador no lanza error (idempotente)', () => {
      const game = buildGameInCombat();
      game.claimTurn('char-1');
      expect(() => game.claimTurn('char-1')).not.toThrow();
    });

    it('lanza DomainError si el characterId no es un jugador de la partida', () => {
      const game = buildGameInCombat();
      expect(() => game.claimTurn('no-existe')).toThrow(DomainError);
    });

    it('lanza DomainError si el jugador ya actuó esta ronda', () => {
      const game = buildGameInCombat();
      game.claimTurn('char-1');
      game.releaseTurnAfterAction('char-1');
      expect(() => game.claimTurn('char-1')).toThrow(DomainError);
    });

    it('releaseTurnAfterAction libera el candado y marca al jugador como actuado', () => {
      const game = buildGameInCombat();
      game.claimTurn('char-1');
      game.releaseTurnAfterAction('char-1');

      const encounter = game.toSnapshot().activeEncounter;
      expect(encounter?.turnClaim).toBeNull();
      expect(encounter?.actedThisRound).toEqual(['char-1']);
    });

    it('lanza DomainError si se libera un turno que no se tiene', () => {
      const game = buildGameInCombat();
      game.claimTurn('char-1');
      expect(() => game.releaseTurnAfterAction('char-2')).toThrow(DomainError);
    });

    it('cuando todos los jugadores vivos han actuado, la fase pasa a enemigos', () => {
      const game = buildGameInCombat();
      game.claimTurn('char-1');
      game.releaseTurnAfterAction('char-1');
      expect(game.toSnapshot().activeEncounter?.roundPhase).toBe('jugadores');

      game.claimTurn('char-2');
      game.releaseTurnAfterAction('char-2');
      expect(game.toSnapshot().activeEncounter?.roundPhase).toBe('enemigos');
    });

    it('un jugador con 0 HP no cuenta para completar la ronda de jugadores', () => {
      const game = buildGameInCombat();
      game.applyDamageToParticipant('char-2', 999); // char-2 queda a 0 HP

      game.claimTurn('char-1');
      game.releaseTurnAfterAction('char-1');

      expect(game.toSnapshot().activeEncounter?.roundPhase).toBe('enemigos');
    });

    it('lanza DomainError si se reclama el turno en fase de enemigos', () => {
      const game = buildGameInCombat();
      game.claimTurn('char-1');
      game.releaseTurnAfterAction('char-1');
      game.claimTurn('char-2');
      game.releaseTurnAfterAction('char-2'); // fase pasa a 'enemigos'

      expect(() => game.claimTurn('char-1')).toThrow(DomainError);
    });
  });

  describe('reopenPlayerRound', () => {
    it('lanza DomainError sin combate activo', () => {
      const game = buildGame();
      expect(() => game.reopenPlayerRound()).toThrow(DomainError);
    });

    it('vuelve a abrir la fase de jugadores, libera el candado y resetea quién ha actuado', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      game.launch('host-1');
      game.startEncounter({
        enemies: [{ instanceId: 'enc-1-goblin-a', enemyRefId: 'enemy-1', name: 'Goblin explorador', currentHp: 7, ac: 15 }],
      });
      game.claimTurn('char-1');
      game.releaseTurnAfterAction('char-1'); // única jugadora -> fase pasa a enemigos

      game.reopenPlayerRound();

      const encounter = game.toSnapshot().activeEncounter;
      expect(encounter?.roundPhase).toBe('jugadores');
      expect(encounter?.turnClaim).toBeNull();
      expect(encounter?.actedThisRound).toEqual([]);
    });
  });

  describe('capitán', () => {
    it('no hay capitán hasta que se lanza la partida o se asigna explícitamente', () => {
      const game = buildGame();
      expect(game.toSnapshot().captainUserId).toBeNull();
    });

    it('al lanzar la partida, el host se convierte en capitán por defecto', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      game.launch('host-1');
      expect(game.toSnapshot().captainUserId).toBe('host-1');
    });

    it('el host puede asignar a otro jugador como capitán', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      game.launch('host-1');

      game.assignCaptain('host-1', 'user-1');

      expect(game.toSnapshot().captainUserId).toBe('user-1');
    });

    it('lanza DomainError si quien asigna no es el host ni el capitán actual', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      game.launch('host-1');

      expect(() => game.assignCaptain('user-1', 'user-1')).toThrow(DomainError);
    });

    it('el capitán actual puede pasarle el testigo a otro jugador (aunque no sea el host)', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 12 });
      game.launch('host-1');
      game.assignCaptain('host-1', 'user-1'); // user-1 es ahora el capitán

      game.assignCaptain('user-1', 'user-2');

      expect(game.toSnapshot().captainUserId).toBe('user-2');
    });

    it('lanza DomainError si se asigna a alguien que no es jugador de la partida', () => {
      const game = buildGame();
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
      game.launch('host-1');

      expect(() => game.assignCaptain('host-1', 'user-no-existe')).toThrow(DomainError);
    });
  });
});
