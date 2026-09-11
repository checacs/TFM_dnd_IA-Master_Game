import { evaluateEncounter, xpForChallengeRating } from './encounter-difficulty';

describe('encounter-difficulty (presupuesto de XP de la Guía del DM 2024)', () => {
  it('traduce el Challenge Rating a XP según la tabla oficial', () => {
    expect(xpForChallengeRating(0.125)).toBe(25);
    expect(xpForChallengeRating(0.25)).toBe(50);
    expect(xpForChallengeRating(0.5)).toBe(100);
    expect(xpForChallengeRating(1)).toBe(200);
    expect(xpForChallengeRating(2)).toBe(450);
  });

  it('CASO REAL: 2 Ghouls + 1 Zombie contra un mago y un guerrero de nivel 1 supera el presupuesto alto', () => {
    // 200 + 200 + 50 = 450 XP; presupuesto alto del grupo: 2 x 100 = 200
    const result = evaluateEncounter({ partyLevels: [1, 1], monsterChallengeRatings: [1, 1, 0.25] });
    expect(result.totalXp).toBe(450);
    expect(result.difficulty).toBe('excesiva');
    expect(result.withinBudget).toBe(false);
    expect(result.maxXp).toBe(200);
  });

  it('CASO REAL: tres goblins (CR 1/4) contra dos personajes de nivel 1 sí caben (sin multiplicador por número)', () => {
    // 3 x 50 = 150 XP: moderada 150, alta 200 -> "moderada"
    const result = evaluateEncounter({ partyLevels: [1, 1], monsterChallengeRatings: [0.25, 0.25, 0.25] });
    expect(result.totalXp).toBe(150);
    expect(result.difficulty).toBe('moderada');
    expect(result.withinBudget).toBe(true);
  });

  it('el tope es inclusivo: cuatro goblins (200 XP) justo en el presupuesto alto se permiten', () => {
    const result = evaluateEncounter({ partyLevels: [1, 1], monsterChallengeRatings: [0.25, 0.25, 0.25, 0.25] });
    expect(result.totalXp).toBe(200);
    expect(result.difficulty).toBe('alta');
    expect(result.withinBudget).toBe(true);
  });

  it('sugiere el CR máximo que cabe para 1, 2 o 3 enemigos iguales', () => {
    const result = evaluateEncounter({ partyLevels: [1, 1], monsterChallengeRatings: [2] });
    expect(result.maxChallengeRatingForOne).toBe(1); // 200
    expect(result.maxChallengeRatingForTwo).toBe(0.5); // 2 x 100
    expect(result.maxChallengeRatingForThree).toBe(0.25); // 3 x 50
  });

  it('con 4 personajes de nivel 3 caben encuentros bastante mayores', () => {
    // Presupuestos del grupo: baja 600, moderada 900, alta 1600. 2 Ghouls: 400 -> "baja".
    const result = evaluateEncounter({ partyLevels: [3, 3, 3, 3], monsterChallengeRatings: [1, 1] });
    expect(result.withinBudget).toBe(true);
    expect(result.difficulty).toBe('baja');
    expect(result.maxXp).toBe(1600);
  });

  it('sin enemigos no hay dificultad', () => {
    const result = evaluateEncounter({ partyLevels: [1, 1], monsterChallengeRatings: [] });
    expect(result.totalXp).toBe(0);
    expect(result.withinBudget).toBe(true);
  });
});
