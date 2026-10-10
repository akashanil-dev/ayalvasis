export type Operator = '|' | '>' | '>>' | '<' | '&&' | '||' | ';';
export type QuoteMode = 'none' | 'single' | 'double';

export interface WordSegment {
  type: 'text' | 'variable';
  value: string;
  quoted: QuoteMode;
}

export interface ParsedWord {
  segments: WordSegment[];
}

export interface ParsedCommand {
  words: ParsedWord[];
  redirections: { op: '>' | '>>' | '<'; word: ParsedWord }[];
}

export interface ParsedList {
  pipelines: { commands: ParsedCommand[] }[];
  operators: ('&&' | '||' | ';')[];
}

type Token =
  | { kind: 'word'; word: ParsedWord }
  | { kind: 'operator'; value: Operator };

export function parse(line: string): ParsedList {
  const tokens = tokenize(line);
  if (!tokens.length) return { pipelines: [], operators: [] };

  const list: ParsedList = { pipelines: [], operators: [] };
  let pipeline = { commands: [] as ParsedCommand[] };
  let command: ParsedCommand = { words: [], redirections: [] };
  let lastWasControlOperator = false;

  const finishCommand = (token = 'newline') => {
    if (!command.words.length) throw syntax(`syntax error near unexpected token '${token}'`);
    pipeline.commands.push(command);
    command = { words: [], redirections: [] };
  };
  const finishPipeline = (token?: string) => {
    finishCommand(token);
    list.pipelines.push(pipeline);
    pipeline = { commands: [] };
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token.kind === 'word') {
      command.words.push(token.word);
      lastWasControlOperator = false;
      continue;
    }
    if (token.value === '>' || token.value === '>>' || token.value === '<') {
      const next = tokens[++index];
      if (!next || next.kind !== 'word') {
        throw syntax(`syntax error near unexpected token '${next?.kind === 'operator' ? next.value : 'newline'}'`);
      }
      command.redirections.push({ op: token.value, word: next.word });
      continue;
    }
    if (token.value === '|') {
      finishCommand('|');
      lastWasControlOperator = false;
      continue;
    }
    if (!command.words.length) {
      const repeated = token.value === ';' && lastWasControlOperator ? ';;' : token.value;
      throw syntax(`syntax error near unexpected token '${repeated}'`);
    }
    finishPipeline();
    list.operators.push(token.value);
    lastWasControlOperator = true;
  }

  finishPipeline();
  if (list.operators.length !== list.pipelines.length - 1) throw syntax('syntax error');
  return list;
}

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let word: ParsedWord = { segments: [] };
  let text = '';
  let textQuote: QuoteMode = 'none';
  let started = false;
  let quote: 'single' | 'double' | undefined;

  const flushText = () => {
    if (text) word.segments.push({ type: 'text', value: text, quoted: textQuote });
    text = '';
  };
  const flushWord = () => {
    flushText();
    if (started) tokens.push({ kind: 'word', word });
    word = { segments: [] };
    started = false;
    textQuote = 'none';
  };
  const addText = (value: string, quoted: QuoteMode) => {
    if (text && textQuote !== quoted) flushText();
    textQuote = quoted;
    text += value;
    started = true;
  };
  const addVariable = (name: string, quoted: QuoteMode) => {
    flushText();
    word.segments.push({ type: 'variable', value: name, quoted });
    started = true;
  };

  for (let index = 0; index < line.length;) {
    const character = line[index]!;
    if (quote === 'single') {
      if (character === "'") quote = undefined;
      else addText(character, 'single');
      index += 1;
      continue;
    }
    if (quote === 'double') {
      if (character === '"') {
        quote = undefined;
        index += 1;
      } else if (character === '\\' && line[index + 1] !== undefined) {
        const next = line[index + 1]!;
        if ('$`"\\\n'.includes(next)) {
          if (next !== '\n') addText(next, 'double');
          index += 2;
        } else {
          addText('\\', 'double');
          index += 1;
        }
      } else if (character === '$') {
        const variable = variableAt(line, index);
        if (!variable) {
          addText('$', 'double');
          index += 1;
        }
        else {
          addVariable(variable.name, 'double');
          index = variable.next;
        }
      } else {
        addText(character, 'double');
        index += 1;
      }
      continue;
    }

    if (/\s/.test(character)) {
      flushWord();
      index += 1;
    } else if (character === "'") {
      quote = 'single';
      started = true;
      index += 1;
    } else if (character === '"') {
      quote = 'double';
      started = true;
      index += 1;
    } else if (character === '\\') {
      if (line[index + 1] === undefined) throw syntax('unexpected end of file');
      addText(line[index + 1]!, 'double');
      index += 2;
    } else if (character === '$') {
      const variable = variableAt(line, index);
      if (!variable) {
        addText('$', 'none');
        index += 1;
      }
      else {
        addVariable(variable.name, 'none');
        index = variable.next;
      }
    } else {
      const two = line.slice(index, index + 2);
      if (two === '&&' || two === '||' || two === '>>') {
        flushWord();
        tokens.push({ kind: 'operator', value: two });
        index += 2;
      } else if ('|><;'.includes(character)) {
        flushWord();
        tokens.push({ kind: 'operator', value: character as Operator });
        index += 1;
      } else {
        addText(character, 'none');
        index += 1;
      }
    }
  }

  if (quote) throw syntax('unexpected EOF while looking for matching quote');
  flushWord();
  return tokens;
}

function variableAt(line: string, index: number): { name: string; next: number } | undefined {
  if (line[index + 1] === '?') return { name: '?', next: index + 2 };
  if (line[index + 1] === '{') {
    const end = line.indexOf('}', index + 2);
    if (end < 0) throw syntax('${: bad substitution', 1);
    const name = line.slice(index + 2, end);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw syntax(`\${${name}}: bad substitution`, 1);
    }
    return { name, next: end + 1 };
  }
  const match = line.slice(index + 1).match(/^[A-Za-z_][A-Za-z0-9_]*/);
  return match ? { name: match[0], next: index + 1 + match[0].length } : undefined;
}

function syntax(message: string, code = 2): Error & { code: number } {
  const error = new Error(`bash: ${message}`) as Error & { code: number };
  error.code = code;
  return error;
}
