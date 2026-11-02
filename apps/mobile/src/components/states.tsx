import { View } from 'react-native';
import { space } from '@sornio/mobile-design';
import { copy } from '../i18n/en';
import { EmptyState, ErrorState as ErrorBlock } from './primitives';

export function PermissionDenied() {
  return (
    <View style={{ padding: space[24] }}>
      <EmptyState title="No access" detail={copy.permissionDenied} />
    </View>
  );
}

export function ErrorState({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={{ padding: space[24] }}>
      <ErrorBlock title={title} detail={detail} />
    </View>
  );
}

export function LoadingState() {
  return (
    <View style={{ padding: space[24] }}>
      <EmptyState title="Sornio" detail="Opening the companion copy." />
    </View>
  );
}
