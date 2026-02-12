import {PropsWithChildren, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

type AccordionSectionProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
}>;

export function AccordionSection({title, subtitle, defaultOpen = false, children}: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={() => setOpen((v) => !v)}>
        <View style={{flex: 1}}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    marginTop: 2,
    color: '#6B7280',
    fontSize: 12,
  },
  chevron: {
    fontSize: 16,
    color: '#374151',
    width: 18,
    textAlign: 'right',
  },
  body: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 8,
    gap: 8,
  },
});

