/**
 * Desordena una lista — usado por SearchMapsUseCase para no devolver siempre el
 * catálogo de mapas en el mismo orden (orden natural de Mongo = orden de
 * inserción). Sin esto, el DM-IA tiende a elegir siempre el primer resultado
 * para las mismas tags, así que partidas distintas con el mismo tono narrativo
 * (ej. tags: ["bosque"]) acababan usando siempre el mismo mapa.
 */
export interface Shuffler {
  shuffle<T>(items: T[]): T[];
}

export const SHUFFLER = Symbol('Shuffler');
