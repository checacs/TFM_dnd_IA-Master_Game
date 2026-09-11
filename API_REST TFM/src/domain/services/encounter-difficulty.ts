/**
 * Dificultad de un encuentro según el presupuesto de XP de la Guía del Dungeon
 * Master de D&D 2024 (cap. "Plan Encounters" -- la misma guía que ya sigue el
 * comportamiento del DM-IA, ver docs/01 sección 4.6): cada personaje aporta un
 * presupuesto según su nivel y dificultad (baja / moderada / alta), y los
 * monstruos cuestan su XP por Challenge Rating, SIN multiplicador por número
 * de monstruos (a diferencia de la guía de 2014).
 *
 * CASO REAL: el DM-IA metió 2 Ghouls (CR 1) y un Zombie (CR 1/4) contra un mago
 * y un guerrero de nivel 1 -- 450 XP contra un presupuesto "alto" de 200: el
 * grupo no podía pasar del primer combate. El modelo no tiene ninguna noción
 * fiable del equilibrio, así que el tope se aplica por código
 * (StartCombatUseCase), no con una instrucción en el prompt.
 *
 * Primera versión: se usaba la guía de 2014 (con multiplicador por número de
 * monstruos) y resultó demasiado estricta con grupos de enemigos débiles: tres
 * goblins contra dos personajes de nivel 1 salían "mortales" y el DM acababa
 * narrando tres goblins de los que solo uno existía de verdad.
 */

export type EncounterDifficulty = 'baja' | 'moderada' | 'alta' | 'excesiva';

/** XP por Challenge Rating (tabla oficial del SRD). */
const XP_BY_CHALLENGE_RATING: ReadonlyArray<readonly [number, number]> = [
  [0, 10], [0.125, 25], [0.25, 50], [0.5, 100], [1, 200], [2, 450], [3, 700], [4, 1100], [5, 1800],
  [6, 2300], [7, 2900], [8, 3900], [9, 5000], [10, 5900], [11, 7200], [12, 8400], [13, 10000],
  [14, 11500], [15, 13000], [16, 15000], [17, 18000], [18, 20000], [19, 22000], [20, 25000],
  [21, 33000], [22, 41000], [23, 50000], [24, 62000], [25, 75000], [26, 90000], [27, 105000],
  [28, 120000], [29, 135000], [30, 155000],
];

/** Presupuesto de XP por personaje (DMG 2024): [baja, moderada, alta]. */
const BUDGET_BY_LEVEL: Record<number, readonly [number, number, number]> = {
  1: [50, 75, 100],
  2: [100, 150, 200],
  3: [150, 225, 400],
  4: [250, 375, 500],
  5: [500, 750, 1100],
  6: [600, 1000, 1400],
  7: [750, 1300, 1700],
  8: [1000, 1700, 2100],
  9: [1300, 2000, 2600],
  10: [1600, 2300, 3100],
};

export function xpForChallengeRating(challengeRating: number): number {
  // Un CR fuera de tabla (dato raro del catálogo) usa el escalón inmediatamente inferior.
  let xp = XP_BY_CHALLENGE_RATING[0][1];
  for (const [cr, value] of XP_BY_CHALLENGE_RATING) {
    if (challengeRating >= cr) {
      xp = value;
    }
  }
  return xp;
}

function budgetFor(level: number): readonly [number, number, number] {
  const clamped = Math.max(1, Math.min(10, Math.floor(level) || 1));
  return BUDGET_BY_LEVEL[clamped];
}

/** Mayor CR del que caben `count` monstruos iguales dentro de `budget`. */
function maxChallengeRatingWithin(budget: number, count: number): number | null {
  let best: number | null = null;
  for (const [cr, xp] of XP_BY_CHALLENGE_RATING) {
    if (xp * count <= budget) {
      best = cr;
    }
  }
  return best;
}

export interface EncounterEvaluation {
  /** XP total de los monstruos del encuentro. */
  totalXp: number;
  difficulty: EncounterDifficulty;
  /** Tope permitido: el presupuesto de dificultad "alta" del grupo (inclusivo). */
  maxXp: number;
  withinBudget: boolean;
  /** Pistas para el DM-IA cuando el encuentro se rechaza (null si ni el CR 0 cabe). */
  maxChallengeRatingForOne: number | null;
  maxChallengeRatingForTwo: number | null;
  maxChallengeRatingForThree: number | null;
}

export function evaluateEncounter(input: {
  partyLevels: number[];
  monsterChallengeRatings: number[];
}): EncounterEvaluation {
  const levels = input.partyLevels.length > 0 ? input.partyLevels : [1];
  const [low, moderate, high] = levels.map(budgetFor).reduce(
      (acc, b) => [acc[0] + b[0], acc[1] + b[1], acc[2] + b[2]] as const,
      [0, 0, 0] as const,
  );

  const totalXp = input.monsterChallengeRatings.reduce((sum, cr) => sum + xpForChallengeRating(cr), 0);
  const difficulty: EncounterDifficulty =
      totalXp > high ? 'excesiva' :
      totalXp > moderate ? 'alta' :
      totalXp > low ? 'moderada' : 'baja';

  return {
    totalXp,
    difficulty,
    maxXp: high,
    withinBudget: totalXp <= high,
    maxChallengeRatingForOne: maxChallengeRatingWithin(high, 1),
    maxChallengeRatingForTwo: maxChallengeRatingWithin(high, 2),
    maxChallengeRatingForThree: maxChallengeRatingWithin(high, 3),
  };
}

/** "1/8", "1/4", "1/2" o el número entero, como se escribe el CR en D&D. */
export function formatChallengeRating(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return String(cr);
}
