import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppButton } from '@/components/ui/AppButton';
import { cn } from '@/lib/cn';
import { setOnboardingComplete } from '@/lib/onboarding';
import { rememberPlanAfterSignIn } from '@/components/onboarding/planIntent';
import { monthIdFromDate } from '@/lib/rules/months';
import { periodTitleFromId } from '@/lib/repo/periods';

const GROUPS = [
  { dot: 'bg-needs', name: 'Needs', text: 'rent, food, transport' },
  { dot: 'bg-wants', name: 'Wants', text: 'eating out, fun' },
  { dot: 'bg-savings', name: 'Savings', text: 'savings and debt' },
];

/**
 * BUDG-8 01: three skippable steps, no writes (C-10). The seen flag is the existing lib/onboarding.
 * Step 3 "Plan <Month>" remembers (in memory) to open /budgets?new=1 after sign-in: Plan with the New
 * month sheet on the current month.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const monthTitle = periodTitleFromId(monthIdFromDate(new Date()));

  async function finish(to: string) {
    await setOnboardingComplete(true);
    router.replace(to as never);
  }

  const title = ['How we split your money', 'Your accounts', 'Start this month'][step];

  return (
    <ScrollView testID="onboarding" className="flex-1 bg-background dark:bg-zinc-950" contentContainerClassName="min-h-full px-5 pb-8 pt-6">
      <View className="w-full flex-1 gap-8 self-center" style={{ maxWidth: 448 }}>
        <View className="flex-row items-center justify-between">
          <Text role="status" className="text-sm font-medium text-muted-foreground dark:text-zinc-400">{`Step ${step + 1} of 3`}</Text>
          {step < 2 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Skip" onPress={() => void finish('/auth')} className="min-h-11 min-w-11 items-center justify-center rounded-md px-3 hover:bg-muted/50 dark:hover:bg-zinc-800/60">
              <Text className="text-sm font-medium text-foreground dark:text-zinc-50">Skip</Text>
            </Pressable>
          ) : null}
        </View>
        <View className="flex-row gap-2">
          {[0, 1, 2].map((i) => (
            <View key={i} className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-primary dark:bg-zinc-50' : 'bg-muted dark:bg-zinc-800')} />
          ))}
        </View>

        <View className="flex-1 gap-5">
          <Text role="heading" aria-level={1} className="text-2xl font-bold text-foreground dark:text-zinc-50">{title}</Text>
          {step === 0 ? (
            <View className="gap-4">
              {GROUPS.map((g) => (
                <View key={g.name} className="flex-row items-center gap-3">
                  <View className={cn('h-3 w-3 rounded-full', g.dot)} />
                  <Text className="text-base font-semibold text-foreground dark:text-zinc-50">{g.name}</Text>
                  <Text className="min-w-0 flex-1 text-base text-muted-foreground dark:text-zinc-400">{g.text}</Text>
                </View>
              ))}
              <Text className="text-base text-muted-foreground dark:text-zinc-400">Every cost in your plan sits in one of these three groups.</Text>
            </View>
          ) : null}
          {step === 1 ? <Text className="text-base text-muted-foreground dark:text-zinc-400">Add the places your money lives: bank, mobile money, cash.</Text> : null}
          {step === 2 ? <Text className="text-base text-muted-foreground dark:text-zinc-400">{`Make a plan for ${monthTitle}: what you expect to earn and spend. It takes a few minutes.`}</Text> : null}
        </View>

        <View className="gap-2">
          {step === 0 ? <AppButton label="Next" size="touch-lg" className="w-full" onPress={() => setStep(1)} /> : null}
          {step === 1 ? <AppButton label="I'll add them on Accounts" accessibilityLabel="Next: I'll add them on Accounts" size="touch-lg" className="w-full" onPress={() => setStep(2)} /> : null}
          {step === 2 ? (
            <>
              <AppButton label={`Plan ${monthTitle}`} size="touch-lg" className="w-full" onPress={() => {
                  rememberPlanAfterSignIn();
                  void finish('/auth');
                }} />
              <AppButton label="Look around first" variant="ghost" size="touch" className="w-full" onPress={() => void finish('/dashboard')} />
            </>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}
