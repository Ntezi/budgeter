import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { cn } from '@/lib/cn';
import { setOnboardingComplete } from '@/lib/onboarding';

const STEPS = [
  {
    title: 'Welcome to Budgeter',
    description: 'Plan your money month-by-month with clarity and confidence.',
    icon: 'wallet-outline' as const,
    tone: 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
  },
  {
    title: 'Needs, Wants, Savings',
    description: 'Classify every budget item and see where your money goes.',
    icon: 'piggy-bank-outline' as const,
    tone: 'bg-pink-100 text-pink-600 dark:bg-pink-950/40 dark:text-pink-300',
  },
  {
    title: 'Auto vs Manual Planning',
    description: 'Use 50/30/20 automatically or track real percentages from your plan.',
    icon: 'target' as const,
    tone: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const current = useMemo(() => STEPS[step], [step]);

  async function next() {
    if (step < STEPS.length - 1) {
      setStep((prev) => prev + 1);
      return;
    }
    await setOnboardingComplete(true);
    router.replace('/auth');
  }

  return (
    <View className="flex-1 items-center justify-center bg-background px-5 dark:bg-slate-950">
      <AppCard className="w-full max-w-md items-center gap-6 px-6 py-8 md:px-8">
        <View className="flex-row gap-2">
          {STEPS.map((item, index) => (
            <View
              key={item.title}
              className={cn('h-1.5 w-9 rounded-full', index === step ? 'bg-primary dark:bg-slate-100' : 'bg-muted dark:bg-slate-800')}
            />
          ))}
        </View>

        <View className={cn('h-20 w-20 items-center justify-center rounded-2xl', current.tone)}>
          <MaterialCommunityIcons name={current.icon} size={40} />
        </View>

        <View className="gap-2">
          <Text className="text-center text-2xl font-bold text-foreground dark:text-slate-100">{current.title}</Text>
          <Text className="text-center text-base text-muted-foreground">{current.description}</Text>
        </View>

        <AppButton label={step === STEPS.length - 1 ? 'Get Started' : 'Next'} onPress={next} className="w-full" />
      </AppCard>
    </View>
  );
}
