// Tipado de rutas de React Navigation — con esto TS avisa si se navega a una
// pantalla pasando params equivocados (ej. GameDetail sin gameId).
export type RootStackParamList = {
  Login: undefined;
  GameList: undefined;
  // gameName es opcional: al unirse por código (GameListScreen) todavía no
  // conocemos el nombre de la partida, solo el gameId pegado por el usuario;
  // GameDetailScreen cae a game?.name en cuanto responde GET /games/:id.
  GameDetail: { gameId: string; gameName?: string };
  CharacterSheet: { characterId: string; gameId: string };
};
