// src/engines/CalculationService.ts
import *_ from "https://esm.sh/lodash@4.17.21";
import * as GameTypes from '../../types';
import { getItemById } from '../services/dataService';
import { FormulaParser } from '../services/FormulaParser';
import { AC_CalculationEngine } from './AC_CalculationEngine';

export class CalculationService {

    public static getAbilityModifier(score: number): number {
        return Math.floor((score - 10) / 2);
    }
    
    public static getEffectiveAbilityScores(creatureState: GameTypes.CreatureRuntimeState): GameTypes.CreatureAbilityScores {
        const effectiveScores: GameTypes.CreatureAbilityScores = _.cloneDeep(creatureState.abilityScores_Base);

        creatureState.activeEffects.forEach(effect => {
            if (effect.effectType === "GRANT_BONUS" && effect.bonusTo_Ref && AbilityScoreDefinition_ids.includes(effect.bonusTo_Ref)) {
                if (typeof effect.bonusValue === 'number') {
                     effectiveScores[effect.bonusTo_Ref] = (effectiveScores[effect.bonusTo_Ref] || 0) + effect.bonusValue;
                } else if (effect.bonusValueFormula) {
                    const formulaContext: GameTypes.FormulaContext = { actor: creatureState, activeEffect: effect, sourceDefinition: effect.sourceDefinitionId ? { itemID: effect.sourceDefinitionId } as any : undefined };
                    const parsedResult = FormulaParser.parseAndEvaluate(effect.bonusValueFormula, formulaContext);
                    if (parsedResult.value !== null) {
                        effectiveScores[effect.bonusTo_Ref] = (effectiveScores[effect.bonusTo_Ref] || 0) + parsedResult.value;
                    } else {
                        console.warn(`Failed to parse bonusValueFormula for ability score "${effect.bonusTo_Ref}": ${effect.bonusValueFormula} - Error: ${parsedResult.error}`);
                    }
                }
            }
        });
        return effectiveScores;
    }

    public static async resolveAttackBonus( // Made async due to potential getItemById for sourceDef
        creatureState: GameTypes.CreatureRuntimeState,
        attackActionDefinition: GameTypes.ParsedAttackAction
    ): Promise<number> {
        let attackBonus = 0;
        const effectiveScores = this.getEffectiveAbilityScores(creatureState);
        
        let sourceDefForFormula: GameTypes.ItemDefinition | GameTypes.FeatureDefinition | undefined;
        if(attackActionDefinition.sourceDefinitionId){
            // Simplified: Assume it's an item or feature definition for formula context if needed by attackBonusFormula
            // This part might need more robust type checking based on how sourceDefinitionId is populated for ParsedAttackAction
             try {
                sourceDefForFormula = await getItemById(attackActionDefinition.sourceDefinitionId) as (GameTypes.ItemDefinition | GameTypes.FeatureDefinition);
             } catch (e) { console.warn(`Could not load source definition ${attackActionDefinition.sourceDefinitionId} for attack bonus formula.`); }
        }

        const formulaContextBase: GameTypes.FormulaContext = { 
            actor: creatureState,
            item: sourceDefForFormula && 'itemID' in sourceDefForFormula ? sourceDefForFormula : undefined,
            feature: sourceDefForFormula && 'featureID' in sourceDefForFormula ? sourceDefForFormula : undefined,
        };

        if (attackActionDefinition.attackBonusFormula) {
            const parsedResult = FormulaParser.parseAndEvaluate(attackActionDefinition.attackBonusFormula, formulaContextBase);
            if (parsedResult.value !== null) {
                attackBonus = parsedResult.value;
            } else {
                console.warn(`Failed to parse attackBonusFormula for ${attackActionDefinition.sourceDefinitionId}: ${attackActionDefinition.attackBonusFormula} - Error: ${parsedResult.error}. Falling back.`);
                if (attackActionDefinition.associatedAbilityID_Ref) {
                    const abilityScore = effectiveScores[attackActionDefinition.associatedAbilityID_Ref] || 10;
                    attackBonus += this.getAbilityModifier(abilityScore);
                }
                if (attackActionDefinition.associatedAbilityID_Ref) { // Assuming proficiency applies if ability mod is used
                    attackBonus += creatureState.proficiencyBonus_Calculated;
                }
            }
        } else if (typeof attackActionDefinition.fixedAttackBonus === 'number') {
            attackBonus = attackActionDefinition.fixedAttackBonus;
        } else {
            if (attackActionDefinition.associatedAbilityID_Ref) {
                const abilityScore = effectiveScores[attackActionDefinition.associatedAbilityID_Ref] || 10;
                attackBonus += this.getAbilityModifier(abilityScore);
            }
            if (attackActionDefinition.associatedAbilityID_Ref) { // Assuming proficiency
                attackBonus += creatureState.proficiencyBonus_Calculated;
            }
        }
        
        creatureState.activeEffects.forEach(effect => {
            if (effect.effectType === "GRANT_BONUS" && effect.bonusTo_Ref === "ATTACK_ROLL") { 
                if (typeof effect.bonusValue === 'number') {
                    attackBonus += effect.bonusValue;
                } else if (effect.bonusValueFormula) {
                    const effectFormulaContext: GameTypes.FormulaContext = { ...formulaContextBase, activeEffect: effect };
                    const parsedResult = FormulaParser.parseAndEvaluate(effect.bonusValueFormula, effectFormulaContext);
                    if (parsedResult.value !== null) {
                        attackBonus += parsedResult.value;
                    } else {
                         console.warn(`Failed to parse bonusValueFormula for ATTACK_ROLL effect ${effect.instanceID}: ${effect.bonusValueFormula} - Error: ${parsedResult.error}`);
                    }
                }
            }
        });

        return attackBonus;
    }

