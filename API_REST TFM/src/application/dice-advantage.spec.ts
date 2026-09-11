import { DiceRoller } from '../domain/ports/dice-roller.port';
import { rollD20WithAdvantage } from './dice-advantage';

class FakeDiceRoller implements DiceRoller {
  public rollD20CallCount = 0;
  constructor(private readonly fixedValues: number[]) {}
  rollD20(): number {
    this.rollD20CallCount += 1;
    return this.fixedValues[this.rollD20CallCount - 1];
  }
  roll(): number {
    return 0;
  }
}

describe('rollD20WithAdvantage', () => {
  it('sin ventaja ni desventaja, tira una sola vez', () => {
    const diceRoller = new FakeDiceRoller([12]);
    const result = rollD20WithAdvantage(diceRoller, false, false);

    expect(result).toBe(12);
    expect(diceRoller.rollD20CallCount).toBe(1);
  });

  it('con ventaja, tira dos veces y devuelve la mayor', () => {
    const diceRoller = new FakeDiceRoller([8, 15]);
    const result = rollD20WithAdvantage(diceRoller, true, false);

    expect(result).toBe(15);
    expect(diceRoller.rollD20CallCount).toBe(2);
  });

  it('con desventaja, tira dos veces y devuelve la menor', () => {
    const diceRoller = new FakeDiceRoller([8, 15]);
    const result = rollD20WithAdvantage(diceRoller, false, true);

    expect(result).toBe(8);
    expect(diceRoller.rollD20CallCount).toBe(2);
  });

  it('con ventaja Y desventaja a la vez, se cancelan y tira una sola vez (regla real de 5e)', () => {
    const diceRoller = new FakeDiceRoller([9]);
    const result = rollD20WithAdvantage(diceRoller, true, true);

    expect(result).toBe(9);
    expect(diceRoller.rollD20CallCount).toBe(1);
  });
});
