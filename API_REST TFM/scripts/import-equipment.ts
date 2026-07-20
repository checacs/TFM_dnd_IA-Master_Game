import 'dotenv/config';
import mongoose from 'mongoose';
import { equipmentMongooseSchema } from '../src/infrastructure/persistence/mongoose/schemas/equipment.schema';
import { mapEquipment, Dnd5eApiEquipment } from '../src/infrastructure/dnd5eapi/equipment-mapper';

const API_BASE = 'https://www.dnd5eapi.co/api/2014';

interface ListItem {
  index: string;
  name: string;
  url: string;
}
interface List {
  count: number;
  results: ListItem[];
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`dnd5eapi.co respondió ${response.status} al pedir ${path}`);
  }
  return response.json() as Promise<T>;
}

async function importEquipment() {
  const uri = process.env.URL;
  if (!uri) {
    throw new Error('Falta la variable de entorno MONGODB_URI (revisa tu .env)');
  }

  await mongoose.connect(uri);
  const EquipmentModel = mongoose.model('Equipment', equipmentMongooseSchema);

  const list = await fetchJson<List>('/equipment');
  console.log(`dnd5eapi.co devuelve ${list.count} objetos de equipo. Importando...`);

  let imported = 0;
  for (const item of list.results) {
    const detail = await fetchJson<Dnd5eApiEquipment>(`/equipment/${item.index}`);
    const doc = mapEquipment(detail);

    await EquipmentModel.findByIdAndUpdate(doc._id, doc, { upsert: true, returnDocument: 'after' });
    imported += 1;
    console.log(`  ✓ (${imported}/${list.count}) ${doc.name}`);
  }

  await mongoose.disconnect();
  console.log(`Importación completa: ${imported} objetos de equipo en el catálogo.`);
}

importEquipment().catch((err) => {
  console.error(err);
  process.exit(1);
});
