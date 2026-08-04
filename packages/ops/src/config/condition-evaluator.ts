/**
 * Safe conditional expression evaluator for task `when:` clauses.
 *
 * Supported syntax:
 * - Comparisons: ==, !=, <, <=, >, >=
 * - Logical operators: &&, ||, ! (with short-circuit evaluation)
 * - Parentheses for grouping
 * - Literals: numbers, true/false, single- or double-quoted strings, bare words
 * - Variable references: ${vars.x}, ${params.x}, ${env.X}, ${secrets.x}
 *
 * The expression is tokenized and parsed explicitly — no eval / new Function is
 * ever applied to user input. Unresolvable variables and malformed expressions
 * throw ConditionEvaluationError so a broken condition can never be mistaken
 * for "condition is false".
 */

import type { VariableContext } from './types.js';
import type { VariableInterpolator } from './variable-interpolator.js';

type ComparisonOp = '==' | '!=' | '<' | '<=' | '>' | '>=';
type LogicalOp = '&&' | '||';

type Token =
  | { type: 'op'; value: ComparisonOp | LogicalOp | '!' }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'literal'; value: string | number | boolean }
  | { type: 'template'; value: string }
  | { type: 'var'; inner: string; raw: string };

type ExprNode =
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'template'; value: string }
  | { kind: 'var'; inner: string; raw: string }
  | { kind: 'not'; operand: ExprNode }
  | { kind: 'logical'; op: LogicalOp; left: ExprNode; right: ExprNode }
  | { kind: 'compare'; op: ComparisonOp; left: ExprNode; right: ExprNode };

interface ParserState {
  tokens: Token[];
  pos: number;
  condition: string;
}

const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;
const WORD_STOP_CHARS = new Set([' ', '\t', '\r', '\n', '(', ')', '<', '>', '=', '!', '&', '|', "'", '"', '$']);

/**
 * Error thrown when a `when:` condition cannot be evaluated — either because
 * the expression is malformed or because a referenced variable cannot be
 * resolved. Distinguishable from step execution errors so callers never treat
 * an unevaluable condition as an ordinary command failure (or as "false").
 */
export class ConditionEvaluationError extends Error {
  constructor(message: string, public readonly condition: string) {
    super(`Cannot evaluate condition '${condition}': ${message}`);
    this.name = 'ConditionEvaluationError';
  }
}

export class ConditionEvaluator {
  constructor(private interpolator: VariableInterpolator) { }

  /**
   * Evaluate a condition expression against the given variable context.
   *
   * @throws {ConditionEvaluationError} for malformed expressions or unresolvable variables
   */
  evaluate(condition: string, context: VariableContext): boolean {
    const trimmed = condition.trim();
    if (!trimmed) {
      throw new ConditionEvaluationError('empty condition expression', condition);
    }

    const tokens = this.tokenize(trimmed, condition);
    const state: ParserState = { tokens, pos: 0, condition };
    const node = this.parseOr(state);

    if (state.pos < tokens.length) {
      throw new ConditionEvaluationError(
        `unexpected '${this.describeToken(tokens[state.pos]!)}' after end of expression`,
        condition
      );
    }

    try {
      return this.truthy(this.evalNode(node, context, condition));
    } catch (error) {
      if (error instanceof ConditionEvaluationError) {
        throw error;
      }
      throw new ConditionEvaluationError(error instanceof Error ? error.message : String(error), condition);
    }
  }

  // Tokenizer

  private tokenize(source: string, condition: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    const n = source.length;

    while (i < n) {
      const ch = source[i]!;

      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        i++;
        continue;
      }

      if (ch === '(') {
        tokens.push({ type: 'lparen' });
        i++;
        continue;
      }

      if (ch === ')') {
        tokens.push({ type: 'rparen' });
        i++;
        continue;
      }

      const two = source.slice(i, i + 2);
      if (two === '&&' || two === '||' || two === '==' || two === '!=' || two === '<=' || two === '>=') {
        tokens.push({ type: 'op', value: two });
        i += 2;
        continue;
      }

      if (ch === '<' || ch === '>' || ch === '!') {
        tokens.push({ type: 'op', value: ch });
        i++;
        continue;
      }

      if (ch === '=' || ch === '&' || ch === '|') {
        const hint = ch === '=' ? " (use '==' for comparison)" : ` (use '${ch}${ch}')`;
        throw new ConditionEvaluationError(`unexpected '${ch}' at position ${i}${hint}`, condition);
      }

      if (ch === "'" || ch === '"') {
        const end = source.indexOf(ch, i + 1);
        if (end === -1) {
          throw new ConditionEvaluationError(`unterminated string starting at position ${i}`, condition);
        }
        const content = source.slice(i + 1, end);
        if (this.interpolator.hasVariables(content)) {
          tokens.push({ type: 'template', value: content });
        } else {
          tokens.push({ type: 'literal', value: content });
        }
        i = end + 1;
        continue;
      }

      if (ch === '$' && source[i + 1] === '{') {
        const end = source.indexOf('}', i + 2);
        if (end === -1) {
          throw new ConditionEvaluationError(`unterminated variable reference starting at position ${i}`, condition);
        }
        tokens.push({ type: 'var', inner: source.slice(i + 2, end), raw: source.slice(i, end + 1) });
        i = end + 1;
        continue;
      }

      // Bare word (number, boolean, or unquoted string)
      let j = i;
      while (j < n && !WORD_STOP_CHARS.has(source[j]!)) {
        j++;
      }
      const word = source.slice(i, j);
      if (!word) {
        throw new ConditionEvaluationError(`unexpected character '${ch}' at position ${i}`, condition);
      }
      i = j;

      if (word === 'true') {
        tokens.push({ type: 'literal', value: true });
      } else if (word === 'false') {
        tokens.push({ type: 'literal', value: false });
      } else if (NUMBER_PATTERN.test(word)) {
        tokens.push({ type: 'literal', value: Number(word) });
      } else {
        tokens.push({ type: 'literal', value: word });
      }
    }

