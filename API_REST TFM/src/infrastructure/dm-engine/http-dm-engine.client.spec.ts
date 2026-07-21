import { HttpDmEngineClient } from './http-dm-engine.client';

/**
 * global.fetch se sustituye por un stub controlado en cada test -- no hay
 * un dm-engine real en el sandbox de CI/desarrollo, así que se simulan aquí
 * los tres escenarios que importan: éxito a la primera, fallo de arranque
 * que se recupera solo al reintentar, y fallo persistente que debe seguir
 * propagándose (para que SendMessageUseCase muestre su mensaje de fallback).
 */
describe('HttpDmEngineClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('devuelve el resultado directamente si el primer intento funciona (sin reintentar)', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls++;
      return {
        ok: true,
        json: async () => ({ narrative: 'Ok', events: [] }),
      } as Response;
    }) as unknown as typeof fetch;

    const client = new HttpDmEngineClient('http://dm-engine.local');
    const result = await client.sendTurn('game-1', [{ role: 'user', content: 'hola' }]);

    expect(result).toEqual({ narrative: 'Ok', events: [] });
    expect(calls).toBe(1);
  });

  it('reintenta una vez si el primer intento falla por timeout (cold start), y funciona si el segundo tiene éxito', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls++;
      if (calls === 1) {
        const timeoutError = new Error('The operation was aborted due to timeout');
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }
      return {
        ok: true,
        json: async () => ({ narrative: 'Ya despierto', events: [] }),
      } as Response;
    }) as unknown as typeof fetch;

    const client = new HttpDmEngineClient('http://dm-engine.local');
    const result = await client.sendTurn('game-1', [{ role: 'user', content: 'hola' }]);

    expect(result).toEqual({ narrative: 'Ya despierto', events: [] });
    expect(calls).toBe(2); // un fallo + un reintento, transparente para quien llama
  });

  it('reintenta una vez si el primer intento ni siquiera conecta (contenedor arrancando), y funciona si el segundo tiene éxito', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls++;
      if (calls === 1) {
        throw new Error('fetch failed'); // típico ECONNREFUSED mientras arranca
      }
      return {
        ok: true,
        json: async () => ({ narrative: 'Ya despierto', events: [] }),
      } as Response;
    }) as unknown as typeof fetch;

    const client = new HttpDmEngineClient('http://dm-engine.local');
    const result = await client.sendTurn('game-1', [{ role: 'user', content: 'hola' }]);

    expect(result).toEqual({ narrative: 'Ya despierto', events: [] });
    expect(calls).toBe(2);
  });

  it('si ambos intentos fallan por timeout, propaga el error (para que SendMessageUseCase muestre el fallback)', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls++;
      const timeoutError = new Error('The operation was aborted due to timeout');
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }) as unknown as typeof fetch;

    const client = new HttpDmEngineClient('http://dm-engine.local');

    await expect(client.sendTurn('game-1', [{ role: 'user', content: 'hola' }])).rejects.toThrow(/no respondió en/);
    expect(calls).toBe(2); // se agotan los reintentos, no se queda reintentando para siempre
  });

  it('NO reintenta si la respuesta HTTP llega con un estado de error (dm-engine sí respondió, pudo haber mutado la partida)', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls++;
      return { ok: false, status: 500 } as Response;
    }) as unknown as typeof fetch;

    const client = new HttpDmEngineClient('http://dm-engine.local');

    await expect(client.sendTurn('game-1', [{ role: 'user', content: 'hola' }])).rejects.toThrow(/estado 500/);
    expect(calls).toBe(1); // ni un solo reintento
  });
});
