import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  LoginInput,
  LoginResult,
  CreateGameInput,
  CreateGameResult,
  JoinGameInput,
  JoinGameResult,
  PlayerAttackInput,
  PlayerAttackResult,
  SendMessageInput,
  DmEngineResult,
  CastSpellInput,
  LevelUpInput,
  CharacterSnapshot,
  GameSnapshot,
  MyGameSummary,
} from '../types/api';

export function useMyGames() {
  return useQuery<MyGameSummary[], Error>({
    queryKey: ['myGames'],
    queryFn: () => api.get<MyGameSummary[]>('/games'),
    refetchInterval: 5000,
  });
}

export function useLogin() {
  return useMutation<LoginResult, Error, LoginInput>({
    mutationFn: (input) => api.post<LoginResult>('/auth/login', input),
  });
}

export function useCreateGame() {
  return useMutation<CreateGameResult, Error, CreateGameInput>({
    mutationFn: (input) => api.post<CreateGameResult>('/games', input),
  });
}

export function useGame(gameId: string | undefined) {
  return useQuery<GameSnapshot, Error>({
    queryKey: ['game', gameId],
    queryFn: () => api.get<GameSnapshot>(`/games/${gameId}`),
    enabled: !!gameId,
    // ui-web ya no es quien dispara las acciones de la partida en curso (eso
    // ahora lo hace el móvil vía claim-turn/player-action/player-roll) — sin
    // seguir sondeando durante 'en_curso', la pantalla de solo lectura se
    // quedaría congelada en el primer estado que vio y nunca reflejaría la
    // narración ni el combate que está pasando desde otros dispositivos.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'finalizada') return false;
      return 3000;
    },
  });
}

export function useJoinGame(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation<JoinGameResult, Error, JoinGameInput>({
    mutationFn: (input) => api.post<JoinGameResult>(`/games/${gameId}/join`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
    },
  });
}

export function useLaunchGame(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => api.post<void>(`/games/${gameId}/launch`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
    },
  });
}

export function useAssignCaptain(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { targetUserId: string }>({
    mutationFn: (input) => api.post<void>(`/games/${gameId}/assign-captain`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
    },
  });
}

export function usePlayerAttack(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation<PlayerAttackResult, Error, PlayerAttackInput>({
    mutationFn: (input) => api.post<PlayerAttackResult>(`/games/${gameId}/player-attack`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
      // resolve-player-attack puede acabar en grant_xp, que solo vive en Character
      // (nivel/XP) — sin esto la hoja de personaje se queda con el XP viejo.
      queryClient.invalidateQueries({ queryKey: ['character'] });
    },
  });
}

export function useSendMessage(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation<DmEngineResult, Error, SendMessageInput>({
    mutationFn: (input) => api.post<DmEngineResult>(`/games/${gameId}/message`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
      // El turno del DM-IA puede llamar a grant_xp (sube nivel/XP en Character,
      // no en Game) — invalidamos también su query para que se refleje en la hoja.
      queryClient.invalidateQueries({ queryKey: ['character'] });
    },
  });
}

export function useCastSpell(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, CastSpellInput>({
    mutationFn: (input) => api.post<unknown>(`/games/${gameId}/cast-spell`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
      queryClient.invalidateQueries({ queryKey: ['character'] });
    },
  });
}

/** Botón "Escuchar" en cada mensaje del DM (ChatPanel) — pide a Amazon Polly (backend) que convierta texto a voz; devuelve el mp3 en base64. */
export function useSynthesizeSpeech() {
  return useMutation<{ audioBase64: string }, Error, { text: string }>({
    mutationFn: (input) => api.post<{ audioBase64: string }>('/tts/speak', input),
  });
}

export function useCharacter(characterId: string | undefined) {
  return useQuery<CharacterSnapshot, Error>({
    queryKey: ['character', characterId],
    queryFn: () => api.get<CharacterSnapshot>(`/characters/${characterId}`),
    enabled: !!characterId,
  });
}

export function useLevelUp(characterId: string) {
  const queryClient = useQueryClient();
  return useMutation<CharacterSnapshot, Error, LevelUpInput>({
    mutationFn: (input) => api.post<CharacterSnapshot>(`/characters/${characterId}/assign-skill-point`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character', characterId] });
    },
  });
}
