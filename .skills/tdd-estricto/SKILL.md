---
name: tdd-estricto
description: Usa esta skill antes de implementar cualquier caso de uso nuevo en application/ o cualquier entidad/value object nuevo en domain/. No la cargues para trabajo puramente de infraestructura (ej. ajustar un índice de Mongo) o de UI.
---

# TDD estricto en este proyecto

Referencia razonada: `docs/03-arquitectura-clean-api-nestjs.md` (secciones 5-6).

## Ciclo obligatorio

1. **Red** — escribe el test que describe el comportamiento esperado. Debe fallar (o no compilar) porque la implementación no existe.
2. **Green** — implementa lo mínimo para que pase. No optimices ni generalices todavía.
3. **Refactor** — con el test en verde, limpia el código. Vuelve a correr los tests tras cada cambio.

No se escribe código de producción en `domain/` o `application/` sin un test que lo exija primero.

## Patrón obligatorio para lógica con aleatoriedad

Cualquier caso de uso que dependa de `DiceRoller` se testea con un `FakeDiceRoller` de valores fijos, nunca con el RNG real:

```ts
class FakeDiceRoller implements DiceRoller {
  private i = 0;
  constructor(private readonly fixedValues: number[]) {}
  rollD20() { return this.fixedValues[this.i++]; }
  roll() { return this.fixedValues[this.i++]; }
}
```

Cubre siempre al menos el caso límite (tirada que iguala exactamente la CA/CD, no solo "impacta claramente" o "falla claramente").

## Qué no hace falta testear con TDD estricto
- Controladores REST y handlers de tools MCP: son adaptadores finos, se cubren con tests de integración, no unitarios uno a uno por línea.
- Mappers de persistencia (`GameMapper`, etc.): tests de ida-y-vuelta (round-trip), no TDD línea a línea.

## Definición de terminado de una tarea de dominio/aplicación
- Test escrito antes que la implementación (verificable en el historial de commits si se pide).
- Casos límite cubiertos, no solo el camino feliz.
- `npm run test` en verde antes de dar la tarea por cerrada.
