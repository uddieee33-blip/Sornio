import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type AccessibilityRole, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { layout, space, touch, type } from '@sornio/mobile-design';
import { useTheme } from '../theme/ThemeProvider';

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { palette } = useTheme();
  return <View style={[styles.screen, { backgroundColor: palette.page }, style]}>{children}</View>;
}

export function Hairline() {
  const { palette } = useTheme();
  return <View style={[styles.line, { backgroundColor: palette.line }]} />;
}

export function Eyebrow({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[styles.eyebrow, { color: palette.muted }]}
      allowFontScaling
    >
      {children}
    </Text>
  );
}

export function Title({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]} allowFontScaling>
      {children}
    </Text>
  );
}

export function Body({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  const { palette } = useTheme();
  return (
    <Text style={[styles.body, { color: palette.ink }, style]} allowFontScaling>
      {children}
    </Text>
  );
}

export function Muted({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <Text style={[styles.caption, { color: palette.muted }]} allowFontScaling>
      {children}
    </Text>
  );
}

export function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.metric} accessibilityRole="summary" accessibilityLabel={`${label} ${value}`}>
      <Text style={[styles.micro, { color: palette.muted }]} allowFontScaling>
        {label.toUpperCase()}
      </Text>
      <Text style={[styles.metricValue, { color: palette.ink }]} allowFontScaling maxFontSizeMultiplier={1.6}>
        {value}
      </Text>
      {hint ? (
        <Text style={[styles.caption, { color: palette.muted }]} allowFontScaling>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function Row({
  title,
  detail,
  meta,
  onPress,
  accessibilityLabel,
}: {
  title: string;
  detail: string;
  meta?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { palette } = useTheme();
  const content = (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.callout, { color: palette.ink }]} allowFontScaling>
          {title}
        </Text>
        <Text style={[styles.caption, { color: palette.muted }]} allowFontScaling>
          {detail}
        </Text>
      </View>
      {meta ? (
        <Text style={[styles.callout, { color: palette.ink }]} allowFontScaling>
          {meta}
        </Text>
      ) : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [pressed ? { opacity: 0.7 } : null, { minHeight: touch }]}
    >
      {content}
    </Pressable>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.empty} accessibilityRole={'text' as AccessibilityRole}>
      <Title>{title}</Title>
      <Muted>{detail}</Muted>
    </View>
  );
}

export function ErrorState({ title, detail }: { title: string; detail: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.empty} accessibilityRole="alert">
      <Text style={[styles.title, { color: palette.danger }]}>{title}</Text>
      <Muted>{detail}</Muted>
    </View>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const { palette } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={palette.muted}
      accessibilityLabel={placeholder}
      autoCorrect={false}
      autoCapitalize="none"
      style={[
        styles.search,
        { color: palette.ink, borderColor: palette.line, backgroundColor: palette.lift },
      ]}
    />
  );
}

export function ActionButton({
  label,
  onPress,
  disabled,
  danger,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Native automation handle. Additive: does not alter the spoken label. */
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      testID={testID}
      // An explicit label keeps VoiceOver announcing one phrase. Without it the
      // name is derived from whatever text nodes happen to be children, which
      // reads compound labels such as "Draft additions · revision 7" in
      // fragments and leaves the control unfindable by name.
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: disabled ? palette.line : danger ? palette.danger : palette.brand,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[styles.buttonLabel, { color: palette.brandInk }]}>{label}</Text>
    </Pressable>
  );
}

export function DemoBanner({ text }: { text: string }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.demo, { backgroundColor: palette.demo }]} accessibilityRole="alert">
      <Text style={[styles.demoText, { color: palette.demoInk }]} allowFontScaling>
        {text}
      </Text>
    </View>
  );
}

export function tablet(width: number): boolean {
  return width >= layout.tabletMin;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  line: { height: StyleSheet.hairlineWidth, width: '100%' },
  eyebrow: { ...type.micro, marginBottom: space[8] },
  title: { ...type.title },
  body: { ...type.body },
  caption: { ...type.caption },
  callout: { ...type.callout },
  micro: { ...type.micro },
  metric: { paddingVertical: space[12], minWidth: 140, flexGrow: 1 },
  metricValue: { ...type.metric, marginTop: space[4] },
  row: {
    minHeight: touch,
    paddingVertical: space[12],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[16],
  },
  rowText: { flex: 1, gap: space[4] },
  empty: { paddingVertical: space[40], gap: space[8] },
  search: {
    minHeight: touch,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    paddingHorizontal: space[12],
    ...type.body,
  },
  button: {
    minHeight: touch,
    paddingHorizontal: space[16],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  buttonLabel: { ...type.callout },
  demo: { paddingHorizontal: space[20], paddingVertical: space[8] },
  demoText: { ...type.caption, fontWeight: '700' },
});
