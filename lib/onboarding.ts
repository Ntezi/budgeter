import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = 'budgeter:onboarding-complete';

export async function getOnboardingComplete() {
  const value = await AsyncStorage.getItem(ONBOARDING_KEY);
  return value === 'true';
}

export async function setOnboardingComplete(completed: boolean) {
  await AsyncStorage.setItem(ONBOARDING_KEY, completed ? 'true' : 'false');
}
