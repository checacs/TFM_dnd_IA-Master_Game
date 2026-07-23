import { Injectable, Inject } from '@nestjs/common';
import { MapRepository, MAP_REPOSITORY } from '../../domain/ports/map.repository.port';
import { MapZone } from '../../domain/entities/battle-map.entity';
import { DomainError } from '../../domain/errors/domain-error';

export interface DescribeMapInput {
  mapId: string;
}

export interface DescribeMapResult {
  mapId: string;
  name: string;
  description: string;
  tags: string[];
  rows: number;
  cols: number;
  /**
   * Zonas catalogadas del mapa, con sus nombres EXACTOS y rangos de celdas.
   * Imprescindible para el DM-IA: sin esto (bug real de producción), el
   * modelo no tenía forma de saber ni los nombres reales de las salas ni sus
   * coordenadas, así que inventaba zoneNames aproximados sacados del texto de
   * la descripción ("bosque de árboles muertos") con celdas al azar (0, 15),
   * y place_participant se los rechazaba una y otra vez -- quemando
   * iteraciones de tools del turno hasta agotar el límite.
   */
  zones: MapZone[];
}

@Injectable()
export class DescribeMapUseCase {
  constructor(
    @Inject(MAP_REPOSITORY) private readonly maps: MapRepository,
  ) {}

  async execute(input: DescribeMapInput): Promise<DescribeMapResult> {
    const map = await this.maps.findById(input.mapId);
    if (!map) {
      throw new DomainError(`Mapa ${input.mapId} no encontrado en el catalogo`);
    }

    const snapshot = map.toSnapshot();

    return {
      mapId: input.mapId,
      name: snapshot.name,
      description: snapshot.description,
      tags: snapshot.tags,
      rows: snapshot.rows,
      cols: snapshot.cols,
      zones: snapshot.zones,
    };
  }
}
