import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  LoginInput,
  LoginResult,
  JoinGameInput,
  JoinGameResult,
  MyGameSummary,
  CharacterSnapshot,
  GameSnapshot,
  LevelUpInput,
  PlayerActionInput,
  PlayerActionResult,
  PlayerRollInput,
  PlayerRollResult,
} from '../types/api';

export function useLogin() {
  return useMutation<LoginResult, Error, LoginInput>({
    mutationFn: (input) => api.post<LoginResult>('/auth/login', input),
  });
}

export function useMyGames() {
  return useQuery<MyGameSummary[], Error>({
    queryKey: ['myGames'],
    queryFn: () => api.get<MyGameSummary[]>('/games'),
    refetchInterval: 5000,
  });
}

export function useGame(gameId: string | undefined) {
  return useQuery<GameSnapshot, Error>({
    queryKey: ['game', gameId],
    queryFn: () => api.get<GameSnapshot>(`/games/${gameId}`),
    enabled: !!gameId,
    // Antes solo se sondeaba en la sala de espera (configuracion) porque
    // toda acción en curso la disparaba este mismo cliente e invalidaba la
    // query a mano. Ahora "Mi turno"/la acción de otro jugador puede llegar
    // desde OTRO móvil, así que hay que seguir sondeando durante 'en_curso'
    // para ver roundPhase/turnClaims/narrativeLog cambiar en tiempo real.
    refetchInterval: (query) => (query.state.data?.status === 'finalizada' ? false : 3000),
  });
}

export function useJoinGame(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation<JoinGameResult, Error, JoinGameInput>({
    mutationFn: (input) => api.post<JoinGameResult>(`/games/${gameId}/join`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
      queryClient.invalidateQueries({ queryKey: ['myGames'] });
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

/** Botón "Mi turno" — reclama el candado de turno de la ronda de jugadores en curso. */
export function useClaimTurn(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { characterId: string }>({
    mutationFn: (input) => api.post<void>(`/games/${gameId}/claim-turn`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
    },
  });
}

/** Campo de texto de abajo — equivale a responder al chat del DM (ver SendPlayerActionUseCase). */
export function usePlayerAction(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation<PlayerActionResult, Error, PlayerActionInput>({
    mutationFn: (input) => api.post<PlayerActionResult>(`/games/${gameId}/player-action`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
      // El turno del DM-IA puede llamar a grant_xp (sube nivel/XP en Character).
      queryClient.invalidateQueries({ queryKey: ['character'] });
    },
  });
}

/** Botón "Tirar Dados" — se guarda en el narrativeLog de la partida (ver PlayerRollUseCase), por eso se invalida la query del juego igual que con player-action. */
export function usePlayerRoll(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation<PlayerRollResult, Error, PlayerRollInput>({
    mutationFn: (input) => api.post<PlayerRollResult>(`/games/${gameId}/player-roll`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
    },
  });
}

/** Botón "Cambiar capitán" en la ficha — puede llamarlo el host o el capitán actual (ver Game.assignCaptain). */
export function useAssignCaptain(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { targetUserId: string }>({
    mutationFn: (input) => api.post<void>(`/games/${gameId}/assign-captain`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
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
