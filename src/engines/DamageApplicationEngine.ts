// src/engines/DamageApplicationEngine.ts
import * as GameTypes from '../../types';

export class DamageApplicationEngine {

    /**
     * Applies a list of damage instances to a target creature.
     * @param targetState The runtime state of the target creature.
     * @param damageInstances Array of damage amounts and types to apply. This damage is after dice rolls and crits, but before target defenses.
     * @param sourceCreatureState Optional state of the creature dealing the damage.
     * @param sourceDefinitionID_Ref Optional ID of the definition (spell, feature, item) causing the damage.
     * @returns An object detailing the damage applied, HP changes, and any new conditions.
     */
    public static async applyDamage(
        targetState: GameTypes.CreatureRuntimeState,
        damageInstances: GameTypes.AppliedDamageInstance[],
        sourceCreatureState?: GameTypes.CreatureRuntimeState,
        sourceDefinitionID_Ref?: string // Changed from sourceEffectID_Ref for clarity
    ): Promise<{
        finalDamageAppliedOverall: number; // Total damage that got through all defenses and temp HP to reduce actual HP
        hpDelta: number; // Change to actual HP
        tempHpDelta: number; // Change to temporary HP
        overkillDamage: number;
        newConditions_Ref_List: string[];
        concentrationCheckDC?: number;
        detailedBreakdown: { type: string, raw: number, modifiedByReduction: number, finalAppliedToHPOrTempHP: number }[];
    }> {
        let totalDamageAfterReductionsAndDefenses = 0; 
        
        const newConditions_Ref_List: string[] = [];
        const detailedBreakdownOutput: { type: string, raw: number, modifiedByReduction: number, finalAppliedToHPOrTempHP: number }[] = [];

        for (const damage of damageInstances) {
            let currentDamageAmount = damage.rawAmount;

            // Step 1: Apply Target's Specific Damage Reduction Effects (e.g., Uncanny Dodge, Heavy Armor Master)
            // This is a placeholder for more complex logic that might involve EffectExecutionEngine
            // For now, assume no such reductions, so damageAfterReductions = currentDamageAmount
            const damageAfterReductions = currentDamageAmount; 

            // Step 2: Apply Resistances, Vulnerabilities, Immunities
            let finalDamageForThisInstance = damageAfterReductions;
            
            const isImmune = targetState.activeEffects.some(effect =>
                effect.effectType === "GRANT_IMMUNITY" &&
                (effect.resistanceScope === "ALL_DAMAGE" || effect.resistanceScope === damage.damageTypeID_Ref || effect.specificImmunities_List?.some(si => si.damageTypeID_Ref === damage.damageTypeID_Ref)) &&
                !(damage.bypassesImmunityTypes_Ref_List?.includes(damage.damageTypeID_Ref)) && // Check if this instance bypasses immunity
                !(damage.bypassesImmunityTypes_Ref_List?.includes(effect.resistanceScope || "")) // Check if this instance bypasses a general immunity type
            );

            if (isImmune) {
                finalDamageForThisInstance = 0;
            } else {
                const isVulnerable = targetState.activeEffects.some(effect =>
                    effect.effectType === "GRANT_RESISTANCE" && effect.resistanceType === "VULNERABILITY" &&
                    (effect.resistanceScope === "ALL_DAMAGE" || effect.resistanceScope === damage.damageTypeID_Ref) &&
                    !(damage.bypassesResistanceTypes_Ref_List?.includes(damage.damageTypeID_Ref)) &&
                    !(damage.bypassesResistanceTypes_Ref_List?.includes(effect.resistanceScope || ""))
                );
                if (isVulnerable) {
                    finalDamageForThisInstance = Math.floor(finalDamageForThisInstance * 2);
                }

                const isResistant = targetState.activeEffects.some(effect =>
                    effect.effectType === "GRANT_RESISTANCE" && (!effect.resistanceType || effect.resistanceType === "RESISTANCE") &&
                    (effect.resistanceScope === "ALL_DAMAGE" || effect.resistanceScope === damage.damageTypeID_Ref) &&
                    !(damage.bypassesResistanceTypes_Ref_List?.includes(damage.damageTypeID_Ref)) &&
                    !(damage.bypassesResistanceTypes_Ref_List?.includes(effect.resistanceScope || ""))
                );
                
                // If vulnerable and resistant to the same damage, they cancel out (RAW 5e).
                // Our logic: apply vulnerability first, then if also resistant (and not cancelled by vuln), apply resistance.
                // If it was vulnerable, it's already doubled. If also resistant, it should be normal damage.
                // If not vulnerable, but resistant, it's halved.
                if (isResistant && !isVulnerable) { // Only apply resistance if not also vulnerable (or if vuln/res cancel)
                    finalDamageForThisInstance = Math.floor(finalDamageForThisInstance / 2);
                } else if (isResistant && isVulnerable) { // They cancel, revert to damageAfterReductions if doubled by vuln
                     finalDamageForThisInstance = damageAfterReductions; // Revert to value before vulnerability if both apply
                }
            }
            totalDamageAfterReductionsAndDefenses += finalDamageForThisInstance;
            detailedBreakdownOutput.push({ 
                type: damage.damageTypeID_Ref, 
                raw: damage.rawAmount, 
                modifiedByReduction: damageAfterReductions, // Damage after specific reductions (future)
                finalAppliedToHPOrTempHP: finalDamageForThisInstance // Damage after res/vuln/imm
            });
        }

        // Step 3: Apply to Temporary HP first
        let tempHpDelta = 0;
        let remainingDamageAfterTempHp = totalDamageAfterReductionsAndDefenses;

        if (targetState.temporaryHP > 0) {
            const damageToTempHP = Math.min(remainingDamageAfterTempHp, targetState.temporaryHP);
            tempHpDelta = -damageToTempHP;
            // targetState.temporaryHP -= damageToTempHP; // State mutation will be handled by caller based on delta
            remainingDamageAfterTempHp -= damageToTempHP;
        }

        // Step 4: Apply remaining damage to actual HP
        const hpDelta = -remainingDamageAfterTempHp;
        const previousHP = targetState.currentHP;
        // targetState.currentHP -= remainingDamageAfterTempHp; // State mutation by caller

        let overkillDamage = 0;
        if ((previousHP + hpDelta) < 0) { // If applying the HP delta results in negative HP
            overkillDamage = Math.abs(previousHP + hpDelta);
        }

        // Step 5: Check for conditions
        if ((previousHP + hpDelta) <= 0 && previousHP > 0) {
            const isAlreadyDying = targetState.activeConditions.some(c => c.conditionID === "UNCONSCIOUS" || c.conditionID === "DEAD");
            if (!isAlreadyDying) {
                 newConditions_Ref_List.push("UNCONSCIOUS");
            }
        }

        // Step 6: Concentration Check
        let concentrationCheckDC: number | undefined = undefined;
        if (targetState.isConcentratingOn && totalDamageAfterReductionsAndDefenses > 0) {
            concentrationCheckDC = Math.max(10, Math.floor(totalDamageAfterReductionsAndDefenses / 2));
        }
        
        return {
            finalDamageAppliedOverall: remainingDamageAfterTempHp, // This is the damage that reduces actual HP
            hpDelta,
            tempHpDelta,
            overkillDamage,
            newConditions_Ref_List,
            concentrationCheckDC,
            detailedBreakdown: detailedBreakdownOutput
        };
    }
}