    public static resolveSavingThrowBonus(
        creatureState: GameTypes.CreatureRuntimeState,
        abilityID_Ref: string
    ): number {
        let saveBonus = 0;
        const effectiveScores = this.getEffectiveAbilityScores(creatureState);
        const abilityScore = effectiveScores[abilityID_Ref] || 10;
        saveBonus += this.getAbilityModifier(abilityScore);
        
        const classDef = creatureState.classLevels_List?.[0]?.class; // Simplified: Assumes first class for proficiency
        if (classDef?.savingThrowProficiencies_List_Ref?.includes(abilityID_Ref) ||
            creatureState.creatureDefinition?.savingThrowProficiencies_List?.includes(abilityID_Ref)) {
            saveBonus += creatureState.proficiencyBonus_Calculated;
        }
        
        creatureState.activeEffects.forEach(effect => {
            if (effect.effectType === "GRANT_BONUS" && 
                (effect.bonusTo_Ref === "SAVING_THROW" || effect.bonusTo_Ref === abilityID_Ref || effect.bonusTo_Ref === `${abilityID_Ref}_SAVE`)) {
                if (typeof effect.bonusValue === 'number') {
                    saveBonus += effect.bonusValue;
                } else if (effect.bonusValueFormula) {
                    const formulaContext: GameTypes.FormulaContext = { actor: creatureState, activeEffect: effect };
                    const parsedResult = FormulaParser.parseAndEvaluate(effect.bonusValueFormula, formulaContext);
                    if (parsedResult.value !== null) {
                        saveBonus += parsedResult.value;
                    } else {
                        console.warn(`Failed to parse bonusValueFormula for SAVE effect ${effect.instanceID}: ${effect.bonusValueFormula} - Error: ${parsedResult.error}`);
                    }
                }
            }
        });
        
        return saveBonus;
    }

