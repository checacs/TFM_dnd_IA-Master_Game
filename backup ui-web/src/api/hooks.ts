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
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === 'configuracion') return 3000;
      return false;
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
