/**
 * 07 - Date Prompt
 *
 * Segment-based date input with arrow key navigation, digit entry,
 * min/max validation, and multiple format presets.
 *
 * Controls:
 *   Left/Right - move between segments (year/month/day)
 *   Up/Down    - increment/decrement current segment
 *   0-9        - type digits directly
 *   Backspace  - clear current segment
 */
import { log, date, intro, outro, cancel, isCancel } from '../src/index.js';

async function main() {
  intro('Date Prompt Examples');
  // Date values are UTC calendar dates, without a local-time offset.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const nextWeekday = new Date(today);
  while ([0, 6].includes(nextWeekday.getUTCDay())) {
    nextWeekday.setUTCDate(nextWeekday.getUTCDate() + 1);
  }

  // Default format: YYYY/MM/DD
  const birthday = await date({
    message: 'Choose a sample birthday',
    initialValue: new Date('1990-01-01T00:00:00Z'),
  });
  if (isCancel(birthday)) {
    cancel('Cancelled.');
    return;
  }

  // US format: MM/DD/YYYY with initial value
  const startDate = await date({
    message: 'Project start date',
    format: 'MM/DD/YYYY',
    initialValue: today,
  });
  if (isCancel(startDate)) {
    cancel('Cancelled.');
    return;
  }

  // European format: DD/MM/YYYY with min/max constraints
  const appointment = await date({
    message: 'Schedule appointment (next 30 days only)',
    format: 'DD/MM/YYYY',
    initialValue: today,
    minDate: today,
    maxDate: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000),
  });
  if (isCancel(appointment)) {
    cancel('Cancelled.');
    return;
  }

  // Date with custom validation
  const deadline = await date({
    message: 'Set deadline (must be a weekday)',
    initialValue: nextWeekday,
    validate: (value) => {
      if (!value) return 'Date is required.';
      const day = value.getUTCDay();
      if (day === 0 || day === 6) return 'Deadline must be a weekday.';
      return undefined;
    },
  });
  if (isCancel(deadline)) {
    cancel('Cancelled.');
    return;
  }

  log.success(`Birthday: ${birthday.toISOString().slice(0, 10)}`);
  log.success(`Start: ${startDate.toISOString().slice(0, 10)}`);
  log.success(`Appointment: ${appointment.toISOString().slice(0, 10)}`);
  log.success(`Deadline: ${deadline.toISOString().slice(0, 10)}`);
  outro('All dates set!');
}

await main();