    public static async resolveSkillCheckBonus(
        creatureState: GameTypes.CreatureRuntimeState,
        skillID_Ref: string
    ): Promise<number> {
        let skillBonus = 0;
        const skillDef = await getItemById(skillID_Ref) as GameTypes.SkillDefinition;
        if (!skillDef) return 0;

        const effectiveScores = this.getEffectiveAbilityScores(creatureState);
        const abilityScore = effectiveScores[skillDef.defaultAbilityScoreID_Ref] || 10;
        skillBonus += this.getAbilityModifier(abilityScore);

        const skillProfInfoFromCreatureDef = creatureState.creatureDefinition?.skillProficiencies_List?.find(p => p.skillID_Ref === skillID_Ref);
        const skillProficiencyInfo = skillProfInfoFromCreatureDef; 

        if (skillProficiencyInfo) {
            if (skillProficiencyInfo.hasProficiency) {
                 skillBonus += creatureState.proficiencyBonus_Calculated;
            }
            if (skillProficiencyInfo.expertise) { 
                 skillBonus += creatureState.proficiencyBonus_Calculated; 
            }
        }
        
        creatureState.activeEffects.forEach(effect => {
            if (effect.effectType === "GRANT_BONUS" && (effect.bonusTo_Ref === skillID_Ref || effect.bonusTo_Ref === "ABILITY_CHECK")) {
                if (typeof effect.bonusValue === 'number') {
                    skillBonus += effect.bonusValue;
                } else if (effect.bonusValueFormula) {
                     const formulaContext: GameTypes.FormulaContext = { actor: creatureState, activeEffect: effect };
                    const parsedResult = FormulaParser.parseAndEvaluate(effect.bonusValueFormula, formulaContext);
                    if (parsedResult.value !== null) {
                        skillBonus += parsedResult.value;
                    } else {
                        console.warn(`Failed to parse bonusValueFormula for SKILL/ABILITY_CHECK effect ${effect.instanceID}: ${effect.bonusValueFormula} - Error: ${parsedResult.error}`);
                    }
                }
            }
        });

        return skillBonus;
    }

    public static calculateSpellSaveDC(
        creatureState: GameTypes.CreatureRuntimeState,
        spellcastingAbilityID_Ref: string,
        definingFeature?: GameTypes.FeatureDefinition
    ): number {
        const formulaContextBase: GameTypes.FormulaContext = { actor: creatureState, feature: definingFeature };
        let dc = 0;

        const featureDcEffect = definingFeature?.parsedEffects_List?.find(e => e.effectType === "DEFINE_SAVE_DC");
        if (featureDcEffect?.valueFormula) {
            const parsedResult = FormulaParser.parseAndEvaluate(featureDcEffect.valueFormula, formulaContextBase);
            if (parsedResult.value !== null) {
                dc = parsedResult.value;
            } else {
                console.warn(`Failed to parse feature-defined DC formula "${featureDcEffect.valueFormula}" from ${definingFeature?.featureID}. Error: ${parsedResult.error}. Defaulting calculation.`);
            }
        }
        
        if (dc === 0) { 
            dc = 8 + creatureState.proficiencyBonus_Calculated;
            const effectiveScores = this.getEffectiveAbilityScores(creatureState);
            const spellcastingAbilityScore = effectiveScores[spellcastingAbilityID_Ref] || 10;
            dc += this.getAbilityModifier(spellcastingAbilityScore);
        }
        
        creatureState.activeEffects.forEach(effect => {
            if (effect.effectType === "GRANT_BONUS" && effect.bonusTo_Ref === "SPELL_SAVE_DC") { 
                 if (typeof effect.bonusValue === 'number') {
                    dc += effect.bonusValue;
                } else if (effect.bonusValueFormula) {
                    const effectFormulaContext: GameTypes.FormulaContext = { ...formulaContextBase, activeEffect: effect };
                    const parsedResult = FormulaParser.parseAndEvaluate(effect.bonusValueFormula, effectFormulaContext);
                     if (parsedResult.value !== null) {
                        dc += parsedResult.value;
                    } else {
                        console.warn(`Failed to parse bonusValueFormula for SPELL_SAVE_DC effect ${effect.instanceID}: ${effect.bonusValueFormula} - Error: ${parsedResult.error}`);
                    }
                }
            }
        });
        
        return dc;
    }
    
