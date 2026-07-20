import 'dotenv/config';
import mongoose from 'mongoose';
import { spellMongooseSchema } from '../src/infrastructure/persistence/mongoose/schemas/spell.schema';
import { mapSpell, Dnd5eApiSpell } from '../src/infrastructure/dnd5eapi/spell-mapper';

const API_BASE = 'https://www.dnd5eapi.co/api/2014';

interface SpellListItem {
  index: string;
  name: string;
  url: string;
}
interface SpellList {
  count: number;
  results: SpellListItem[];
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`dnd5eapi.co respondió ${response.status} al pedir ${path}`);
  }
  return response.json() as Promise<T>;
}

async function importSpells() {
  const uri = process.env.URL;
  if (!uri) {
    throw new Error('Falta la variable de entorno MONGODB_URI (revisa tu .env)');
  }

  await mongoose.connect(uri);
  const SpellModel = mongoose.model('Spell', spellMongooseSchema);

  const list = await fetchJson<SpellList>('/spells');
  console.log(`dnd5eapi.co devuelve ${list.count} hechizos. Importando...`);

  let imported = 0;
  for (const item of list.results) {
    const detail = await fetchJson<Dnd5eApiSpell>(`/spells/${item.index}`);
    const spellDoc = mapSpell(detail);

    await SpellModel.findByIdAndUpdate(spellDoc._id, spellDoc, { upsert: true, returnDocument: 'after' });
    imported += 1;
    console.log(`  ✓ (${imported}/${list.count}) ${spellDoc.name}`);
  }

  await mongoose.disconnect();
  console.log(`Importación completa: ${imported} hechizos en el catálogo.`);
}

importSpells().catch((err) => {
  console.error(err);
  process.exit(1);
});
