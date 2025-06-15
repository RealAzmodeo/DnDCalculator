// src/services/FormulaParser.ts
import * as GameTypes from '../../types';
import { CalculationService } from '../engines/CalculationService';

interface Token {
  type: 'NUMBER' | 'OPERATOR' | 'LEFT_PAREN' | 'RIGHT_PAREN';
  value: string | number;
}

export class FormulaParser {
  private static readonly OPERATORS: { [op: string]: { precedence: number; associativity: 'Left' | 'Right' } } = {
    '+': { precedence: 1, associativity: 'Left' },
    '-': { precedence: 1, associativity: 'Left' },
    '*': { precedence: 2, associativity: 'Left' },
    '/': { precedence: 2, associativity: 'Left' },
    // '^': { precedence: 3, associativity: 'Right' }, // Example for exponentiation
  };

  private static _isNumeric(str: string): boolean {
    return !isNaN(parseFloat(str)) && isFinite(Number(str));
  }

  private static _tokenize(formula: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    while (i < formula.length) {
      const char = formula[i];

      if (/\s/.test(char)) {
        i++;
        continue;
      }

      if (this._isNumeric(char) || (char === '.' && this._isNumeric(formula[i+1])) || (char === '-' && (tokens.length === 0 || ['OPERATOR', 'LEFT_PAREN'].includes(tokens[tokens.length-1].type)) && this._isNumeric(formula[i+1])) ) {
        // Handle numbers (including decimals and unary minus)
        let numStr = char;
        i++;
        // Check if it's a unary minus
        if (char === '-' && (tokens.length === 0 || ['OPERATOR', 'LEFT_PAREN'].includes(tokens[tokens.length-1].type))) {
            // It's a unary minus, look for subsequent digits
        } else if (char === '-') { // Binary minus
             tokens.push({ type: 'OPERATOR', value: char });
             continue;
        }


        while (i < formula.length && (this._isNumeric(formula[i]) || formula[i] === '.')) {
          numStr += formula[i];
          i++;
        }
        if (!this._isNumeric(numStr)) {
            throw new Error(`Invalid number token: ${numStr}`);
        }
        tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
        continue;
      }


      if (this.OPERATORS[char]) {
        tokens.push({ type: 'OPERATOR', value: char });
        i++;
        continue;
      }

      if (char === '(') {
        tokens.push({ type: 'LEFT_PAREN', value: char });
        i++;
        continue;
      }

      if (char === ')') {
        tokens.push({ type: 'RIGHT_PAREN', value: char });
        i++;
        continue;
      }
      throw new Error(`Unknown token: ${char} in formula "${formula}"`);
    }
    return tokens;
  }

  private static _infixToRpn(tokens: Token[]): Token[] {
    const outputQueue: Token[] = [];
    const operatorStack: Token[] = [];

    for (const token of tokens) {
      if (token.type === 'NUMBER') {
        outputQueue.push(token);
      } else if (token.type === 'OPERATOR') {
        const op1 = token.value as string;
        while (
          operatorStack.length > 0 &&
          operatorStack[operatorStack.length - 1].type === 'OPERATOR' &&
          ( (this.OPERATORS[operatorStack[operatorStack.length - 1].value as string].precedence > this.OPERATORS[op1].precedence) ||
            (this.OPERATORS[operatorStack[operatorStack.length - 1].value as string].precedence === this.OPERATORS[op1].precedence && this.OPERATORS[op1].associativity === 'Left')
          )
        ) {
          outputQueue.push(operatorStack.pop()!);
        }
        operatorStack.push(token);
      } else if (token.type === 'LEFT_PAREN') {
        operatorStack.push(token);
      } else if (token.type === 'RIGHT_PAREN') {
        while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type !== 'LEFT_PAREN') {
          outputQueue.push(operatorStack.pop()!);
        }
        if (operatorStack.length === 0 || operatorStack[operatorStack.length - 1].type !== 'LEFT_PAREN') {
          throw new Error('Mismatched parentheses.');
        }
        operatorStack.pop(); // Discard the LEFT_PAREN
      }
    }