    public static calculateInitiativeModifier(creatureState: GameTypes.CreatureRuntimeState): number {
        let initiativeMod = 0;
        const effectiveScores = this.getEffectiveAbilityScores(creatureState);
        const dexScore = effectiveScores["DEX"] || 10;
        initiativeMod += this.getAbilityModifier(dexScore);

        creatureState.activeEffects.forEach(effect => {
            if (effect.effectType === "GRANT_BONUS" && effect.bonusTo_Ref === "INITIATIVE_ROLL") { 
                 if (typeof effect.bonusValue === 'number') {
                    initiativeMod += effect.bonusValue;
                } else if (effect.bonusValueFormula) {
                     const formulaContext: GameTypes.FormulaContext = { actor: creatureState, activeEffect: effect };
                    const parsedResult = FormulaParser.parseAndEvaluate(effect.bonusValueFormula, formulaContext);
                    if (parsedResult.value !== null) {
                        initiativeMod += parsedResult.value;
                    } else {
                         console.warn(`Failed to parse bonusValueFormula for INITIATIVE_ROLL effect ${effect.instanceID}: ${effect.bonusValueFormula} - Error: ${parsedResult.error}`);
                    }
                }
            }
        });
        return initiativeMod;
    }

    public static async calculateMaxHP(creatureState: GameTypes.CreatureRuntimeState): Promise<number> {
        let maxHP = 0;
        const effectiveScores = creatureState.abilityScores_Effective; // Use already calculated effective scores
        const conMod = this.getAbilityModifier(effectiveScores["CON"] || 10);
        const formulaContextBase: GameTypes.FormulaContext = { actor: creatureState };

        if (creatureState.creatureDefinition) { 
            const hpInfo = creatureState.creatureDefinition.hitPoints;
            const hitDie = await getItemById(hpInfo.diceFormula.diceID_Ref) as GameTypes.DiceDefinition;
            const hitDiceCount = hpInfo.diceFormula.diceCount;
            let diceAverageTotal = 0;
            if (hitDie) {
                 diceAverageTotal = Math.floor((hitDie.faces / 2 + 0.5) * hitDiceCount);
            }

            let bonusFromFormula = 0;
            if (hpInfo.diceFormula.bonusFormula) {
                const parsedBonus = FormulaParser.parseAndEvaluate(hpInfo.diceFormula.bonusFormula, formulaContextBase);
                if (parsedBonus.value !== null) {
                    bonusFromFormula = parsedBonus.value;
                     maxHP = diceAverageTotal + hpInfo.diceFormula.bonus + bonusFromFormula; // Assuming bonusFormula includes CON_MOD * HD_COUNT if applicable
                } else {
                    console.warn(`Failed to parse monster HP bonusFormula "${hpInfo.diceFormula.bonusFormula}". Error: ${parsedBonus.error}. Using static bonus.`);
                    maxHP = diceAverageTotal + (conMod * hitDiceCount) + hpInfo.diceFormula.bonus;
                }
            } else {
                 maxHP = diceAverageTotal + (conMod * hitDiceCount) + hpInfo.diceFormula.bonus;
            }
            if (hpInfo.average > maxHP) maxHP = hpInfo.average;

        } else if (creatureState.isPlayerCharacter) { 
            maxHP = 0;
            let characterLevelSoFar = 0;
            for (const classLevelEntry of creatureState.classLevels_List) {
                const classDef = classLevelEntry.class || await getItemById(classLevelEntry.classID_Ref) as GameTypes.ClassDefinition;
                const hitDie = classDef.hitDie || await getItemById(classDef.hitDie_Ref) as GameTypes.DiceDefinition;
                
                if(!classDef || !hitDie) {
                    console.error(`Missing Class or Hit Die definition for class ${classLevelEntry.classID_Ref}`);
                    continue;
                }
                // Ensure the class definition is resolved if it was fetched
                if (!classLevelEntry.class) classLevelEntry.class = classDef;
                if (!classDef.hitDie) classDef.hitDie = hitDie;


                for (let i = 1; i <= classLevelEntry.level; i++) {
                    characterLevelSoFar++;
                    if (characterLevelSoFar === 1) { 
                        maxHP += hitDie.faces + conMod;
                    } else { 
                        maxHP += Math.max(1, Math.floor(hitDie.faces / 2 + 0.5) + conMod);
                    }
                }
            }
        } else {
            maxHP = 1; 
        }

        creatureState.activeEffects.forEach(effect => {
            if (effect.effectType === "INCREASE_MAX_HP") {
                if (typeof effect.bonusValue === 'number') { // If value was pre-calculated and stored
                    maxHP += effect.bonusValue;
                } else if (effect.valueFormula) {
                    const effectFormulaContext: GameTypes.FormulaContext = { ...formulaContextBase, activeEffect: effect };
                    const parsedResult = FormulaParser.parseAndEvaluate(effect.valueFormula, effectFormulaContext);
                    if (parsedResult.value !== null) {
                        maxHP += parsedResult.value;
                    } else {
                        console.warn(`Failed to parse INCREASE_MAX_HP valueFormula "${effect.valueFormula}" for effect ${effect.instanceID}. Error: ${parsedResult.error}`);
                    }
                }
            }
        });
        return Math.max(1, Math.floor(maxHP));
    }

