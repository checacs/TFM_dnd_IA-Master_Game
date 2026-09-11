import { withGameLock, activeGameLockCount } from './game-lock';

describe('withGameLock', () => {
  it('serializa el trabajo de una misma partida', async () => {
    const order: string[] = [];
    const slow = withGameLock('g-serial', async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push('primero');
    });
    const fast = withGameLock('g-serial', async () => {
      order.push('segundo');
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(['primero', 'segundo']);
  });

  it('un error no deja el candado bloqueado', async () => {
    await expect(withGameLock('g-error', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(withGameLock('g-error', async () => 'ok')).resolves.toBe('ok');
  });

  // Depuración: el mapa de candados nunca se limpiaba -- una entrada por cada
  // gameId distinto que hubiera pasado por aquí (incluidos ids inventados
  // enviados a /mcp), creciendo sin límite mientras viva el proceso.
  it('libera la entrada de la partida cuando ya no queda trabajo pendiente', async () => {
    const before = activeGameLockCount();
    await withGameLock('g-prune-1', async () => undefined);
    await withGameLock('g-prune-2', async () => undefined);
    await new Promise((r) => setTimeout(r, 0));
    expect(activeGameLockCount()).toBe(before);
  });
});
