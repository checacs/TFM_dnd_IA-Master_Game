import { Equipment, EquipmentProps } from '../../../../domain/entities/equipment.entity';

export type EquipmentDocumentShape = EquipmentProps & { _id: string };

export const EquipmentMapper = {
  toPersistence(equipment: Equipment): EquipmentDocumentShape {
    return { _id: equipment.id, ...equipment.toSnapshot() };
  },

  toDomain(doc: EquipmentDocumentShape): Equipment {
    const { _id, ...props } = doc;
    return Equipment.create(props, _id);
  },
};
