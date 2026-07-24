import { DiceRoller } from '../../domain/ports/dice-roller.port';
import { GameRepository } from '../../domain/ports/game.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { ResolveAttackUseCase } from './resolve-attack.use-case';

class FakeDiceRoller implements DiceRoller {
  private i = 0;
  constructor(private readonly fixedValues: number[]) {}
  rollD20(): number {
    return this.fixedValues[this.i++];
  }
  roll(): number {
    return this.fixedValues[this.i++];
  }
}

class FakeGameRepository implements GameRepository {
  private readonly games = new Map<string, Game>();

  seed(game: Game): void {
    this.games.set(game.id, game);
  }

  async findById(id: string): Promise<Game | null> {
    return this.games.get(id) ?? null;
  }
  async findByUserId(_userId: string): Promise<Game[]> { return []; }


  async save(game: Game): Promise<void> {
    this.games.set(game.id, game);
  }
}

function buildGameWithActiveEnemy(): { game: Game; repo: FakeGameRepository } {
  const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
  game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
  game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
  game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
  game.launch('host-1');
  game.startEncounter({
    enemies: [{ instanceId: 'enc-1-goblin-a', enemyRefId: 'enemy-1', name: 'Goblin explorador', currentHp: 7, ac: 15 }],
  });

  const repo = new FakeGameRepository();
  repo.seed(game);
  return { game, repo };
}

