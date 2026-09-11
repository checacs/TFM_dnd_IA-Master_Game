// Mismos umbrales que API_REST TFM/src/domain/entities/character.entity.ts
// (LEVEL_XP_THRESHOLDS) — se duplican aquí solo para pintar la barra de
// progreso; el backend sigue siendo la única fuente de verdad de cuándo se
// sube de nivel (gainXp), esto no decide nada, solo repinta lo que ya pasó.
const LEVEL_XP_THRESHOLDS: Record<number, number> = { 2: 300, 3: 900, 4: 2700, 5: 6500 };
const MAX_LEVEL = 5;

export interface XpProgress {
  isMaxLevel: boolean;
  currentLevelBaseXp: number;
  nextLevelXp: number | null;
  progress: number; // 0..1
}

export function computeXpProgress(level: number, xp: number): XpProgress {
  if (level >= MAX_LEVEL) {
    return { isMaxLevel: true, currentLevelBaseXp: LEVEL_XP_THRESHOLDS[MAX_LEVEL] ?? 0, nextLevelXp: null, progress: 1 };
  }
  const currentLevelBaseXp = level > 1 ? LEVEL_XP_THRESHOLDS[level] : 0;
  const nextLevelXp = LEVEL_XP_THRESHOLDS[level + 1];
  const span = nextLevelXp - currentLevelBaseXp;
  const progress = span > 0 ? Math.min(1, Math.max(0, (xp - currentLevelBaseXp) / span)) : 0;
  return { isMaxLevel: false, currentLevelBaseXp, nextLevelXp, progress };
}
