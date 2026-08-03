import { it, expect, describe } from 'vitest';

import { VariableInterpolator } from '../../../src/config/variable-interpolator.js';
import { ConditionEvaluator, ConditionEvaluationError } from '../../../src/config/condition-evaluator.js';

import type { VariableContext } from '../../../src/config/types.js';

describe('ConditionEvaluator (defect #2)', () => {
  const interpolator = new VariableInterpolator();
  const evaluator = new ConditionEvaluator(interpolator);

  const evalWith = (condition: string, context: VariableContext = {}) =>
    evaluator.evaluate(condition, context);

  describe('bare truthiness (legacy behaviour preserved)', () => {
    it("treats 'true' and '1' as true", () => {
      expect(evalWith('${vars.f}', { vars: { f: 'true' } })).toBe(true);
      expect(evalWith('${vars.f}', { vars: { f: '1' } })).toBe(true);
      expect(evalWith('true', {})).toBe(true);
    });

    it("treats 'false', '0' and '' as false", () => {
      expect(evalWith('${vars.f}', { vars: { f: 'false' } })).toBe(false);
      expect(evalWith('${vars.f}', { vars: { f: '0' } })).toBe(false);
      expect(evalWith('${vars.f}', { vars: { f: '' } })).toBe(false);
      expect(evalWith('false', {})).toBe(false);
    });

    it('handles boolean and numeric variable values', () => {
      expect(evalWith('${vars.f}', { vars: { f: true } })).toBe(true);
      expect(evalWith('${vars.f}', { vars: { f: 0 } })).toBe(false);
      expect(evalWith('${vars.f}', { vars: { f: 7 } })).toBe(true);
    });
  });

  describe('comparison operators', () => {
    const context: VariableContext = { vars: { env: 'production', count: 5, version: '2' } };

    it('evaluates string equality', () => {
      expect(evalWith("${vars.env} == 'production'", context)).toBe(true);
      expect(evalWith("${vars.env} == 'staging'", context)).toBe(false);
      expect(evalWith('${vars.env} == "production"', context)).toBe(true);
    });

    it('evaluates inequality', () => {
      expect(evalWith("${vars.env} != 'staging'", context)).toBe(true);
      expect(evalWith("${vars.env} != 'production'", context)).toBe(false);
    });

    it('evaluates numeric comparisons with numbers and numeric strings', () => {
      expect(evalWith('${vars.count} > 3', context)).toBe(true);
      expect(evalWith('${vars.count} < 3', context)).toBe(false);
      expect(evalWith('${vars.count} >= 5', context)).toBe(true);
      expect(evalWith('${vars.count} <= 4', context)).toBe(false);
      expect(evalWith('${vars.version} >= 2', context)).toBe(true);
    });

    it('compares numeric strings numerically for equality', () => {
      expect(evalWith('${vars.count} == 5', context)).toBe(true);
      expect(evalWith("${vars.count} == '5'", context)).toBe(true);
    });

    it('compares booleans against true/false literals', () => {
      expect(evalWith('${vars.on} == true', { vars: { on: true } })).toBe(true);
      expect(evalWith("${vars.on} == 'true'", { vars: { on: true } })).toBe(true);
      expect(evalWith('${vars.on} == false', { vars: { on: true } })).toBe(false);
    });

    it('supports comparison against bare words', () => {
      expect(evalWith('${vars.env} == production', context)).toBe(true);
    });

    it('rejects relational operators on non-numeric operands', () => {
      expect(() => evalWith("${vars.env} > 'abc'", context)).toThrow(ConditionEvaluationError);
    });
  });

  describe('logical operators and grouping', () => {
    const context: VariableContext = { vars: { a: 'yes', n: 10 } };

    it('evaluates && and ||', () => {
      expect(evalWith("${vars.a} == 'yes' && ${vars.n} > 5", context)).toBe(true);
      expect(evalWith("${vars.a} == 'no' && ${vars.n} > 5", context)).toBe(false);
      expect(evalWith("${vars.a} == 'no' || ${vars.n} > 5", context)).toBe(true);
      expect(evalWith("${vars.a} == 'no' || ${vars.n} > 50", context)).toBe(false);
    });

    it('evaluates negation', () => {
      expect(evalWith("!(${vars.a} == 'no')", context)).toBe(true);
      expect(evalWith('!true', {})).toBe(false);
    });

    it('respects parentheses', () => {
      expect(evalWith("(${vars.a} == 'no' || ${vars.n} > 5) && true", context)).toBe(true);
      expect(evalWith("${vars.a} == 'no' || (${vars.n} > 5 && false)", context)).toBe(false);
    });

    it('short-circuits so guarded references are not resolved', () => {
      // vars.maybe is undefined — must not be touched when the left side decides
      expect(evalWith("${vars.a} == 'yes' || ${vars.maybe} == 'x'", context)).toBe(true);
      expect(evalWith("${vars.a} == 'no' && ${vars.maybe} == 'x'", context)).toBe(false);
    });
  });

  describe('interpolated string templates', () => {
    it('interpolates variables inside quoted strings', () => {
      const context: VariableContext = { vars: { stage: 'prod' } };
      expect(evalWith("'${vars.stage}-eu' == 'prod-eu'", context)).toBe(true);
    });
  });

  describe('failure modes — never silently false', () => {
    it('throws for an undefined variable reference', () => {
      expect(() => evalWith('${vars.undefined_flag}', { vars: {} })).toThrow(ConditionEvaluationError);
      expect(() => evalWith('${vars.undefined_flag}', { vars: {} })).toThrow(/undefined_flag/);
    });

    it('supports defaults for optional variables', () => {
      expect(evalWith('${vars.optional:false}', { vars: {} })).toBe(false);
      expect(evalWith('${vars.optional:true}', { vars: {} })).toBe(true);
    });

    it('throws for malformed expressions', () => {
      expect(() => evalWith('${vars.a} ==', { vars: { a: 1 } })).toThrow(ConditionEvaluationError);
      expect(() => evalWith('a = b', {})).toThrow(/use '=='/);
      expect(() => evalWith("'unterminated", {})).toThrow(/unterminated string/);
      expect(() => evalWith('${vars.broken', {})).toThrow(/unterminated variable/);
      expect(() => evalWith('(true', {})).toThrow(/closing/);
      expect(() => evalWith('', {})).toThrow(/empty condition/);
      expect(() => evalWith('1 2', {})).toThrow(ConditionEvaluationError);
    });

    it('wraps resolution failures in ConditionEvaluationError with the condition text', () => {
      try {
        evalWith("${vars.nope} == 'x'", { vars: {} });
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConditionEvaluationError);
        expect((error as ConditionEvaluationError).condition).toBe("${vars.nope} == 'x'");
      }
    });
  });
});
