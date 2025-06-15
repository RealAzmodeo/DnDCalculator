// src/engines/SavingThrowResolutionEngine.ts
import * as GameTypes from '../../types';
import { DiceRoller } from './DiceRoller';
import { CalculationService } from './CalculationService';

export class SavingThrowResolutionEngine {

    /**
     * Determines the outcome of a saving throw made by a target creature.
     * @param targetState The runtime state of the creature making the save.
     * @param abilityID_Ref The ability score ID used for the save (e.g., "DEX", "WIS").
     * @param dc The difficulty class (DC) of the saving throw.
     * @param situationalModifiers Any situational modifiers to the save (e.g., from spells or conditions).
     * @returns An object detailing the outcome of the saving throw.
     */
    public static async resolveSavingThrow(
        targetState: GameTypes.CreatureRuntimeState,
        abilityID_Ref: string,
        dc: number,
        situationalModifiers?: GameTypes.SituationalSaveModifiers
    ): Promise<{
        outcome: 'CriticalFailure' | 'Failure' | 'Success' | 'CriticalSuccess'; // Note: D&D 5e typically doesn't have critical success/failure on saves by default, but effects might specify.
        saveRollResult: number;
        d20NaturalRolls: number[];
        chosenNaturalRoll: number;
    }> {
        // 1. Calculate Target's Saving Throw Bonus
        const saveBonus = CalculationService.resolveSavingThrowBonus(targetState, abilityID_Ref)
                        + (situationalModifiers?.flatBonus || 0);

        // 2. Determine Advantage/Disadvantage
        let hasAdvantage = situationalModifiers?.grantAdvantage || false;
        let hasDisadvantage = situationalModifiers?.grantDisadvantage || false;

        // Check active effects on target for advantage/disadvantage on this specific save or all saves
        targetState.activeEffects.forEach(effect => {
            if (effect.effectType === "GRANT_ADVANTAGE_ON_ROLL" && 
                (effect.bonusTo_Ref === "SAVING_THROW" || effect.bonusTo_Ref === `${abilityID_Ref}_SAVE`)) {
                hasAdvantage = true;
            }
            if (effect.effectType === "IMPOSE_DISADVANTAGE_ON_ROLL" &&
                (effect.bonusTo_Ref === "SAVING_THROW" || effect.bonusTo_Ref === `${abilityID_Ref}_SAVE`)) {
                hasDisadvantage = true;
            }
        });
        
        if (situationalModifiers?.advantageSources && situationalModifiers.advantageSources.length > 0) hasAdvantage = true;
        if (situationalModifiers?.disadvantageSources && situationalModifiers.disadvantageSources.length > 0) hasDisadvantage = true;

        // 3. Roll the d20 for the save
        const d20RollContext: GameTypes.D20RollContext = {
            hasAdvantage,
            hasDisadvantage,
            rollType: 'SavingThrow',
        };
        const saveD20Result = DiceRoller.rollD20(saveBonus, d20RollContext);

        // 4. Determine Outcome
        let outcome: 'CriticalFailure' | 'Failure' | 'Success' | 'CriticalSuccess';

        // Standard 5e rules: natural 1 on a save is not an auto-fail, natural 20 is not an auto-success,
        // unless a specific feature says otherwise (e.g. Death Saves).
        // For this engine, we'll report criticals based on natural roll for effects that might care.
        if (saveD20Result.isCriticalMiss && dc > 1) { // Only a "critical failure" if it actually makes you fail
             outcome = 'CriticalFailure'; // More a flag than a distinct outcome category in base 5e saves
        } else if (saveD20Result.isCriticalHit && saveD20Result.result < dc) { // Nat 20 but still failed? Very high DC
            outcome = 'Failure'; // Even a Nat 20 might fail if DC is extremely high and mods are low.
        } else if (saveD20Result.isCriticalHit) {
            outcome = 'CriticalSuccess'; // Nat 20 often means success, and some effects might care.
        } else if (saveD20Result.result >= dc) {
            outcome = 'Success';
        } else {
            outcome = 'Failure';
        }
        
        // Refined outcome based on general 5e save rules (nat 1/20 usually don't auto-fail/succeed for general saves)
        if (saveD20Result.result >= dc) {
            outcome = saveD20Result.chosenNaturalRoll === 20 ? 'CriticalSuccess' : 'Success';
        } else {
            outcome = saveD20Result.chosenNaturalRoll === 1 ? 'CriticalFailure' : 'Failure';
        }


        // TODO: Handle effects like "Legendary Resistance" which allow auto-success. This might be a layer above this engine or a specific event listener.
        // TODO: Generate GameEvent for SAVING_THROW_MADE

        return {
            outcome,
            saveRollResult: saveD20Result.result,
            d20NaturalRolls: saveD20Result.naturalRolls,
            chosenNaturalRoll: saveD20Result.chosenNaturalRoll,
        };
    }
}
