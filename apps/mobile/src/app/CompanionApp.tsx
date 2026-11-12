import {useState} from 'react';
import {ScrollView,View} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CompanionProvider } from './CompanionContext';
import { ErrorBoundary } from './ErrorBoundary';
import { AppNavigation } from '../navigation/AppNavigation';
import {LanRestaurantScreen} from '../screens/LanRestaurantScreen';
import {ActionButton,Body,Title,Muted} from '../components/primitives';
import { useTheme } from '../theme/ThemeProvider';

export function CompanionApp() {
  const [mode,setMode]=useState<'connect'|'chooser'|'demo'>('connect');
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: palette.page, paddingTop: insets.top }}>
      <ErrorBoundary>
        {mode==='connect'?<LanRestaurantScreen onBack={()=>setMode('chooser')} backLabel="Other Sornio modes"/>:mode==='demo'?<CompanionProvider><View style={{padding:12}}><ActionButton label="Connect to an authoritative restaurant shop" onPress={()=>setMode('connect')}/></View><AppNavigation/></CompanionProvider>:<ScrollView contentContainerStyle={{padding:24,gap:16}}><Title>SORNIO</Title><Body>Small business, big numbers.</Body><ActionButton label="Find my restaurant shop" onPress={()=>setMode('connect')}/><ActionButton label="Explore the companion demonstration" onPress={()=>setMode('demo')}/><Muted>Restaurant connections use approved devices and the shop’s native employee accounts. Demonstration data does not authorise shop operations.</Muted></ScrollView>}
      </ErrorBoundary>
    </View>
  );
}
