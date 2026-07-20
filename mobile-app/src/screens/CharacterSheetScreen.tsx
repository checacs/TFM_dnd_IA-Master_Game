import { useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useCharacter,
  useGame,
  useClaimTurn,
  usePlayerAction,
  usePlayerRoll,
  useLevelUp,
  useAssignCaptain,
} from '../api/hooks';
import { useAuth } from '../auth/useAuth';
import { decodeUserId } from '../auth/jwt';
import { colors, radius } from '../theme/theme';
import { computeXpProgress } from '../utils/xp';
import type { RootStackParamList } from '../navigation/types';
import type { AttributeKey, CharacterClass, PlayerRollResult } from '../types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'CharacterSheet'>;

const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  str: 'Fuerza',
  dex: 'Destreza',
  con: 'Constitución',
  int: 'Inteligencia',
  wis: 'Sabiduría',
  cha: 'Carisma',
};

const CLASS_ICONS: Record<CharacterClass, string> = {
  guerrero: '⚔️',
  picaro: '🗡️',
  mago: '🔮',
  clerigo: '✝️',
};

// Panel deslizante: ancho fijo salvo en pantallas muy estrechas, donde ocupa
// el 85% -- así no tapa nunca por completo el fondo de aventura en tablets.
const PANEL_WIDTH = Math.min(340, Dimensions.get('window').width * 0.85);

/**
 * Única pantalla que ve el jugador mientras la partida está en curso (ver
 * docs/08-app-movil.md). El orden de turno entre jugadores ya no importa:
 * en combate, "Mi turno" reclama el candado de la ronda de jugadores actual
 * (Game.claimTurn); fuera de combate, solo el capitán del grupo puede
 * escribir al DM (Game.captainUserId). El campo de texto de abajo equivale
 * a responder al chat del DM (SendPlayerActionUseCase) y libera el turno
 * automáticamente al enviar.
 *
 * A propósito esta pantalla NO muestra el texto de la narración ni tiene
 * botón para escucharla en voz alta -- el jugador lee (y, desde ui-web,
 * escucha con Amazon Polly) la partida en ui-web; el móvil se queda solo
 * como mando para actuar (escribir, reclamar turno, tirar dados).
 *
 * La ficha completa (HP/CA, XP, atributos, hechizos, inventario) ya no vive
 * en el scroll principal -- es solo informativa (se actualiza sola cuando el
 * personaje sube de nivel o recibe daño, vía el polling de useCharacter/
 * useGame) y se abre bajo demanda con el botón "Ficha" arriba a la derecha,
 * para dejar la pantalla principal centrada en jugar.
 *
 * El capitán (Game.captainUserId, único que puede hablar con el DM fuera de
 * combate) puede pasarle el testigo a otro jugador desde aquí mismo (botón
 * "Cambiar capitán" debajo de la fila mi-turno/tirar-dados) sin depender del
 * host -- normalmente el host ni siquiera es jugador y no tiene presencia en
 * el móvil durante la partida (ver Game.assignCaptain en el backend).
 */
