import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../auth/useAuth';
import { LoginScreen } from '../screens/LoginScreen';
import { GameListScreen } from '../screens/GameListScreen';
import { GameDetailScreen } from '../screens/GameDetailScreen';
import { CharacterSheetScreen } from '../screens/CharacterSheetScreen';
import type { RootStackParamList } from './types';
import { colors } from '../theme/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    // Se muestra mientras se lee el token guardado de AsyncStorage — sin
    // esto, un usuario con sesion iniciada veria un parpadeo del login antes
    // de saltar a la lista de partidas.
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.night }}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="GameList" component={GameListScreen} />
            <Stack.Screen
              name="GameDetail"
              component={GameDetailScreen}
              options={{ headerShown: true, title: '' }}
            />
            <Stack.Screen name="CharacterSheet" component={CharacterSheetScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
