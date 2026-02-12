import {doc, onSnapshot, serverTimestamp, setDoc, updateDoc} from 'firebase/firestore';
import {db} from '../firebase';

export type ReminderSettings = {
  dailyBalanceReminderEnabled?: boolean;
  dailyBalanceReminderEmail?: string;
  dailyBalanceReminderHourUtc?: number;
  updatedAt?: unknown;
};

function reminderDoc(uid: string) {
  return doc(db, 'users', uid, 'settings', 'reminders');
}

export function watchReminderSettings(uid: string, cb: (settings: ReminderSettings) => void) {
  return onSnapshot(reminderDoc(uid), (snap) => {
    cb((snap.data() as ReminderSettings | undefined) ?? {});
  });
}

export async function setReminderSettings(uid: string, settings: ReminderSettings) {
  return setDoc(
    reminderDoc(uid),
    {
      ...settings,
      updatedAt: serverTimestamp(),
    },
    {merge: true}
  );
}

export async function setDailyBalanceReminder(uid: string, enabled: boolean, email?: string) {
  return updateDoc(reminderDoc(uid), {
    dailyBalanceReminderEnabled: enabled,
    dailyBalanceReminderEmail: email ?? null,
    updatedAt: serverTimestamp(),
  });
}

