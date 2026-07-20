import 'dotenv/config';
import mongoose from 'mongoose';
import { enemyMongooseSchema } from '../src/infrastructure/persistence/mongoose/schemas/enemy.schema';
import { mapMonster, Dnd5eApiMonster } from '../src/infrastructure/dnd5eapi/monster-mapper';

const API_BASE = 'https://www.dnd5eapi.co/api/2014';

interface MonsterListItem {
  index: string;
  name: string;
  url: string;
}
interface MonsterList {
  count: number;
  results: MonsterListItem[];
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`dnd5eapi.co respondió ${response.status} al pedir ${path}`);
  }
  return response.json() as Promise<T>;
}

async function importMonsters() {
  const uri = process.env.URL;
  if (!uri) {
    throw new Error('Falta la variable de entorno MONGODB_URI (revisa tu .env)');
  }

  await mongoose.connect(uri);
  const EnemyModel = mongoose.model('Enemy', enemyMongooseSchema);

  const list = await fetchJson<MonsterList>('/monsters');
  console.log(`dnd5eapi.co devuelve ${list.count} monstruos. Importando...`);

  let imported = 0;
  for (const item of list.results) {
    const detail = await fetchJson<Dnd5eApiMonster>(`/monsters/${item.index}`);
    const enemyDoc = mapMonster(detail);

    await EnemyModel.findByIdAndUpdate(enemyDoc._id, enemyDoc, { upsert: true, returnDocument: 'after' });
    imported += 1;
    console.log(`  ✓ (${imported}/${list.count}) ${enemyDoc.name}`);
  }

  await mongoose.disconnect();
  console.log(`Importación completa: ${imported} enemigos en el catálogo.`);
}

importMonsters().catch((err) => {
  console.error(err);
  process.exit(1);
});
