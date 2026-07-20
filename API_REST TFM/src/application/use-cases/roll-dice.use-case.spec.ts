import { DiceRoller } from '../../domain/ports/dice-roller.port';
import { RollDiceUseCase } from './roll-dice.use-case';

class FakeDiceRoller implements DiceRoller {
  constructor(private readonly fixedValue: number) {}
  rollD20(): number {
    return this.fixedValue;
  }
  roll(): number {
    return this.fixedValue;
  }
}

describe('RollDiceUseCase', () => {
  it('delega en el DiceRoller y devuelve el resultado junto a la notación pedida', () => {
    const useCase = new RollDiceUseCase(new FakeDiceRoller(14));

    const result = useCase.execute({ notation: '1d20+3' });

    expect(result).toEqual({ notation: '1d20+3', result: 14 });
  });
});
