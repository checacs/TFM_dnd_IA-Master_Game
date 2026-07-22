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
  app.enableCors({ origin: corsOrigins });

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

  httpAdapter.post('/mcp', async (req: any, res: any) => {
    try {
      const mcpServer = new McpServer({ name: 'dnd-game-mcp', version: '1.0.0' });
      registerGameTools(mcpServer, gameMcpTools);

      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);

      res.on('close', () => {
        transport.close();
        mcpServer.close();
      });
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

  await app.listen(3000);
  // eslint-disable-next-line no-console
  console.log('D&D con IA Master — API escuchando en http://localhost:3000');
  // eslint-disable-next-line no-console
  console.log('Servidor MCP escuchando en http://localhost:3000/mcp');
}

bootstrap();
