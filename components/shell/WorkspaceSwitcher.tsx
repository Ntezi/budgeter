import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { cn } from '@/lib/cn';
import { AppButton } from '@/components/ui/AppButton';
import { DropdownField } from '@/components/ui/DropdownField';
import { useWorkspace } from '@/providers/WorkspaceProvider';

/**
 * Moved unchanged in behaviour from app/(shell)/_layout.tsx; 44 px trigger.
 * onManage (optional): link to Settings › Workspace; the caller navigates so a sheet can close first.
 */
export function WorkspaceSwitcher({ onManage }: { onManage?: () => void } = {}) {
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
      {onManage ? (
        <AppButton label="Manage workspaces" variant="ghost" size="touch" className="self-start px-0" testID="workspace-manage-link" onPress={onManage} />
      ) : null}
    </View>
  );
}
