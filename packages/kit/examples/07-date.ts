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
import { intro, date, isCancel, cancel, log, outro } from '../src/index.js';

async function main() {
  intro('Date Prompt Examples');

  // Default format: YYYY/MM/DD
  const birthday = await date({
    message: 'When is your birthday?',
  });
  if (isCancel(birthday)) { cancel('Cancelled.'); process.exit(0); }

  // US format: MM/DD/YYYY with initial value
  const startDate = await date({
    message: 'Project start date',
    format: 'MM/DD/YYYY',
    initialValue: new Date(),
  });
  if (isCancel(startDate)) { cancel('Cancelled.'); process.exit(0); }

  // European format: DD/MM/YYYY with min/max constraints
  const appointment = await date({
    message: 'Schedule appointment (next 30 days only)',
    format: 'DD/MM/YYYY',
    minDate: new Date(),
    maxDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  if (isCancel(appointment)) { cancel('Cancelled.'); process.exit(0); }

  // Date with custom validation
  const deadline = await date({
    message: 'Set deadline (must be a weekday)',
    validate: (value) => {
      if (!value) return 'Date is required.';
      const day = value.getUTCDay();
      if (day === 0 || day === 6) return 'Deadline must be a weekday.';
      return undefined;
    },
  });
  if (isCancel(deadline)) { cancel('Cancelled.'); process.exit(0); }

  log.success(`Birthday: ${(birthday as Date).toISOString().slice(0, 10)}`);
  log.success(`Start: ${(startDate as Date).toISOString().slice(0, 10)}`);
  log.success(`Appointment: ${(appointment as Date).toISOString().slice(0, 10)}`);
  log.success(`Deadline: ${(deadline as Date).toISOString().slice(0, 10)}`);
  outro('All dates set!');
}

main().catch(console.error);
