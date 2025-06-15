// src/engines/AttackResolutionEngine.ts
import * as GameTypes from '../../types';
import { DiceRoller } from './DiceRoller';
import { AC_CalculationEngine } from './AC_CalculationEngine';
import { CalculationService } from './CalculationService';

export class AttackResolutionEngine {
    /**
     * Determines if an attack hits, misses, or critically hits/misses.
     * @param attackerState Runtime state of the attacker.
     * @param targetState Runtime state of the target.
     * @param parsedAttackAction Definition of the attack being made (this should be more specific than a generic ParsedEffect).
     * @param situationalModifiers Any situational modifiers to the attack roll (e.g., cover, specific spell effects).
     * @returns An object detailing the outcome of the attack.
     */
    public static async resolveAttack(
        attackerState: GameTypes.CreatureRuntimeState,
        targetState: GameTypes.CreatureRuntimeState,
        parsedAttackAction: GameTypes.ParsedAttackAction, // Changed from attackActionDefinition for clarity
        situationalModifiers?: GameTypes.SituationalAttackModifiers
    ): Promise<{
        outcome: 'CriticalMiss' | 'Miss' | 'Hit' | 'CriticalHit';
        attackRollResult: number;
        d20NaturalRolls: number[];
        chosenNaturalRoll: number;
        targetACValue: number;
    }> {
        // 1. Calculate Target AC
        const acResult = await AC_CalculationEngine.calculateCurrentAC(targetState, {
            forAttackContext: true,
            attackingCreatureId: attackerState.id,
        });
        const targetACValue = acResult.finalAC;

        // 2. Calculate Attacker's Attack Bonus
        const attackBonusFromService = await CalculationService.resolveAttackBonus(attackerState, parsedAttackAction);
        const attackBonus = attackBonusFromService + (situationalModifiers?.flatBonus || 0);

        // 3. Determine Advantage/Disadvantage
        let hasAdvantage = situationalModifiers?.grantAdvantage || false;
        let hasDisadvantage = situationalModifiers?.grantDisadvantage || false;

        attackerState.activeEffects.forEach(effect => {
            if (effect.effectType === "GRANT_ADVANTAGE_ON_ROLL" && effect.bonusTo_Ref === "ATTACK_ROLL") {
                hasAdvantage = true;
            }
            if (effect.effectType === "IMPOSE_DISADVANTAGE_ON_ROLL" && effect.bonusTo_Ref === "ATTACK_ROLL") {
                hasDisadvantage = true;
            }
        });
        targetState.activeConditions.forEach(activeCond => {
            activeCond.definition?.parsedEffects_List.forEach(effect => {
                if (effect.effectType === "GRANT_ADVANTAGE_TO_ATTACKERS") hasAdvantage = true;
                if (effect.effectType === "GRANT_DISADVANTAGE_TO_ATTACKERS") hasDisadvantage = true;
            });
        });
        
        if (situationalModifiers?.advantageSources && situationalModifiers.advantageSources.length > 0) hasAdvantage = true;
        if (situationalModifiers?.disadvantageSources && situationalModifiers.disadvantageSources.length > 0) hasDisadvantage = true;


        // 4. Roll the d20 for the attack
        const d20RollContext: GameTypes.D20RollContext = {
            hasAdvantage,
            hasDisadvantage,
            rollType: 'Attack',
        };
        const attackD20Result = DiceRoller.rollD20(attackBonus, d20RollContext);

        // 5. Determine Outcome
        let outcome: 'CriticalMiss' | 'Miss' | 'Hit' | 'CriticalHit';

        if (attackD20Result.isCriticalMiss) {
            outcome = 'CriticalMiss';
        } else if (attackD20Result.isCriticalHit) {
            outcome = 'CriticalHit';
        } else if (attackD20Result.result >= targetACValue) {
            outcome = 'Hit';
        } else {
            outcome = 'Miss';
        }
        
        // Event data is constructed and pushed by TurnAndRoundManager using these results.

        return {
            outcome,
            attackRollResult: attackD20Result.result,
            d20NaturalRolls: attackD20Result.naturalRolls,
            chosenNaturalRoll: attackD20Result.chosenNaturalRoll,
            targetACValue,
        };
    }
}