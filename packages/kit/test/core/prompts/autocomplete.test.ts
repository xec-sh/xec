import { cursor } from 'sisteransi';
import { vi, test, expect, describe, afterEach, beforeEach } from 'vitest';

import { MockReadable } from '../mock-readable.js';
import { MockWritable } from '../mock-writable.js';
import { default as AutocompletePrompt } from '../../../src/core/prompts/autocomplete.js';

describe('AutocompletePrompt', () => {
  let input: MockReadable;
  let output: MockWritable;
  const testOptions = [
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana' },
    { value: 'cherry', label: 'Cherry' },
    { value: 'grape', label: 'Grape' },
    { value: 'orange', label: 'Orange' },
  ];

  beforeEach(() => {
    input = new MockReadable();
    output = new MockWritable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('renders render() result', () => {
    const instance = new AutocompletePrompt({
      input,
      output,
      render: () => 'foo',
      options: testOptions,
    });
    instance.prompt();
    expect(output.buffer).to.deep.equal([cursor.hide, 'foo']);
  });

  test('initial options match provided options', () => {
    const instance = new AutocompletePrompt({
      input,
      output,
      render: () => 'foo',
      options: testOptions,
    });

    instance.prompt();

    // Initial state should have all options
    expect(instance.filteredOptions.length).to.equal(testOptions.length);
    expect(instance.cursor).to.equal(0);
  });

  test('cursor navigation with event emitter', () => {
    const instance = new AutocompletePrompt({
      input,
      output,
      render: () => 'foo',
      options: testOptions,
    });

    instance.prompt();

    // Initial cursor should be at 0
    expect(instance.cursor).to.equal(0);

    // Directly trigger the cursor event with 'down'
    instance.emit('key', '', { name: 'down' });

    // After down event, cursor should be 1
    expect(instance.cursor).to.equal(1);

    // Trigger cursor event with 'up'
    instance.emit('key', '', { name: 'up' });

    // After up event, cursor should be back to 0
    expect(instance.cursor).to.equal(0);
  });

  test('initialValue selects correct option', () => {
    const instance = new AutocompletePrompt({
      input,
      output,
      render: () => 'foo',
      options: testOptions,
      initialValue: ['cherry'],
    });

    // The cursor should be initialized to the cherry index
    const cherryIndex = testOptions.findIndex((opt) => opt.value === 'cherry');
    expect(instance.cursor).to.equal(cherryIndex);

    // The selectedValue should be cherry
    expect(instance.selectedValues).to.deep.equal(['cherry']);
  });

  test('initialValue defaults to first option when non-multiple', () => {
    const instance = new AutocompletePrompt({
      input,
      output,
      render: () => 'foo',
      options: testOptions,
    });

    expect(instance.cursor).to.equal(0);
    expect(instance.selectedValues).to.deep.equal(['apple']);
  });

  test('initialValue is empty when multiple', () => {
    const instance = new AutocompletePrompt({
      input,
      output,
      render: () => 'foo',
      options: testOptions,
      multiple: true,
    });

    expect(instance.cursor).to.equal(0);
    expect(instance.selectedValues).to.deep.equal([]);
  });

  test('filtering through user input', () => {
    const instance = new AutocompletePrompt({
      input,
      output,
      render: () => 'foo',
      options: testOptions,
    });

    instance.prompt();

    // Initial state should have all options
    expect(instance.filteredOptions.length).to.equal(testOptions.length);

    // Simulate typing 'a' by emitting keypress event
    input.emit('keypress', 'a', { name: 'a' });

    // Check that filtered options are updated to include options with 'a'
    expect(instance.filteredOptions.length).to.be.lessThan(testOptions.length);

    // Check that 'apple' is in the filtered options
    const hasApple = instance.filteredOptions.some((opt) => opt.value === 'apple');
    expect(hasApple).to.equal(true);
  });

  test('default filter function works correctly', () => {
    const instance = new AutocompletePrompt({
      input,
      output,
      render: () => 'foo',
      options: testOptions,
    });

    instance.prompt();

    input.emit('keypress', 'a', { name: 'a' });
    input.emit('keypress', 'p', { name: 'p' });

    expect(instance.filteredOptions).toEqual([
      { value: 'apple', label: 'Apple' },
      { value: 'grape', label: 'Grape' },
    ]);

    input.emit('keypress', 'z', { name: 'z' });

    expect(instance.filteredOptions).toEqual([]);
  });

  test('submit without nav resolves to first option in non-multiple', async () => {
    const instance = new AutocompletePrompt({
      input,
      output,
      render: () => 'foo',
      options: testOptions,
    });

    const promise = instance.prompt();
    input.emit('keypress', '', { name: 'return' });
    const result = await promise;

    expect(instance.selectedValues).to.deep.equal(['apple']);
    expect(result).to.equal('apple');
  });

  test('submit without nav resolves to [] in multiple', async () => {
    const instance = new AutocompletePrompt({
      input,
      output,
      render: () => 'foo',
      options: testOptions,
      multiple: true,
    });

    const promise = instance.prompt();
    input.emit('keypress', '', { name: 'return' });
    const result = await promise;

    expect(instance.selectedValues).to.deep.equal([]);
    expect(result).to.deep.equal([]);
  });

  // Upstream #496: a dynamic options() getter searches by itself — the default
  // substring filter must not run on top of what the getter returned.
  test('does not force the default filter onto dynamic options getters', () => {
    const instance = new AutocompletePrompt({
      input,
      output,
      render: () => 'foo',
      // A getter that ignores the input entirely and always returns one
      // fixed option whose label does not contain the typed text.
      options: () => [{ value: 'fixed', label: 'Fixed' }],
    });

    instance.prompt();

    input.emit('keypress', 'z', { name: 'z' });

    // With the default filter forced on, 'Fixed' would not match 'z' and the
    // list would go empty; the getter's results must survive as-is.
    expect(instance.filteredOptions).toEqual([{ value: 'fixed', label: 'Fixed' }]);
  });

  // Focus must never land on a disabled option after filtering: Enter would
  // submit an unselectable value.
  test('clears focus when filtering leaves a disabled option first', () => {
    const instance = new AutocompletePrompt({
      input,
      output,
      render: () => 'foo',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'zebra', label: 'Zebra', disabled: true },
      ],
    });

    instance.prompt();

    input.emit('keypress', 'z', { name: 'z' });

    expect(instance.filteredOptions).toEqual([{ value: 'zebra', label: 'Zebra', disabled: true }]);
    expect(instance.focusedValue).toBeUndefined();
    expect(instance.selectedValues).toEqual([]);
  });

  // Upstream #485: Tab with an empty input copies the placeholder into the
  // input so Enter can confirm it.
  describe('placeholder', () => {
    test('Tab fills input with a matching placeholder', async () => {
      const instance = new AutocompletePrompt({
        input,
        output,
        render: () => 'foo',
        options: testOptions,
        placeholder: 'banana',
      });

      const promise = instance.prompt();
      input.emit('keypress', '\t', { name: 'tab' });
      input.emit('keypress', '', { name: 'return' });
      const result = await promise;

      expect(result).to.equal('banana');
    });

    test('Tab ignores a placeholder that matches no option', async () => {
      const instance = new AutocompletePrompt({
        input,
        output,
        render: () => 'foo',
        options: testOptions,
        placeholder: 'Type to search...',
      });

      const promise = instance.prompt();
      input.emit('keypress', '\t', { name: 'tab' });
      input.emit('keypress', '', { name: 'return' });
      const result = await promise;

      // Input stayed empty, so Enter submits the first option.
      expect(result).to.equal('apple');
    });
  });
});