    return tokens;
  }

  // Parser (recursive descent, precedence: || < && < comparison < ! < primary)

  private parseOr(state: ParserState): ExprNode {
    let left = this.parseAnd(state);

    while (this.peekOp(state) === '||') {
      state.pos++;
      const right = this.parseAnd(state);
      left = { kind: 'logical', op: '||', left, right };
    }

    return left;
  }

  private parseAnd(state: ParserState): ExprNode {
    let left = this.parseComparison(state);

    while (this.peekOp(state) === '&&') {
      state.pos++;
      const right = this.parseComparison(state);
      left = { kind: 'logical', op: '&&', left, right };
    }

    return left;
  }

  private parseComparison(state: ParserState): ExprNode {
    const left = this.parseUnary(state);
    const op = this.peekOp(state);

    if (op === '==' || op === '!=' || op === '<' || op === '<=' || op === '>' || op === '>=') {
      state.pos++;
      const right = this.parseUnary(state);
      return { kind: 'compare', op, left, right };
    }

    return left;
  }

  private parseUnary(state: ParserState): ExprNode {
    if (this.peekOp(state) === '!') {
      state.pos++;
      return { kind: 'not', operand: this.parseUnary(state) };
    }

    return this.parsePrimary(state);
  }

  private parsePrimary(state: ParserState): ExprNode {
    const token = state.tokens[state.pos];

    if (!token) {
      throw new ConditionEvaluationError('unexpected end of expression', state.condition);
    }

    if (token.type === 'lparen') {
      state.pos++;
      const node = this.parseOr(state);
      const closing = state.tokens[state.pos];
      if (!closing || closing.type !== 'rparen') {
        throw new ConditionEvaluationError("missing closing ')'", state.condition);
      }
      state.pos++;
      return node;
    }

    if (token.type === 'literal') {
      state.pos++;
      return { kind: 'literal', value: token.value };
    }

    if (token.type === 'template') {
      state.pos++;
      return { kind: 'template', value: token.value };
    }

    if (token.type === 'var') {
      state.pos++;
      return { kind: 'var', inner: token.inner, raw: token.raw };
    }

    throw new ConditionEvaluationError(`unexpected '${this.describeToken(token)}'`, state.condition);
  }

  private peekOp(state: ParserState): string | undefined {
    const token = state.tokens[state.pos];
    return token && token.type === 'op' ? token.value : undefined;
  }

  private describeToken(token: Token): string {
    switch (token.type) {
      case 'op':
        return token.value;
      case 'lparen':
        return '(';
      case 'rparen':
        return ')';
      case 'literal':
        return String(token.value);
      case 'template':
        return `'${token.value}'`;
      case 'var':
        return token.raw;
      default:
        return 'token';
    }
  }

  // Evaluator

  private evalNode(node: ExprNode, context: VariableContext, condition: string): unknown {
    switch (node.kind) {
      case 'literal':
        return node.value;

      case 'template':
        return this.interpolator.interpolate(node.value, context);

      case 'var':
        return this.interpolator.resolveValue(node.inner, context);

      case 'not':
        return !this.truthy(this.evalNode(node.operand, context, condition));

      case 'logical': {
        const left = this.truthy(this.evalNode(node.left, context, condition));
        if (node.op === '&&') {
          return left ? this.truthy(this.evalNode(node.right, context, condition)) : false;
        }
        return left ? true : this.truthy(this.evalNode(node.right, context, condition));
      }

      case 'compare': {
        const left = this.evalNode(node.left, context, condition);
        const right = this.evalNode(node.right, context, condition);
        return this.compare(node.op, left, right, condition);
      }

      default: {
        const unreachable: never = node;
        throw new ConditionEvaluationError(`unsupported expression node: ${String(unreachable)}`, condition);
      }
    }
  }

  private compare(op: ComparisonOp, left: unknown, right: unknown, condition: string): boolean {
    if (op === '==') {
      return this.looseEquals(left, right);
    }
    if (op === '!=') {
      return !this.looseEquals(left, right);
    }

    if (!this.isNumberLike(left) || !this.isNumberLike(right)) {
      throw new ConditionEvaluationError(
        `operator '${op}' requires numeric operands, got '${String(left)}' and '${String(right)}'`,
        condition
      );
    }

    const a = Number(left);
    const b = Number(right);

    switch (op) {
      case '<':
        return a < b;
      case '<=':
        return a <= b;
      case '>':
        return a > b;
      case '>=':
        return a >= b;
      default: {
        const unreachable: never = op;
        throw new ConditionEvaluationError(`unsupported operator: ${String(unreachable)}`, condition);
      }
    }
  }

  private looseEquals(left: unknown, right: unknown): boolean {
    if (this.isNumberLike(left) && this.isNumberLike(right)) {
      return Number(left) === Number(right);
    }
    return String(left) === String(right);
  }

  private isNumberLike(value: unknown): boolean {
    if (typeof value === 'number') {
      return !Number.isNaN(value);
    }
    if (typeof value === 'string') {
      return value.trim() !== '' && !Number.isNaN(Number(value));
    }
    return false;
  }

  private truthy(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0 && !Number.isNaN(value);
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized !== '' && normalized !== 'false' && normalized !== '0';
    }
    if (value === null || value === undefined) {
      return false;
    }
    return true;
  }
}
