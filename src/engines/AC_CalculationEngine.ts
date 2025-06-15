// src/engines/AC_CalculationEngine.ts
import * as GameTypes from '../../types';
import { getItemById } from '../services/dataService';
import { CalculationService } from './CalculationService';

export class AC_CalculationEngine {

    /**
     * Calculates the current Armor Class (AC) for a target creature.
     * @param targetState The runtime state of the target creature.
     * @param context Optional context, e.g., if the AC is being calculated against a specific attack.
     * @returns An object containing the final AC and a breakdown of its calculation (optional).
     */
    public static async calculateCurrentAC(
        targetState: GameTypes.CreatureRuntimeState,
        context?: GameTypes.ACContext
    ): Promise<{ baseFormulaAC: number; finalAC: number; calculationBreakdown_Text?: string }> {
        
        const effectiveScores = CalculationService.getEffectiveAbilityScores(targetState);
        const dexMod = CalculationService.getAbilityModifier(effectiveScores["DEX"] || 10);
        
        let baseAC = 10 + dexMod; // Unarmored base AC
        let acCalculationMethod = "Unarmored (10 + DEX Mod)";

        // Check for equipped armor
        const armorID = targetState.equippedItems_Map?.["armor"];
        let equippedArmor: GameTypes.ItemDefinition | null = null;
        if (armorID) {
            equippedArmor = await getItemById(armorID) as GameTypes.ItemDefinition;
            if (equippedArmor && equippedArmor.properties?.armorSpecifics) {
                const armorSpec = equippedArmor.properties.armorSpecifics;
                let armorBaseAC = armorSpec.baseAC || 0; // e.g. 11 for Leather, 14 for Chain Shirt
                
                acCalculationMethod = `${equippedArmor.fullName}`;
                if (armorSpec.addDexModifier) {
                    let dexBonusForAC = dexMod;
                    if (armorSpec.maxDexModifier !== null && typeof armorSpec.maxDexModifier === 'number') {
                        dexBonusForAC = Math.min(dexBonusForAC, armorSpec.maxDexModifier);
                    }
                    armorBaseAC += dexBonusForAC;
                    acCalculationMethod += ` (${armorSpec.baseAC} + DEX Mod${armorSpec.maxDexModifier !== null ? ` (max ${armorSpec.maxDexModifier})` : ''})`;
                } else {
                     acCalculationMethod += ` (${armorSpec.baseAC})`;
                }
                baseAC = armorBaseAC; // Armor formula overrides unarmored
            }
        }
        
        // TODO: Handle "Unarmored Defense" features (e.g., Barbarian, Monk)
        // This would involve checking activeEffects for features like "BARBARIAN_UNARMORED_DEFENSE"
        // and potentially using a higher baseAC if that formula (e.g., 10 + DEX + CON) is better.
        // Example:
        // targetState.activeEffects.forEach(effect => {
        //   if (effect.effectType === "SET_BASE_AC" && effect.valueFormula) {
        //     const potentialAC = parseAndCalculateACFormula(effect.valueFormula, effectiveScores, targetState);
        //     if (potentialAC > baseAC) {
        //       baseAC = potentialAC;
        //       acCalculationMethod = effect.details || "Special Unarmored Defense";
        //     }
        //   }
        // });


        let finalAC = baseAC;
        let breakdown = [acCalculationMethod];

        // Add shield bonus if a shield is equipped
        const shieldID = targetState.equippedItems_Map?.["shield"]; // Assuming 'shield' slot
        if (shieldID) {
            const shieldItem = await getItemById(shieldID) as GameTypes.ItemDefinition;
            if (shieldItem && shieldItem.properties?.armorSpecifics?.acBonus) {
                finalAC += shieldItem.properties.armorSpecifics.acBonus;
                breakdown.push(`Shield (+${shieldItem.properties.armorSpecifics.acBonus})`);
            }
        }
        
        // Apply other bonuses/penalties from active effects (e.g., Ring of Protection, Shield spell, cover)
        targetState.activeEffects.forEach(effect => {
            if (effect.effectType === "GRANT_BONUS" && effect.bonusTo_Ref === "ARMOR_CLASS") {
                if (typeof effect.bonusValue === 'number') {
                    finalAC += effect.bonusValue;
                    breakdown.push(`${effect.details || effect.sourceDefinitionId || "Effect"} (+${effect.bonusValue})`);
                }
                // TODO: Handle bonusValueFormula for AC
            } else if (effect.effectType === "SET_BASE_AC" && !equippedArmor) { // e.g. Mage Armor, only if not wearing armor
                 if (effect.acValueFormula) { // e.g. "13 + TARGET_DEX_MOD"
                    let tempBaseAc = 0;
                    if (effect.acValueFormula === "13 + TARGET_DEX_MOD") { // crude parse
                        tempBaseAc = 13 + dexMod;
                         if (tempBaseAc > finalAC) { // Note: Mage armor sets base, doesn't stack typically with armor.
                            finalAC = tempBaseAc; // This logic needs refinement based on stacking rules.
                            acCalculationMethod = effect.details || "Mage Armor like effect";
                            breakdown = [`${acCalculationMethod} (${finalAC})`]; // Reset breakdown as base changed
                         }
                    }
                 }
            }
            // TODO: Handle Cover (if not ignored by attacker context)
            // Example: Half cover +2 AC, Three-quarters cover +5 AC
            // This might come from context or an effect on the target.
        });

        // If context indicates an attack, some temporary effects might apply (e.g., Shield spell specifically for that attack)
        if (context?.forAttackContext) {
            // Check for effects that trigger on being targeted or attacked
        }

        // targetState.currentAC_Calculated is updated by CalculationService.updateCalculatedStats

        return {
            baseFormulaAC: baseAC, // The AC from armor/unarmored defense before other modifiers
            finalAC: finalAC,
            calculationBreakdown_Text: breakdown.join(', ')
        };
    }
}