describe('ResolveAttackUseCase', () => {
  it('impacta, aplica la tirada de daño y persiste el HP resultante en la partida', async () => {
    const { game, repo } = buildGameWithActiveEnemy();
    const diceRoller = new FakeDiceRoller([15, 5]); // 1d20 = 15, daño = 5
    const useCase = new ResolveAttackUseCase(diceRoller, repo);

    const result = await useCase.execute({
      gameId: game.id,
      targetId: 'enc-1-goblin-a',
      attackerName: 'Elyndra',
      attackerModifier: 2,
      targetArmorClass: 17,
      damageDice: '1d6+2',
    });

    expect(result.hit).toBe(true);
    expect(result.damage).toBe(5);

    const saved = await repo.findById(game.id);
    const enemy = saved?.toSnapshot().activeEncounter?.enemies.find((e) => e.instanceId === 'enc-1-goblin-a');
    expect(enemy?.currentHp).toBe(2); // 7 - 5

    // Se comprobó que el jugador no veía en el chat de dónde salía el daño
    // que el DM narraba -- a diferencia de PlayerRollUseCase (que sí publica
    // la tirada del jugador), ResolveAttackUseCase no dejaba ningún rastro en
    // narrativeLog. Ahora sí: mismo formato con emoji de dado, rol 'assistant'
    // (la tirada la resuelve el sistema/DM, no la pulsó el jugador).
    const log = saved!.toSnapshot().narrativeLog;
    expect(log).toHaveLength(1);
    expect(log[0].role).toBe('assistant');
    // Nombre en negrita Markdown, igual que en PlayerRollUseCase, para
    // distinguirlo del resto del mensaje.
    expect(log[0].content).toContain('**Goblin explorador**');
    // El mensaje muestra el TOTAL de la tirada (15 + 2 = **17**), no el d20
    // crudo -- formato actual: "(1d20+2): **17** vs Armadura 17 → ¡IMPACTA! — Daño (1d6+2): **5**".
    expect(log[0].content).toContain('**17**');
    expect(log[0].content).toContain('Armadura 17');
    expect(log[0].content).toContain('1d6+2');
    expect(log[0].content).toContain('**5**');
    // CASO REAL: antes no decía quién atacaba -- ahora siempre nombra al atacante real.
    expect(log[0].content).toContain('**Elyndra**');
  });

  it('falla cuando la tirada no alcanza la CA y no modifica el HP del objetivo', async () => {
    const { game, repo } = buildGameWithActiveEnemy();
    const diceRoller = new FakeDiceRoller([5]); // 1d20 = 5, no debería consumir una segunda tirada
    const useCase = new ResolveAttackUseCase(diceRoller, repo);

    const result = await useCase.execute({
      gameId: game.id,
      targetId: 'enc-1-goblin-a',
      attackerName: 'Elyndra',
      attackerModifier: 2,
      targetArmorClass: 17,
      damageDice: '1d6+2',
    });

    expect(result.hit).toBe(false);
    expect(result.damage).toBe(0);

    const saved = await repo.findById(game.id);
    const enemy = saved?.toSnapshot().activeEncounter?.enemies.find((e) => e.instanceId === 'enc-1-goblin-a');
    expect(enemy?.currentHp).toBe(7); // sin cambios

    // También en un fallo debe quedar rastro en el chat (para que el jugador
    // vea que sí hubo una tirada, aunque no acertara) -- antes, al fallar,
    // ni siquiera se guardaba la partida (no hacía falta persistir HP), así
    // que el registro de la tirada tampoco se guardaba nunca.
    const log = saved!.toSnapshot().narrativeLog;
    expect(log).toHaveLength(1);
    // El mensaje muestra el TOTAL de la tirada (5 + 2 = **7**), no el d20
    // crudo -- formato actual: "(1d20+2): **7** vs Armadura 17 → falla".
    expect(log[0].content).toContain('**7**');
    expect(log[0].content).toContain('Armadura 17');
    expect(log[0].content.toLowerCase()).toContain('falla');
  });

  describe('con playerD20 (el jugador ya tiró su propio d20 con el botón "Tirar Dados")', () => {
    // Se comprobó que el jugador se quejaba de que la IA "tiraba por él": el
    // ataque se resolvía con un d20 interno invisible en cuanto describía su
    // acción, sin que él llegase a pulsar el botón de tirar dados en ningún
    // momento -- perdía la sensación de agencia sobre su propia tirada. Ahora,
    // si se pasa playerD20 (el resultado real que YA tiró el jugador y que ya
    // quedó publicado en el chat vía PlayerRollUseCase), se usa ESE número en
    // vez de que el sistema tire uno nuevo por su cuenta -- el daño, si
    // impacta, lo sigue tirando el sistema (el jugador no tiene botón para
    // tirar dados de daño, ver decisión de mantener "Tirar Dados" fijo a 1d20).

    it('usa el d20 del jugador (no tira uno nuevo) para decidir impacto, y solo tira el dado de daño', async () => {
      const { game, repo } = buildGameWithActiveEnemy();
      const diceRoller = new FakeDiceRoller([5]); // si tirase su propio d20 tocaría 5 (y fallaría) -- no debe usarse
      const useCase = new ResolveAttackUseCase(diceRoller, repo);

      const result = await useCase.execute({
        gameId: game.id,
        targetId: 'enc-1-goblin-a',
        attackerName: 'Elyndra',
        attackerModifier: 2,
        targetArmorClass: 17,
        damageDice: '1d6+2',
        playerD20: 15, // el jugador ya tiró un 15 con "Tirar Dados"
      });

      expect(result.hit).toBe(true); // 15 + 2 = 17 >= 17
      expect(result.attackRoll).toBe(17);
      expect(result.damage).toBe(5); // única tirada consumida del DiceRoller: el daño
    });

    it('el mensaje de chat dice "tirada del jugador" en vez de fingir que la tiró el sistema', async () => {
      const { game, repo } = buildGameWithActiveEnemy();
      const diceRoller = new FakeDiceRoller([5]);
      const useCase = new ResolveAttackUseCase(diceRoller, repo);

      await useCase.execute({
        gameId: game.id,
        targetId: 'enc-1-goblin-a',
        attackerName: 'Elyndra',
        attackerModifier: 2,
        targetArmorClass: 17,
        damageDice: '1d6+2',
        playerD20: 15,
      });

      const saved = await repo.findById(game.id);
      const log = saved!.toSnapshot().narrativeLog;
      // El mensaje muestra el TOTAL (15 + 2 = **17**), no el d20 crudo del
      // jugador -- formato actual: "(1d20+2 (tirada del jugador)): **17** vs Armadura 17 → ...".
      expect(log[0].content).toContain('**17**');
      expect(log[0].content.toLowerCase()).toContain('tirada del jugador');
    });

    it('sin playerD20, sigue tirando su propio d20 como antes (compatibilidad con ataques de enemigos)', async () => {
      const { game, repo } = buildGameWithActiveEnemy();
      const diceRoller = new FakeDiceRoller([15, 5]);
      const useCase = new ResolveAttackUseCase(diceRoller, repo);

      const result = await useCase.execute({
        gameId: game.id,
        targetId: 'enc-1-goblin-a',
        attackerName: 'Goblin explorador',
        attackerModifier: 2,
        targetArmorClass: 17,
        damageDice: '1d6+2',
      });

      expect(result.attackRoll).toBe(17);
      expect(result.hit).toBe(true);
      expect(result.damage).toBe(5);
    });
  });

  it('lanza DomainError si la partida no existe', async () => {
    const repo = new FakeGameRepository();
    const diceRoller = new FakeDiceRoller([15, 5]);
    const useCase = new ResolveAttackUseCase(diceRoller, repo);

    await expect(
        useCase.execute({
          gameId: 'no-existe',
          targetId: 'enc-1-goblin-a',
          attackerName: 'Elyndra',
          attackerModifier: 2,
          targetArmorClass: 17,
          damageDice: '1d6+2',
        }),
    ).rejects.toThrow();
  });

  it(
      'lanza DomainError si targetId no corresponde a ningún jugador ni enemigo real (CASO REAL: el chat ' +
      'mostraba "Ataque contra 1"/"Ataque contra 2" porque el DM pasaba un id inventado en vez del characterId real)',
      async () => {
        const { game, repo } = buildGameWithActiveEnemy();
        const diceRoller = new FakeDiceRoller([15, 5]);
        const useCase = new ResolveAttackUseCase(diceRoller, repo);

        await expect(
            useCase.execute({
              gameId: game.id,
              targetId: '1', // id inventado, no es ni characterId ni instanceId real
              attackerName: 'Goblin explorador',
              attackerModifier: 2,
              targetArmorClass: 17,
              damageDice: '1d6+2',
            }),
        ).rejects.toThrow();
      },
  );

  it('el mensaje del chat nombra al atacante real y, si se indica, el arma con la que golpea', async () => {
    const { game, repo } = buildGameWithActiveEnemy();
    const diceRoller = new FakeDiceRoller([15, 5]);
    const useCase = new ResolveAttackUseCase(diceRoller, repo);

    await useCase.execute({
      gameId: game.id,
      targetId: 'enc-1-goblin-a',
      attackerName: 'Matón Cicatrizado',
      weaponName: 'su hacha mellada',
      attackerModifier: 2,
      targetArmorClass: 17,
      damageDice: '1d6+2',
    });

    const saved = await repo.findById(game.id);
    const log = saved!.toSnapshot().narrativeLog;
    expect(log[0].content).toContain('**Matón Cicatrizado**');
    expect(log[0].content).toContain('con su hacha mellada');
  });

  it('ataca a un jugador real (targetId = characterId) sin necesitar weaponName', async () => {
    const { game, repo } = buildGameWithActiveEnemy();
    const diceRoller = new FakeDiceRoller([15, 5]);
    const useCase = new ResolveAttackUseCase(diceRoller, repo);

    await useCase.execute({
      gameId: game.id,
      targetId: 'char-1', // characterId real de Elyndra
      attackerName: 'Goblin explorador',
      attackerModifier: 2,
      targetArmorClass: 14,
      damageDice: '1d6+2',
    });

    const saved = await repo.findById(game.id);
    const log = saved!.toSnapshot().narrativeLog;
    expect(log[0].content).toContain('**Elyndra**');
  });
});