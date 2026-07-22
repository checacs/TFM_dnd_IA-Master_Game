import 'dotenv/config';
import mongoose from 'mongoose';
import { mapMongooseSchema } from '../src/infrastructure/persistence/mongoose/schemas/map.schema';

/**
 * Añade aquí una entrada por cada imagen que coloques en assets/maps/.
 * El _id es el identificador que luego usarás como mapId al iniciar combate
 * (POST /games/:gameId/start-combat con { "mapId": "taverna" }).
 *
 * rows/cols de estas 5 entradas son una ESTIMACIÓN VISUAL sobre la imagen
 * generada — la cuadrícula fina de mapas dibujados es difícil de contar con
 * precisión sin medir el archivo directamente. Ajusta los valores si al ver
 * el tablero superpuesto en la UI no encaja con las líneas del propio dibujo.
 */
const maps = [
  {
    _id: 'tablonAnuncios',
    name: 'Tablon Anuncios',
    description: 'Tablon de anuncios del pueblo sobre trabajos remunerados o dar ayuda a gente necesitada.',
    tags: ['calle', 'tablon', 'social', 'anuncios', 'pueblo'],
    // rows/cols son obligatorios en el esquema (BattleMapProps) aunque este mapa
    // no tenga salas que catalogar -- es una ilustracion de calle en primer
    // plano, no una planta con cuadricula real, así que el valor exacto no
    // importa para el juego (no se necesita mover a nadie por el tablero aquí).
    rows: 12,
    cols: 12,
    imageUrl: '/maps/battleMap-tablonAnuncios.png',
    // Sin zonas a proposito (ver dm-system-prompt.ts): es solo una imagen de
    // calle, no una sala con salas que catalogar. zones: [] hace que
    // isCellInsideZones acepte cualquier celda (ver battle-map.entity.ts) --
    // el DM no necesita place_participant con una celda concreta aqui. La
    // entrada anterior tenía una zona sin "cells" (campo obligatorio del tipo
    // MapZone), lo que habría roto isCellInsideZone si algún place_participant
    // hubiera pasado ese zoneName.
    zones: [],
  },
  {
    _id: 'tabernaMercenarios',
    name: 'Taberna Mercenarios',
    description: 'Sala principal de una taberna, con mesas, chimenea y zona de barra.',
    tags: ['interior', 'taberna', 'social'],
    // Recalibrado a pixel sobre la imagen real (antes 25x26 "a ojo"), en DOS
    // pasadas -- la primera pasada (rows:21 cols:24, calcada de la rejilla
    // real dibujada) resultó estar mal planteada: BoardPanel.tsx pinta el
    // mapa en un contenedor con aspect-ratio = cols/rows y ahí encima el
    // <img> con object-fit:contain, así que si cols/rows no coincide con el
    // ratio real de la imagen (1024x1024 -- CUADRADA, confirmado con PIL),
    // el navegador añade franjas vacías (letterboxing) a los lados para
    // encajarla sin deformarla -- y el % de cada marcador se calcula sobre
    // el CONTENEDOR, no sobre el dibujo real, así que con rows≠cols en una
    // imagen cuadrada todo marcador queda desplazado. Por eso rows Y cols
    // tienen que ser IGUALES aquí (contenedor cuadrado = imagen cuadrada =
    // cero letterboxing), no el conteo literal de casillas del dibujo (que
    // es 24 columnas x 21 filas, ligeramente rectangular).
    //
    // Con rows=cols=27 (1024/27 ≈ 37.9px por celda, casi igual al paso real
    // de ~38px de la rejilla dibujada) se localizaron las líneas reales de
    // la rejilla por pixel (picos de oscuridad + verificación cruzada por
    // FFT de la periodicidad) y se tradujeron a este sistema de coordenadas
    // cuadrado: el muro exterior deja un margen de ~2 filas/columnas antes
    // de que empiece el suelo real, y la franja de fuera (cartel, arbustos,
    // escalones de la entrada, sin rejilla dibujada) empieza pasada la fila
    // 22 -- las zonas de abajo excluyen ese margen por todos los lados. Se
    // verificó pintando marcadores de prueba sobre la imagen real con esta
    // fórmula exacta ((fila+0.5)/rows, (col+0.5)/cols) y confirmando que
    // caen dentro del dibujo, no en el muro ni en la franja exterior. El
    // muro/pilar que separa la sala principal del ala de barra y almacén
    // cae en la columna 16/17 en este sistema.
    //
    // Antes (25x26 "a ojo" y luego 21x24 "por rejilla real pero rectangular")
    // se detectó en partida real que la IA colocaba a los jugadores fuera de
    // la taberna (en la franja exterior con el cartel y los arbustos) pese a
    // que place_participant los daba por "dentro" de la zona.
    rows: 27,
    cols: 27,
    imageUrl: '/maps/battleMap1-tabernaMercenarios.png',
    zones: [
      { name: 'Salón Principal', cells: [{ rowStart: 2, rowEnd: 22, colStart: 2, colEnd: 16 }] },
      { name: 'Barra y Almacén', cells: [{ rowStart: 2, rowEnd: 22, colStart: 17, colEnd: 24 }] },
    ],
  },
  {
    _id: 'gran-castillo-sala-trono',
    name: 'Gran salón del trono con pilares',
    description: 'Salón del trono de un castillo, con estandartes, estatuas de grifos y alfombra ceremonial.',
    tags: ['interior', 'castillo', 'nobleza', 'trono', 'pilares'],
    rows: 29,
    cols: 30,
    imageUrl: '/maps/battleMap2-GreatCastlePilares.png',
    zones: [
      { name: 'Sala del Trono', cells: [{ rowStart: 0, rowEnd: 9, colStart: 4, colEnd: 25 }] },
      { name: 'Salón Central de Pilares', cells: [{ rowStart: 9, rowEnd: 22, colStart: 1, colEnd: 28 }] },
      { name: 'Vestíbulo de Entrada', cells: [{ rowStart: 22, rowEnd: 28, colStart: 4, colEnd: 25 }] },
    ],
  },
  {
    _id: 'fortaleza-multisala',
    name: 'Fortaleza (planta completa)',
    description: 'Planta completa de una pequeña fortaleza: entrada, barracones, forja, biblioteca, dormitorio, tesoro y sala ritual.',
    tags: ['interior', 'castillo', 'mazmorra', 'multisala'],
    rows: 35,
    cols: 20,
    imageUrl: '/maps/battleMap3-castle.png',
    zones: [
      { name: 'Sala Ritual', cells: [{ rowStart: 0, rowEnd: 8, colStart: 0, colEnd: 8 }] },
      { name: 'Tesoro', cells: [{ rowStart: 1, rowEnd: 7, colStart: 9, colEnd: 16 }] },
      { name: 'Almacén', cells: [{ rowStart: 9, rowEnd: 14, colStart: 1, colEnd: 8 }] },
      { name: 'Dormitorio', cells: [{ rowStart: 8, rowEnd: 11, colStart: 10, colEnd: 18 }] },
      { name: 'Biblioteca', cells: [{ rowStart: 11, rowEnd: 19, colStart: 10, colEnd: 18 }] },
      { name: 'Barracones', cells: [{ rowStart: 15, rowEnd: 24, colStart: 1, colEnd: 8 }] },
      { name: 'Armería y Forja', cells: [{ rowStart: 20, rowEnd: 24, colStart: 10, colEnd: 18 }] },
      { name: 'Entrada', cells: [{ rowStart: 25, rowEnd: 34, colStart: 4, colEnd: 15 }] },
    ],
  },
  {
    _id: 'cueva-rio',
    name: 'Cueva del río subterráneo',
    description: 'Sistema de cuevas conectado por un río, con estanque oculto, gruta de cristales y guarida de hongos.',
    tags: ['exterior', 'cueva', 'subterraneo'],
    rows: 41,
    cols: 22,
    imageUrl: '/maps/battleMap4-caverna.png',
    zones: [
      { name: 'Estanque Oculto', cells: [{ rowStart: 0, rowEnd: 6, colStart: 0, colEnd: 7 }] },
      { name: 'Cámara de la Cascada', cells: [{ rowStart: 0, rowEnd: 8, colStart: 6, colEnd: 16 }] },
      { name: 'Cruce del Río', cells: [{ rowStart: 8, rowEnd: 15, colStart: 5, colEnd: 14 }] },
      { name: 'Guarida de Hongos', cells: [{ rowStart: 15, rowEnd: 24, colStart: 0, colEnd: 7 }] },
      { name: 'Gruta de Cristales', cells: [{ rowStart: 15, rowEnd: 24, colStart: 14, colEnd: 21 }] },
      { name: 'Caverna Principal', cells: [{ rowStart: 15, rowEnd: 30, colStart: 6, colEnd: 15 }] },
      { name: 'Puesto de Guardia', cells: [{ rowStart: 30, rowEnd: 38, colStart: 3, colEnd: 18 }] },
    ],
  },
  {
    _id: 'cueva-rio-alt',
    name: 'Cueva del río (variante)',
    description: 'Variante de la cueva del río: las Cascadas del Norte, el Abismo Torrencial, el Estanque ' +
        'Luminoso junto al Embarcadero Antiguo, un Santuario Oculto y la Gruta de Cristales, todo conectado ' +
        'por la corriente que cruza la Caverna Principal hasta el Puesto de Guardia de la entrada.',
    tags: ['exterior', 'cueva', 'subterraneo'],
    rows: 34,
    cols: 18,
    imageUrl: '/maps/battleMap5-caverna.png',
    zones: [
      { name: 'Las Cascadas del Norte', cells: [{ rowStart: 0, rowEnd: 6, colStart: 5, colEnd: 13 }] },
      { name: 'El Abismo Torrencial', cells: [{ rowStart: 5, rowEnd: 10, colStart: 0, colEnd: 6 }] },
      { name: 'El Embarcadero Antiguo', cells: [{ rowStart: 5, rowEnd: 11, colStart: 12, colEnd: 17 }] },
      { name: 'Cruce del Río', cells: [{ rowStart: 8, rowEnd: 14, colStart: 4, colEnd: 13 }] },
      { name: 'El Santuario Oculto', cells: [{ rowStart: 13, rowEnd: 19, colStart: 0, colEnd: 6 }] },
      { name: 'Gruta de Cristales', cells: [{ rowStart: 13, rowEnd: 19, colStart: 12, colEnd: 17 }] },
      { name: 'Caverna Principal', cells: [{ rowStart: 14, rowEnd: 25, colStart: 5, colEnd: 13 }] },
      { name: 'Puesto de Guardia', cells: [{ rowStart: 25, rowEnd: 33, colStart: 2, colEnd: 15 }] },
    ],
  },
  {
    _id: 'laberinto-exterior',
    name: 'Laberinto de los Ecos (planta completa)',
    description: 'Planta completa de un laberinto en ruinas: el Gran Osario, la Sala del Trono Derruida, un ' +
        'taller de alquimia, celdas de contención, un pozo de sacrificio, el Estanque de los Susurros, el ' +
        'Santuario de los Antiguos, el Cruce Principal, la Armería Real, un puente colgante sobre un abismo, ' +
        'el Cruce de las Ratas, una entrada de servicio y la Sala de los Ecos.',
    tags: ['interior', 'laberinto', 'mazmorra', 'trono', 'prision', 'multisala'],
    rows: 34,
    cols: 18,
    imageUrl: '/maps/battleMap6-LaberintoDeLosEcos.png',
    zones: [
      { name: 'El Gran Osario', cells: [{ rowStart: 0, rowEnd: 6, colStart: 0, colEnd: 6 }] },
      { name: 'Sala del Trono Derruida', cells: [{ rowStart: 0, rowEnd: 6, colStart: 6, colEnd: 12 }] },
      { name: 'Taller de Alquimia', cells: [{ rowStart: 4, rowEnd: 9, colStart: 13, colEnd: 17 }] },
      { name: 'Celdas de Contención', cells: [{ rowStart: 7, rowEnd: 12, colStart: 0, colEnd: 6 }] },
      { name: 'Pozo de Sacrificio', cells: [{ rowStart: 7, rowEnd: 12, colStart: 6, colEnd: 12 }] },
      { name: 'El Estanque de los Susurros', cells: [{ rowStart: 9, rowEnd: 14, colStart: 13, colEnd: 17 }] },
      { name: 'Santuario de los Antiguos', cells: [{ rowStart: 13, rowEnd: 18, colStart: 0, colEnd: 6 }] },
      { name: 'Cruce Principal', cells: [{ rowStart: 13, rowEnd: 18, colStart: 6, colEnd: 11 }] },
      { name: 'Armería Real', cells: [{ rowStart: 15, rowEnd: 19, colStart: 11, colEnd: 14 }] },
      { name: 'Puente Colgante', cells: [{ rowStart: 14, rowEnd: 22, colStart: 14, colEnd: 17 }] },
      { name: 'El Cruce de las Ratas', cells: [{ rowStart: 19, rowEnd: 25, colStart: 0, colEnd: 6 }] },
      { name: 'Entrada de Servicio', cells: [{ rowStart: 24, rowEnd: 31, colStart: 0, colEnd: 8 }] },
      { name: 'Sala de los Ecos', cells: [{ rowStart: 24, rowEnd: 31, colStart: 11, colEnd: 17 }] },
      { name: 'Entrada Principal', cells: [{ rowStart: 27, rowEnd: 33, colStart: 7, colEnd: 11 }] },
    ],
  },
  {
    _id: 'cripta-multisala',
    name: 'Fortaleza con mazmorras (planta completa)',
    description: 'Planta completa de una fortaleza con mazmorras: sala de tortura, barracones, almacén, ' +
        'celdas de la prisión, armería, sala central, escalera al patio de armas y escaleras que bajan a las criptas.',
    tags: ['interior', 'castillo', 'prision', 'mazmorra', 'multisala', 'cripta', 'tumba'],
    rows: 30,
    cols: 19,
    imageUrl: '/maps/battleMap9-CriptaDeLosEcos.png',
    zones: [
      { name: 'Sala de Tortura', cells: [{ rowStart: 0, rowEnd: 8, colStart: 0, colEnd: 5 }] },
      { name: 'Escalera al Patio de Armas', cells: [{ rowStart: 0, rowEnd: 4, colStart: 14, colEnd: 18 }] },
      { name: 'Celdas de la Prisión (norte)', cells: [{ rowStart: 5, rowEnd: 9, colStart: 14, colEnd: 18 }] },
      { name: 'Barracones', cells: [{ rowStart: 9, rowEnd: 16, colStart: 0, colEnd: 5 }] },
      { name: 'Armería', cells: [{ rowStart: 9, rowEnd: 16, colStart: 13, colEnd: 18 }] },
      { name: 'Sala Central', cells: [{ rowStart: 15, rowEnd: 24, colStart: 5, colEnd: 13 }] },
      { name: 'Almacén', cells: [{ rowStart: 17, rowEnd: 23, colStart: 0, colEnd: 5 }] },
      { name: 'Prisión Celdas 1-6', cells: [{ rowStart: 17, rowEnd: 23, colStart: 13, colEnd: 18 }] },
      { name: 'Escalera a las Criptas', cells: [{ rowStart: 22, rowEnd: 30, colStart: 0, colEnd: 5 }] },
      { name: 'Celdas de la Prisión (sur)', cells: [{ rowStart: 26, rowEnd: 30, colStart: 5, colEnd: 9 }] },
      { name: 'Larder', cells: [{ rowStart: 23, rowEnd: 30, colStart: 13, colEnd: 18 }] },
      { name: 'Puesto de Guardia', cells: [{ rowStart: 27, rowEnd: 30, colStart: 8, colEnd: 12 }] },
    ],
  },
  {
    _id: 'ruinas-bosque',
    name: 'Las Ruinas del Claro del Bosque (planta completa)',
    description: 'Claro de bosque con un estanque reflectante en el centro: el Círculo de Piedras, la Arboleda ' +
        'Sagrada, el Túmulo del Héroe Caído, la Senda de la Enredadera, las Ruinas del Templo del Sol, el Coto ' +
        'de Caza de los Trasgos y un Viejo Roble Resonante junto a la entrada al claro.',
    tags: ['exterior', 'ruinas', 'bosque', 'multisala', 'claro'],
    rows: 34,
    cols: 18,
    imageUrl: '/maps/battleMap7-RuinasClaroDelBosque.png',
    zones: [
      { name: 'Claro del Círculo de Piedras', cells: [{ rowStart: 0, rowEnd: 8, colStart: 0, colEnd: 7 }] },
      { name: 'Arboleda Sagrada', cells: [{ rowStart: 0, rowEnd: 8, colStart: 7, colEnd: 13 }] },
      { name: 'Túmulo del Héroe Caído', cells: [{ rowStart: 5, rowEnd: 11, colStart: 13, colEnd: 17 }] },
      { name: 'Senda de la Enredadera', cells: [{ rowStart: 11, rowEnd: 19, colStart: 0, colEnd: 7 }] },
      { name: 'El Estanque Reflectante', cells: [{ rowStart: 11, rowEnd: 20, colStart: 7, colEnd: 13 }] },
      { name: 'Ruinas del Templo del Sol', cells: [{ rowStart: 11, rowEnd: 19, colStart: 13, colEnd: 17 }] },
      { name: 'Coto de Caza de los Trasgos', cells: [{ rowStart: 20, rowEnd: 28, colStart: 0, colEnd: 9 }] },
      { name: 'Viejo Roble Resonante', cells: [{ rowStart: 20, rowEnd: 28, colStart: 9, colEnd: 17 }] },
      { name: 'Entrada al Claro', cells: [{ rowStart: 28, rowEnd: 33, colStart: 6, colEnd: 12 }] },
    ],
  },
  {
    _id: 'fortaleza-subterranea',
    name: 'Fortaleza subterranea (planta completa)',
    description: 'Planta completa de unas forteleza subterranea: entrada, prisiones, tesoro, celdas, armería, tortura',
    tags: ['interior', 'prision', 'tesoros', 'multisala'],
    rows: 34,
    cols: 18,
    imageUrl: '/maps/battleMap8-FortalezaSubterranea.png',
    // Zonas leídas visualmente sobre la rejilla calibrada (c0-c17 / r0-r34) — borrador, revisar bordes.
    zones: [
      { name: 'Sala de Tortura', cells: [{ rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 6 }] },
      { name: 'Cripta de los Despojos', cells: [{ rowStart: 0, rowEnd: 6, colStart: 7, colEnd: 12 }] },
      { name: 'Armeria Real', cells: [{ rowStart: 6, rowEnd: 11, colStart: 13, colEnd: 17 }] },
      { name: 'Corredor de los Murcielagos', cells: [{ rowStart: 11, rowEnd: 19, colStart: 0, colEnd: 5 }] },
      { name: 'Gran Salon Central', cells: [{ rowStart: 12, rowEnd: 21, colStart: 5, colEnd: 11 }] },
      { name: 'Celdas de Contencion', cells: [{ rowStart: 13, rowEnd: 19, colStart: 13, colEnd: 17 }] },
      { name: 'Prision de Alta Seguridad', cells: [{ rowStart: 22, rowEnd: 29, colStart: 0, colEnd: 6 }] },
      { name: 'Sala del Tesoro', cells: [{ rowStart: 23, rowEnd: 28, colStart: 12, colEnd: 17 }] },
      { name: 'Entrada Principal', cells: [{ rowStart: 28, rowEnd: 34, colStart: 7, colEnd: 10 }] },
    ],
  },
  {
    _id: 'casa-escondite-piso1',
    name: 'Casa ocupada (planta superior)',
    description: 'Planta superior de la casa escondite de un enemigo vil y poderoso, conectada a la planta ' +
        'baja (mapId casa-escondite-piso2) por una escalera de caracol: un dormitorio con arcón y estantería, ' +
        'una cocina-despensa con alacena y mesa, la escalera de caracol que baja, una bodega con barriles y ' +
        'cajas, y la entrada de la casa.',
    tags: ['interior', 'casa', 'habitaciones', 'multisala', 'piso1'],
    rows: 20,
    cols: 12,
    imageUrl: '/maps/battleMap10-CasaOcupadaPiso1.png',
    zones: [
      { name: 'Dormitorio', cells: [{ rowStart: 0, rowEnd: 8, colStart: 1, colEnd: 11 }] },
      { name: 'Cocina y Despensa', cells: [{ rowStart: 8, rowEnd: 12, colStart: 0, colEnd: 6 }] },
      { name: 'Escalera de Caracol', cells: [{ rowStart: 11, rowEnd: 15, colStart: 7, colEnd: 11 }] },
      { name: 'Bodega', cells: [{ rowStart: 14, rowEnd: 18, colStart: 0, colEnd: 6 }] },
      { name: 'Entrada', cells: [{ rowStart: 18, rowEnd: 19, colStart: 6, colEnd: 9 }] },
    ],
  },
  {
    _id: 'casa-escondite-piso2',
    name: 'Casa ocupada (planta baja)',
    description: 'Planta baja de la casa escondite de un enemigo vil y poderoso, conectada a la planta ' +
        'superior (mapId casa-escondite-piso1) por una escalera de caracol: una sala de mapas con cofres y ' +
        'un plano de guerra, un pasillo central, una armería-estudio con armero y mesa de trabajo, una gran ' +
        'bodega con barriles y escombros, y la entrada trasera.',
    tags: ['interior', 'casa', 'habitaciones', 'armeria', 'multisala', 'piso2'],
    rows: 22,
    cols: 11,
    imageUrl: '/maps/battleMap10-CasaOcupadaPiso2.png',
    zones: [
      { name: 'Sala de Mapas', cells: [{ rowStart: 0, rowEnd: 8, colStart: 1, colEnd: 10 }] },
      { name: 'Pasillo Central', cells: [{ rowStart: 8, rowEnd: 16, colStart: 4, colEnd: 6 }] },
      { name: 'Armería y Estudio', cells: [{ rowStart: 10, rowEnd: 15, colStart: 0, colEnd: 4 }] },
      { name: 'Bodega', cells: [{ rowStart: 16, rowEnd: 21, colStart: 0, colEnd: 6 }] },
      { name: 'Entrada', cells: [{ rowStart: 20, rowEnd: 21, colStart: 6, colEnd: 8 }] },
    ],
  },
  {
    _id: 'almacen-piso1',
    name: 'Almacén (planta superior)',
    description: 'Planta superior de un gran almacén de mercancías, conectada a la planta baja (mapId ' +
        'almacen-piso2) por una escalera de carga central: estanterías y barriles a ambos lados de la ' +
        'nave, el hueco de la escalera en el centro, y grandes puertas de carga al norte y al sur.',
    tags: ['interior', 'almacen', 'comercio', 'tienda', 'multisala', 'piso1', 'escaleras'],
    rows: 32,
    cols: 61,
    imageUrl: '/maps/battleMap12-AlmacenPiso1.png',
    zones: [
      { name: 'Almacén Oeste', cells: [{ rowStart: 0, rowEnd: 31, colStart: 0, colEnd: 25 }] },
      { name: 'Hueco de la Escalera', cells: [{ rowStart: 3, rowEnd: 28, colStart: 26, colEnd: 44 }] },
      { name: 'Almacén Este', cells: [{ rowStart: 0, rowEnd: 31, colStart: 45, colEnd: 60 }] },
      { name: 'Entrada Norte', cells: [{ rowStart: 0, rowEnd: 3, colStart: 26, colEnd: 34 }] },
      { name: 'Entrada Sur', cells: [{ rowStart: 28, rowEnd: 31, colStart: 26, colEnd: 34 }] },
    ],
  },
  {
    _id: 'almacen-piso2',
    name: 'Almacén (planta baja)',
    description: 'Planta baja del almacén, conectada a la planta superior (mapId almacen-piso1) por una ' +
        'escalera de carga central: estanterías de mercancías al oeste, el hueco de la escalera, y al este ' +
        'la oficina del encargado con un ventanal enrejado y una pequeña armería con lanzas y escudo. La ' +
        'única puerta de carga está al sur.',
    tags: ['interior', 'almacen', 'comercio', 'tienda', 'multisala', 'piso2', 'escaleras'],
    rows: 32,
    cols: 61,
    imageUrl: '/maps/battleMap12-AlmacenPiso2.png',
    zones: [
      { name: 'Almacén Oeste', cells: [{ rowStart: 0, rowEnd: 31, colStart: 0, colEnd: 25 }] },
      { name: 'Hueco de la Escalera', cells: [{ rowStart: 3, rowEnd: 28, colStart: 26, colEnd: 44 }] },
      { name: 'Oficina del Encargado', cells: [{ rowStart: 0, rowEnd: 15, colStart: 45, colEnd: 60 }] },
      { name: 'Armería', cells: [{ rowStart: 16, rowEnd: 31, colStart: 45, colEnd: 60 }] },
      { name: 'Entrada', cells: [{ rowStart: 28, rowEnd: 31, colStart: 26, colEnd: 34 }] },
    ],
  },
  {
    _id: 'almacen-mercancias',
    name: 'Almacén de mercancías',
    description: 'Nave de almacén estrecha y alargada: una estantería alta recorre todo el muro oeste, tres ' +
        'pasillos centrales de barriles y cajas, un pequeño rincón del encargado con escritorio junto a una ' +
        'polea de carga, y una armería de reserva con lanzas colgadas. Las puertas de carga están al sur. No tiene' +
        'escaleras, es solo un piso.',
    tags: ['interior', 'almacen', 'comercio', 'tienda'],
    rows: 22,
    cols: 11,
    imageUrl: '/maps/battleMap13-Almacen1.png',
    zones: [
      { name: 'Estantería Oeste', cells: [{ rowStart: 1, rowEnd: 20, colStart: 0, colEnd: 1 }] },
      { name: 'Pasillo de Barriles', cells: [{ rowStart: 2, rowEnd: 19, colStart: 2, colEnd: 6 }] },
      { name: 'Rincón del Encargado', cells: [{ rowStart: 0, rowEnd: 4, colStart: 7, colEnd: 10 }] },
      { name: 'Armería de Reserva', cells: [{ rowStart: 5, rowEnd: 19, colStart: 7, colEnd: 10 }] },
      { name: 'Entrada', cells: [{ rowStart: 20, rowEnd: 21, colStart: 3, colEnd: 7 }] },
    ],
  },
  {
    _id: 'almacen-suministros',
    name: 'Almacén de suministros',
    description: 'Nave de almacén dividida en dos largos pasillos de estanterías por un muro central de ' +
        'estanterías, cada uno repleto de cajas, telas y provisiones. La puerta de carga está al sur. No tiene' +
        'escaleras, es solo un piso.',
    tags: ['interior', 'almacen', 'comercio', 'tienda'],
    rows: 22,
    cols: 11,
    imageUrl: '/maps/battleMap14-Almacen2.png',
    zones: [
      { name: 'Pasillo Oeste', cells: [{ rowStart: 0, rowEnd: 21, colStart: 0, colEnd: 5 }] },
      { name: 'Pasillo Este', cells: [{ rowStart: 0, rowEnd: 21, colStart: 6, colEnd: 10 }] },
      { name: 'Entrada', cells: [{ rowStart: 20, rowEnd: 21, colStart: 3, colEnd: 7 }] },
    ],
  },
  {
    _id: 'cabana-bosque-grande',
    name: 'Cabaña grande del bosque',
    description: 'Interior de una amplia cabaña de troncos en el bosque, con varias estancias: dormitorios ' +
        'con camas individuales al norte, un estudio con estanterías al ala este, un comedor central con mesa ' +
        'larga y chimenea de cocina, una despensa y cocina que recorre todo el muro oeste, alcobas y un rincón ' +
        'de lectura al ala este, y al sur una zona de almacenaje con un cofre junto a la entrada porticada.',
    tags: ['interior', 'cabana', 'bosque', 'multisala'],
    rows: 21,
    cols: 11,
    imageUrl: '/maps/battleMap15-cabañaBosqueGrande.png',
    zones: [
      { name: 'Dormitorios Norte', cells: [{ rowStart: 0, rowEnd: 6, colStart: 3, colEnd: 10 }] },
      { name: 'Cocina y Despensa Oeste', cells: [{ rowStart: 3, rowEnd: 14, colStart: 0, colEnd: 2 }] },
      { name: 'Comedor Central', cells: [{ rowStart: 6, rowEnd: 11, colStart: 3, colEnd: 7 }] },
      { name: 'Ala Este (Alcobas)', cells: [{ rowStart: 6, rowEnd: 18, colStart: 8, colEnd: 10 }] },
      { name: 'Almacenaje Sur', cells: [{ rowStart: 14, rowEnd: 19, colStart: 3, colEnd: 7 }] },
      { name: 'Entrada Sur', cells: [{ rowStart: 19, rowEnd: 20, colStart: 3, colEnd: 7 }] },
    ],
  },
  {
    _id: 'cabana-bosque-pequena',
    name: 'Cabaña pequeña del bosque',
    description: 'Vista aérea de una pequeña cabaña de troncos aislada en un claro nevado del bosque, rodeada ' +
        'de árboles y rocas. Por dentro es una única estancia: cocina y mesa junto a la puerta al oeste, dos ' +
        'camas y una chimenea central al este. Una pequeña entrada porticada da acceso por el sur.',
    tags: ['exterior', 'interior', 'cabana', 'bosque'],
    rows: 22,
    cols: 11,
    imageUrl: '/maps/battleMap16-cabañaBosquePequeña.png',
    zones: [
      { name: 'Bosque Norte', cells: [{ rowStart: 0, rowEnd: 7, colStart: 0, colEnd: 10 }] },
      { name: 'Bosque Oeste', cells: [{ rowStart: 8, rowEnd: 15, colStart: 0, colEnd: 2 }] },
      { name: 'Interior Cabaña - Cocina', cells: [{ rowStart: 8, rowEnd: 14, colStart: 3, colEnd: 5 }] },
      { name: 'Interior Cabaña - Dormitorio', cells: [{ rowStart: 8, rowEnd: 14, colStart: 6, colEnd: 8 }] },
      { name: 'Bosque Este', cells: [{ rowStart: 8, rowEnd: 15, colStart: 9, colEnd: 10 }] },
      { name: 'Porche Sur', cells: [{ rowStart: 14, rowEnd: 15, colStart: 4, colEnd: 7 }] },
      { name: 'Bosque Sur', cells: [{ rowStart: 16, rowEnd: 21, colStart: 0, colEnd: 10 }] },
    ],
  },
];

async function seed() {
  const uri = process.env.URL;
  if (!uri) {
    throw new Error('Falta la variable de entorno MONGODB_URI (revisa tu .env)');
  }

  await mongoose.connect(uri);

  const MapModel = mongoose.model('Map', mapMongooseSchema);

  for (const map of maps) {
    await MapModel.findByIdAndUpdate(map._id, map, { upsert: true, returnDocument: 'after' });
    console.log(`Sembrado: ${map.name} (${map._id})`);
  }

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
