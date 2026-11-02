import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';
import { diagnosticMessage } from '@sornio/mobile-contracts';
import { space } from '@sornio/mobile-design';
import { ActionButton, Body, Title } from '../components/primitives';

type Props = { children: ReactNode };
type State = { message: string | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null };
  static getDerivedStateFromError(error: unknown): State {
    return { message: diagnosticMessage(error) };
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.warn('Companion error boundary', info.componentStack);
  }
  render() {
    if (!this.state.message) return this.props.children;
    return (
      <View style={{ padding: space[24], gap: space[12] }}>
        <Title>Something stopped this screen</Title>
        <Body>{this.state.message}</Body>
        <ActionButton label="Try again" onPress={() => this.setState({ message: null })} />
      </View>
    );
  }
}
