import { describe, expect, it } from 'vitest';
import { parse } from './parser';

describe('parser', () => {
  it('keeps quote modes and variable references in word segments', () => {
    const parsed = parse(`echo plain '$HOME' "$HOME"`);
    expect(parsed.pipelines[0]!.commands[0]!.words[1]).toEqual({
      segments: [{ type: 'text', value: 'plain', quoted: 'none' }],
    });
    expect(parsed.pipelines[0]!.commands[0]!.words[2]).toEqual({
      segments: [{ type: 'text', value: '$HOME', quoted: 'single' }],
    });
    expect(parsed.pipelines[0]!.commands[0]!.words[3]).toEqual({
      segments: [{ type: 'variable', value: 'HOME', quoted: 'double' }],
    });
  });

  it('parses quotes, escapes, operators and redirections without expansion', () => {
    const parsed = parse(String.raw`echo "a b" c\ d | cat < in >> out && true || false; echo end`);
    expect(parsed.pipelines).toHaveLength(4);
    expect(parsed.operators).toEqual(['&&', '||', ';']);
    expect(parsed.pipelines[0]!.commands).toHaveLength(2);
    expect(parsed.pipelines[0]!.commands[1]!.redirections).toHaveLength(2);
  });

  it.each(['| ls', 'ls &&', 'echo >', 'echo "unterminated'])('rejects syntax: %s', (line) => {
    expect(() => parse(line)).toThrow(/^bash:/);
  });

  it('reports the unexpected token in common syntax errors', () => {
    expect(() => parse('echo a;;echo b')).toThrow("bash: syntax error near unexpected token ';;'");
    expect(() => parse('| ls')).toThrow("bash: syntax error near unexpected token '|'");
    expect(() => parse('echo a &&')).toThrow("bash: syntax error near unexpected token 'newline'");
  });

  it('terminates for every prefix of tricky input', { timeout: 1000 }, () => {
    const inputs = ['$', '"$', '${', '\\', "'", '"a\\', '$?$', '~$', 'a|', '>>', '&&&', ';;'];
    for (const input of inputs) {
      for (let length = 0; length <= input.length; length += 1) {
        try {
          parse(input.slice(0, length));
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    }
  });
});
