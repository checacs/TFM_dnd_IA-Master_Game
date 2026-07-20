import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  FlatList,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMyGames } from '../api/hooks';
import { useAuth } from '../auth/useAuth';
import { colors, radius } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';
import type { MyGameSummary } from '../types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'GameList'>;

export function GameListScreen({ navigation }: Props) {
  const { data: games, isLoading, error } = useMyGames();
  const auth = useAuth();
  const [joinCode, setJoinCode] = useState('');

  // "Unirme con código": para un jugador remoto que aún no pertenece a esta
  // partida (por eso no aparece en useMyGames/GET /games, que solo devuelve
  // partidas donde el usuario ya es host o jugador). El host comparte el
  // gameId por fuera (WhatsApp, etc., ver LobbyScreen de ui-web) y aquí basta
  // con pegarlo y navegar directo — GameDetailScreen ya sabe pedir GET
  // /games/:id para cualquier partida exista o no el usuario en ella todavía.
  const handleJoinByCode = () => {
    const trimmed = joinCode.trim();
    if (!trimmed) return;
    navigation.navigate('GameDetail', { gameId: trimmed });
    setJoinCode('');
  };

  const renderItem = ({ item }: { item: MyGameSummary }) => (
    <Pressable
      style={styles.card}
      onPress={() => navigation.navigate('GameDetail', { gameId: item.id, gameName: item.name })}
    >
      <Text style={styles.cardTitle}>{item.name}</Text>
      <Text style={styles.cardMeta}>
        {item.players}/{item.maxPlayers} jugadores · {item.status}
      </Text>
    </Pressable>
  );

  return (
    <ImageBackground
      source={require('../../assets/fondo_aventura.jpg')}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.title}>Tus partidas</Text>
          <Pressable onPress={auth.logout}>
            <Text style={styles.logout}>Salir</Text>
          </Pressable>
        </View>

        <View style={styles.joinByCodeBox}>
          <Text style={styles.joinByCodeLabel}>¿Tienes un código de partida?</Text>
          <View style={styles.joinByCodeRow}>
            <TextInput
              style={styles.joinByCodeInput}
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder="Pega el código aquí"
              placeholderTextColor={colors.inkSoft}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.joinByCodeButton, !joinCode.trim() && styles.buttonDisabled]}
              disabled={!joinCode.trim()}
              onPress={handleJoinByCode}
            >
              <Text style={styles.joinByCodeButtonText}>Ir</Text>
            </Pressable>
          </View>
        </View>

        {isLoading && <ActivityIndicator color={colors.ink} style={{ marginTop: 24 }} />}
        {error && <Text style={styles.error}>{error.message}</Text>}

        {games && games.length === 0 && !isLoading && (
          <Text style={styles.empty}>Aún no perteneces a ninguna partida.</Text>
        )}

        <FlatList
          data={games ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
  },
  logout: {
    color: colors.ink,
    fontWeight: '600',
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,250,235,0.85)',
    overflow: 'hidden',
  },
  list: {
    gap: 12,
    paddingBottom: 32,
  },
  joinByCodeBox: {
    flexDirection: 'column',
    alignItems: 'stretch',
    backgroundColor: 'rgba(237, 225, 196, 0.85)',
    borderWidth: 1.5,
    borderColor: colors.inkSoft,
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 16,
  },
  joinByCodeLabel: {
    width: '100%',
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 8,
  },
  joinByCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 8,
  },
  joinByCodeInput: {
    // flexGrow/flexShrink/flexBasis en vez de flex:1: en react-native-web un
    // <input> tiene un min-width implícito que le impide encogerse aunque
    // tenga flex:1, y el botón de al lado (Pressable) puede acabar
    // absorbiendo él solo todo el espacio sobrante — minWidth: 0 es lo que
    // le permite encogerse de verdad dentro de la fila.
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    borderWidth: 1.5,
    borderColor: colors.inkSoft,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.ink,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  joinByCodeButton: {
    // flexGrow/flexShrink: 0 explícitos — en web, Pressable puede heredar un
    // flexGrow por defecto y "comerse" el espacio sobrante de la fila si no
    // se le dice lo contrario (de ahí el botón gigante).
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'center',
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  joinByCodeButtonText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  buttonDisabled: { opacity: 0.4 },
  card: {
    backgroundColor: 'rgba(237, 225, 196, 0.9)',
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  cardMeta: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 4,
  },
  empty: {
    color: colors.ink,
    textAlign: 'center',
    marginTop: 32,
  },
  error: {
    color: colors.danger,
    textAlign: 'center',
    marginTop: 16,
  },
});
