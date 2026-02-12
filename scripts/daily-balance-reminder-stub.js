/**
 * Daily balance reminder stub.
 *
 * Intended to be replaced by a scheduled Firebase Cloud Function.
 * This stub documents the shape and logs what would be sent.
 */

async function runDailyBalanceReminderJob({firestore, logger = console}) {
  const remindersSnap = await firestore.collectionGroup('settings').where('dailyBalanceReminderEnabled', '==', true).get();
  let queued = 0;

  remindersSnap.forEach((doc) => {
    const data = doc.data() || {};
    const email = data.dailyBalanceReminderEmail;
    if (!email) return;

    queued += 1;
    logger.log('[reminder-stub] would enqueue email', {
      to: email,
      subject: 'Budgeter: update wallet balances',
      hourUtc: data.dailyBalanceReminderHourUtc ?? 7,
    });
  });

  logger.log('[reminder-stub] total reminders', queued);
  return queued;
}

module.exports = {runDailyBalanceReminderJob};

