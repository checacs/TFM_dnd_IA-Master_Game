import 'dotenv/config';
import mongoose from 'mongoose';
import { magicItemMongooseSchema } from '../src/infrastructure/persistence/mongoose/schemas/magic-item.schema';
import { mapMagicItem, Dnd5eApiMagicItem } from '../src/infrastructure/dnd5eapi/magic-item-mapper';

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

async function importMagicItems() {
  const uri = process.env.URL;
  if (!uri) {
    throw new Error('Falta la variable de entorno MONGODB_URI (revisa tu .env)');
  }

  await mongoose.connect(uri);
  const MagicItemModel = mongoose.model('MagicItem', magicItemMongooseSchema);

  const list = await fetchJson<List>('/magic-items');
  console.log(`dnd5eapi.co devuelve ${list.count} objetos mágicos. Importando...`);

  let imported = 0;
  for (const item of list.results) {
    const detail = await fetchJson<Dnd5eApiMagicItem>(`/magic-items/${item.index}`);
    const doc = mapMagicItem(detail);

    await MagicItemModel.findByIdAndUpdate(doc._id, doc, { upsert: true, returnDocument: 'after' });
    imported += 1;
    console.log(`  ✓ (${imported}/${list.count}) ${doc.name}`);
  }

  await mongoose.disconnect();
  console.log(`Importación completa: ${imported} objetos mágicos en el catálogo.`);
}

importMagicItems().catch((err) => {
  console.error(err);
  process.exit(1);
});
