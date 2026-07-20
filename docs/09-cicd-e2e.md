# CI/CD y E2E

**Estado:** v1.0 — Paso 9 de la hoja de ruta (cierre)
**Se apoya en:** todos los documentos anteriores (01-08)

---

## 1. Estructura del repositorio

**Monorepo** (`api/`, `dm-engine/`, `web/`, `mobile/` como workspaces de npm/pnpm) — para un TFM con un equipo pequeño, coordinar cuatro repos separados añade fricción sin beneficio real, y os permite compartir el paquete de tipos TypeScript de los contratos REST/eventos entre `web` y `mobile`.

## 2. Gitflow

```
feature/*  →  develop  →  main
```

- `feature/*` → PR contra `develop`: dispara lint + tests unitarios + integración.
- Merge a `develop`: despliegue automático a **staging** (Continuous Delivery — el artefacto queda listo, aunque no llegue solo a producción).
- Merge a `main` (con aprobación manual): **el mismo artefacto ya probado en staging** se promueve a producción — nunca se recompila para producción. Este es el principio de "compilación única" de vuestro material de CI/CD: lo que se testea es exactamente lo que se despliega.

## 3. Pirámide de tests aplicada a este proyecto

| Nivel | Qué cubre aquí | Herramienta |
|---|---|---|
| Unitarios | Entidades de dominio, casos de uso con `FakeDiceRoller`, bucle de `dm-engine` con DeepSeek/MCP mockeados | Jest |
| Integración | Repositorios Mongoose contra Mongo real (no mockeado), servidor MCP (registro + despacho de tools contra casos de uso reales) | Jest + Testcontainers / `mongodb-memory-server` |
| E2E | Una partida completa jugada de principio a fin contra un entorno de staging | Playwright |

Cuantos más "reales" son los tests, menos frecuentes se ejecutan: unitarios en cada commit, integración en cada PR, E2E en cada merge a `develop`/`main` (no en cada commit — son lentos).

## 4. El problema específico de testear con un LLM real en E2E

El resultado narrativo de DeepSeek no es determinista — un test E2E no puede hacer `expect(narrative).toBe("...")`. Dos soluciones combinadas:

- **E2E funcional (en cada pipeline):** se sustituye la llamada real a DeepSeek por una respuesta grabada/fija (igual que el mock del paso 5) y se asertan los **efectos estructurales**: ¿cambió el HP correcto?, ¿se generó el evento `combate_iniciado`?, ¿se guardó la partida? — nunca el contenido exacto del texto narrado.
- **E2E de humo contra la API real (periódico, no en cada commit):** una ejecución programada (ej. nightly) contra DeepSeek real, que solo comprueba que la respuesta llega, tiene el formato esperado y no lanza error — para detectar cambios de comportamiento del proveedor, no para verificar lógica de negocio.

## 5. Pipeline (esqueleto GitHub Actions)

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run lint

  unit-tests:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit

  integration-tests:
    needs: unit-tests
    runs-on: ubuntu-latest
    services:
      mongodb:
        image: mongo:7
        ports: ["27017:27017"]
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:integration
        env:
          MONGODB_URI: mongodb://localhost:27017/test

  e2e:
    if: github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/main'
    needs: integration-tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
        env:
          DEEPSEEK_MODE: fixture   # respuestas grabadas, no llamada real

  deploy-staging:
    if: github.ref == 'refs/heads/develop'
    needs: e2e
    runs-on: ubuntu-latest
    steps:
      - run: echo "desplegar api, dm-engine, web y mobile a staging"
```

Con path filters (`paths:` en cada job) se puede evitar redesplegar los cuatro proyectos si un cambio solo tocó, por ejemplo, `mobile/` — mismo principio de reutilización de workflows de vuestro material de CI/CD.

## 6. Variables de entorno y secretos por entorno

`DEEPSEEK_API_KEY`, `MCP_SERVER_URL`, `MONGODB_URI` — distintos valores en staging y producción, gestionados como secrets de CI, nunca en el repositorio.

## 7. Definición de terminado del proyecto (global)

Cerrando la hoja de ruta completa (pasos 1-9):

- Toda regla de negocio nace de un test (TDD estricto, paso 3).
- Ninguna capa de dominio conoce NestJS, Mongoose, MCP ni DeepSeek (paso 3).
- REST y MCP son adaptadores finos sobre los mismos casos de uso (pasos 3-4).
- El motor de IA nunca inventa números ni estadísticas — todo pasa por tools (paso 5).
- `agents.md` + skills documentan las convenciones para cualquier agente que trabaje en el repo (paso 6).
- UI web y móvil se derivan del mismo contrato de eventos, sin lógica de negocio propia (pasos 7-8).
- El pipeline garantiza que lo desplegado es exactamente lo testeado (paso 9).

---

*Con esto se cierran las 9 piezas de la hoja de ruta. Documentación completa en `/docs/01` a `/docs/09`.*
