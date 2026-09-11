import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { GameCodeGenerator, GAME_CODE_GENERATOR } from '../../domain/ports/game-code-generator.port';
import { Game } from '../../domain/entities/game.entity';
import { DomainError } from '../../domain/errors/domain-error';

export interface CreateGameInput {
  name: string;
  hostUserId: string;
  maxPlayers: number;
}

export interface CreateGameResult {
  gameId: string;
}

// Con 6 caracteres alfanuméricos (32^6 = ~1073M combinaciones) una colisión
// real sigue siendo prácticamente imposible, pero se comprueba igualmente
// antes de guardar: el repositorio hace upsert por _id, así que guardar sin
// comprobar podría pisar silenciosamente la partida de otro grupo si el
// código coincidiera.
const MAX_CODE_ATTEMPTS = 5;

// Evita que un mismo usuario acumule partidas sin fin como host (cada una
// consume un slot de "sus partidas" en la UI y en la práctica casi ninguna
// se cierra nunca a 'finalizada'). No cuentan las partidas donde el usuario
// solo es jugador (findByUserId también las devuelve), ni las que él mismo
// ya cerró como 'finalizada' -- ver test "el límite es por host".
const MAX_GAMES_PER_HOST = 3;

/** El host crea la partida (HU1) — arranca en estado "configuracion", a la espera de que se unan jugadores.
 * El id de la partida es también su código público para unirse (se lo pasa el host a los demás jugadores),
 * por eso se genera corto y legible en vez de usar un UUID largo. */
@Injectable()
export class CreateGameUseCase {
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(GAME_CODE_GENERATOR) private readonly codeGenerator: GameCodeGenerator,
  ) {}

  async execute(input: CreateGameInput): Promise<CreateGameResult> {
    const existingGames = await this.games.findByUserId(input.hostUserId);
    const hostedActiveGames = existingGames.filter(
      (g) => g.toSnapshot().hostUserId === input.hostUserId && g.toSnapshot().status !== 'finalizada',
    );
    if (hostedActiveGames.length >= MAX_GAMES_PER_HOST) {
      throw new DomainError(`No puedes tener más de ${MAX_GAMES_PER_HOST} partidas como host a la vez`);
    }

    let code = this.codeGenerator.generate();
    let attempts = 0;
    while (await this.games.findById(code)) {
      attempts++;
      if (attempts >= MAX_CODE_ATTEMPTS) {
        throw new DomainError('No se ha podido generar un código de partida único, inténtalo de nuevo');
      }
      code = this.codeGenerator.generate();
    }

    const game = Game.create(input, code);
    await this.games.save(game);
    return { gameId: game.id };
  }
}
