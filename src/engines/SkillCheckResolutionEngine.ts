// src/engines/SkillCheckResolutionEngine.ts
import * as GameTypes from '../../types';
import { DiceRoller } from './DiceRoller';
import { CalculationService } from './CalculationService';

export class SkillCheckResolutionEngine {

    /**
     * Determines the outcome of a skill check made by a creature against a DC.
     * @param performerState The runtime state of the creature making the skill check.
     * @param skillID_Ref The ID of the skill being used (e.g., "STEALTH", "PERCEPTION").
     * @param dc The difficulty class (DC) of the skill check.
     * @param situationalModifiers Any situational modifiers to the skill check.
     * @returns An object detailing the outcome of the skill check.
     */
    public static async resolveSkillCheck(
        performerState: GameTypes.CreatureRuntimeState,
        skillID_Ref: string,
        dc: number,
        situationalModifiers?: GameTypes.SituationalSkillCheckModifiers
    ): Promise<{
        outcome: 'Failure' | 'Success'; // Standard skill checks don't typically have criticals by default
        checkRollResult: number;
        d20NaturalRolls: number[];
        chosenNaturalRoll: number;
    }> {
        // 1. Calculate Performer's Skill Check Bonus
        const skillBonus = (await CalculationService.resolveSkillCheckBonus(performerState, skillID_Ref))
                         + (situationalModifiers?.flatBonus || 0);

        // 2. Determine Advantage/Disadvantage
        let hasAdvantage = situationalModifiers?.grantAdvantage || false;
        let hasDisadvantage = situationalModifiers?.grantDisadvantage || false;

        performerState.activeEffects.forEach(effect => {
            if (effect.effectType === "GRANT_ADVANTAGE_ON_ROLL" && 
                (effect.bonusTo_Ref === "ABILITY_CHECK" || effect.bonusTo_Ref === skillID_Ref)) {
                hasAdvantage = true;
            }
            if (effect.effectType === "IMPOSE_DISADVANTAGE_ON_ROLL" &&
                (effect.bonusTo_Ref === "ABILITY_CHECK" || effect.bonusTo_Ref === skillID_Ref)) {
                hasDisadvantage = true;
            }
        });
        
        if (situationalModifiers?.advantageSources && situationalModifiers.advantageSources.length > 0) hasAdvantage = true;
        if (situationalModifiers?.disadvantageSources && situationalModifiers.disadvantageSources.length > 0) hasDisadvantage = true;


        // 3. Roll the d20 for the skill check
        const d20RollContext: GameTypes.D20RollContext = {
            hasAdvantage,
            hasDisadvantage,
            rollType: 'AbilityCheck',
        };
        const checkD20Result = DiceRoller.rollD20(skillBonus, d20RollContext);

        // 4. Determine Outcome
        // Standard 5e: Nat 1/20 on ability checks are not auto-fail/success unless a specific rule applies.
        const outcome: 'Failure' | 'Success' = checkD20Result.result >= dc ? 'Success' : 'Failure';
        
        // TODO: Generate GameEvent for SKILL_CHECK_MADE

        return {
            outcome,
            checkRollResult: checkD20Result.result,
            d20NaturalRolls: checkD20Result.naturalRolls,
            chosenNaturalRoll: checkD20Result.chosenNaturalRoll,
        };
    }

    /**
     * Determines the outcome of a contested skill check between two creatures.
     * @param performerA_State Runtime state of the first creature.
     * @param skillA_ID_Ref Skill ID for the first creature.
     * @param performerB_State Runtime state of the second creature.
     * @param skillB_ID_Ref Skill ID for the second creature.
     * @param sitModsA Optional situational modifiers for creature A.
     * @param sitModsB Optional situational modifiers for creature B.
     * @returns An object detailing the winner and individual roll results.
     */
    public static async resolveContestedSkillCheck(
        performerA_State: GameTypes.CreatureRuntimeState,
        skillA_ID_Ref: string,
        performerB_State: GameTypes.CreatureRuntimeState,
        skillB_ID_Ref: string,
        sitModsA?: GameTypes.SituationalSkillCheckModifiers,
        sitModsB?: GameTypes.SituationalSkillCheckModifiers
    ): Promise<{
        winner: 'PerformerA' | 'PerformerB' | 'Tie';
        rollA_Result: number;
        naturalRollA: number;
        rollB_Result: number;
        naturalRollB: number;
    }> {
        const bonusA = (await CalculationService.resolveSkillCheckBonus(performerA_State, skillA_ID_Ref)) + (sitModsA?.flatBonus || 0);
        const bonusB = (await CalculationService.resolveSkillCheckBonus(performerB_State, skillB_ID_Ref)) + (sitModsB?.flatBonus || 0);

        let advA = sitModsA?.grantAdvantage || false;
        let disA = sitModsA?.grantDisadvantage || false;
        // Simplified: Check active effects for A similar to resolveSkillCheck

        let advB = sitModsB?.grantAdvantage || false;
        let disB = sitModsB?.grantDisadvantage || false;
        // Simplified: Check active effects for B similar to resolveSkillCheck
        
        const rollA = DiceRoller.rollD20(bonusA, { hasAdvantage: advA, hasDisadvantage: disA, rollType: 'AbilityCheck' });
        const rollB = DiceRoller.rollD20(bonusB, { hasAdvantage: advB, hasDisadvantage: disB, rollType: 'AbilityCheck' });

        let winner: 'PerformerA' | 'PerformerB' | 'Tie';
        if (rollA.result > rollB.result) {
            winner = 'PerformerA';
        } else if (rollB.result > rollA.result) {
            winner = 'PerformerB';
        } else {
            // Tie-breaking: In D&D 5e, a tie on a contested check means the situation remains the same as it was before the contest.
            // Or, the DM can rule based on ability scores (e.g., higher DEX wins a Stealth vs. Perception tie).
            // For this engine, we'll just call it a 'Tie'. The calling code can decide tie-breaking.
            winner = 'Tie';
        }
        
        // TODO: Generate GameEvent for SKILL_CHECK_MADE (perhaps two events or one with both results)

        return {
            winner,
            rollA_Result: rollA.result,
            naturalRollA: rollA.chosenNaturalRoll,
            rollB_Result: rollB.result,
            naturalRollB: rollB.chosenNaturalRoll,
        };
    }
}