    public static async getPassiveScore(
        creatureState: GameTypes.CreatureRuntimeState,
        skillID_Ref: string
    ): Promise<number> {
        const skillBonus = await this.resolveSkillCheckBonus(creatureState, skillID_Ref);
        let passiveScore = 10 + skillBonus;
        
        creatureState.activeEffects.forEach(effect => {
            if (effect.effectType === "GRANT_BONUS" && effect.bonusTo_Ref === `PASSIVE_${skillID_Ref.toUpperCase()}`) {
                 if (typeof effect.bonusValue === 'number') {
                    passiveScore += effect.bonusValue;
                } else if (effect.bonusValueFormula) {
                    const formulaContext: GameTypes.FormulaContext = { actor: creatureState, activeEffect: effect };
                    const parsedResult = FormulaParser.parseAndEvaluate(effect.bonusValueFormula, formulaContext);
                    if (parsedResult.value !== null) {
                        passiveScore += parsedResult.value;
                    } else {
                        console.warn(`Failed to parse bonusValueFormula for PASSIVE_SCORE effect ${effect.instanceID}: ${effect.bonusValueFormula} - Error: ${parsedResult.error}`);
                    }
                }
            }
        });
        return passiveScore;
    }

    public static calculateProficiencyBonus(creatureState: GameTypes.CreatureRuntimeState): number {
        if (creatureState.isPlayerCharacter) {
            const level = creatureState.totalCharacterLevel;
            if (level >= 17) return 6;
            if (level >= 13) return 5;
            if (level >= 9) return 4;
            if (level >= 5) return 3;
            if (level >= 1) return 2;
            return 0;
        } else if (creatureState.creatureDefinition) {
            return creatureState.creatureDefinition.proficiencyBonus; // Directly from monster stat block
        }
        return 2; // Default fallback
    }

    public static async updateCalculatedStats(creatureState: GameTypes.CreatureRuntimeState): Promise<void> {
        creatureState.totalCharacterLevel = creatureState.classLevels_List.reduce((sum, cl) => sum + cl.level, 0);
        // Effective scores must be calculated before proficiency if proficiency formula depends on effective scores.
        creatureState.abilityScores_Effective = this.getEffectiveAbilityScores(creatureState);
        creatureState.proficiencyBonus_Calculated = this.calculateProficiencyBonus(creatureState);
        
        // MaxHP calculation depends on effective CON and proficiency (if formulas use PROFICIENCY_BONUS)
        creatureState.maxHP_Calculated = await this.calculateMaxHP(creatureState);
        
        if (creatureState.currentHP > creatureState.maxHP_Calculated) {
            creatureState.currentHP = creatureState.maxHP_Calculated;
        }

        const acResult = await AC_CalculationEngine.calculateCurrentAC(creatureState);
        creatureState.currentAC_Calculated = acResult.finalAC;
        
        if (creatureState.creatureDefinition?.senses) { 
            creatureState.senses_Effective = { ...creatureState.creatureDefinition.senses };
            if (creatureState.senses_Effective && !creatureState.senses_Effective.passivePerception) {
                 const perceptionBonus = await this.resolveSkillCheckBonus(creatureState, "PERCEPTION");
                 creatureState.senses_Effective.passivePerception = 10 + perceptionBonus;
            }
        } else if (creatureState.isPlayerCharacter && !creatureState.senses_Effective) {
             creatureState.senses_Effective = {}; // Initialize if undefined
             const perceptionBonus = await this.resolveSkillCheckBonus(creatureState, "PERCEPTION");
             creatureState.senses_Effective.passivePerception = 10 + perceptionBonus;
        }
    }
}

export const AbilityScoreDefinition_ids = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];