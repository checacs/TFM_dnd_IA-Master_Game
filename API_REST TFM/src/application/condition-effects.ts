/**
 * Simplificación deliberada: cada condición real de 5e tiene su propio texto
 * de reglas completo (ver RulesReference, kind='condition') — aquí solo se
 * modela su efecto más relevante en combate (ventaja/desventaja en ataques),
 * no cada matiz. Por ejemplo, "prone" en la 5e real da desventaja a quien
 * ataca a distancia pero ventaja a quien ataca cuerpo a cuerpo; aquí se
 * simplifica a "siempre da ventaja al atacante", sin distinguir el alcance.
 */
export const CAUSES_DISADVANTAGE_ON_OWN_ATTACKS = new Set([
  'blinded',
  'frightened',
  'poisoned',
  'prone',
  'restrained',
]);

export const GRANTS_ADVANTAGE_TO_ATTACKER = new Set([
  'blinded',
  'restrained',
  'paralyzed',
  'prone',
  'stunned',
  'unconscious',
]);