    while (operatorStack.length > 0) {
      const topOp = operatorStack[operatorStack.length - 1];
      if (topOp.type === 'LEFT_PAREN' || topOp.type === 'RIGHT_PAREN') {
        throw new Error('Mismatched parentheses on stack.');
      }
      outputQueue.push(operatorStack.pop()!);
    }
    return outputQueue;
  }

  private static _evaluateRpn(rpnTokens: Token[]): number {
    const stack: number[] = [];

    for (const token of rpnTokens) {
      if (token.type === 'NUMBER') {
        stack.push(token.value as number);
      } else if (token.type === 'OPERATOR') {
        if (stack.length < 2) {
          throw new Error(`Insufficient operands for operator ${token.value}. Stack: ${stack.join(', ')}`);
        }
        const b = stack.pop()!;
        const a = stack.pop()!;
        switch (token.value) {
          case '+': stack.push(a + b); break;
          case '-': stack.push(a - b); break;
          case '*': stack.push(a * b); break;
          case '/':
            if (b === 0) throw new Error('Division by zero.');
            stack.push(a / b);
            break;
          // case '^': stack.push(Math.pow(a, b)); break; // Example for exponentiation
          default: throw new Error(`Unknown operator: ${token.value}`);
        }
      }
    }

    if (stack.length !== 1) {
      throw new Error(`Invalid RPN expression result. Stack: ${stack.join(', ')}`);
    }
    return stack[0];
  }

  public static parseAndEvaluate(
    formulaString: string,
    context: GameTypes.FormulaContext
  ): { value: number | null; error: string | null } {
    if (!formulaString || typeof formulaString !== 'string') {
      return { value: null, error: "Invalid formula string." };
    }
    if (!context || !context.actor) {
      return { value: null, error: "Invalid context or missing actor." };
    }

    let processedFormula = formulaString;

    // --- Keyword/Variable Resolution (existing logic) ---
    try {
      if (context.actor) {
        processedFormula = processedFormula.replace(/\bPROFICIENCY_BONUS\b/g, (context.actor.proficiencyBonus_Calculated || 0).toString());
        processedFormula = processedFormula.replace(/\bLEVEL\b/g, (context.actor.totalCharacterLevel || 0).toString());
        processedFormula = processedFormula.replace(/\bMAX_HP\b/g, (context.actor.maxHP_Calculated || 0).toString());
        processedFormula = processedFormula.replace(/\bCURRENT_HP\b/g, (context.actor.currentHP || 0).toString());

        processedFormula = processedFormula.replace(/\bABILITY_MODIFIER:([A-Z]{3})\b/g, (match, stat) => {
          const score = context.actor.abilityScores_Effective?.[stat.toUpperCase()] || context.actor.abilityScores_Base?.[stat.toUpperCase()] || 10;
          return CalculationService.getAbilityModifier(score).toString();
        });

        if (/\bSPELLCASTING_ABILITY_MODIFIER\b/.test(processedFormula)) {
          const spellAbilityRef = context.actor.spellcastingAbility_Ref;
          if (spellAbilityRef) {
            const score = context.actor.abilityScores_Effective?.[spellAbilityRef] || context.actor.abilityScores_Base?.[spellAbilityRef] || 10;
            processedFormula = processedFormula.replace(/\bSPELLCASTING_ABILITY_MODIFIER\b/g, CalculationService.getAbilityModifier(score).toString());
          } else {
            return { value: null, error: "SPELLCASTING_ABILITY_MODIFIER used but actor has no spellcastingAbility_Ref." };
          }
        }

        processedFormula = processedFormula.replace(/\bCLASS_LEVEL:([A-Z_0-9]+)\b/gi, (match, classId) => {
          const classEntry = context.actor.classLevels_List?.find(cl => cl.classID_Ref.toUpperCase() === classId.toUpperCase());
          return (classEntry?.level || 0).toString();
        });
      }

      if (context.target) {
        processedFormula = processedFormula.replace(/\bTARGET_ABILITY_MODIFIER:([A-Z]{3})\b/g, (match, stat) => {
          const score = context.target!.abilityScores_Effective?.[stat.toUpperCase()] || context.target!.abilityScores_Base?.[stat.toUpperCase()] || 10;
          return CalculationService.getAbilityModifier(score).toString();
        });
        processedFormula = processedFormula.replace(/\bTARGET_AC\b/g, (context.target.currentAC_Calculated || 10).toString());
        processedFormula = processedFormula.replace(/\bTARGET_MAX_HP\b/g, (context.target.maxHP_Calculated || 0).toString());
      } else if (/\bTARGET_/.test(processedFormula) && !/\bTARGET_/.test(formulaString)) {
         // This condition is tricky. If TARGET_ was in the original string and target is null, it's an error.
         // If TARGET_ appears *after* some replacement, that's a different kind of error (bad replacement).
         if (formulaString.includes("TARGET_")) {
            return { value: null, error: "Formula uses TARGET_ variable but no target provided in context." };
         }
      }


      const spellSlotLvlFromExecContext = context.executionContext?.spellSlotLevel;
      const spellLvlFromSpellDef = context.spell?.level;

      if (/\bSPELL_SLOT_LEVEL\b/.test(processedFormula)) {
        if (spellSlotLvlFromExecContext !== undefined) {
          processedFormula = processedFormula.replace(/\bSPELL_SLOT_LEVEL\b/g, spellSlotLvlFromExecContext.toString());
        } else if (spellLvlFromSpellDef !== undefined) {
          processedFormula = processedFormula.replace(/\bSPELL_SLOT_LEVEL\b/g, spellLvlFromSpellDef.toString());
        } else {
          return { value: null, error: "Formula uses SPELL_SLOT_LEVEL but no spellSlotLevel in executionContext or spell definition level in context." };
        }
      }
      
       // --- Function Evaluation ---
       // MAX, MIN, FLOOR, CEIL, ROUND, ABS
       const mathFunctions: { [key: string]: (args: number[]) => number } = {
        MAX: (args) => Math.max(...args),
        MIN: (args) => Math.min(...args),
        FLOOR: (args) => { if (args.length !== 1) throw new Error("FLOOR expects 1 argument."); return Math.floor(args[0]); },
        CEIL: (args) => { if (args.length !== 1) throw new Error("CEIL expects 1 argument."); return Math.ceil(args[0]); },
        ROUND: (args) => { if (args.length !== 1) throw new Error("ROUND expects 1 argument."); return Math.round(args[0]); },
        ABS: (args) => { if (args.length !== 1) throw new Error("ABS expects 1 argument."); return Math.abs(args[0]); },
      };

      for (const funcName in mathFunctions) {
        const regex = new RegExp(`${funcName}\\s*\\(([^)]+)\\)`, 'gi');
        processedFormula = processedFormula.replace(regex, (match, argsString) => {
          // Temporarily replace operators inside function args to avoid splitting numbers like "2 * -3"
          const tempArgsString = argsString.replace(/(\s*[+\-*/]\s*)-/g, '$1NEG');
          const args = tempArgsString.split(',')
            .map(s => parseFloat(s.trim().replace(/NEG/g, '-')));

          if (args.some(isNaN)) {
            // Check if failure is due to an unresolved variable inside function call
             if (/[A-Z_]+/i.test(argsString)) {
                 throw new Error(`Unresolved variable or invalid number in arguments for ${funcName}: ${argsString}`);
             }
            throw new Error(`Invalid numeric arguments for ${funcName}: ${argsString}`);
          }
          return mathFunctions[funcName](args).toString();
        });
      }

    } catch (e: any) {
      return { value: null, error: `Error during variable/function resolution: ${e.message}. Formula after partial processing: ${processedFormula}` };
    }

    // --- Arithmetic Evaluation using Shunting-yard and RPN ---
    try {
      // If after all replacements, the formula is just a number, parse it directly.
      if (this._isNumeric(processedFormula)) {
        return { value: parseFloat(processedFormula), error: null };
      }
      
      const tokens = this._tokenize(processedFormula);
      if (tokens.length === 0 && this._isNumeric(formulaString)) { // Edge case: original formula was just a number.
          return { value: parseFloat(formulaString), error: null };
      }
      if (tokens.length === 0 && !this._isNumeric(processedFormula)) {
          return { value: null, error: `Formula resolved to an empty string or non-numeric value after processing: "${processedFormula}". Original: "${formulaString}"`};
      }

      const rpnTokens = this._infixToRpn(tokens);
      const result = this._evaluateRpn(rpnTokens);
      
      if (isNaN(result) || !isFinite(result)) {
        return { value: null, error: `Evaluation resulted in NaN or Infinity. RPN: ${rpnTokens.map(t=>t.value).join(' ')}, Original: "${formulaString}"` };
      }
      return { value: result, error: null };

    } catch (e: any) {
      return { value: null, error: `Error during arithmetic evaluation: ${e.message}. Formula after keyword/func processing: "${processedFormula}", Original: "${formulaString}"` };
    }
  }
}
