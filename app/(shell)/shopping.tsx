import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View, useWindowDimensions, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppModal } from '@/components/ui/AppModal';
import { DropdownField } from '@/components/ui/DropdownField';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { useWorkspaceUid } from '@/providers/WorkspaceProvider';
import {
  addShoppingCategory,
  type ShoppingCatalogItem,
  addShoppingList,
  addShoppingListItem,
  deleteShoppingList,
  deleteShoppingListItem,
  type ShoppingList,
  type ShoppingListItem,
  upsertShoppingCatalogItem,
  updateShoppingListItem,
  watchShoppingCatalog,
  watchShoppingListItems,
  watchShoppingLists,
  updateShoppingList,
} from '@/lib/repo/shopping';
import { addTransaction } from '@/lib/repo/transactions';
import { periodIdFromDate, type PeriodDoc, watchPeriods } from '@/lib/repo/periods';
import { type PlanItem, watchPlanTotals } from '@/lib/repo/plans';
import { fmtMoney, parseMoney } from '@/lib/format';
import { planGroupLabel } from '@/lib/groups';
import { cn } from '@/lib/cn';

type PlanOption = { id: string; label: string; group: PlanItem['group'] };

function normalize(input: string) {
  return input.trim().toLowerCase();
}

export default function ShoppingScreen() {
  const uid = useWorkspaceUid();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 768;

  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [selectedListId, setSelectedListId] = useState('');
  const [catalogRows, setCatalogRows] = useState<ShoppingCatalogItem[]>([]);

  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [createListOpen, setCreateListOpen] = useState(false);
  const [listDraftName, setListDraftName] = useState('');
  const [listError, setListError] = useState('');

  const [itemDraftName, setItemDraftName] = useState('');
  const [itemDraftQuantity, setItemDraftQuantity] = useState('1');
  const [itemDraftPrice, setItemDraftPrice] = useState('');
  const [itemError, setItemError] = useState('');

  const [completing, setCompleting] = useState(false);
  const [itemInputs, setItemInputs] = useState<Record<string, { price: string; quantity: string }>>({});

  const [periods, setPeriods] = useState<(PeriodDoc & { id: string })[]>([]);
  const [selectedPid, setSelectedPid] = useState(periodIdFromDate());
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);

  const [importOpen, setImportOpen] = useState(false);
  const [importSearch, setImportSearch] = useState('');
  const [importSelection, setImportSelection] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!uid) return;
    return watchShoppingLists(uid, (rows) => {
      setLists(rows);
      if (!selectedListId && rows.length > 0 && isWide) {
        setSelectedListId(rows[0].id || '');
      }
    });
  }, [uid, isWide]);

  useEffect(() => {
    if (!uid) return;
    return watchShoppingCatalog(uid, setCatalogRows);
  }, [uid]);

  useEffect(() => {
    if (!uid || !selectedListId) {
      setItems([]);
      return;
    }
    return watchShoppingListItems(uid, selectedListId, setItems);
  }, [uid, selectedListId]);

  useEffect(() => {
    if (!uid) return;
    return watchPeriods(uid, (next) => {
      setPeriods(next);
      if (!next.some((p) => p.id === selectedPid) && next[0]?.id) {
        setSelectedPid(next[0].id);
      }
    });
  }, [uid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchPlanTotals(uid, selectedPid, (_totals, rows) => setPlanItems(rows));
  }, [uid, selectedPid]);

  const selectedList = useMemo(() => lists.find((l) => l.id === selectedListId) || null, [lists, selectedListId]);

  const planOptions = useMemo<PlanOption[]>(
    () =>
      planItems
        .filter((row): row is PlanItem & { id: string } => Boolean(row.id))
        .map((row) => ({
          id: row.id,
          label: `${row.name} · ${fmtMoney(row.amount || 0)} · ${planGroupLabel(row.group)}`,
          group: row.group,
        })),
    [planItems]
  );

  const displayItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.bought !== b.bought) return a.bought ? 1 : -1;
      return normalize(a.name || '').localeCompare(normalize(b.name || ''));
    });
  }, [items]);

  const importCandidates = useMemo(() => {
    const q = importSearch.trim().toLowerCase();
    if (!q) return catalogRows.slice(0, 20);
    return catalogRows.filter(c => c.name?.toLowerCase().includes(q));
  }, [catalogRows, importSearch]);

  async function createList() {
    if (!uid) return;
    const name = listDraftName.trim();
    if (!name) {
      setListError('Name is required.');
      return;
    }
    const ref = await addShoppingList(uid, name);
    setListDraftName('');
    setCreateListOpen(false);
    setSelectedListId(ref.id);
  }

  async function addItem() {
    if (!uid || !selectedListId) return;
    const name = itemDraftName.trim();
    if (!name) return;
    const quantity = parseInt(itemDraftQuantity) || 1;
    const price = parseMoney(itemDraftPrice) || 0;

    await addShoppingListItem(uid, selectedListId, {
      name,
      quantity,
      price,
      bought: false,
      completed: false,
    });
    setItemDraftName('');
    setItemDraftQuantity('1');
    setItemDraftPrice('');
  }

  async function toggleBought(item: ShoppingListItem) {
    if (!uid || !selectedListId || !item.id) return;
    await updateShoppingListItem(uid, selectedListId, item.id, { bought: !item.bought });
  }

  async function removeItem(item: ShoppingListItem) {
    if (!uid || !selectedListId || !item.id) return;
    await deleteShoppingListItem(uid, selectedListId, item.id);
  }

  const startCompletion = () => {
    const inputs: Record<string, { price: string; quantity: string }> = {};
    items.forEach((item) => {
      if (item.id) {
        inputs[item.id] = {
          price: String(item.price || ''),
          quantity: String(item.quantity || '1'),
        };
      }
    });
    setItemInputs(inputs);
    setCompleting(true);
  };

  const handleDoneAndClear = async () => {
    if (!uid || !selectedListId || !selectedList) return;
    
    try {
      for (const item of items) {
        if (!item.id) continue;
        const input = itemInputs[item.id];
        const finalPrice = parseMoney(input?.price || '0');
        const finalQty = parseInt(input?.quantity || '1') || 1;
        const total = finalPrice * finalQty;

        if (total > 0) {
          const group = (selectedList as any).assignedGroup || 'NEED';
          const planItemId = (selectedList as any).assignedPlanItemId || '';
          
          await addTransaction(uid, selectedPid, {
            name: item.name,
            amount: total,
            group,
            date: new Date().toISOString().split('T')[0],
            note: `Shopping: ${selectedList.name}`,
            categoryId: planItemId,
          } as any);

          // Update catalog with final price history
          await upsertShoppingCatalogItem(uid, {
            name: item.name,
            category: item.category || '',
            tags: item.tags || [],
            price: finalPrice,
            quantity: finalQty,
          });
        }
        await deleteShoppingListItem(uid, selectedListId, item.id);
      }
      setCompleting(false);
      setSelectedListId('');
    } catch (e) {
      Alert.alert('Error', 'Failed to complete shopping list');
    }
  };

  const updateListPlan = async (planId: string) => {
    if (!uid || !selectedListId) return;
    const plan = planOptions.find(p => p.id === planId);
    await updateShoppingList(uid, selectedListId, {
      assignedPlanItemId: planId,
      assignedPlanItemName: plan?.label || '',
      assignedGroup: plan?.group || 'NEED',
    } as any);
  };

  const importSelected = async () => {
    if (!uid || !selectedListId) return;
    const picks = catalogRows.filter(c => importSelection[c.id || '']);
    for (const p of picks) {
      await addShoppingListItem(uid, selectedListId, {
        name: p.name || '',
        quantity: 1,
        price: 0,
        bought: false,
        completed: false,
      });
    }
    setImportOpen(false);
    setImportSelection({});
  };

  const renderLists = () => (
    <AppCard className="flex-1 md:max-w-xs border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-lg font-bold text-foreground dark:text-zinc-50">Lists</Text>
        <IconActionButton icon="plus" label="New List" onPress={() => setCreateListOpen(true)} />
      </View>
      <ScrollView>
        {lists.map((l) => (
          <Pressable
            key={l.id}
            onPress={() => setSelectedListId(l.id || '')}
            className={cn(
              "p-3 rounded-lg mb-2 border",
              selectedListId === l.id 
                ? "bg-primary/10 border-primary/30 dark:bg-primary/20 dark:border-primary/40" 
                : "bg-muted/30 border-transparent dark:bg-zinc-800/40"
            )}
          >
            <Text className="font-medium text-foreground dark:text-zinc-100">{l.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </AppCard>
  );

  const renderItems = () => {
    if (!selectedList) return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-muted-foreground dark:text-zinc-400">Select a list to view items</Text>
      </View>
    );

    return (
      <View className="flex-1 gap-3">
        {!isWide && (
          <View className="flex-row items-center justify-between">
            <Pressable onPress={() => setSelectedListId('')} className="flex-row items-center gap-1">
              <MaterialCommunityIcons name="chevron-left" size={20} color="#717182" />
              <Text className="text-primary dark:text-blue-400 font-medium">Lists</Text>
            </Pressable>
            {!completing && (
              <View className="flex-row gap-2">
                <AppButton label="Import" onPress={() => setImportOpen(true)} variant="outline" size="sm" />
                <AppButton label="Complete" onPress={startCompletion} variant="outline" size="sm" />
              </View>
            )}
          </View>
        )}

        <AppCard className="flex-1 border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
          <View className="flex-row items-center justify-between mb-4">
            <View>
              <Text className="text-xl font-bold text-foreground dark:text-zinc-50">{selectedList.name}</Text>
            </View>
            {isWide && !completing && (
              <View className="flex-row gap-2">
                <AppButton label="Import" onPress={() => setImportOpen(true)} variant="outline" size="sm" />
                <AppButton label="Complete" onPress={startCompletion} variant="outline" size="sm" />
              </View>
            )}
          </View>

          {isWide && (
          <View className="mb-4 gap-2">
            <Text className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground dark:text-zinc-400">Assign to Budget Item</Text>
            <DropdownField
              value={(selectedList as any).assignedPlanItemId || ''}
              options={[{ label: 'None (Unassigned)', value: '' }, ...planOptions.map(o => ({ label: o.label, value: o.id }))]}
              onChange={updateListPlan}
              placeholder="Select Budget Item"
              menuStrategy="inline"
              triggerClassName="bg-background dark:bg-zinc-950 border-border dark:border-zinc-800"
            />
          </View>
        )}

        {!completing ? (
          <>
            {isWide ? (
              <View className="flex-row gap-2 mb-4">
                <AppInput
                  value={itemDraftName}
                  onChangeText={setItemDraftName}
                  placeholder="Item name"
                  className="flex-1"
                />
                <AppInput
                  value={itemDraftQuantity}
                  onChangeText={setItemDraftQuantity}
                  placeholder="Qty"
                  keyboardType="numeric"
                  className="w-16"
                />
                <AppButton onPress={addItem}>
                  <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
                </AppButton>
              </View>
            ) : (
              <View className="mb-4 relative z-50">
                <AppInput
                  value={itemDraftName}
                  onChangeText={setItemDraftName}
                  placeholder="Add item..."
                  className="flex-1"
                />
                {itemDraftName.trim().length > 0 && (
                  <View className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg dark:bg-zinc-900 dark:border-zinc-800 overflow-hidden">
                    <ScrollView keyboardShouldPersistTaps="handled" className="max-h-48">
                      {/* Filtered catalog items */}
                      {catalogRows
                        .filter(c => c.name?.toLowerCase().includes(itemDraftName.toLowerCase()))
                        .map(c => (
                          <Pressable
                            key={c.id}
                            className="p-3 border-b border-border dark:border-zinc-800 active:bg-muted/50"
                            onPress={() => {
                              addShoppingListItem(uid!, selectedListId, {
                                name: c.name || '',
                                quantity: 1,
                                price: c.price || 0,
                                bought: false,
                                completed: false,
                              });
                              setItemDraftName('');
                            }}
                          >
                            <Text className="text-foreground dark:text-zinc-100">{c.name}</Text>
                          </Pressable>
                        ))
                      }
                      {/* Option to add as new if not an exact match */}
                      {!catalogRows.some(c => c.name?.toLowerCase() === itemDraftName.toLowerCase()) && (
                        <Pressable
                          className="p-3 active:bg-muted/50"
                          onPress={() => {
                            addShoppingListItem(uid!, selectedListId, {
                              name: itemDraftName.trim(),
                              quantity: 1,
                              price: 0,
                              bought: false,
                              completed: false,
                            });
                            setItemDraftName('');
                          }}
                        >
                          <Text className="text-primary font-medium">Add "{itemDraftName.trim()}"</Text>
                        </Pressable>
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            <ScrollView className="flex-1">
              {displayItems.map((item) => (
                <View key={item.id} className="flex-row items-center justify-between p-3 border-b border-border dark:border-zinc-800">
                  <View className="flex-row items-center gap-3 flex-1">
                    <Switch
                      value={item.bought}
                      onValueChange={() => toggleBought(item)}
                    />
                    <Text className={cn(
                      "text-foreground dark:text-zinc-100",
                      item.bought && "line-through text-muted-foreground dark:text-zinc-500"
                    )}>
                      {item.name} {item.quantity > 1 ? `(x${item.quantity})` : ''}
                    </Text>
                  </View>
                  <View className="flex-row gap-1">
                    <IconActionButton icon="pencil-outline" label="Edit" onPress={() => {}} />
                    <IconActionButton icon="trash-can-outline" label="Delete" variant="danger" onPress={() => removeItem(item)} />
                  </View>
                </View>
              ))}
              {!displayItems.length && (
                <Text className="text-center text-muted-foreground dark:text-zinc-400 py-8">No items yet</Text>
              )}
            </ScrollView>
          </>
        ) : (
          <View className="flex-1">
            <Text className="text-sm text-muted-foreground dark:text-zinc-400 mb-4">Finalize quantities and prices before clearing.</Text>
            <ScrollView className="flex-1 mb-4">
              {items.map((item) => (
                <View key={item.id} className="flex-row items-center gap-3 p-3 border-b border-border dark:border-zinc-800">
                  <Text className="flex-1 text-foreground dark:text-zinc-100" numberOfLines={1}>{item.name}</Text>
                  <View className="flex-row gap-2 items-center">
                    <AppInput
                      value={itemInputs[item.id!]?.quantity}
                      onChangeText={(v) => setItemInputs(prev => ({ ...prev, [item.id!]: { ...prev[item.id!], quantity: v } }))}
                      className="w-16 h-9 text-center"
                      placeholder="Qty"
                      keyboardType="numeric"
                    />
                    <AppInput
                      value={itemInputs[item.id!]?.price}
                      onChangeText={(v) => setItemInputs(prev => ({ ...prev, [item.id!]: { ...prev[item.id!], price: v } }))}
                      className="w-24 h-9 text-right"
                      placeholder="Price"
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              ))}
            </ScrollView>
            <View className="flex-row gap-2">
              <AppButton label="Cancel" onPress={() => setCompleting(false)} variant="outline" className="flex-1" />
              <AppButton label="Done & Clear" onPress={handleDoneAndClear} className="flex-1" textClassName="text-white" />
            </View>
          </View>
        )}
      </AppCard>
    </View>
    );
  };

  return (
    <View className={cn("flex-1 gap-4 bg-background dark:bg-zinc-950", isWide ? "p-4" : "px-1.5 pt-1 pb-4")}>
      {isWide && (
        <View className="flex-row items-center justify-between">
          <Text className="text-3xl font-bold text-foreground dark:text-zinc-50">Shopping</Text>
        </View>
      )}

      <View className={`flex-1 ${isWide ? 'flex-row gap-4' : 'flex-col'}`}>
        {(!selectedListId || isWide) && renderLists()}
        {(selectedListId || isWide) && renderItems()}
      </View>

      <AppModal open={createListOpen} onClose={() => setCreateListOpen(false)} title="New Shopping List">
        <View className="gap-4">
          <AppInput value={listDraftName} onChangeText={setListDraftName} placeholder="List name (e.g. Weekly Groceries)" />
          <View className="flex-row gap-2">
            <AppButton label="Cancel" onPress={() => setCreateListOpen(false)} variant="outline" />
            <AppButton label="Create" onPress={createList} textClassName="text-white" />
          </View>
        </View>
      </AppModal>

      <AppModal open={importOpen} onClose={() => setImportOpen(false)} title="Import Items">
        <View className="gap-4">
          <AppInput
            value={importSearch}
            onChangeText={setImportSearch}
            placeholder="Search catalog..."
            className="mb-2"
          />
          <ScrollView className="max-h-80">
            {importCandidates.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setImportSelection(prev => ({ ...prev, [c.id!]: !prev[c.id!] }))}
                className={cn(
                  "flex-row items-center justify-between p-3 border-b border-border dark:border-zinc-800",
                  importSelection[c.id!] && "bg-primary/5 dark:bg-primary/10"
                )}
              >
                <Text className="text-foreground dark:text-zinc-100">{c.name}</Text>
                <MaterialCommunityIcons
                  name={importSelection[c.id!] ? "checkbox-marked" : "checkbox-blank-outline"}
                  size={20}
                  color={importSelection[c.id!] ? "#22C55E" : "#717182"}
                />
              </Pressable>
            ))}
          </ScrollView>
          <View className="flex-row justify-end gap-2">
            <AppButton label="Cancel" onPress={() => setImportOpen(false)} variant="outline" />
            <AppButton 
              label={`Import Selected (${Object.values(importSelection).filter(Boolean).length})`} 
              onPress={importSelected}
              textClassName="text-white"
            />
          </View>
        </View>
      </AppModal>
    </View>
  );
}
