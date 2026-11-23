import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { cn } from '@/lib/cn';
import { DropdownField } from '@/components/ui/DropdownField';
import { useWorkspace } from '@/providers/WorkspaceProvider';

/** Moved unchanged in behaviour from app/(shell)/_layout.tsx; 44 px trigger. */
export function WorkspaceSwitcher() {
  const { activeWorkspaceId, legacyMode, setActiveWorkspaceId, workspaceOptions } = useWorkspace();
  const options = useMemo(
    () =>
      workspaceOptions.map((option) => ({
        label: `${option.label}${option.legacyMode ? ' (existing data)' : ''}`,
        value: option.workspaceId,
      })),
    [workspaceOptions]
  );
  if (!options.length) return null;
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-muted-foreground dark:text-zinc-400">Workspace</Text>
      <DropdownField
        value={activeWorkspaceId || ''}
        options={options}
        onChange={(value) => void setActiveWorkspaceId(value)}
        placeholder="Select workspace"
        triggerClassName={cn('min-h-11 bg-background dark:bg-zinc-950', !legacyMode && 'border-amber-300 dark:border-amber-600')}
      />
      {!legacyMode ? <Text className="text-xs text-amber-700 dark:text-amber-300">Older records may be under the existing data workspace.</Text> : null}
    </View>
  );
}