export function CharacterSheetScreen({ route }: Props) {
  const { characterId, gameId } = route.params;
  const { data: character, isLoading, error } = useCharacter(characterId);
  const { data: game } = useGame(gameId);
  const levelUp = useLevelUp(characterId);
  const claimTurn = useClaimTurn(gameId);
  const playerAction = usePlayerAction(gameId);
  const playerRoll = usePlayerRoll(gameId);
  const assignCaptain = useAssignCaptain(gameId);
  const auth = useAuth();
  const userId = decodeUserId(auth.token);
  // Espacio para la barra de gestos/botones del sistema (atrás, inicio,
  // cambio de apps) en Android -- sin esto el campo de acción queda pegado
  // al borde y esos botones lo tapan en la mayoría de móviles.
  const insets = useSafeAreaInsets();

  const [actionText, setActionText] = useState('');
  const [lastRoll, setLastRoll] = useState<PlayerRollResult | null>(null);
  const [captainPickerOpen, setCaptainPickerOpen] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(PANEL_WIDTH)).current; // fuera de pantalla al empezar

  const openSheet = () => {
    setSheetOpen(true);
    Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  };
  const closeSheet = () => {
    Animated.timing(slideAnim, { toValue: PANEL_WIDTH, duration: 200, useNativeDriver: true }).start(() => {
      setSheetOpen(false);
    });
  };

  if (isLoading) {
    return (
      <ImageBackground source={require('../../assets/fondo_aventura.jpg')} style={styles.background}>
        <View style={styles.centerFull}>
          <ActivityIndicator color={colors.ink} size="large" />
        </View>
      </ImageBackground>
    );
  }

  if (error || !character) {
    return (
      <ImageBackground source={require('../../assets/fondo_aventura.jpg')} style={styles.background}>
        <View style={styles.centerFull}>
          <Text style={styles.error}>{error?.message ?? 'Personaje no encontrado'}</Text>
        </View>
      </ImageBackground>
    );
  }

  const xp = computeXpProgress(character.level, character.xp);

  const encounter = game?.activeEncounter ?? null;
  const inCombat = !!encounter;
  const hasActed = encounter?.actedThisRound.includes(characterId) ?? false;
  const isMyTurn = !!encounter && encounter.turnClaim === characterId;
  const turnHolder = encounter?.turnClaim
    ? game?.players.find((p) => p.characterId === encounter.turnClaim)
    : undefined;
  const isCaptain = !!userId && !!game && game.captainUserId === userId;
  const otherPlayers = game?.players.filter((p) => p.userId !== userId) ?? [];
  const canClaimTurn =
    inCombat && encounter!.roundPhase === 'jugadores' && !hasActed && !isMyTurn && !encounter!.turnClaim;
  const canAct = inCombat ? isMyTurn : isCaptain;

  const handleClaimTurn = () => {
    claimTurn.mutate({ characterId });
  };

  const handleRoll = () => {
    // characterId es necesario para que la tirada se atribuya a este
    // personaje en el chat de ui-web (ver PlayerRollUseCase).
    playerRoll.mutate({ characterId }, { onSuccess: (data) => setLastRoll(data) });
  };

  const handleSendAction = () => {
    const content = actionText.trim();
    if (!content) return;
    playerAction.mutate(
      { characterId, content },
      {
        onSuccess: () => {
          setActionText('');
        },
      },
    );
  };

  const handleAssignCaptain = (targetUserId: string) => {
    assignCaptain.mutate({ targetUserId }, { onSuccess: () => setCaptainPickerOpen(false) });
  };

  let combatStatusText: string;
  if (!inCombat) {
    combatStatusText = isCaptain
      ? 'Fuera de combate -- eres el capitán: puedes hablar con el DM.'
      : 'Fuera de combate -- solo el capitán del grupo puede hablar con el DM.';
  } else if (isMyTurn) {
    combatStatusText = 'Es tu turno -- di qué hace tu personaje.';
  } else if (hasActed) {
    combatStatusText = 'Ya has actuado en esta ronda. Esperando a los demás...';
  } else if (encounter!.roundPhase === 'enemigos') {
    combatStatusText = 'El DM está resolviendo el turno de los enemigos...';
  } else if (turnHolder) {
    combatStatusText = `Turno de: ${turnHolder.name}`;
  } else {
    combatStatusText = 'Ronda de jugadores -- pulsa "Mi turno" cuando quieras actuar.';
  }

  return (
    <ImageBackground
      source={require('../../assets/fondo_aventura.jpg')}
      style={styles.background}
      resizeMode="cover"
    >
      <KeyboardAvoidingView
        style={styles.flexFull}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.menuButtonFloating} onPress={openSheet}>
          <Text style={styles.menuButtonText}>Ficha</Text>
        </Pressable>

        <View style={styles.header}>
          <View style={styles.headerCard}>
            <View style={styles.headerIconWrap}>
              <Text style={styles.headerIcon}>{CLASS_ICONS[character.class] ?? '⚔️'}</Text>
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.name}>{character.name}</Text>
              <Text style={styles.classLevel}>
                {character.class} · Nivel {character.level}
              </Text>
              {isCaptain && (
                <View style={styles.captainBadge}>
                  <Text style={styles.captainBadgeText}>★ Capitán</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.combatSection}>
          <Text style={styles.combatStatus}>{combatStatusText}</Text>
          <View style={styles.actionButtonsRow}>
            <Pressable
              style={[styles.turnButton, !canClaimTurn && styles.buttonDisabled]}
              disabled={!canClaimTurn || claimTurn.isPending}
              onPress={handleClaimTurn}
            >
              <Text style={styles.turnButtonText}>{claimTurn.isPending ? 'Reclamando...' : 'Mi turno'}</Text>
            </Pressable>
            <Pressable
              style={[styles.diceButton, playerRoll.isPending && styles.buttonDisabled]}
              disabled={playerRoll.isPending}
              onPress={handleRoll}
            >
              <Image source={require('../../assets/boton-roll.jpg')} style={styles.diceButtonImage} resizeMode="cover" />
              <Text style={styles.diceButtonText}>{playerRoll.isPending ? 'Tirando...' : 'Tirar Dados'}</Text>
            </Pressable>
          </View>
          {lastRoll && (
            <Text style={styles.rollResult}>
              {lastRoll.notation}: {lastRoll.result}
            </Text>
          )}
          {claimTurn.error && <Text style={styles.error}>{claimTurn.error.message}</Text>}
        </View>

        {isCaptain && otherPlayers.length > 0 && (
          <Pressable style={styles.captainSwapButtonFull} onPress={() => setCaptainPickerOpen(true)}>
            <Text style={styles.captainSwapButtonFullText}>Cambiar capitán</Text>
          </Pressable>
        )}

        <View style={styles.spacer} />

        {character.unassignedSkillPoints > 0 && (
          <Text style={styles.skillPointsNotice}>
            Tienes {character.unassignedSkillPoints} punto(s) de habilidad por asignar -- ábrelos desde "Ficha"
          </Text>
        )}

        <View style={[styles.actionBar, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
          <TextInput
            style={[styles.actionInput, !canAct && styles.actionInputDisabled]}
            value={actionText}
            onChangeText={setActionText}
            placeholder={canAct ? 'Qué hace tu personaje?' : 'Espera tu turno para escribir...'}
            placeholderTextColor={colors.inkSoft}
            editable={canAct && !playerAction.isPending}
            multiline
          />
          <Pressable
            style={[
              styles.sendButton,
              (!canAct || !actionText.trim() || playerAction.isPending) && styles.buttonDisabled,
            ]}
            disabled={!canAct || !actionText.trim() || playerAction.isPending}
            onPress={handleSendAction}
          >
            <Text style={styles.sendButtonText}>{playerAction.isPending ? '...' : 'Enviar'}</Text>
          </Pressable>
        </View>
        {playerAction.error && <Text style={styles.error}>{playerAction.error.message}</Text>}
      </KeyboardAvoidingView>

      <Modal
        visible={captainPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCaptainPickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCaptainPickerOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Elige el nuevo capitán</Text>
            {otherPlayers.map((p) => (
              <Pressable
                key={p.userId}
                style={styles.modalPlayerRow}
                disabled={assignCaptain.isPending}
                onPress={() => handleAssignCaptain(p.userId)}
              >
                <Text style={styles.modalPlayerName}>{p.name}</Text>
                <Text style={styles.modalPlayerClass}>{p.class}</Text>
              </Pressable>
            ))}
            {assignCaptain.error && <Text style={styles.error}>{assignCaptain.error.message}</Text>}
            <Pressable style={styles.modalCancel} onPress={() => setCaptainPickerOpen(false)}>
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {sheetOpen && <Pressable style={styles.backdrop} onPress={closeSheet} />}
      {sheetOpen && (
        <Animated.View
          style={[styles.sheetPanel, { width: PANEL_WIDTH, transform: [{ translateX: slideAnim }] }]}
        >
          <ScrollView contentContainerStyle={styles.sheetScroll}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Ficha de personaje</Text>
              <Pressable onPress={closeSheet} hitSlop={8}>
                <Text style={styles.sheetClose}>X</Text>
              </Pressable>
            </View>

            <View style={styles.statCardsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>HP</Text>
                <Text style={styles.statValue}>
                  {character.hp.current}/{character.hp.max}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>CA</Text>
                <Text style={styles.statValue}>{character.ac}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.xpHeaderRow}>
                <Text style={styles.sectionTitle}>Experiencia</Text>
                <Text style={styles.xpText}>
                  {xp.isMaxLevel ? `${character.xp} XP (nivel máximo)` : `${character.xp} / ${xp.nextLevelXp} XP`}
                </Text>
              </View>
              <View style={styles.xpBarTrack}>
                <View style={[styles.xpBarFill, { width: `${xp.progress * 100}%` }]} />
              </View>
            </View>

            {character.unassignedSkillPoints > 0 && (
              <Text style={styles.skillPointsNoticeInPanel}>
                Tienes {character.unassignedSkillPoints} punto(s) de habilidad por asignar
              </Text>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Atributos</Text>
              {(Object.keys(character.attributes) as AttributeKey[]).map((attr) => (
                <View key={attr} style={styles.attributeRow}>
                  <Text style={styles.attributeLabel}>{ATTRIBUTE_LABELS[attr]}</Text>
                  <Text style={styles.attributeValue}>{character.attributes[attr]}</Text>
                  <Pressable
                    style={[
                      styles.plusButton,
                      (character.unassignedSkillPoints <= 0 || levelUp.isPending) && styles.plusButtonDisabled,
                    ]}
                    disabled={character.unassignedSkillPoints <= 0 || levelUp.isPending}
                    onPress={() => levelUp.mutate({ attribute: attr })}
                  >
                    <Text style={styles.plusButtonText}>+</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            {character.spellcaster && character.spells && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Hechizos</Text>
                <Text style={styles.slotsText}>
                  Ranuras nivel 1: {character.spells.slots.level1.used}/{character.spells.slots.level1.max}
                  {'  ·  '}
                  Ranuras nivel 2: {character.spells.slots.level2.used}/{character.spells.slots.level2.max}
                </Text>
                {character.spells.known.length === 0 ? (
                  <Text style={styles.emptyNote}>Aún no conoce ningún hechizo.</Text>
                ) : (
                  character.spells.known.map((spellId) => (
                    <Text key={spellId} style={styles.listItem}>
                      · {spellId}
                    </Text>
                  ))
                )}
              </View>
            )}

            {character.inventory.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Equipamiento</Text>
                {character.inventory.map((item) => (
                  <Text key={item.equipmentId} style={styles.listItem}>
                    · {item.name}
                    {item.equipmentId === character.equippedWeaponId ? '  (equipado)' : ''}
                  </Text>
                ))}
              </View>
            )}

            <Pressable style={styles.logoutInPanel} onPress={auth.logout}>
              <Text style={styles.logoutInPanelText}>Cerrar sesión</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      )}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  flexFull: { flex: 1 },
  centerFull: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 20,
    // El botón "Ficha" flota arriba a la derecha (menuButtonFloating, top:50) y
    // tapaba la tarjeta de personaje -- se baja bastante el arranque de esta
    // caja para que quede claramente debajo.
    paddingTop: 116,
    marginBottom: 24,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(237, 225, 196, 0.9)',
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  headerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.gold,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: { fontSize: 22 },
  headerInfo: { flex: 1 },
  name: { fontSize: 20, fontWeight: '700', color: colors.ink },
  classLevel: { fontSize: 13, color: colors.inkSoft, textTransform: 'capitalize', marginTop: 2 },
  captainBadge: {
    alignSelf: 'flex-start',
    marginTop: 5,
    backgroundColor: colors.gold,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  captainBadgeText: { color: colors.ink, fontWeight: '700', fontSize: 10, letterSpacing: 0.5 },
  // "Ficha" ya no vive pegado a la tarjeta de personaje -- flota arriba a la
  // derecha, por encima de todo, tal como en el boceto del usuario.
  menuButtonFloating: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,250,235,0.9)',
  },
  menuButtonText: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  // El pill pequeño de "Cambiar capitán" que vivía en el header se sustituyó
  // por un botón ancho debajo de la fila mi-turno/tirar-dados (ver
  // captainSwapButtonFull) siguiendo el boceto del usuario.
  captainSwapButtonFull: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: colors.gold,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(20, 16, 26, 0.75)',
  },
  captainSwapButtonFullText: { color: colors.goldBright, fontWeight: '700', fontSize: 15, letterSpacing: 0.3 },
  combatSection: {
    backgroundColor: 'rgba(237, 225, 196, 0.9)',
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: radius.lg,
    padding: 14,
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 20,
  },
  combatStatus: { fontSize: 13, color: colors.ink, fontWeight: '600', marginBottom: 10, textAlign: 'center' },
  actionButtonsRow: { flexDirection: 'row', gap: 10 },
  // Tiles bastante más grandes (antes eran botones finos de paddingVertical:12)
  // para acercarse al boceto: dos cuadros grandes lado a lado.
  turnButton: {
    flex: 1,
    height: 150,
    backgroundColor: colors.success,
    borderRadius: radius.lg,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  turnButtonText: { color: '#fff', fontWeight: '700', fontSize: 17, textAlign: 'center' },
  diceButton: {
    flex: 1,
    height: 150,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: 'rgba(237, 225, 196, 0.6)',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
  },
  diceButtonImage: {
    width: '100%',
    flex: 1,
    borderRadius: radius.md,
  },
  diceButtonText: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 14,
    marginTop: 6,
  },
  rollResult: { marginTop: 8, textAlign: 'center', color: colors.ink, fontWeight: '700', fontSize: 15 },
  buttonDisabled: { opacity: 0.4 },
  spacer: { flex: 1 },
  skillPointsNotice: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.success,
    textAlign: 'center',
    marginHorizontal: 20,
    marginBottom: 8,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 16,
    backgroundColor: 'rgba(20, 16, 26, 0.92)',
    borderTopWidth: 2,
    borderTopColor: colors.ink,
  },
  actionInput: {
    flex: 1,
    minHeight: 60,
    maxHeight: 140,
    borderWidth: 1.5,
    borderColor: colors.inkSoft,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: 'rgba(237, 225, 196, 0.95)',
  },
  actionInputDisabled: { opacity: 0.5 },
  sendButton: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    paddingHorizontal: 20,
    paddingVertical: 16,
    justifyContent: 'center',
  },
  sendButtonText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  error: { marginTop: 8, color: colors.danger, fontSize: 13, textAlign: 'center', paddingHorizontal: 12 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.nightPanelSolid,
    borderWidth: 2,
    borderColor: colors.gold,
    borderRadius: radius.lg,
    padding: 18,
  },
  modalTitle: {
    color: colors.parchment,
    fontWeight: '700',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 14,
  },
  modalPlayerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 8,
  },
  modalPlayerName: { color: colors.parchment, fontWeight: '700', fontSize: 14 },
  modalPlayerClass: { color: colors.parchment, opacity: 0.7, fontSize: 12, textTransform: 'capitalize' },
  modalCancel: {
    marginTop: 6,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.parchment,
  },
  modalCancelText: { color: colors.parchment, fontWeight: '700', fontSize: 13 },

  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.nightPanelSolid,
    borderLeftWidth: 2,
    borderLeftColor: colors.gold,
  },
  sheetScroll: { padding: 20, paddingTop: 56 },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.parchment },
  sheetClose: { fontSize: 18, color: colors.parchment, fontWeight: '700', paddingHorizontal: 6 },
  statCardsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(237, 225, 196, 0.9)',
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: radius.lg,
    padding: 14,
    alignItems: 'center',
  },
  statLabel: { fontSize: 12, fontWeight: '700', color: colors.inkSoft, letterSpacing: 1 },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.ink, marginTop: 4 },
  section: {
    backgroundColor: 'rgba(237, 225, 196, 0.85)',
    borderWidth: 1.5,
    borderColor: colors.inkSoft,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 8, textTransform: 'uppercase' },
  xpHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  xpText: { fontSize: 12, color: colors.inkSoft },
  xpBarTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.5)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.inkSoft,
  },
  xpBarFill: { height: '100%', backgroundColor: colors.gold },
  skillPointsNoticeInPanel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.success,
    textAlign: 'center',
    marginBottom: 14,
  },
  attributeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  attributeLabel: { flex: 1, color: colors.ink, fontSize: 14 },
  attributeValue: { width: 32, textAlign: 'center', fontWeight: '700', color: colors.ink, fontSize: 15 },
  plusButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusButtonDisabled: { opacity: 0.35 },
  plusButtonText: { fontWeight: '700', color: colors.ink, fontSize: 16, lineHeight: 18 },
  slotsText: { fontSize: 12, color: colors.inkSoft, marginBottom: 6 },
  listItem: { fontSize: 13, color: colors.ink, marginBottom: 2 },
  emptyNote: { fontSize: 12, color: colors.inkSoft, fontStyle: 'italic', marginTop: 4 },
  logoutInPanel: {
    marginTop: 8,
    marginBottom: 24,
    borderWidth: 1.5,
    borderColor: colors.parchment,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  logoutInPanelText: { color: colors.parchment, fontWeight: '700', fontSize: 14 },
});
