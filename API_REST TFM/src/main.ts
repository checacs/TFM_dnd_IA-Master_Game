import 'dotenv/config';
import 'reflect-metadata';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { AppModule } from './modules/app.module';
import { DomainErrorFilter } from './interface/http/domain-error.filter';
import { GameMcpTools } from './interface/mcp/game-mcp-tools';
import { registerGameTools } from './interface/mcp/mcp.server';
import { INTERNAL_API_KEY_HEADER, isInternalRequestAuthorized } from './interface/internal/internal-api-key';
import { isCorsOriginAllowed } from './interface/http/cors-origin';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // OJO: UNA SOLA llamada a enableCors() — el middleware `cors` que usa Nest
  // por debajo responde él mismo a las peticiones OPTIONS de preflight
  // (preflightContinue: false por defecto), así que si hubiera una segunda
  // llamada más permisiva detrás de una primera con whitelist, esa primera
  // ya habría contestado (y cortado) el preflight antes de llegar a la
  // segunda — bug real que tuvimos aquí mismo antes.
  //
  // La whitelist viene de CORS_ORIGIN (lista separada por comas) para poder
  // restringirla en producción por seguridad (ej. en Render: CORS_ORIGIN=
  // https://ui-web-dnd.onrender.com,https://app-mobile-dnd.onrender.com).
  // Si no se define (desarrollo local), cae a los puertos locales de
  // ui-web/Vite y de Expo en modo web. Esto NO afecta a mobile-app corriendo
  // como app nativa (iOS/Android): el fetch nativo no manda cabecera Origin,
  // así que el middleware cors ni comprueba la whitelist en ese caso — solo
  // importa para clientes que corren dentro de un navegador (ui-web, o
  // mobile-app en modo web). Tampoco se usan cookies (solo JWT en el header
  // Authorization), así que no hay riesgo de CSRF por permitir varios orígenes.
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : ['http://localhost:3001', 'http://localhost:3002', 'http://localhost:5173', 'http://localhost:8081', 'http://localhost:19006'];
  // CORS_ALLOW_LAN=true (solo docker-compose local, nunca en Render): acepta
  // además cualquier origen de la red local, para jugar desde el navegador del
  // móvil con mobile-app en modo web servida desde el PC (http://192.168.x.x:8081).
  const allowLan = process.env.CORS_ALLOW_LAN === 'true';
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) =>
      callback(null, isCorsOriginAllowed(origin, corsOrigins, allowLan)),
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DomainErrorFilter());

  // Sirve las imágenes de assets/maps/ en http://localhost:3000/maps/<archivo>.
  app.useStaticAssets(join(__dirname, '..', 'assets', 'maps'), { prefix: '/maps' });

  // Sirve la música de fondo de assets/music/ en http://localhost:3000/music/<archivo>.
  // ui-web decide qué pista sonar (pantallas iniciales, taberna, resto de
  // mapas, combate) — ver ui-web/src/audio/musicController.ts.
  app.useStaticAssets(join(__dirname, '..', 'assets', 'music'), { prefix: '/music' });

  // Servidor MCP (docs/04-servidor-mcp.md), en modo stateless (sin sesión).
  // GameMcpTools se recupera UNA vez del contenedor de Nest (mismos
  // repositorios que la API REST), pero McpServer/transport se crean
  // NUEVOS en cada petición — es el patrón oficial del SDK para modo
  // stateless (ver examples/server/simpleStatelessStreamableHttp del propio
  // paquete): reutilizar la misma instancia entre peticiones rompe el
  // transporte al no haber sesión que las distinga.
  const gameMcpTools = app.get(GameMcpTools);
  const httpAdapter = app.getHttpAdapter().getInstance();

  // Secreto compartido con dm-engine (ver interface/internal/internal-api-key.ts):
  // sin él, cualquiera con la URL pública podía invocar las tools MCP que
  // mutan partidas. Tiene que ser el MISMO valor en los dos servicios.
  const internalApiKey = process.env.INTERNAL_API_KEY;
  if (!internalApiKey) {
    // eslint-disable-next-line no-console
    console.warn(
      '[seguridad] INTERNAL_API_KEY no está definida: /mcp acepta peticiones de cualquiera. ' +
        'Defínela (el mismo valor) en la API y en dm-engine antes de desplegar.',
    );
  }

  httpAdapter.post('/mcp', async (req: any, res: any) => {
    if (!isInternalRequestAuthorized(internalApiKey, req.headers[INTERNAL_API_KEY_HEADER])) {
      res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null });
      return;
    }
    try {
      const mcpServer = new McpServer({ name: 'dnd-game-mcp', version: '1.0.0' });
      registerGameTools(mcpServer, gameMcpTools);

      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      // Igual que el ejemplo stateless del SDK: el cierre se registra ANTES de
      // atender la petición, para no perderlo si la conexión se cierra durante.
      res.on('close', () => {
        transport.close();
        mcpServer.close();
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error manejando la petición MCP:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  httpAdapter.get('/mcp', (_req: any, res: any) => {
    res.writeHead(405).end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    }));
  });

  httpAdapter.delete('/mcp', (_req: any, res: any) => {
    res.writeHead(405).end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    }));
  });

  setupSwaggerIfInstalled(app);

  // Render (y la mayoría de PaaS) indican el puerto en PORT; 3000 en local.
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`D&D con IA Master — API escuchando en http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`Servidor MCP escuchando en http://localhost:${port}/mcp`);
}

/**
 * Contrato OpenAPI (docs/03: "configurar @nestjs/swagger y entregar el
 * contrato OpenAPI generado -- no es opcional"). Se carga solo si el paquete
 * está instalado (`npm i @nestjs/swagger`), para no romper el arranque ni el
 * build de un entorno que todavía no lo tenga: con él, la documentación
 * interactiva queda en /api-docs y el JSON del contrato en /api-docs-json.
 */
function setupSwaggerIfInstalled(app: NestExpressApplication): void {
  let swagger: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    swagger = require('@nestjs/swagger');
  } catch {
    // eslint-disable-next-line no-console
    console.warn('[swagger] @nestjs/swagger no está instalado: ejecuta `npm i @nestjs/swagger` para publicar /api-docs.');
    return;
  }
  const config = new swagger.DocumentBuilder()
    .setTitle('D&D con IA Master — API')
    .setDescription('API REST del TFM: autenticación, partidas, personajes y TTS. El servidor MCP vive en /mcp.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = swagger.SwaggerModule.createDocument(app, config);
  swagger.SwaggerModule.setup('api-docs', app, document);
}

bootstrap();
