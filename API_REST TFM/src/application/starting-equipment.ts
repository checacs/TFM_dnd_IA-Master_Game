import { CharacterClass } from '../domain/entities/character.entity';

/**
 * Arma inicial simplificada por clase, en la misma línea que STARTING_ATTRIBUTES
 * (character.entity.ts) — no es 5e real (ahí hay elección del jugador entre
 * varias opciones), es una asignación fija para que el personaje sea jugable
 * en combate desde el primer momento.
 *
 * A diferencia del resto de catálogos de este proyecto, estos índices NO
 * están verificados contra una respuesta real de dnd5eapi.co (no tenía un
 * fixture a mano para longsword/mace al escribir esto). Si al unirte a una
 * partida el personaje no sale con arma equipada, revisa el índice exacto en
 * tu catálogo importado (`npm run import:equipment`) y corrígelo aquí.
 */
export const STARTING_WEAPON_BY_CLASS: Record<CharacterClass, string> = {
  guerrero: 'longsword',
  picaro: 'dagger',
  mago: 'dagger',
  clerigo: 'mace',
};

/**
 * Foco de lanzamiento inicial para las clases conjuradoras (mago/clérigo) --
 * se detectó en partida real que un mago solo tenía la daga inicial y ningún
 * objeto arcano, pese a tener hechizos que lanzar. Índices verificados contra
 * dnd5eapi.co: "wand" está en /equipment-categories/arcane-foci, "amulet" en
 * /equipment-categories/holy-symbols. Las clases no conjuradoras no tienen
 * entrada aquí (no necesitan foco).
 */
export const STARTING_FOCUS_BY_CLASS: Partial<Record<CharacterClass, string>> = {
  mago: 'wand',
  clerigo: 'amulet',
};
