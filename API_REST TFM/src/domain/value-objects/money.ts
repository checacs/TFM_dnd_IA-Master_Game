/**
 * Dinero simplificado con las tres monedas reales de D&D 5e (oro/plata/
 * cobre — 1 gp = 10 sp = 100 cp), a petición explícita del usuario en vez de
 * un único contador genérico. Toda la aritmética pasa por copperTotal para
 * no tener que reimplementar acarreo (carry-over) entre denominaciones en
 * cada sitio que suma o resta dinero: se convierte todo a cobre, se opera, y
 * se vuelve a descomponer en oro/plata/cobre en su forma canónica (ej. 15
 * piezas de plata sueltas se normalizan solas a 1 oro + 5 plata).
 */
export interface Money {
  gold: number;
  silver: number;
  copper: number;
}

export const ZERO_MONEY: Money = { gold: 0, silver: 0, copper: 0 };

export function moneyToCopper(money: Partial<Money>): number {
  return (money.gold ?? 0) * 100 + (money.silver ?? 0) * 10 + (money.copper ?? 0);
}

export function copperToMoney(totalCopper: number): Money {
  const safeTotal = Math.max(0, totalCopper);
  const gold = Math.floor(safeTotal / 100);
  const silver = Math.floor((safeTotal % 100) / 10);
  const copper = safeTotal % 10;
  return { gold, silver, copper };
}

export function addMoney(current: Money, amount: Partial<Money>): Money {
  return copperToMoney(moneyToCopper(current) + moneyToCopper(amount));
}

/** Devuelve null si `current` no llega a cubrir `cost` (nunca deja el dinero en negativo). */
export function subtractMoney(current: Money, cost: Money): Money | null {
  const remaining = moneyToCopper(current) - moneyToCopper(cost);
  if (remaining < 0) {
    return null;
  }
  return copperToMoney(remaining);
}

/**
 * Convierte el coste real de un objeto del catálogo de equipo (cost:
 * {quantity, unit}, ej. {quantity: 2, unit: "gp"} tal cual lo trae
 * dnd5eapi.co) a nuestro Money de tres monedas. Unidades no reconocidas se
 * tratan como oro (gp) por ser la unidad por defecto de la API real.
 */
export function equipmentCostToMoney(cost: { quantity: number; unit: string } | null): Money {
  if (!cost) {
    return { ...ZERO_MONEY };
  }
  const unit = cost.unit.toLowerCase();
  if (unit === 'sp') {
    return { gold: 0, silver: cost.quantity, copper: 0 };
  }
  if (unit === 'cp') {
    return { gold: 0, silver: 0, copper: cost.quantity };
  }
  // "gp", "pp" (platino, poco común en el catálogo real) y cualquier otra
  // unidad no reconocida se tratan como oro -- evita reventar por una unidad
  // rara del catálogo en vez de degradar con gracia.
  return { gold: cost.quantity, silver: 0, copper: 0 };
}
