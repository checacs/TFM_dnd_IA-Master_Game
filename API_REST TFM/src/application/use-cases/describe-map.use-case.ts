import { Injectable, Inject } from '@nestjs/common';
import { MapRepository, MAP_REPOSITORY } from '../../domain/ports/map.repository.port';
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
    };
  }
}
