import { addMoney, copperToMoney, equipmentCostToMoney, moneyToCopper, subtractMoney, ZERO_MONEY } from './money';

describe('money (oro/plata/cobre, 1gp=10sp=100cp)', () => {
  describe('moneyToCopper / copperToMoney', () => {
    it('convierte oro/plata/cobre a un total de cobre', () => {
      expect(moneyToCopper({ gold: 2, silver: 3, copper: 4 })).toBe(234);
    });

    it('descompone un total de cobre en su forma canónica oro/plata/cobre', () => {
      expect(copperToMoney(234)).toEqual({ gold: 2, silver: 3, copper: 4 });
    });

    it('normaliza denominaciones sueltas (ej. 15 piezas de plata) a su forma canónica', () => {
      expect(copperToMoney(moneyToCopper({ gold: 0, silver: 15, copper: 0 }))).toEqual({
        gold: 1,
        silver: 5,
        copper: 0,
      });
    });

    it('nunca devuelve cantidades negativas', () => {
      expect(copperToMoney(-50)).toEqual(ZERO_MONEY);
    });
  });

  describe('addMoney', () => {
    it('suma dos cantidades y normaliza el acarreo entre monedas', () => {
      const result = addMoney({ gold: 0, silver: 8, copper: 5 }, { silver: 5, copper: 8 });
      // 85 + 58 = 143 cobre -> 1 oro, 4 plata, 3 cobre
      expect(result).toEqual({ gold: 1, silver: 4, copper: 3 });
    });

    it('acepta un Partial<Money> (solo algunas denominaciones)', () => {
      expect(addMoney(ZERO_MONEY, { gold: 12 })).toEqual({ gold: 12, silver: 0, copper: 0 });
    });
  });

  describe('subtractMoney', () => {
    it('resta y normaliza cuando hay fondos suficientes', () => {
      const result = subtractMoney({ gold: 1, silver: 0, copper: 0 }, { gold: 0, silver: 2, copper: 0 });
      // 100 - 20 = 80 cobre -> 0 oro, 8 plata, 0 cobre
      expect(result).toEqual({ gold: 0, silver: 8, copper: 0 });
    });

    it('devuelve null si no hay fondos suficientes (nunca deja el dinero en negativo)', () => {
      expect(subtractMoney({ gold: 0, silver: 0, copper: 5 }, { gold: 0, silver: 0, copper: 10 })).toBeNull();
    });

    it('permite gastar exactamente todo el dinero disponible', () => {
      expect(subtractMoney({ gold: 1, silver: 0, copper: 0 }, { gold: 1, silver: 0, copper: 0 })).toEqual(ZERO_MONEY);
    });
  });

  describe('equipmentCostToMoney', () => {
    it('convierte {quantity, unit: "gp"} a oro', () => {
      expect(equipmentCostToMoney({ quantity: 2, unit: 'gp' })).toEqual({ gold: 2, silver: 0, copper: 0 });
    });

    it('convierte {quantity, unit: "sp"} a plata', () => {
      expect(equipmentCostToMoney({ quantity: 5, unit: 'sp' })).toEqual({ gold: 0, silver: 5, copper: 0 });
    });

    it('convierte {quantity, unit: "cp"} a cobre', () => {
      expect(equipmentCostToMoney({ quantity: 3, unit: 'cp' })).toEqual({ gold: 0, silver: 0, copper: 3 });
    });

    it('devuelve cero si el objeto no tiene coste definido (cost: null)', () => {
      expect(equipmentCostToMoney(null)).toEqual(ZERO_MONEY);
    });

    it('trata una unidad no reconocida como oro en vez de reventar', () => {
      expect(equipmentCostToMoney({ quantity: 1, unit: 'pp' })).toEqual({ gold: 1, silver: 0, copper: 0 });
    });
  });
});
