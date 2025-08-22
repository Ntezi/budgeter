import {View, Text, TextInput, StyleSheet} from 'react-native';

export function InputRow({
                             label, value, onChangeText, placeholder, keyboardType = 'numeric',
                         }: {
    label: string;
    value: string;
    onChangeText: (t: string) => void;
    placeholder?: string;
    keyboardType?: 'default' | 'numeric';
}) {
    return (
        <View style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
                style={styles.input}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                keyboardType={keyboardType}
                inputMode={keyboardType === 'numeric' ? 'decimal' : 'text'}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    row: {flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6},
    label: {flex: 1, fontSize: 14, color: '#374151'},
    input: {
        width: 140, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#fff',
        borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', textAlign: 'right',
    },
});
