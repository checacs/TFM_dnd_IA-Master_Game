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
    // Aun así, ajustado a pixel (imagen real 829x871, ratio 0.9518) para que
    // ningún futuro place_participant sufra el letterboxing de BoardPanel.tsx:
    // antes 12x12 (ratio 1.0, +5.07%), ahora 21x20 (ratio 0.9524, +0.06%).
    rows: 21,
    cols: 20,
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
    description: 'Sala principal de una taberna, con mesas, chimenea y zona de barra. Una escalera junto a la ' +
        'cocina baja al sótano de almacenaje (mapId sotanoTaberna).',
    tags: ['interior', 'taberna', 'social', 'escaleras'],
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
    // Recalibrado a pixel: imagen real 1024x1024 (CUADRADA), declarado antes
    // 29x30 (ratio 1.0345, +3.45% de letterboxing sobre el contenedor
    // cuadrado). Ajustado a rows=cols=30 (el cambio nominal más pequeño posible
    // -- solo +1 fila) para eliminar el letterboxing sin tocar ninguna zona:
    // verificado con overlay sobre la imagen real que las 3 zonas existentes
    // (salón del trono, salón central de pilares con estatuas de grifos,
    // vestíbulo de entrada) siguen encajando perfectamente sin rescalar nada.
    rows: 30,
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
    // Verificado a pixel: imagen real 784x1360, ratio -0.88% vs declarado
    // (negligible, sin letterboxing perceptible) -- SIN CAMBIOS. La imagen
    // trae los nombres de sala en inglés dibujados encima ("9 Ritual Room",
    // "8 Treasure Room", "5 Storage" x2, "7 Bedchamber", "6 Library",
    // "3. Barracks", "4. Armory/Smithy", "Entrance Hall"...) y el overlay de
    // las 8 zonas de abajo encaja casi perfecto con cada etiqueta.
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
    // Verificado a pixel: imagen real 918x1714, ratio +0.19% vs declarado
    // (negligible) -- SIN CAMBIOS. Etiquetas en inglés dibujadas en la imagen
    // ("Hidden Pool", "Waterfall Chamber", "River Fork", "Fungal Lair",
    // "Crystal Grotto", "Main Cavern", "Guard Post") confirman por overlay
    // que las 7 zonas de abajo encajan con cada sala.
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
    // Verificado a pixel: imagen real 752x1408, ratio -0.88% vs declarado
    // (negligible) -- SIN CAMBIOS. Etiquetas en inglés dibujadas en la imagen
    // ("The North Cascades", "The Rushing Chasm", "River Fork", "The Ancient
    // Jetty"/"The Luminous Pool", "The Hidden Shrine", "Crystal Grotto",
    // "Main Cavern", "Guard Post") confirman por overlay que las 8 zonas de
    // abajo encajan con cada sala.
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
    // Verificado a pixel: imagen real 752x1408, ratio negligible -- SIN
    // CAMBIOS. Esta imagen trae los nombres de sala en ESPAÑOL dibujados
    // encima, coincidiendo casi letra a letra con los nombres de zona de
    // abajo (los 14) -- el overlay fue un ajuste casi perfecto.
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
    // Recalibrado a pixel: imagen real 848x1264, ratio declarada 19/30=0.6333
    // vs objetivo 0.6709 (-5.6%, mismatch real, no negligible). Cambiado cols
    // 19->20 (el cambio nominal más pequeño posible) y reescaladas todas las
    // colStart/colEnd por ×20/19≈1.0526 para conservar la disposición
    // relativa de las salas. Verificado con overlay sobre la imagen real
    // (que trae los nombres de sala en español dibujados encima, coincidiendo
    // con los nombres de zona de abajo) -- excelente encaje tras el reescalado.
    rows: 30,
    cols: 20,
    imageUrl: '/maps/battleMap9-CriptaDeLosEcos.png',
    zones: [
      { name: 'Sala de Tortura', cells: [{ rowStart: 0, rowEnd: 8, colStart: 0, colEnd: 5 }] },
      { name: 'Escalera al Patio de Armas', cells: [{ rowStart: 0, rowEnd: 4, colStart: 15, colEnd: 19 }] },
      { name: 'Celdas de la Prisión (norte)', cells: [{ rowStart: 5, rowEnd: 9, colStart: 15, colEnd: 19 }] },
      { name: 'Barracones', cells: [{ rowStart: 9, rowEnd: 16, colStart: 0, colEnd: 5 }] },
      { name: 'Armería', cells: [{ rowStart: 9, rowEnd: 16, colStart: 14, colEnd: 19 }] },
      { name: 'Sala Central', cells: [{ rowStart: 15, rowEnd: 24, colStart: 5, colEnd: 14 }] },
      { name: 'Almacén', cells: [{ rowStart: 17, rowEnd: 23, colStart: 0, colEnd: 5 }] },
      { name: 'Prisión Celdas 1-6', cells: [{ rowStart: 17, rowEnd: 23, colStart: 14, colEnd: 19 }] },
      { name: 'Escalera a las Criptas', cells: [{ rowStart: 22, rowEnd: 30, colStart: 0, colEnd: 5 }] },
      { name: 'Celdas de la Prisión (sur)', cells: [{ rowStart: 26, rowEnd: 30, colStart: 5, colEnd: 9 }] },
      { name: 'Larder', cells: [{ rowStart: 23, rowEnd: 30, colStart: 14, colEnd: 19 }] },
      { name: 'Puesto de Guardia', cells: [{ rowStart: 27, rowEnd: 30, colStart: 8, colEnd: 13 }] },
    ],
  },
  {
    _id: 'ruinas-bosque',
    name: 'Las Ruinas del Claro del Bosque (planta completa)',
    description: 'Claro de bosque con un estanque reflectante en el centro: el Círculo de Piedras, la Arboleda ' +
        'Sagrada, el Túmulo del Héroe Caído, la Senda de la Enredadera, las Ruinas del Templo del Sol, el Coto ' +
        'de Caza de los Trasgos y un Viejo Roble Resonante junto a la entrada al claro.',
    tags: ['exterior', 'ruinas', 'bosque', 'multisala', 'claro'],
    // Verificado a pixel: imagen real 752x1408, ratio negligible -- SIN
    // CAMBIOS. Nombres de sala en español dibujados en la imagen coinciden
    // exactamente con los nombres de zona de abajo (9 salas) -- overlay
    // perfecto.
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
    // Verificado a pixel: imagen real 752x1408, ratio negligible -- SIN
    // CAMBIOS. Nombres de sala en español dibujados en la imagen coinciden
    // exactamente con los nombres de zona de abajo (9 salas) -- overlay
    // perfecto, confirmando el borrador anterior.
    rows: 34,
    cols: 18,
    imageUrl: '/maps/battleMap8-FortalezaSubterranea.png',
    // Zonas leídas visualmente sobre la rejilla calibrada (c0-c17 / r0-r34) — confirmado con overlay pixel-perfecto sobre la imagen real.
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
    name: 'Casa ocupada (planta baja)',
    description: 'Planta superior de la casa escondite de un enemigo vil y poderoso, conectada a la planta ' +
        'superior (mapId casa-escondite-piso2) por una escalera de caracol: un dormitorio con arcón y estantería, ' +
        'una cocina-despensa con alacena y mesa, la escalera de caracol que baja, una bodega con barriles y ' +
        'cajas, y la entrada de la casa.',
    tags: ['interior', 'casa', 'habitaciones', 'multisala', 'piso1', 'escaleras'],
    // Recalibrado a pixel: imagen real 768x1365, ratio declarada 20/12=... (ver
    // cols/rows=0.6 vs objetivo 0.5626, +6.65%, mismatch real). Cambiado rows
    // 20->21 (el cambio nominal más pequeño posible) y reescaladas todas las
    // rowStart/rowEnd por ×21/20=1.05 para conservar la disposición relativa.
    // Esta imagen no trae etiquetas de texto -- verificado visualmente contra
    // la descripción del mapa (cama/alfombra/estantería=Dormitorio arriba,
    // estantería de cocina/mesa=Cocina y Despensa centro-izq, escalera de
    // caracol=Escalera de Caracol centro-der, barriles/cajas=Bodega abajo-izq,
    // puerta pequeña=Entrada abajo) tras el reescalado.
    rows: 21,
    cols: 12,
    imageUrl: '/maps/battleMap10-CasaOcupadaPiso1.png',
    zones: [
      { name: 'Dormitorio', cells: [{ rowStart: 0, rowEnd: 8, colStart: 1, colEnd: 11 }] },
      { name: 'Cocina y Despensa', cells: [{ rowStart: 8, rowEnd: 13, colStart: 0, colEnd: 6 }] },
      { name: 'Escalera de Caracol', cells: [{ rowStart: 12, rowEnd: 16, colStart: 7, colEnd: 11 }] },
      { name: 'Bodega', cells: [{ rowStart: 15, rowEnd: 19, colStart: 0, colEnd: 6 }] },
      { name: 'Entrada', cells: [{ rowStart: 19, rowEnd: 20, colStart: 6, colEnd: 9 }] },
    ],
  },
  {
    _id: 'casa-escondite-piso2',
    name: 'Casa ocupada (planta superior)',
    description: 'Planta superior de la casa escondite de un enemigo vil y poderoso, conectada a la planta ' +
        'baja (mapId casa-escondite-piso1) por una escalera de caracol: una sala de mapas con cofres y ' +
        'un plano de guerra, un pasillo central, una armería-estudio con armero y mesa de trabajo, una gran ' +
        'bodega con barriles y escombros, y la entrada trasera.',
    tags: ['interior', 'casa', 'habitaciones', 'armeria', 'multisala', 'piso2', 'escaleras'],
    // Verificado a pixel: imagen real 677x1351, ratio negligible (-0.22%) --
    // SIN CAMBIOS. Overlay sobre la imagen real confirma buen encaje: mesa de
    // mapas/cofres arriba (Sala de Mapas), corredor con ventana redonda y
    // escalera (Pasillo Central), armero/sofá/mesa con plano (Armería y
    // Estudio), barriles/cajas (Bodega), puerta (Entrada).
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
    name: 'Almacén (planta baja)',
    description: 'Planta baja de un gran almacén de mercancías, conectada a la planta superior (mapId ' +
        'almacen-piso2) por una escalera de carga central: estanterías y barriles a ambos lados de la ' +
        'nave, el hueco de la escalera en el centro, y grandes puertas de carga al norte y al sur.',
    tags: ['interior', 'almacen', 'comercio', 'tienda', 'multisala', 'piso1', 'escaleras'],
    // Recalibrado a pixel: imagen real 1408x768 (ratio W/H = 11/6 = 1.8333
    // exacto), declarado 61/32=1.9063 (+3.98%, mismatch real). Cambiado rows
    // 32->33 (cambio nominal más pequeño que tocar cols: +1 fila vs -2
    // columnas) y reescaladas todas las rowStart/rowEnd por ×33/32=1.03125.
    // Verificado con overlay sobre la imagen real: encaje excelente con las
    // estanterías del almacén oeste/este, el hueco central de la escalera de
    // carga con la polea, y las puertas norte/sur.
    rows: 33,
    cols: 61,
    imageUrl: '/maps/battleMap12-AlmacenPiso1.png',
    zones: [
      { name: 'Almacén Oeste', cells: [{ rowStart: 0, rowEnd: 32, colStart: 0, colEnd: 25 }] },
      { name: 'Hueco de la Escalera', cells: [{ rowStart: 3, rowEnd: 29, colStart: 26, colEnd: 44 }] },
      { name: 'Almacén Este', cells: [{ rowStart: 0, rowEnd: 32, colStart: 45, colEnd: 60 }] },
      { name: 'Entrada Norte', cells: [{ rowStart: 0, rowEnd: 3, colStart: 26, colEnd: 34 }] },
      { name: 'Entrada Sur', cells: [{ rowStart: 29, rowEnd: 32, colStart: 26, colEnd: 34 }] },
    ],
  },
  {
    _id: 'almacen-piso2',
    name: 'Almacén (planta superior)',
    description: 'Planta superior del almacén, conectada a la planta baja (mapId almacen-piso1) por una ' +
        'escalera de carga central: estanterías de mercancías al oeste, el hueco de la escalera, y al este ' +
        'la oficina del encargado con un ventanal enrejado y una pequeña armería con lanzas y escudo. La ' +
        'única puerta de carga está al sur.',
    tags: ['interior', 'almacen', 'comercio', 'tienda', 'multisala', 'piso2', 'escaleras'],
    // Misma imagen base que almacen-piso1 (1408x768, ratio real 11/6=1.8333),
    // mismo mismatch (+3.98%) y misma corrección: rows 32->33, cols sin tocar,
    // rowStart/rowEnd reescalados por ×33/32=1.03125. Verificado con overlay:
    // la oficina del encargado (escritorio, ventanal enrejado) y la armería
    // (lanzas, escudo, barriles) encajan perfectamente en su mitad este.
    rows: 33,
    cols: 61,
    imageUrl: '/maps/battleMap12-AlmacenPiso2.png',
    zones: [
      { name: 'Almacén Oeste', cells: [{ rowStart: 0, rowEnd: 32, colStart: 0, colEnd: 25 }] },
      { name: 'Hueco de la Escalera', cells: [{ rowStart: 3, rowEnd: 29, colStart: 26, colEnd: 44 }] },
      { name: 'Oficina del Encargado', cells: [{ rowStart: 0, rowEnd: 15, colStart: 45, colEnd: 60 }] },
      { name: 'Armería', cells: [{ rowStart: 16, rowEnd: 32, colStart: 45, colEnd: 60 }] },
      { name: 'Entrada', cells: [{ rowStart: 29, rowEnd: 32, colStart: 26, colEnd: 34 }] },
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
    // Verificado a pixel: imagen real 729x1456, ratio negligible (-0.14%) --
    // SIN CAMBIOS. Overlay confirma buen encaje: estantería alta (Estantería
    // Oeste), pasillo de barriles/cajas central, escritorio con documentos
    // (Rincón del Encargado), lanzas colgadas (Armería de Reserva), puerta
    // (Entrada).
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
    // Verificado a pixel: imagen real 720x1438, ratio negligible (-0.14%) --
    // SIN CAMBIOS. Overlay confirma los dos pasillos de estanterías (oeste y
    // este) y la puerta de carga al sur.
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
    // Recalibrado a pixel: imagen real 720x1438, ratio declarada 11/21=0.5238
    // vs objetivo 0.5007 (+4.62%, mismatch real -- esta es la única cabaña de
    // esta familia de imágenes con un rows distinto: las otras tres
    // (almacen-mercancias, almacen-suministros, cabana-bosque-pequena) ya
    // usaban rows=22/cols=11, que es exactamente el tamaño real de esta
    // familia de assets). Cambiado rows 21->22 (cambio nominal mínimo, y
    // además alinea esta imagen con el resto de la familia) y reescaladas
    // todas las rowStart/rowEnd por ×22/21≈1.0476. Verificado con overlay:
    // dormitorios con camas (Norte), estantería de cocina (Oeste), mesa larga
    // con chimenea (Comedor Central), alcobas (Ala Este), cofre de
    // almacenaje (Almacenaje Sur), entrada porticada (Entrada Sur).
    rows: 22,
    cols: 11,
    imageUrl: '/maps/battleMap15-cabañaBosqueGrande.png',
    zones: [
      { name: 'Dormitorios Norte', cells: [{ rowStart: 0, rowEnd: 6, colStart: 3, colEnd: 10 }] },
      { name: 'Cocina y Despensa Oeste', cells: [{ rowStart: 3, rowEnd: 15, colStart: 0, colEnd: 2 }] },
      { name: 'Comedor Central', cells: [{ rowStart: 6, rowEnd: 12, colStart: 3, colEnd: 7 }] },
      { name: 'Ala Este (Alcobas)', cells: [{ rowStart: 6, rowEnd: 19, colStart: 8, colEnd: 10 }] },
      { name: 'Almacenaje Sur', cells: [{ rowStart: 15, rowEnd: 20, colStart: 3, colEnd: 7 }] },
      { name: 'Entrada Sur', cells: [{ rowStart: 20, rowEnd: 21, colStart: 3, colEnd: 7 }] },
    ],
  },
  {
    _id: 'cabana-bosque-pequena',
    name: 'Cabaña pequeña del bosque',
    description: 'Vista aérea de una pequeña cabaña de troncos aislada en un claro nevado del bosque, rodeada ' +
        'de árboles y rocas. Por dentro es una única estancia: cocina y mesa junto a la puerta al oeste, dos ' +
        'camas y una chimenea central al este. Una pequeña entrada porticada da acceso por el sur.',
    tags: ['exterior', 'interior', 'cabana', 'bosque'],
    // Verificado a pixel: imagen real 720x1438, ratio negligible (-0.14%) --
    // SIN CAMBIOS. Overlay confirma el interior de la cabaña (cocina y
    // dormitorio) rodeado por el bosque en las cuatro direcciones y el porche
    // sur junto a la entrada.
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
  {
    _id: 'sotanoTaberna',
    name: 'Sótano de la Taberna',
    description: 'Sótano de almacenaje de la taberna, conectado a la sala principal (mapId tabernaMercenarios) ' +
        'por una escalera de caracol que sube a la cocina: dos almacenes separados por un muro de piedra y ' +
        'madera, llenos de barriles, cajas y sacos de provisiones. En el segundo almacén hay una vieja escalera ' +
        'de madera desmontable junto a una trampilla candada que lleva a un nivel inferior aún sin explorar.',
    tags: ['interior', 'taberna', 'sotano', 'almacen', 'multisala', 'escaleras'],
    // Calibrado a pixel: imagen real 847x1264, ratio 0.6701, prácticamente
    // idéntica a cripta-multisala (0.6709) -- mismo rows=30/cols=20 (precedente
    // ya probado). Esta imagen trae los nombres de sala en español dibujados
    // encima ("Escaleras hacia la cocina de la taberna", "Almacén del Sótano 1",
    // "Almacén del Sótano 2", "Muro de piedra y madera"); verificado con
    // overlay sobre la imagen real que las 3 zonas de abajo encajan con cada
    // sala. La "Escalera de madera de quitar y poner" y la "Trampilla al nivel
    // inferior" son solo props narrativos dentro de Almacén del Sótano 2 (un
    // gancho para una futura planta inferior) -- no llevan zona propia porque
    // no existe todavía ningún mapId para ese nivel.
    rows: 30,
    cols: 20,
    imageUrl: '/maps/battleMap17-sotanoTaberna.png',
    zones: [
      { name: 'Escaleras a la Cocina', cells: [{ rowStart: 2, rowEnd: 13, colStart: 0, colEnd: 8 }] },
      { name: 'Almacén del Sótano 1', cells: [{ rowStart: 2, rowEnd: 13, colStart: 8, colEnd: 20 }] },
      { name: 'Almacén del Sótano 2', cells: [{ rowStart: 14, rowEnd: 27, colStart: 6, colEnd: 20 }] },
    ],
  },
  {
    _id: 'molino-piso1',
    name: 'Molino (planta baja)',
    description: 'Planta baja de un molino, conectada a la planta intermedia (mapId molino-piso2) por una ' +
        'escalera de caracol: un vestíbulo de entrada curvo, la sala de molienda central con el gran engranaje, ' +
        'almacenes de grano al este, un taller de carpintería y una cocina-comedor, y el dormitorio de los ' +
        'molineros al oeste.',
    tags: ['interior', 'molino', 'multisala', 'piso1', 'escaleras'],
    // Calibrado a pixel: imagen real 847x1264, ratio 0.6701 -- mismo rows=30/
    // cols=20 que sotanoTaberna y cripta-multisala. Edificio ovalado (torre de
    // molino), no rectangular, con los nombres de sala en español dibujados
    // encima ("Escaleras hacia el nivel superior", "Sala de Molienda Central",
    // "Almacén de Grano 1/2" -- una única zona de almacenaje partida en dos
    // etiquetas por el propio dibujo, sin muro real entre ambas mitades --,
    // "Taller de Carpintería", "Cocina-Comedor", "Dormitorio de los
    // Molineros", "Vestíbulo de Entrada"). Verificado con overlay sobre la
    // imagen real: buen encaje en las 7 zonas de abajo.
    rows: 30,
    cols: 20,
    imageUrl: '/maps/battleMap18-MolinoPiso1.png',
    zones: [
      { name: 'Escaleras Hacia el Nivel Superior', cells: [{ rowStart: 4, rowEnd: 16, colStart: 1, colEnd: 7 }] },
      { name: 'Sala de Molienda Central', cells: [{ rowStart: 4, rowEnd: 16, colStart: 7, colEnd: 14 }] },
      { name: 'Almacenes de Grano', cells: [{ rowStart: 4, rowEnd: 16, colStart: 14, colEnd: 20 }] },
      { name: 'Dormitorio de los Molineros', cells: [{ rowStart: 16, rowEnd: 24, colStart: 0, colEnd: 8 }] },
      { name: 'Taller de Carpintería', cells: [{ rowStart: 16, rowEnd: 20, colStart: 8, colEnd: 20 }] },
      { name: 'Cocina-Comedor', cells: [{ rowStart: 20, rowEnd: 24, colStart: 8, colEnd: 20 }] },
      { name: 'Vestíbulo de Entrada', cells: [{ rowStart: 24, rowEnd: 29, colStart: 2, colEnd: 18 }] },
    ],
  },
  {
    _id: 'molino-piso2',
    name: 'Molino (planta intermedia)',
    description: 'Planta intermedia de un molino, conectada por la misma escalera de caracol a la planta baja ' +
        '(mapId molino-piso1) y a la planta superior (mapId molino-piso3): una zona de carga con polea que da ' +
        'al exterior, almacenes de grano, un salón de clasificación, la oficina del capataz y un almacén de ' +
        'herramientas y repuestos.',
    tags: ['interior', 'molino', 'multisala', 'piso2', 'escaleras'],
    // Misma imagen base que molino-piso1 (847x1263, ratio 0.6706 -- negligible
    // vs 0.6701) -- mismo rows=30/cols=20. Verificado con overlay sobre la
    // imagen real: buen encaje en las 6 zonas de abajo (misma disposición
    // general que molino-piso1, con la zona de carga con polea sustituyendo a
    // la sala de molienda del piso de abajo).
    rows: 30,
    cols: 20,
    imageUrl: '/maps/battleMap18-MolinoPiso2.png',
    zones: [
      { name: 'Subida desde la Planta Inferior', cells: [{ rowStart: 4, rowEnd: 16, colStart: 1, colEnd: 7 }] },
      { name: 'Zona de Carga con Polea', cells: [{ rowStart: 4, rowEnd: 8, colStart: 7, colEnd: 20 }] },
      { name: 'Almacenes de Grano', cells: [{ rowStart: 8, rowEnd: 16, colStart: 7, colEnd: 20 }] },
      { name: 'Salón de Clasificación', cells: [{ rowStart: 16, rowEnd: 20, colStart: 8, colEnd: 20 }] },
      { name: 'Oficina del Capataz', cells: [{ rowStart: 16, rowEnd: 24, colStart: 0, colEnd: 8 }] },
      { name: 'Almacén de Herramientas y Repuestos', cells: [{ rowStart: 20, rowEnd: 27, colStart: 8, colEnd: 20 }] },
    ],
  },
  {
    _id: 'molino-piso3',
    name: 'Molino (planta superior)',
    description: 'Planta superior de un molino, conectada por la misma escalera de caracol a la planta ' +
        'intermedia (mapId molino-piso2): la zona del eje principal y el mecanismo del eje vertical con las ' +
        'grandes ruedas dentadas que mueven las aspas, un almacén de sacos y herramientas de ajuste, y el ' +
        'pequeño despacho del molinero.',
    tags: ['interior', 'molino', 'multisala', 'piso3', 'escaleras'],
    // Misma imagen base que molino-piso1/piso2 (847x1264, ratio 0.6701) --
    // mismo rows=30/cols=20. Esta es la planta de la maquinaria (ejes y
    // engranajes que mueven las aspas del molino), sin escalera hacia una
    // planta superior (es la última planta del edificio). Verificado con
    // overlay sobre la imagen real: buen encaje en las 5 zonas de abajo.
    rows: 30,
    cols: 20,
    imageUrl: '/maps/battleMap18-MolinoPiso3.png',
    zones: [
      { name: 'Subida desde la Planta Inferior', cells: [{ rowStart: 4, rowEnd: 16, colStart: 1, colEnd: 7 }] },
      { name: 'Zona del Eje Principal', cells: [{ rowStart: 4, rowEnd: 16, colStart: 7, colEnd: 14 }] },
      { name: 'Eje Vertical del Molino', cells: [{ rowStart: 4, rowEnd: 16, colStart: 14, colEnd: 20 }] },
      { name: 'Almacén de Sacos y Herramientas', cells: [{ rowStart: 16, rowEnd: 24, colStart: 0, colEnd: 8 }] },
      { name: 'Pequeño Despacho del Molinero', cells: [{ rowStart: 16, rowEnd: 27, colStart: 8, colEnd: 20 }] },
    ],
  },
  {
    _id: 'pantano-rey',
    name: 'Guarida del Rey del Pantano (planta completa)',
    description: 'Complejo de cuevas y ruinas anegadas en un pantano: dos vestíbulos de entrada (norte y sur), ' +
        'un pasillo de raíces, una zona de cría de monstruos, el antiguo templo sumergido, una cloaca de ' +
        'desagüe, la sala del tesoro oculta, el bosque de árboles muertos, un nido de harpías, la prisión de ' +
        'pantano, un laboratorio de alquimia de barro, la guarida de la bestia, un pasaje secreto y la sala del ' +
        'trono del Rey del Pantano.',
    tags: ['exterior', 'interior', 'pantano', 'mazmorra', 'multisala', 'cueva', 'ciénaga', 'cienaga', 'juncos'],
    // Calibrado a pixel: imagen real 847x1264, ratio 0.6701 -- mismo rows=30/
    // cols=20 que sotanoTaberna/molino (mismo precedente que cripta-multisala).
    // Esta imagen trae los nombres y NÚMEROS de sala en español dibujados
    // encima (1 a 13, más "Pasaje Secreto" sin número) -- verificado con
    // overlay sobre la imagen real que las 14 zonas de abajo encajan con cada
    // sala numerada. El número "1" (Vestíbulo de Entrada) aparece dos veces en
    // la imagen (norte y sur, dos accesos distintos al mismo complejo) -- de
    // ahí que existan dos zonas distintas "Vestíbulo de Entrada Norte" y
    // "Vestíbulo de Entrada Sur" con ese mismo nombre base para no romper la
    // unicidad de nombres de zona que exige place_participant.
    rows: 30,
    cols: 20,
    imageUrl: '/maps/battleMap19-Pantano.png',
    zones: [
      { name: 'Vestíbulo de Entrada Norte', cells: [{ rowStart: 2, rowEnd: 8, colStart: 0, colEnd: 7 }] },
      { name: 'Pasillo de las Raíces', cells: [{ rowStart: 2, rowEnd: 9, colStart: 7, colEnd: 13 }] },
      { name: 'Zona de Cría de Monstruos', cells: [{ rowStart: 2, rowEnd: 9, colStart: 13, colEnd: 20 }] },
      { name: 'Antiguo Templo Sumergido', cells: [{ rowStart: 9, rowEnd: 14, colStart: 0, colEnd: 7 }] },
      { name: 'Cloaca de Desagüe', cells: [{ rowStart: 8, rowEnd: 13, colStart: 9, colEnd: 13 }] },
      { name: 'Sala del Tesoro Oculta', cells: [{ rowStart: 9, rowEnd: 13, colStart: 13, colEnd: 20 }] },
      { name: 'Bosque de Árboles Muertos', cells: [{ rowStart: 14, rowEnd: 17, colStart: 0, colEnd: 7 }] },
      { name: 'Nido de Harpías', cells: [{ rowStart: 12, rowEnd: 16, colStart: 11, colEnd: 17 }] },
      { name: 'Prisión de Pantano', cells: [{ rowStart: 13, rowEnd: 17, colStart: 17, colEnd: 20 }] },
      { name: 'Laboratorio de Alquimia de Barro', cells: [{ rowStart: 16, rowEnd: 20, colStart: 9, colEnd: 20 }] },
      { name: 'Guarda de la Bestia', cells: [{ rowStart: 17, rowEnd: 19, colStart: 0, colEnd: 5 }] },
      { name: 'Sala del Trono del Rey del Pantano', cells: [{ rowStart: 19, rowEnd: 23, colStart: 0, colEnd: 11 }] },
      { name: 'Pasaje Secreto', cells: [{ rowStart: 20, rowEnd: 23, colStart: 12, colEnd: 18 }] },
      { name: 'Vestíbulo de Entrada Sur', cells: [{ rowStart: 24, rowEnd: 29, colStart: 3, colEnd: 17 }] },
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
