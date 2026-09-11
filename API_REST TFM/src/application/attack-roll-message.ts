/**
 * Mensaje de chat de una tirada de ataque ya resuelta por el sistema. Lo usan
 * resolve_attack, resolve_player_attack y resolve_enemy_attack para que todas
 * las tiradas se lean igual en el chat (y el jugador pueda comprobar de dónde
 * sale cada número):
 *
 *   🎲 **Tablet** ataca con Espadón a **Zombie** (1d20+5 (tirada del jugador)): **19** vs Armadura 8 → ¡IMPACTA! — Daño (2d6): **9**
 */
export interface AttackRollMessageInput {
  attackerName: string;
  weaponName?: string;
  targetName: string;
  modifier: number;
  /** true si el d20 es el que tiró el propio jugador con "Tirar Dados". */
  fromPlayerRoll: boolean;
  attackRoll: number;
  armorClass: number;
  hit: boolean;
  damageDice: string;
  damage: number;
  /** Si el objetivo acaba de caer a 0 HP con este golpe: "derrotado" (enemigo) o "inconsciente" (jugador). */
  targetDown: 'derrotado' | 'inconsciente' | null;
}

export function formatAttackRollMessage(input: AttackRollMessageInput): string {
  const modifierText = input.modifier >= 0 ? `+${input.modifier}` : `${input.modifier}`;
  const rollSource = input.fromPlayerRoll ? ' (tirada del jugador)' : '';
  const weaponText = input.weaponName ? ` con ${input.weaponName}` : '';
  const header =
      `🎲 **${input.attackerName}** ataca${weaponText} a **${input.targetName}** (1d20${modifierText}${rollSource}): ` +
      `**${input.attackRoll}** vs Armadura ${input.armorClass} → ` + (input.hit ? '¡IMPACTA!' : 'falla');
  if (!input.hit) {
    return header;
  }
  const downText = input.targetDown ? ` — **${input.targetName}** cae ${input.targetDown}.` : '';
  return `${header} — Daño (${input.damageDice}): **${input.damage}**${downText}`;
}
