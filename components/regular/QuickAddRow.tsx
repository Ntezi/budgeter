import React, { useState } from 'react';
import { View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { parseQuickAdd } from './types';

/** "Add a cost: name and amount" -> opens the item form pre-filled. Nothing is saved here. */
export function QuickAddRow({ onOpen }: { onOpen: (prefill: { name: string; amount: string }, e?: unknown) => void }) {
  const [text, setText] = useState('');
  const submit = (e?: unknown) => {
    if (!text.trim()) return;
    onOpen(parseQuickAdd(text), e);
    setText('');
  };
  return (
    <View testID="quick-add" className="flex-row items-center gap-2 px-4 py-2">
      <View className="min-w-0 flex-1">
        <AppInput
          accessibilityLabel="Add a cost: name and amount"
          placeholder="Add a cost: name and amount"
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => submit()}
          returnKeyType="next"
          className="h-11 text-base"
          style={{ height: 44 }}
        />
      </View>
      <AppButton label="Add" variant="outline" size="touch" disabled={!text.trim()} onPress={submit} />
    </View>
  );
}
