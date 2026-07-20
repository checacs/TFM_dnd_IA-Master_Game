import { useState } from 'react';
import {
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLogin } from '../api/hooks';
import { useAuth } from '../auth/useAuth';
import { colors, radius } from '../theme/theme';

export function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const auth = useAuth();

  const handleSubmit = () => {
    login.mutate(
      { username, password },
      {
        onSuccess: (data) => auth.login(data.token),
      },
    );
  };

  const canSubmit = !!username && !!password && !login.isPending;

  return (
    <ImageBackground
      source={require('../../assets/fondo_aventura.jpg')}
      style={styles.background}
      resizeMode="cover"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.center}
      >
        <View style={styles.card}>
          <Image source={require('../../assets/logo_dnd.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>D&D con IA Master</Text>
          <Text style={styles.subtitle}>Inicia sesión para continuar tu aventura</Text>

          <Text style={styles.label}>Usuario</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="tu nombre de usuario"
            placeholderTextColor={colors.inkSoft}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.inkSoft}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Pressable
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            <Text style={styles.buttonText}>{login.isPending ? 'Entrando...' : 'Entrar'}</Text>
          </Pressable>

          {login.error && <Text style={styles.error}>{login.error.message}</Text>}
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'rgba(237, 225, 196, 0.92)',
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.ink,
    padding: 24,
  },
  logo: {
    width: 150,
    height: 162,
    alignSelf: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 4,
    marginTop: 10,
  },
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
  button: {
    marginTop: 22,
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 15,
  },
  error: {
    marginTop: 12,
    color: colors.danger,
    fontSize: 13,
    textAlign: 'center',
  },
});
