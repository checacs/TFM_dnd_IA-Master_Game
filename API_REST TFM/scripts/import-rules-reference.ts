import 'dotenv/config';
import mongoose from 'mongoose';
import { rulesReferenceMongooseSchema } from '../src/infrastructure/persistence/mongoose/schemas/rules-reference.schema';
import { mapCondition, mapSkill, mapDamageType, mapAbilityScore, mapRuleSection, Dnd5eApiCondition, Dnd5eApiSkill, Dnd5eApiDamageType, Dnd5eApiAbilityScore, Dnd5eApiRuleSection } from '../src/infrastructure/dnd5eapi/rules-reference-mapper';

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

async function importRulesReference() {
  const uri = process.env.URL;
  if (!uri) {
    throw new Error('Falta la variable de entorno MONGODB_URI (revisa tu .env)');
  }

  await mongoose.connect(uri);
  const RulesReferenceModel = mongoose.model('RulesReference', rulesReferenceMongooseSchema);

  // Condiciones
  const conditions = await fetchJson<List>('/conditions');
  console.log(`Importando ${conditions.count} condiciones...`);
  for (const item of conditions.results) {
    const detail = await fetchJson<Dnd5eApiCondition>(`/conditions/${item.index}`);
    const doc = mapCondition(detail);
    await RulesReferenceModel.findByIdAndUpdate(doc._id, doc, { upsert: true, returnDocument: 'after' });
    console.log(`  ✓ [condition] ${doc.name}`);
  }

  // Habilidades
  const skills = await fetchJson<List>('/skills');
  console.log(`Importando ${skills.count} habilidades...`);
  for (const item of skills.results) {
    const detail = await fetchJson<Dnd5eApiSkill>(`/skills/${item.index}`);
    const doc = mapSkill(detail);
    await RulesReferenceModel.findByIdAndUpdate(doc._id, doc, { upsert: true, returnDocument: 'after' });
    console.log(`  ✓ [skill] ${doc.name}`);
  }

  // Tipos de daño
  const damageTypes = await fetchJson<List>('/damage-types');
  console.log(`Importando ${damageTypes.count} tipos de daño...`);
  for (const item of damageTypes.results) {
    const detail = await fetchJson<Dnd5eApiDamageType>(`/damage-types/${item.index}`);
    const doc = mapDamageType(detail);
    await RulesReferenceModel.findByIdAndUpdate(doc._id, doc, { upsert: true, returnDocument: 'after' });
    console.log(`  ✓ [damage-type] ${doc.name}`);
  }

  // Puntuaciones de característica
  const abilityScores = await fetchJson<List>('/ability-scores');
  console.log(`Importando ${abilityScores.count} puntuaciones de característica...`);
  for (const item of abilityScores.results) {
    const detail = await fetchJson<Dnd5eApiAbilityScore>(`/ability-scores/${item.index}`);
    const doc = mapAbilityScore(detail);
    await RulesReferenceModel.findByIdAndUpdate(doc._id, doc, { upsert: true, returnDocument: 'after' });
    console.log(`  ✓ [ability-score] ${doc.name}`);
  }

  // Secciones de reglas
  const ruleSections = await fetchJson<List>('/rule-sections');
  console.log(`Importando ${ruleSections.count} secciones de reglas...`);
  for (const item of ruleSections.results) {
    const detail = await fetchJson<Dnd5eApiRuleSection>(`/rule-sections/${item.index}`);
    const doc = mapRuleSection(detail);
    await RulesReferenceModel.findByIdAndUpdate(doc._id, doc, { upsert: true, returnDocument: 'after' });
    console.log(`  ✓ [rule-section] ${doc.name}`);
  }

  await mongoose.disconnect();
  console.log('Importación completa: condiciones, habilidades, tipos de daño, puntuaciones de característica y secciones de reglas.');
}

importRulesReference().catch((err) => {
  console.error(err);
  process.exit(1);
});
