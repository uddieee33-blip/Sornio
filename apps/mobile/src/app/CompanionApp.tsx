import {useState} from 'react';
import {ScrollView,View} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CompanionProvider } from './CompanionContext';
import { ErrorBoundary } from './ErrorBoundary';
import { AppNavigation } from '../navigation/AppNavigation';
import {LanRestaurantScreen} from '../screens/LanRestaurantScreen';
import {ActionButton,Body,Title,Muted} from '../components/primitives';
import { useTheme } from '../theme/ThemeProvider';

type Mode = 'connect'|'chooser'|'demo';

export function CompanionApp() {
  const [mode,setMode]=useState<Mode>('connect');
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const choose = (next: Mode) => setMode(next);
  return (
    <View style={{ flex: 1, backgroundColor: palette.page, paddingTop: insets.top }}>
      <ErrorBoundary>
        {mode==='demo'
          ? <CompanionProvider>
              <AppNavigation onLeaveDemo={()=>choose('chooser')} />
            </CompanionProvider>
          : mode==='connect'
            ? <LanRestaurantScreen onBack={()=>choose('chooser')} backLabel="Other Sornio modes" />
            : <ScrollView contentContainerStyle={{padding:24,gap:16}}>
                <Title>SORNIO</Title>
                <Body>Small business, big numbers.</Body>
                <ActionButton label="Sign in as an employee or manager" onPress={()=>choose('connect')}/>
                <ActionButton label="Explore the companion demonstration" onPress={()=>choose('demo')}/>
                <Muted>Restaurant connections use approved devices and the shop’s native employee accounts. Demonstration data does not authorise shop operations.</Muted>
                <Muted>Employee sign-in needs the shop’s desktop hub on the same private network. It is not an internet login.</Muted>
              </ScrollView>}
      </ErrorBoundary>
    </View>
  );
}
