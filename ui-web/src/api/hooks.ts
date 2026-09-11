import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  LoginInput,
  LoginResult,
  CreateGameInput,
  CreateGameResult,
  DmEngineResult,
  GameSnapshot,
  MyGameSummary,
  AdminUserSummary,
  CreateUserInput,
  CreateUserResult,
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

export function useDeleteGame() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (gameId) => api.delete<void>(`/games/${gameId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myGames'] });
    },
  });
}

/**
 * Arranque de la escena inicial de la partida (POST /games/:id/message). El
 * mensaje lo construye ya el servidor (StartOpeningSceneUseCase): el endpoint
 * dejó de aceptar un historial arbitrario del cliente.
 */
export function useStartOpeningScene(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation<DmEngineResult, Error, void>({
    mutationFn: () => api.post<DmEngineResult>(`/games/${gameId}/message`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
      // El turno del DM-IA puede llamar a grant_xp (sube nivel/XP en Character,
      // no en Game) — invalidamos también su query para que se refleje en la hoja.
      queryClient.invalidateQueries({ queryKey: ['character'] });
    },
  });
}

/** Botón "Escuchar" en cada mensaje del DM (ChatPanel) — pide al backend (Qwen-TTS) que convierta texto a voz; devuelve el audio en base64. */
export function useSynthesizeSpeech() {
  return useMutation<{ audioBase64: string }, Error, { text: string }>({
    mutationFn: (input) => api.post<{ audioBase64: string }>('/tts/speak', input),
  });
}

// --- Administración de usuarios (solo admin, ver UserAdminScreen) ---

export function useUsers() {
  return useQuery<AdminUserSummary[], Error>({
    queryKey: ['users'],
    queryFn: () => api.get<AdminUserSummary[]>('/auth/users'),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation<CreateUserResult, Error, CreateUserInput>({
    mutationFn: (input) => api.post<CreateUserResult>('/auth/users', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (userId) => api.delete<void>(`/auth/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useDeleteCharacterAdmin() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (characterId) => api.delete<void>(`/characters/${characterId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
