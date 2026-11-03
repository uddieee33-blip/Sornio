import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CompanionProvider } from './CompanionContext';
import { ErrorBoundary } from './ErrorBoundary';
import { AppNavigation } from '../navigation/AppNavigation';
import { useTheme } from '../theme/ThemeProvider';

export function CompanionApp() {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: palette.page, paddingTop: insets.top }}>
      <ErrorBoundary>
        <CompanionProvider>
          <AppNavigation />
        </CompanionProvider>
      </ErrorBoundary>
    </View>
  );
}
