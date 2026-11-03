import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CompanionApp } from './src/app/CompanionApp';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';

function ThemedStatusBar() {
  const { appearance } = useTheme();
  return <StatusBar style={appearance === 'dusk' ? 'light' : 'dark' } />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedStatusBar />
        <CompanionApp />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
