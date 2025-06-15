// src/engines/DiceRoller.ts
import * as GameTypes from '../../types';
import * as DiceUtils from './utils/diceUtils';
import { getItemById } from '../services/dataService'; // For fetching DiceDefinition

export class DiceRoller {
    /**
     * Rolls a d20, applies modifiers, and determines critical success/miss.
     * @param baseModifier The sum of all static modifiers to the roll (e.g., ability mod + proficiency + other bonuses).
     * @param context Specifies if advantage or disadvantage applies, and the type of roll.
     * @returns An object with the final result, natural roll(s), chosen natural roll, and critical hit/miss status.
     */
    public static rollD20(
        baseModifier: number = 0,
        context: GameTypes.D20RollContext
    ): { result: number; naturalRolls: number[]; chosenNaturalRoll: number; isCriticalHit: boolean; isCriticalMiss: boolean } {
        const { rolls, chosenRoll } = DiceUtils.rollD20WithAdvantageDisadvantage(context.hasAdvantage, context.hasDisadvantage);
        
        const result = chosenRoll + baseModifier;

        let isCriticalHit = false;
        let isCriticalMiss = false;

        if (context.rollType === 'Attack' || context.rollType === 'SavingThrow' || context.rollType === 'AbilityCheck') {
            if (chosenRoll === 20) {
                isCriticalHit = true;
            }
            if (chosenRoll === 1) {
                isCriticalMiss = true;
            }
        }
        // For Initiative or OtherD20, criticals might not apply in the same way or are handled by specific rules.

        return {
            result,
            naturalRolls: rolls,
            chosenNaturalRoll: chosenRoll,
            isCriticalHit,
            isCriticalMiss,
        };
    }

    /**
     * Rolls a specified number of a given type of die with a static modifier.
     * @param diceCount Number of dice to roll.
     * @param diceID_Ref Reference to the DiceDefinition ID (e.g., "D6").
     * @param staticModifier A flat modifier to add to the total.
     * @returns An object with the total result and an array of individual rolls.
     */
    public static async rollGenericDice(
        diceCount: number,
        diceID_Ref: string,
        staticModifier: number = 0
    ): Promise<{ result: number; individualRolls: number[] }> {
        try {
            const diceDef = await getItemById(diceID_Ref) as GameTypes.DiceDefinition;
            if (!diceDef || typeof diceDef.faces !== 'number' || diceDef.faces <= 0) {
                console.error(`Invalid DiceDefinition for ID: ${diceID_Ref}. Defaulting to 1d6.`);
                const defaultRoll = DiceUtils.rollDiceFromDefinition({diceID: "D6_DEFAULT", faces: 6}, diceCount, staticModifier);
                return { result: defaultRoll.total, individualRolls: defaultRoll.rolls };
            }

            const rollResult = DiceUtils.rollDiceFromDefinition(diceDef, diceCount, staticModifier);
            return { result: rollResult.total, individualRolls: rollResult.rolls };

        } catch (error) {
            console.error(`Error fetching DiceDefinition for ${diceID_Ref}:`, error);
            // Fallback or rethrow, here we fallback to d6
            const defaultRoll = DiceUtils.rollDiceFromDefinition({diceID: "D6_FALLBACK", faces: 6}, diceCount, staticModifier);
            return { result: defaultRoll.total, individualRolls: defaultRoll.rolls };
        }
    }
    
    /**
     * Rolls damage based on a list of DamageRoll definitions, handling critical hits.
     * Bonus formulas are expected to be resolved *before* calling this method and included in `damageRoll.bonusDamage`.
     * @param damageRolls_List Array of DamageRoll definitions.
     * @param isCriticalHit Boolean indicating if the attack was a critical hit.
     * // @param creatureContext Optional context for resolving formula-based bonuses. (REMOVED - handled upstream)
     * @returns An object with total damage and a breakdown by damage type.
     */
    public static async rollSpecificDamage(
        damageRolls_List: GameTypes.DamageRoll[],
        isCriticalHit: boolean
        // creatureContext?: GameTypes.CreatureContextForDamage // Removed, formulas resolved before this call
    ): Promise<{ totalDamage: number; damageBreakdown: GameTypes.RolledDamageInstance[] }> {
        let totalDamage = 0;
        const damageBreakdown: GameTypes.RolledDamageInstance[] = [];

        for (const damageRoll of damageRolls_List) {
            // Ensure dice and damageType are resolved if they exist as references
            const diceDef = damageRoll.dice 
                ? damageRoll.dice 
                : (await getItemById(damageRoll.diceID_Ref) as GameTypes.DiceDefinition);
            
            const damageTypeDef = damageRoll.damageType
                ? damageRoll.damageType
                : (await getItemById(damageRoll.damageTypeID_Ref) as GameTypes.DamageTypeDefinition);


            if (!diceDef || diceDef.faces <= 0) {
                console.warn(`Invalid dice definition for ${damageRoll.diceID_Ref} in damage roll. Skipping this part.`);
                continue;
            }
            if (!damageTypeDef) {
                console.warn(`Invalid damage type definition for ${damageRoll.damageTypeID_Ref} in damage roll. Skipping this part.`);
                continue;
            }
            
            const numDiceToRoll = isCriticalHit ? damageRoll.diceCount * 2 : damageRoll.diceCount;
            const rolls: number[] = [];
            let currentDiceTotal = 0;

            for (let i = 0; i < numDiceToRoll; i++) {
                const roll = DiceUtils.rollSingleDie(diceDef.faces);
                rolls.push(roll);
                currentDiceTotal += roll;
            }
            
            // bonusDamageFormula is now resolved *before* calling this method.
            // The result of that formula parsing is expected to be part of damageRoll.bonusDamage.
            const bonusDamage = damageRoll.bonusDamage || 0;

            const rawSubTotal = currentDiceTotal + bonusDamage;
            const subTotal = Math.max(0, rawSubTotal); // Damage can't be negative

            totalDamage += subTotal;
            damageBreakdown.push({
                sourceName: damageTypeDef.fullName || damageRoll.damageTypeID_Ref,
                typeID_Ref: damageRoll.damageTypeID_Ref,
                typeName: damageTypeDef.fullName,
                dice: `${damageRoll.diceCount}d${diceDef.faces}`, // Original dice, not doubled for display
                rolls: rolls,
                rawTotal: rawSubTotal, 
                modifiedTotal: subTotal, // After crit doubling and bonuses, before target defenses
                finalTotal: subTotal, // This will be adjusted by DamageApplicationEngine
                isCrit: isCriticalHit,
            });
        }

        return { totalDamage, damageBreakdown };
    }
}