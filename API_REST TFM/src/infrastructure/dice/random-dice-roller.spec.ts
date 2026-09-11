import { RandomDiceRoller } from './random-dice-roller';

describe('RandomDiceRoller', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('rollD20', () => {
    it('devuelve un valor entre 1 y 20', () => {
      const roller = new RandomDiceRoller();
      for (let i = 0; i < 200; i++) {
        const result = roller.rollD20();
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(20);
      }
    });

    it('con Math.random fijo a 0, devuelve 1 (el mínimo)', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      const roller = new RandomDiceRoller();
      expect(roller.rollD20()).toBe(1);
    });

    it('con Math.random fijo justo por debajo de 1, devuelve 20 (el máximo)', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.9999999);
      const roller = new RandomDiceRoller();
      expect(roller.rollD20()).toBe(20);
    });
  });

  describe('roll (notación)', () => {
    it('interpreta "1d6+2" sumando el modificador', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0); // cada dado sale 1
      const roller = new RandomDiceRoller();
      expect(roller.roll('1d6+2')).toBe(3); // 1 + 2
    });

    it('suma varios dados del mismo tipo, ej. "2d4"', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.999999); // cada dado sale al máximo
      const roller = new RandomDiceRoller();
      expect(roller.roll('2d4')).toBe(8); // 4 + 4
    });

    it('funciona sin modificador, ej. "1d8"', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      const roller = new RandomDiceRoller();
      expect(roller.roll('1d8')).toBe(1);
    });

    it('lanza un error si la notación no es válida', () => {
      const roller = new RandomDiceRoller();
      expect(() => roller.roll('no-es-un-dado')).toThrow();
    });

    // Depuración: sin límites, "999999999999d6" (vía la tool MCP roll_dice o
    // la tirada del jugador) bloqueaba el event loop de la API en un bucle
    // síncrono de ~10^12 iteraciones -- una sola petición tumbaba el servicio.
    it('rechaza cantidades de dados absurdas sin llegar a tirarlos', () => {
      const roller = new RandomDiceRoller();
      const start = Date.now();
      expect(() => roller.roll('999999999999d6')).toThrow('Notación de dado fuera de rango');
      expect(Date.now() - start).toBeLessThan(50);
    });

    it('rechaza dados de más de 1000 caras y modificadores desproporcionados', () => {
      const roller = new RandomDiceRoller();
      expect(() => roller.roll('1d100000')).toThrow('Notación de dado fuera de rango');
      expect(() => roller.roll('1d6+999999')).toThrow('Notación de dado fuera de rango');
      expect(() => roller.roll('0d6')).toThrow('Notación de dado fuera de rango');
    });

    it('acepta el máximo permitido (100 dados)', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      const roller = new RandomDiceRoller();
      expect(roller.roll('100d6')).toBe(100);
    });
  });
});
