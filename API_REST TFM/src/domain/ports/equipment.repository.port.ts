import { Equipment } from '../entities/equipment.entity';

export interface EquipmentSearchCriteria {
  category?: string;
}

export interface EquipmentRepository {
  findById(id: string): Promise<Equipment | null>;
  search(criteria: EquipmentSearchCriteria): Promise<Equipment[]>;
}

export const EQUIPMENT_REPOSITORY = Symbol('EquipmentRepository');
