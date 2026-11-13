/**
 * 08 - Autocomplete Prompt
 *
 * Type-ahead search with single and multi-select modes,
 * custom filter functions, and placeholder text.
 */
import {
  log,
  intro,
  outro,
  cancel,
  isCancel,
  autocomplete,
  autocompleteMultiselect,
} from '../src/index.js';

const countries = [
  { value: 'us', label: 'United States', hint: 'North America' },
  { value: 'uk', label: 'United Kingdom', hint: 'Europe' },
  { value: 'de', label: 'Germany', hint: 'Europe' },
  { value: 'fr', label: 'France', hint: 'Europe' },
  { value: 'jp', label: 'Japan', hint: 'Asia' },
  { value: 'au', label: 'Australia', hint: 'Oceania' },
  { value: 'br', label: 'Brazil', hint: 'South America' },
  { value: 'ca', label: 'Canada', hint: 'North America' },
  { value: 'in', label: 'India', hint: 'Asia' },
  { value: 'kr', label: 'South Korea', hint: 'Asia' },
  { value: 'mx', label: 'Mexico', hint: 'North America' },
  { value: 'ng', label: 'Nigeria', hint: 'Africa' },
];

async function main() {
  intro('Autocomplete Prompt Examples');

  // Single select with search
  const country = await autocomplete({
    message: 'Select your country',
    placeholder: 'Type to search...',
    options: countries,
  });
  if (isCancel(country)) {
    cancel('Cancelled.');
    return;
  }

  // Custom filter - search by hint (region) as well
  const destination = await autocomplete({
    message: 'Choose a destination (try typing a region name)',
    placeholder: 'e.g. "Europe" or "Asia"',
    options: countries,
    filter: (search, option) => {
      const term = search.toLowerCase();
      const label = (option.label ?? '').toLowerCase();
      const hint = (option.hint ?? '').toLowerCase();
      return label.includes(term) || hint.includes(term);
    },
  });
  if (isCancel(destination)) {
    cancel('Cancelled.');
    return;
  }

  // Multi-select with search
  const visited = await autocompleteMultiselect({
    message: 'Which countries have you visited? (optional)',
    required: false,
    placeholder: 'Type to filter, Tab to toggle, Enter to submit',
    options: countries,
  });
  if (isCancel(visited)) {
    cancel('Cancelled.');
    return;
  }

  log.success(`Country: ${country}`);
  log.success(`Destination: ${destination}`);
  log.success(`Visited: ${visited.join(', ')}`);
  outro('Done!');
}

await main();
