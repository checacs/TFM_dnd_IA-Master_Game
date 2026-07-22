/**
 * Serializa las mutaciones concurrentes sobre una MISMA partida (Game) para evitar
 * "lost updates". Causa raíz real detectada en partida: MongooseGameRepository.save()
 * (ver infrastructure/persistence/mongoose/repositories/mongoose-game.repository.ts)
 * hace un `findByIdAndUpdate` que reemplaza el documento ENTERO con el snapshot que el
 * caso de uso tiene en memoria -- no hay ningún control de concurrencia optimista
 * (versión, timestamp, etc.). Todo caso de uso que mute la partida sigue el mismo
 * patrón: leer (findById) -> mutar en memoria -> guardar (save). Si DOS peticiones
 * para el MISMO gameId se solapan (por ejemplo, el DM-engine resolviendo un ataque de
 * enemigo con resolve_attack MIENTRAS un jugador pulsa "Mi turno" desde el móvil, o
 * varias llamadas MCP seguidas dentro del mismo turno del DM solapándose con
 * peticiones REST independientes), la que termine de guardar en último lugar PISA por
 * completo los cambios de la otra, sin ningún error visible para nadie.
 *
 * Se comprobó en partida real, en el MISMO combate: (1) un jugador (Che) pulsaba "Mi
 * turno" y el campo de texto no se activaba nunca -- el turnClaims recién guardado
 * por claim-turn desaparecía; (2) el HP de otro jugador (San) se quedaba sin
 * actualizar en la ficha (seguía en 9) aunque el DM narrara "queda con 3/8 HP" tras un
 * resolve_attack que sí se ejecutó. Las dos son la MISMA causa: escrituras
 * concurrentes sobre el mismo documento de Mongo pisándose entre sí.
 *
 * withGameLock() encola el trabajo por gameId: una petición nueva para una partida
 * espera a que termine la anterior (con éxito o con error) antes de arrancar su
 * propio find->mutar->save, eliminando la ventana de solapamiento. Es un mutex EN
 * MEMORIA del propio proceso Node -- correcto siempre que la API corra en una única
 * instancia de proceso (que es como está desplegada esta API en Render). Si algún día
 * se escala horizontalmente a varias instancias, esto dejaría de ser suficiente y
 * haría falta un lock distribuido (ej. basado en Mongo con findOneAndUpdate atómico
 * condicionado a una versión, o Redis).
 */
const gameLocks = new Map<string, Promise<unknown>>();

export function withGameLock<T>(gameId: string, fn: () => Promise<T>): Promise<T> {
  const previous = gameLocks.get(gameId) ?? Promise.resolve();
  // fn() solo arranca cuando el trabajo anterior de ESTE gameId ha terminado, tanto si
  // acabó bien como si lanzó un error (segundo argumento de .then) -- así un fallo en
  // una mutación no deja el candado bloqueado para siempre para las peticiones
  // siguientes de la misma partida.
  const run = previous.then(fn, fn);
  // La promesa que guardamos en el mapa NUNCA debe rechazar (si lo hiciera, el
  // próximo withGameLock de este gameId heredaría un rechazo no gestionado) -- pero
  // el resultado real de fn(), incluido cualquier error, sí se propaga al llamador a
  // través de `run`, que es lo que devolvemos aquí.
  gameLocks.set(gameId, run.then(() => undefined, () => undefined));
  return run;
}
