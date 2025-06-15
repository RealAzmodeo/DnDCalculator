// src/engines/utils/diceUtils.ts
import type { DiceDefinition } from '../../../types';

export interface ParsedDice {
  count: number;
  faces: number;
  modifier: number;
  rawString: string;
}

/**
 * Parses a dice string (e.g., "1d8", "2d6+3", "1d4-1", "10") into its components.
 * @param diceString The string representation of the dice.
 * @returns A ParsedDice object or a default if parsing fails.
 */
export const parseDiceString = (diceString: string): ParsedDice => {
  const originalString = diceString;
  diceString = (diceString || "").toLowerCase().trim();
  
  if (!diceString.includes('d')) {
    const flatValue = parseInt(diceString, 10);
    if (!isNaN(flatValue)) {
      return { count: 0, faces: 0, modifier: flatValue, rawString: originalString };
    }
  }

  const match = diceString.match(/(\d*)d(\d+)\s*(([+-])\s*(\d+))?/);

  if (!match) {
    const modOnlyMatch = diceString.match(/^([+-])\s*(\d+)$/);
    if (modOnlyMatch) {
      const modSign = modOnlyMatch[1];
      const modVal = parseInt(modOnlyMatch[2], 10);
      return { count: 0, faces: 0, modifier: modSign === '+' ? modVal : -modVal, rawString: originalString };
    }
     const simpleNumber = parseInt(diceString, 10);
     if(!isNaN(simpleNumber)) {
        return { count: 0, faces: 0, modifier: simpleNumber, rawString: originalString };
     }

    console.warn(`Invalid dice string: ${originalString}. Defaulting to 1d6.`);
    return { count: 1, faces: 6, modifier: 0, rawString: originalString }; // Default or error case
  }

  const count = match[1] ? parseInt(match[1], 10) : 1;
  const faces = parseInt(match[2], 10);
  let modifier = 0;

  if (match[3]) { 
    const sign = match[4];
    const modValue = parseInt(match[5], 10);
    modifier = sign === '+' ? modValue : -modValue;
  }

  return { count, faces, modifier, rawString: originalString };
};

/**
 * Rolls a single die with the specified number of faces.
 * @param faces The number of faces on the die.
 * @returns A random number between 1 and faces (inclusive).
 */
export const rollSingleDie = (faces: number): number => {
  if (faces <= 0) return 0; 
  return Math.floor(Math.random() * faces) + 1;
};

/**
 * Rolls dice based on a ParsedDice object.
 * @param parsedDice The ParsedDice object.
 * @returns An object containing the array of individual rolls and their total sum (including modifier).
 */
export const rollParsedDice = (parsedDice: ParsedDice): { rolls: number[], total: number } => {
  const rolls: number[] = [];
  let sum = 0;

  for (let i = 0; i < parsedDice.count; i++) {
    if (parsedDice.faces > 0) { // Only roll if there are faces (e.g. not for "5")
        const roll = rollSingleDie(parsedDice.faces);
        rolls.push(roll);
        sum += roll;
    }
  }
  sum += parsedDice.modifier;
  return { rolls, total: sum };
};

/**
 * Rolls dice based on a DiceDefinition and count.
 * @param diceDef The DiceDefinition object.
 * @param count The number of dice to roll.
 * @param modifier An optional flat modifier to add to the total.
 * @returns An object containing the array of individual rolls and their total sum.
 */
export const rollDiceFromDefinition = (diceDef: DiceDefinition, count: number, modifier: number = 0): { rolls: number[], total: number } => {
    const rolls: number[] = [];
    let sum = 0;
    for (let i = 0; i < count; i++) {
        const roll = rollSingleDie(diceDef.faces);
        rolls.push(roll);
        sum += roll;
    }
    sum += modifier;
    return { rolls, total: sum };
};

/**
 * Rolls a d20, considering advantage and disadvantage.
 * @param hasAdvantage Boolean indicating if advantage applies.
 * @param hasDisadvantage Boolean indicating if disadvantage applies.
 * @returns An object with individual rolls and the chosen roll.
 */
export const rollD20WithAdvantageDisadvantage = (hasAdvantage: boolean, hasDisadvantage: boolean): { rolls: number[], chosenRoll: number } => {
    const d20Roll1 = rollSingleDie(20);
    
    // If neither or both advantage and disadvantage apply, it's a straight roll
    if (hasAdvantage === hasDisadvantage) {
        return { rolls: [d20Roll1], chosenRoll: d20Roll1 };
    }

    const d20Roll2 = rollSingleDie(20);
    if (hasAdvantage) {
        return { rolls: [d20Roll1, d20Roll2], chosenRoll: Math.max(d20Roll1, d20Roll2) };
    } else { // hasDisadvantage
        return { rolls: [d20Roll1, d20Roll2], chosenRoll: Math.min(d20Roll1, d20Roll2) };
    }
};
