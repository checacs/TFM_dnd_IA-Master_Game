import { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useGame, useJoinGame, useLaunchGame } from '../api/hooks';
import { useAuth } from '../auth/useAuth';
import { decodeUserId } from '../auth/jwt';
import { colors, radius } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';
import type { CharacterClass } from '../types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'GameDetail'>;

const CLASSES: CharacterClass[] = ['guerrero', 'picaro', 'mago', 'clerigo'];

/**
 * Sala de espera de una partida: muestra los huecos de jugador ocupados/libres,
 * deja unirse creando un personaje (nombre + clase, igual que LobbyScreen de
 * ui-web — no hay "elegir entre personajes existentes", unirse a una partida
 * ES crear el personaje para ella) y, si el usuario es el host, el botón para
 * lanzar la partida. En cuanto el estado pasa a "en_curso" navega sola a la
 * ficha de personaje (única pantalla que ve el jugador durante la partida).
 *
 * gameName puede venir sin definir (se llegó aquí pegando un código de
 * partida desde GameListScreen, no desde la lista de "mis partidas") — en
 * ese caso se usa game.name en cuanto responde GET /games/:id.
 */
export function GameDetailScreen({ route, navigation }: Props) {
  const { gameId, gameName } = route.params;
  const { data: game, isLoading, error } = useGame(gameId);
  const joinGame = useJoinGame(gameId);
  const launchGame = useLaunchGame(gameId);
  const { token } = useAuth();
  const userId = decodeUserId(token);

  const [charName, setCharName] = useState('');
  const [charClass, setCharClass] = useState<CharacterClass>('guerrero');
  const [showJoinForm, setShowJoinForm] = useState(false);

  const myPlayer = game?.players.find((p) => p.userId === userId);
  const isHost = !!userId && userId === game?.hostUserId;

  useEffect(() => {
    if (game?.status === 'en_curso' && myPlayer) {
      navigation.replace('CharacterSheet', { characterId: myPlayer.characterId, gameId });
    }
  }, [game?.status, myPlayer, navigation, gameId]);

  if (isLoading) {
    return (
      <ImageBackground source={require('../../assets/fondo_aventura.jpg')} style={styles.background}>
        <View style={styles.centerFull}>
          <ActivityIndicator color={colors.ink} size="large" />
        </View>
      </ImageBackground>
    );
  }

  if (error || !game) {
    return (
      <ImageBackground source={require('../../assets/fondo_aventura.jpg')} style={styles.background}>
        <View style={styles.centerFull}>
          <Text style={styles.error}>{error?.message ?? 'Partida no encontrada'}</Text>
        </View>
      </ImageBackground>
    );
  }

  const handleJoin = () => {
    if (!charName) return;
    joinGame.mutate(
      { characterName: charName, characterClass: charClass },
      { onSuccess: () => setShowJoinForm(false) },
    );
  };

  return (
    <ImageBackground
      source={require('../../assets/fondo_aventura.jpg')}
      style={styles.background}
      resizeMode="cover"
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.title}>{gameName ?? game.name}</Text>
          <Text style={styles.codeText}>Código de partida: {gameId}</Text>
          <Text style={styles.subtitle}>
            Sala de espera — {game.players.length}/{game.maxPlayers} jugadores
          </Text>

          <View style={styles.slotList}>
            {Array.from({ length: game.maxPlayers }).map((_, i) => {
              const player = game.players[i];
              return (
                <View key={i} style={styles.slot}>
                  {player ? (
                    <>
                      <Text style={styles.slotName}>{player.name}</Text>
                      <Text style={styles.slotClass}>{player.class}</Text>
                    </>
                  ) : (
                    <Text style={styles.slotEmpty}>Esperando jugador...</Text>
                  )}
                </View>
              );
            })}
          </View>

          {userId && !myPlayer && !showJoinForm && (
            <Pressable style={styles.button} onPress={() => setShowJoinForm(true)}>
              <Text style={styles.buttonText}>Unirse como jugador</Text>
            </Pressable>
          )}

          {showJoinForm && (
            <View style={styles.joinForm}>
              <Text style={styles.label}>Nombre del personaje</Text>
              <TextInput
                style={styles.input}
                value={charName}
                onChangeText={setCharName}
                placeholder="Aragorn..."
                placeholderTextColor={colors.inkSoft}
                autoFocus
              />

              <Text style={styles.label}>Clase</Text>
              <View style={styles.classRow}>
                {CLASSES.map((c) => (
                  <Pressable
                    key={c}
                    style={[styles.classOption, charClass === c && styles.classOptionSelected]}
                    onPress={() => setCharClass(c)}
                  >
                    <Text style={[styles.classOptionText, charClass === c && styles.classOptionTextSelected]}>
                      {c}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                style={[styles.button, (!charName || joinGame.isPending) && styles.buttonDisabled]}
                onPress={handleJoin}
                disabled={!charName || joinGame.isPending}
              >
                <Text style={styles.buttonText}>{joinGame.isPending ? 'Uniendo...' : 'Unirse'}</Text>
              </Pressable>
              <Pressable style={styles.linkButton} onPress={() => setShowJoinForm(false)}>
                <Text style={styles.linkButtonText}>Cancelar</Text>
              </Pressable>
              {joinGame.error && <Text style={styles.error}>{joinGame.error.message}</Text>}
            </View>
          )}

          {isHost && (
            <Pressable
              style={[
                styles.button,
                styles.launchButton,
                (game.players.length < 1 || launchGame.isPending) && styles.buttonDisabled,
              ]}
              onPress={() => launchGame.mutate()}
              disabled={game.players.length < 1 || launchGame.isPending}
            >
              <Text style={styles.buttonText}>{launchGame.isPending ? 'Iniciando...' : 'Iniciar partida'}</Text>
            </Pressable>
          )}

          {launchGame.error && <Text style={styles.error}>{launchGame.error.message}</Text>}
        </View>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  centerFull: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(237, 225, 196, 0.92)',
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.ink,
    padding: 24,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  codeText: { fontSize: 11, color: colors.inkSoft, textAlign: 'center', marginTop: 4 },
  subtitle: { fontSize: 13, color: colors.inkSoft, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  slotList: { gap: 8 },
  slot: {
    borderWidth: 1,
    borderColor: colors.inkSoft,
    borderRadius: radius.md,
    padding: 10,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  slotName: { fontWeight: '700', color: colors.ink },
  slotClass: { fontSize: 12, color: colors.inkSoft, textTransform: 'capitalize' },
  slotEmpty: { fontSize: 13, color: colors.inkSoft, fontStyle: 'italic' },
  button: {
    marginTop: 14,
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  launchButton: { backgroundColor: colors.success },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  linkButton: { marginTop: 8, alignItems: 'center' },
  linkButtonText: { color: colors.inkSoft, fontWeight: '600' },
  joinForm: { marginTop: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink, marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.inkSoft,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  classRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  classOption: {
    borderWidth: 1.5,
    borderColor: colors.inkSoft,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  classOptionSelected: { backgroundColor: colors.gold, borderColor: colors.ink },
  classOptionText: { color: colors.inkSoft, textTransform: 'capitalize', fontWeight: '600' },
  classOptionTextSelected: { color: colors.ink },
  error: { marginTop: 12, color: colors.danger, fontSize: 13, textAlign: 'center' },
});
