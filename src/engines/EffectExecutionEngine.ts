// src/engines/EffectExecutionEngine.ts
import * as GameTypes from '../../types';
import { getItemById } from '../services/dataService';
import { DiceRoller } from './DiceRoller';
import { DamageApplicationEngine } from './DamageApplicationEngine';
import { SavingThrowResolutionEngine } from './SavingThrowResolutionEngine';
import { CalculationService } from './CalculationService';
import { ResourceManagementEngine } from './ResourceManagementEngine';
import { AC_CalculationEngine } from './AC_CalculationEngine';
import *_ from "https://esm.sh/lodash@4.17.21";
import { FormulaParser } from '../services/FormulaParser';


export class EffectExecutionEngine {

    /**
     * Applies a list of ParsedEffects to one or more target creatures.
     * @param sourceDefinitionID_Ref ID of the item, spell, feature, etc., that is the source of these effects.
     * @param sourceEntityType Type of the source entity (e.g., "SPELL", "FEATURE", "ITEM").
     * @param effectList Array of ParsedEffect objects to apply.
     * @param originatorState Runtime state of the creature initiating the effects.
     * @param targetsState_List Array of runtime states for creatures targeted by the effects.
     * @param executionContext Additional context for the effect execution (e.g., spell slot level).
     * @returns An object containing lists of modified creature states and generated game events.
     */
    public static async applyEffects(
        sourceDefinitionID_Ref: string,
        sourceEntityType: string,
        effectList: GameTypes.ParsedEffect[],
        originatorState: GameTypes.CreatureRuntimeState,
        targetsState_List: GameTypes.CreatureRuntimeState[],
        executionContext: GameTypes.EffectExecutionContext
    ): Promise<{
        modifiedEntitiesState_List: GameTypes.CreatureRuntimeState[];
        generatedGameEvents_List: GameTypes.GameEventBase[];
    }> {
        
        const workingOriginatorState = _.cloneDeep(originatorState);
        const workingTargetsState_List: GameTypes.CreatureRuntimeState[] = _.cloneDeep(targetsState_List);
        const generatedGameEvents_List: GameTypes.GameEventBase[] = [];
        
        // Map to keep track of modified entities to return at the end
        const modifiedEntityMap: Map<string, GameTypes.CreatureRuntimeState> = new Map();
        modifiedEntityMap.set(workingOriginatorState.id, workingOriginatorState);
        workingTargetsState_List.forEach(t => modifiedEntityMap.set(t.id, t));


        let sourceDefinition: GameTypes.SpellDefinition | GameTypes.ItemDefinition | GameTypes.FeatureDefinition | GameTypes.ConditionDefinition | undefined;
        if (sourceDefinitionID_Ref && sourceEntityType) {
            try {
                sourceDefinition = await getItemById(sourceDefinitionID_Ref) as any; 
            } catch (e) {
                console.warn(`Could not fetch sourceDefinition ${sourceDefinitionID_Ref} of type ${sourceEntityType}: ${e}`);
            }
        }


        for (const effect of effectList) {
            // Determine the actual targets for *this specific effect*
            let actualEffectTargetsStates: GameTypes.CreatureRuntimeState[] = [];
            if (effect.targetScope === "SELF" || effect.targetScope === "SELF_CONSUMER" || effect.targetScope === "SELF_WIELDER") {
                actualEffectTargetsStates.push(modifiedEntityMap.get(originatorState.id)!);
            } else if (effect.targetScope === "TARGET" || !effect.targetScope) { 
                workingTargetsState_List.forEach(t => {
                    const targetFromMap = modifiedEntityMap.get(t.id);
                    if(targetFromMap) actualEffectTargetsStates.push(targetFromMap);
                });
            }
            // TODO: Handle other scopes like ALLIES_IN_RADIUS, ENEMIES_IN_RADIUS etc.

            for (let currentTarget of actualEffectTargetsStates) {
                if (!currentTarget) continue; 
                
                const effectInstanceId = effect.instanceID || `${sourceDefinitionID_Ref}-${Date.now()}-${Math.random().toString(36).substring(2,7)}`;
                
                const activeEffectForContext: GameTypes.ActiveParsedEffect = {
                    ...effect, 
                    instanceID: effectInstanceId,
                    sourceDefinitionId: sourceDefinitionID_Ref,
                    sourceCreatureId: originatorState.id, 
                };

                const baseFormulaContext: GameTypes.FormulaContext = {
                    actor: modifiedEntityMap.get(originatorState.id)!, 
                    target: currentTarget,
                    sourceDefinition: sourceDefinition,
                    spell: sourceEntityType === 'SPELL' ? sourceDefinition as GameTypes.SpellDefinition : undefined,
                    item: sourceEntityType === 'ITEM' ? sourceDefinition as GameTypes.ItemDefinition : undefined,
                    feature: (sourceEntityType === 'FEATURE' || sourceEntityType === 'SPECIES_FEATURE' || sourceEntityType === 'BACKGROUND_FEATURE' || sourceEntityType === 'CONDITION' || sourceEntityType === 'ACTION') ? sourceDefinition as GameTypes.FeatureDefinition : undefined,
                    activeEffect: activeEffectForContext,
                    executionContext: {...executionContext, sourceDefinitionId: sourceDefinitionID_Ref},
                };


                switch (effect.effectType) {
                    case "DEAL_DAMAGE":
                    case "DEAL_DAMAGE_ON_ATTACK_HIT":
                        if (effect.damageRolls_List) {
                            const processedDamageRolls: GameTypes.DamageRoll[] = [];
                            for (const damageRoll of effect.damageRolls_List) {
                                const currentDamageRollCopy = _.cloneDeep(damageRoll);
                                if (currentDamageRollCopy.bonusDamageFormula) {
                                    const damageRollFormulaContext: GameTypes.FormulaContext = { ...baseFormulaContext, actor: modifiedEntityMap.get(originatorState.id)!, activeEffect: {...activeEffectForContext, ...currentDamageRollCopy} };
                                    const parsedBonusResult = FormulaParser.parseAndEvaluate(currentDamageRollCopy.bonusDamageFormula, damageRollFormulaContext);
                                    if (parsedBonusResult.value !== null) {
                                        currentDamageRollCopy.bonusDamage = (currentDamageRollCopy.bonusDamage || 0) + parsedBonusResult.value;
                                    } else {
                                        console.warn(`Failed to parse bonusDamageFormula "${currentDamageRollCopy.bonusDamageFormula}" for DEAL_DAMAGE: ${parsedBonusResult.error}. Using static bonus.`);
                                    }
                                }
                                processedDamageRolls.push(currentDamageRollCopy);
                            }

                            const damageRollResult = await DiceRoller.rollSpecificDamage(
                                processedDamageRolls,
                                executionContext.attackRollResult?.isCriticalHit || false
                            );

                            let damageToApply = damageRollResult.totalDamage;
                            if (effect.savingThrow) {
                                let saveDC = 10; 
                                if (effect.savingThrow.dcFormula) {
                                    const saveDcFormulaContext: GameTypes.FormulaContext = { ...baseFormulaContext, actor: modifiedEntityMap.get(originatorState.id)!, target: currentTarget, activeEffect: activeEffectForContext };
                                    const parsedDcResult = FormulaParser.parseAndEvaluate(effect.savingThrow.dcFormula, saveDcFormulaContext);
                                    if (parsedDcResult.value !== null) {
                                        saveDC = parsedDcResult.value;
                                    } else {
                                        console.warn(`Failed to parse savingThrow.dcFormula "${effect.savingThrow.dcFormula}": ${parsedDcResult.error}. Defaulting DC.`);
                                        if(effect.savingThrow.dcFormula === "CASTER_SPELL_SAVE_DC" && modifiedEntityMap.get(originatorState.id)!.spellcastingAbility_Ref) {
                                            saveDC = CalculationService.calculateSpellSaveDC(modifiedEntityMap.get(originatorState.id)!, modifiedEntityMap.get(originatorState.id)!.spellcastingAbility_Ref!, sourceDefinition as GameTypes.FeatureDefinition);
                                        } else {
                                            saveDC = effect.savingThrow.dcFixedValue || 10;
                                        }
                                    }
                                } else if (effect.savingThrow.dcFixedValue) {
                                    saveDC = effect.savingThrow.dcFixedValue;
                                }
                                
                                const saveResult = await SavingThrowResolutionEngine.resolveSavingThrow(
                                    currentTarget,
                                    effect.savingThrow.abilityID_Ref,
                                    saveDC
                                );
                                generatedGameEvents_List.push({ type: "SAVING_THROW_MADE", targetCreatureId: currentTarget.id, sourceCreatureId: originatorState.id, sourceDefinitionId: sourceDefinitionID_Ref, timestamp: Date.now(), details: { ...saveResult, vsDC: saveDC, ability: effect.savingThrow.abilityID_Ref }, description: `${currentTarget.name} attempts a ${effect.savingThrow.abilityID_Ref} save (DC ${saveDC}) vs ${sourceDefinition?.fullName || sourceDefinitionID_Ref}. Roll: ${saveResult.saveRollResult}. Outcome: ${saveResult.outcome}` } as any);

                                if (saveResult.outcome === "Success" || saveResult.outcome === "CriticalSuccess") {
                                    if (effect.savingThrow.effectOnSuccess === "HALF_DAMAGE") {
                                        damageToApply = Math.floor(damageToApply / 2);
                                    } else if (effect.savingThrow.effectOnSuccess === "NO_EFFECT") {
                                        damageToApply = 0;
                                    }
                                }
                            }
                            
                            if (damageToApply > 0) {
                                const appliedDamageInstances: GameTypes.AppliedDamageInstance[] = [{
                                    rawAmount: damageToApply,
                                    damageTypeID_Ref: effect.damageRolls_List[0].damageTypeID_Ref, 
                                    isMagicalSource: sourceEntityType === "SPELL" || effect.isMagical,
                                    sourceEffectID_Ref: effectInstanceId
                                }];
                                
                                const hpBeforeDamageApplication = currentTarget.currentHP;

                                const damageResult = await DamageApplicationEngine.applyDamage(
                                    currentTarget,
                                    appliedDamageInstances,
                                    modifiedEntityMap.get(originatorState.id)!,
                                    sourceDefinitionID_Ref
                                );
                                currentTarget.currentHP += damageResult.hpDelta;
                                currentTarget.temporaryHP += damageResult.tempHpDelta;
                                if(currentTarget.currentHP < 0) currentTarget.currentHP = 0;

                                for (const condId of damageResult.newConditions_Ref_List) {
                                     await this.addCondition(currentTarget, condId, effectInstanceId, originatorState.id, sourceDefinitionID_Ref, sourceDefinition, undefined, undefined);
                                }
                                
                                const eventDetails: GameTypes.DamageAppliedEventDetails = {
                                    totalAmount: damageResult.finalDamageAppliedOverall,
                                    breakdown: damageResult.detailedBreakdown.map(db => ({
                                        type: db.type,
                                        raw: db.raw,
                                        modified: db.modifiedByReduction,
                                        finalApplied: db.finalAppliedToHPOrTempHP
                                    })),
                                    hpReduced: Math.abs(damageResult.hpDelta),
                                    tempHpReduced: Math.abs(damageResult.tempHpDelta),
                                    wasLethal: currentTarget.currentHP <= 0 && hpBeforeDamageApplication > 0,
                                    isCriticalHit: executionContext.attackRollResult?.isCriticalHit || false,
                                    damageTypeID_Ref: effect.damageRolls_List[0].damageTypeID_Ref,
                                };

                                generatedGameEvents_List.push({ 
                                    type: "DAMAGE_APPLIED", 
                                    targetCreatureId: currentTarget.id, 
                                    sourceCreatureId: originatorState.id, 
                                    sourceDefinitionId: sourceDefinitionID_Ref, 
                                    timestamp: Date.now(), 
                                    details: eventDetails,
                                    description: `${currentTarget.name} takes ${damageResult.finalDamageAppliedOverall} ${effect.damageRolls_List[0].damageTypeID_Ref} damage from ${sourceDefinition?.fullName || sourceDefinitionID_Ref}. HP: ${currentTarget.currentHP}/${currentTarget.maxHP_Calculated}. TempHP: ${currentTarget.temporaryHP}.`
                                } as GameTypes.DamageAppliedEvent);
                                await CalculationService.updateCalculatedStats(currentTarget); // Update if HP/TempHP changed
                            }
                        }
                        break;

                    case "APPLY_CONDITION":
                        if (effect.condition_Ref) {
                            let conditionApplied = true;
                            let saveInfoForCondition = effect.savingThrow ? _.cloneDeep(effect.savingThrow) : undefined;
                            if (saveInfoForCondition) {
                                let saveDC = 10;
                                 if (saveInfoForCondition.dcFormula) {
                                    const saveDcFormulaContext: GameTypes.FormulaContext = { ...baseFormulaContext, actor: modifiedEntityMap.get(originatorState.id)!, target: currentTarget, activeEffect: activeEffectForContext };
                                    const parsedDcResult = FormulaParser.parseAndEvaluate(saveInfoForCondition.dcFormula, saveDcFormulaContext);
                                    if (parsedDcResult.value !== null) saveDC = parsedDcResult.value;
                                    else {
                                        console.warn(`Failed to parse dcFormula for APPLY_CONDITION save: ${parsedDcResult.error}. Defaulting DC.`);
                                        if(saveInfoForCondition.dcFormula === "CASTER_SPELL_SAVE_DC" && modifiedEntityMap.get(originatorState.id)!.spellcastingAbility_Ref) {
                                            saveDC = CalculationService.calculateSpellSaveDC(modifiedEntityMap.get(originatorState.id)!, modifiedEntityMap.get(originatorState.id)!.spellcastingAbility_Ref!, sourceDefinition as GameTypes.FeatureDefinition);
                                        } else {
                                            saveDC = saveInfoForCondition.dcFixedValue || 10;
                                        }
                                    }
                                } else if (saveInfoForCondition.dcFixedValue) {
                                    saveDC = saveInfoForCondition.dcFixedValue;
                                }
                                saveInfoForCondition.dcFixedValue = saveDC; // Store calculated DC

                                const saveOutcome = await SavingThrowResolutionEngine.resolveSavingThrow(currentTarget, saveInfoForCondition.abilityID_Ref, saveDC);
                                generatedGameEvents_List.push({ type: "SAVING_THROW_MADE", targetCreatureId: currentTarget.id, sourceCreatureId: originatorState.id, sourceDefinitionId: sourceDefinitionID_Ref, timestamp: Date.now(), details: { ...saveOutcome, vsDC: saveDC, ability: saveInfoForCondition.abilityID_Ref }, description: `${currentTarget.name} attempts ${saveInfoForCondition.abilityID_Ref} save (DC ${saveDC}) vs ${effect.condition_Ref} from ${sourceDefinition?.fullName || sourceDefinitionID_Ref}. Outcome: ${saveOutcome.outcome}.` } as any);
                                if (saveOutcome.outcome === "Success" || saveOutcome.outcome === "CriticalSuccess") {
                                    if(saveInfoForCondition.effectOnSuccess === "NO_EFFECT" || !saveInfoForCondition.effectOnSuccess) {
                                        conditionApplied = false;
                                    }
                                    // Handle other effectOnSuccess cases if needed
                                }
                            }

                            if (conditionApplied) {
                                await this.addCondition(currentTarget, effect.condition_Ref, effectInstanceId, originatorState.id, sourceDefinitionID_Ref, sourceDefinition, this.parseDurationToRounds(effect.duration, executionContext), saveInfoForCondition);
                                generatedGameEvents_List.push({ type: "CONDITION_GAINED", targetCreatureId: currentTarget.id, sourceCreatureId: originatorState.id, sourceDefinitionId: sourceDefinitionID_Ref, timestamp: Date.now(), conditionID_Ref: effect.condition_Ref, durationRounds: this.parseDurationToRounds(effect.duration, executionContext), saveDC: saveInfoForCondition?.dcFixedValue, description: `${currentTarget.name} gains condition ${effect.condition_Ref} from ${sourceDefinition?.fullName || sourceDefinitionID_Ref}.` } as GameTypes.ConditionGainedEvent);
                            }
                        }
                        break;

                    case "HEAL":
                        let totalHealing = 0;
                        if (effect.healingRolls_List) {
                            for (const healingRoll of effect.healingRolls_List) {
                                const rollRes = await DiceRoller.rollGenericDice(healingRoll.diceCount, healingRoll.diceID_Ref, healingRoll.bonusHealing);
                                totalHealing += rollRes.result;
                            }
                        }
                        if (effect.bonusValueFormula) { 
                            const healBonusFormulaContext: GameTypes.FormulaContext = { ...baseFormulaContext, actor: modifiedEntityMap.get(originatorState.id)! };
                            const parsedBonus = FormulaParser.parseAndEvaluate(effect.bonusValueFormula, healBonusFormulaContext);
                            if (parsedBonus.value !== null) {
                                totalHealing += parsedBonus.value;
                            } else {
                                console.warn(`Failed to parse bonusValueFormula for HEAL effect: ${parsedBonus.error}`);
                            }
                        }
                        if (typeof effect.bonusValue === 'number') totalHealing += effect.bonusValue;
                        
                        const oldHP = currentTarget.currentHP;
                        currentTarget.currentHP = Math.min(currentTarget.maxHP_Calculated, currentTarget.currentHP + totalHealing);
                        const healedAmount = currentTarget.currentHP - oldHP;
                        if (healedAmount > 0) {
                            generatedGameEvents_List.push({ type: "HEALING_APPLIED", targetCreatureId: currentTarget.id, sourceCreatureId: originatorState.id, sourceDefinitionId: sourceDefinitionID_Ref, timestamp: Date.now(), amount: healedAmount, description: `${currentTarget.name} is healed for ${healedAmount} HP by ${sourceDefinition?.fullName || sourceDefinitionID_Ref}. HP: ${currentTarget.currentHP}/${currentTarget.maxHP_Calculated}.` } as any);
                        }
                        await CalculationService.updateCalculatedStats(currentTarget);
                        break;
                    
                    case "GRANT_BONUS":
                    case "GRANT_ADVANTAGE_ON_ROLL": // These often have durations
                    case "IMPOSE_DISADVANTAGE_ON_ROLL":
                    case "GRANT_DISADVANTAGE_TO_ATTACKERS": // e.g. Prone effect part
                    case "GRANT_ADVANTAGE_TO_ATTACKERS": // e.g. Blinded effect part
                        const grantBonusEffectToAdd = _.cloneDeep(effect);
                        if (grantBonusEffectToAdd.bonusValueFormula) {
                            const bonusFormulaContext: GameTypes.FormulaContext = { ...baseFormulaContext, actor: currentTarget };
                            const parsedBonus = FormulaParser.parseAndEvaluate(grantBonusEffectToAdd.bonusValueFormula, bonusFormulaContext);
                            if (parsedBonus.value !== null) {
                                grantBonusEffectToAdd.bonusValue = parsedBonus.value;
                            } else {
                                console.warn(`Failed to parse bonusValueFormula for GRANT_BONUS: ${parsedBonus.error}. Bonus not applied or using static value if present.`);
                                if(typeof grantBonusEffectToAdd.bonusValue !== 'number') grantBonusEffectToAdd.bonusValue = 0; 
                            }
                        }
                         const activeGrantBonusEffect: GameTypes.ActiveParsedEffect = {
                            ...grantBonusEffectToAdd,
                            instanceID: effectInstanceId,
                            sourceDefinitionId: sourceDefinitionID_Ref,
                            sourceCreatureId: originatorState.id,
                            remainingDurationRounds: this.parseDurationToRounds(effect.duration, executionContext)
                        };
                        currentTarget.activeEffects.push(activeGrantBonusEffect);
                        generatedGameEvents_List.push({ type: "EFFECT_APPLIED", targetCreatureId: currentTarget.id, sourceCreatureId: originatorState.id, sourceDefinitionId: sourceDefinitionID_Ref, effectType: effect.effectType, timestamp: Date.now(), description: `${currentTarget.name} gains effect ${effect.effectType} (${effect.bonusTo_Ref || effect.details || 'general'}) from ${sourceDefinition?.fullName || sourceDefinitionID_Ref}.` } as any);
                        if(effect.bonusTo_Ref === "ARMOR_CLASS" || effect.bonusTo_Ref?.startsWith("ABILITY_SCORE:") || AbilityScoreDefinition_ids.includes(effect.bonusTo_Ref || "")) await CalculationService.updateCalculatedStats(currentTarget);
                        break;

                    case "SET_BASE_AC":
                        const setBaseAcEffectToAdd = _.cloneDeep(effect);
                        const acFormulaString = setBaseAcEffectToAdd.acValueFormula || setBaseAcEffectToAdd.valueFormula;

                        const activeSetBaseAcEffect: GameTypes.ActiveParsedEffect = {
                            ...setBaseAcEffectToAdd,
                            acValueFormula: acFormulaString, 
                            instanceID: effectInstanceId,
                            sourceDefinitionId: sourceDefinitionID_Ref,
                            sourceCreatureId: originatorState.id,
                            remainingDurationRounds: this.parseDurationToRounds(effect.duration, executionContext),
                        };
                        currentTarget.activeEffects.push(activeSetBaseAcEffect);
                        generatedGameEvents_List.push({ type: "EFFECT_APPLIED", targetCreatureId: currentTarget.id, sourceCreatureId: originatorState.id, sourceDefinitionId: sourceDefinitionID_Ref, effectType: effect.effectType, timestamp: Date.now(), description: `${currentTarget.name} gains effect SET_BASE_AC from ${sourceDefinition?.fullName || sourceDefinitionID_Ref}. Formula: ${acFormulaString}` } as any);
                        await CalculationService.updateCalculatedStats(currentTarget); 
                        break;

                    case "GRANT_RESISTANCE":
                    case "GRANT_IMMUNITY":
                         const activeResImmEffect: GameTypes.ActiveParsedEffect = {
                            ..._.cloneDeep(effect),
                            instanceID: effectInstanceId,
                            sourceDefinitionId: sourceDefinitionID_Ref,
                            sourceCreatureId: originatorState.id,
                            remainingDurationRounds: this.parseDurationToRounds(effect.duration, executionContext)
                        };
                        currentTarget.activeEffects.push(activeResImmEffect);
                        generatedGameEvents_List.push({ type: "EFFECT_APPLIED", targetCreatureId: currentTarget.id, sourceCreatureId: originatorState.id, sourceDefinitionId: sourceDefinitionID_Ref, effectType: effect.effectType, timestamp: Date.now(), description: `${currentTarget.name} gains ${effect.effectType} (${effect.resistanceScope || 'various'}) from ${sourceDefinition?.fullName || sourceDefinitionID_Ref}.` } as any);
                        break;
                    
                    case "INCREASE_MAX_HP":
                        const increaseMaxHpEffectToAdd = _.cloneDeep(effect);
                        if (increaseMaxHpEffectToAdd.valueFormula) {
                             const hpFormulaContext: GameTypes.FormulaContext = { ...baseFormulaContext, actor: currentTarget };
                             const parsedHpIncrease = FormulaParser.parseAndEvaluate(increaseMaxHpEffectToAdd.valueFormula, hpFormulaContext);
                             if (parsedHpIncrease.value !== null) {
                                 increaseMaxHpEffectToAdd.value = parsedHpIncrease.value; 
                             } else {
                                 console.warn(`Failed to parse valueFormula for INCREASE_MAX_HP: ${parsedHpIncrease.error}.`);
                                 increaseMaxHpEffectToAdd.value = 0; // Fallback
                             }
                        }

                        const activeIncreaseMaxHpEffect: GameTypes.ActiveParsedEffect = {
                            ...increaseMaxHpEffectToAdd,
                            instanceID: effectInstanceId,
                            sourceDefinitionId: sourceDefinitionID_Ref,
                            sourceCreatureId: originatorState.id,
                            remainingDurationRounds: this.parseDurationToRounds(effect.duration, executionContext)
                        };
                        currentTarget.activeEffects.push(activeIncreaseMaxHpEffect);
                        
                        const oldMaxHp = currentTarget.maxHP_Calculated;
                        await CalculationService.updateCalculatedStats(currentTarget); 
                        const actualHpIncrease = currentTarget.maxHP_Calculated - oldMaxHp;
                        if (actualHpIncrease > 0) {
                            currentTarget.currentHP += actualHpIncrease; 
                        }
                        generatedGameEvents_List.push({ type: "EFFECT_APPLIED", targetCreatureId: currentTarget.id, sourceCreatureId: originatorState.id, sourceDefinitionId: sourceDefinitionID_Ref, effectType: effect.effectType, timestamp: Date.now(), description: `${currentTarget.name}'s Max HP increased by ${increaseMaxHpEffectToAdd.value} from ${sourceDefinition?.fullName || sourceDefinitionID_Ref}. New Max HP: ${currentTarget.maxHP_Calculated}.` } as any);
                        break;

                    default:
                        // For other effects that might have a duration or are just markers
                        if (effect.duration || sourceEntityType === "CONDITION") { // Conditions always apply as active effects
                             const genericActiveEffect: GameTypes.ActiveParsedEffect = {
                                ..._.cloneDeep(effect),
                                instanceID: effectInstanceId,
                                sourceDefinitionId: sourceDefinitionID_Ref,
                                sourceCreatureId: originatorState.id,
                                remainingDurationRounds: this.parseDurationToRounds(effect.duration, executionContext)
                            };
                            currentTarget.activeEffects.push(genericActiveEffect);
                            generatedGameEvents_List.push({ type: "EFFECT_APPLIED", targetCreatureId: currentTarget.id, sourceCreatureId: originatorState.id, sourceDefinitionId: sourceDefinitionID_Ref, effectType: effect.effectType, timestamp: Date.now(), description: `${currentTarget.name} gains effect ${effect.effectType} from ${sourceDefinition?.fullName || sourceDefinitionID_Ref}.` } as any);
                        } else {
                            console.warn(`EffectType "${effect.effectType}" not fully implemented or not an ongoing effect.`);
                        }
                }
                modifiedEntityMap.set(currentTarget.id, currentTarget); // Update map with modified target
            }
        }
        
        return { modifiedEntitiesState_List: Array.from(modifiedEntityMap.values()), generatedGameEvents_List };
    }

    private static async addCondition(
        target: GameTypes.CreatureRuntimeState, 
        conditionID: string, 
        sourceEffectInstanceID: string, 
        sourceCreatureID: string,
        sourceDefinitionId: string, 
        sourceDefinition?: GameTypes.SpellDefinition | GameTypes.ItemDefinition | GameTypes.FeatureDefinition | GameTypes.ConditionDefinition,
        durationRounds?: number,
        saveInfoForCondition?: GameTypes.SavingThrowInfo 
    ) {
        if (target.activeConditions.some(c => c.conditionID === conditionID)) {
            // console.log(`Condition ${conditionID} already active on ${target.name}. TODO: Handle stacking/refreshing.`);
            // For simplicity, we don't re-apply if already present. Some conditions might stack (e.g., exhaustion) - future enhancement.
            return;
        }
        const conditionDef = await getItemById(conditionID) as GameTypes.ConditionDefinition;
        if (!conditionDef) {
            console.error(`ConditionDefinition not found for ID: ${conditionID}`);
            return;
        }

        const activeCondition: GameTypes.ActiveCondition = {
            conditionID,
            definition: _.cloneDeep(conditionDef), // Store a copy of the definition
            sourceEffectID: sourceEffectInstanceID, 
            sourceCreatureID,
            sourceDefinitionID: sourceDefinitionId, // Added to store the ID of the source definition (spell, item, etc.)
            sourceDefinition: sourceDefinition ? _.cloneDeep(sourceDefinition) : undefined,
            remainingDurationRounds: durationRounds,
        };

        if (saveInfoForCondition && saveInfoForCondition.dcFixedValue) { // dcFixedValue should be populated by now
            activeCondition.saveToEndDC = saveInfoForCondition.dcFixedValue; 
            activeCondition.saveAbilityID_Ref = saveInfoForCondition.abilityID_Ref;
            // TODO: Add saveFrequency if defined in conditionDef or effect
        }
        target.activeConditions.push(activeCondition);

        // Apply the direct effects of the condition itself
        if (conditionDef.parsedEffects_List && conditionDef.parsedEffects_List.length > 0) {
           await this.applyEffects(conditionID, "CONDITION", conditionDef.parsedEffects_List, target, [target], { sourceDefinitionId: conditionDef.conditionID });
        }
        await CalculationService.updateCalculatedStats(target); 
    }
    
    private static parseDurationToRounds(
        duration: any, 
        executionContext: GameTypes.EffectExecutionContext
    ): number | undefined {
        if (!duration) return undefined; 

        let durationValue: number | null | undefined = undefined;
        let durationUnit: string | null | undefined = undefined;
        let durationTypeRef: string | null | undefined = undefined;
        let maxDurationValue: number | null | undefined = undefined;
        let maxDurationUnit: string | null | undefined = undefined;


        if (typeof duration === 'string') {
            const lowerDuration = duration.toLowerCase().trim();
            if (lowerDuration === 'instantaneous') return 0;
            if (lowerDuration.includes('round')) {
                 const match = lowerDuration.match(/(\d+)\s*round/);
                 return match ? parseInt(match[1]) : 1;
            }
             if (lowerDuration === "1 round") return 1; // Explicit case
            if (lowerDuration === "concentration" || lowerDuration.startsWith("concentration,")) { 
                durationTypeRef = "CONCENTRATION";
                // Try to parse max duration from string if present, e.g., "Concentration, up to 1 minute"
                const concMatch = lowerDuration.match(/up to\s*(\d+)\s*(minute|hour|round)/);
                if (concMatch) {
                    maxDurationValue = parseInt(concMatch[1]);
                    maxDurationUnit = concMatch[2];
                } else { // Default concentration if no max specified
                    maxDurationValue = 1; maxDurationUnit = "minute"; // default 1 min = 10 rounds
                }
            }
            if (lowerDuration === "until dispelled" || lowerDuration === "until triggered" || lowerDuration === "special") {
                return undefined; // Indefinite or specially handled
            }
            const timeMatch = lowerDuration.match(/(\d+)\s*(minute|hour|day)s?/);
            if (timeMatch) {
                durationValue = parseInt(timeMatch[1]);
                durationUnit = timeMatch[2];
            }
        } else if (typeof duration === 'object' && duration !== null) {
            durationTypeRef = (duration as GameTypes.SpellDuration).durationTypeID_Ref;
            durationValue = (duration as GameTypes.SpellDuration).value;
            durationUnit = (duration as GameTypes.SpellDuration).unit?.toLowerCase();

            if ((duration as any).maxDuration && typeof (duration as any).maxDuration.value === 'number' && typeof (duration as any).maxDuration.unit === 'string') {
                maxDurationValue = (duration as any).maxDuration.value;
                maxDurationUnit = (duration as any).maxDuration.unit.toLowerCase();
             } else if (durationTypeRef === "CONCENTRATION" && durationValue && durationUnit) { // If concentration has explicit duration like "Conc, 10 minutes"
                maxDurationValue = durationValue;
                maxDurationUnit = durationUnit;
             }
        }

        const finalValueToConvert = maxDurationValue !== undefined ? maxDurationValue : durationValue;
        const finalUnitToConvert = maxDurationUnit !== undefined ? maxDurationUnit : durationUnit;


        if (durationTypeRef === "INSTANTANEOUS" || finalValueToConvert === null || finalValueToConvert === undefined) return 0; // Instantaneous or no value
        if ((durationTypeRef === "ROUND_BASED" || finalUnitToConvert === "rounds" || finalUnitToConvert === "round") && typeof finalValueToConvert === 'number') return finalValueToConvert;
        
        if ((durationTypeRef === "TIME_BASED" || durationTypeRef === "CONCENTRATION") && typeof finalValueToConvert === 'number' && finalUnitToConvert) {
            if (finalUnitToConvert === "minute" || finalUnitToConvert === "minutes") return finalValueToConvert * 10; // 1 min = 10 rounds
            if (finalUnitToConvert === "hour" || finalUnitToConvert === "hours") return finalValueToConvert * 600; // 1 hour = 60 mins = 600 rounds
            if (finalUnitToConvert === "day" || finalUnitToConvert === "days") return finalValueToConvert * 600 * 24; 
        }
        
        // Fallback for simple concentration if no other values found
        if (durationTypeRef === "CONCENTRATION" && finalValueToConvert === undefined) return 10; // Default 1 minute for basic concentration

        return undefined; // Cannot parse
    }

    public static processEndOfTurnEffects(targetState: GameTypes.CreatureRuntimeState, currentRound: number): GameTypes.GameEventBase[] {
        const events: GameTypes.GameEventBase[] = [];
        const effectsToRemove: string[] = []; 
        const conditionsToRemove: string[] = []; 

        // Process Active Effects
        for (let i = targetState.activeEffects.length - 1; i >= 0; i--) {
            const effect = targetState.activeEffects[i];
            if (effect.remainingDurationRounds !== undefined) {
                effect.remainingDurationRounds--;
                if (effect.remainingDurationRounds <= 0) {
                    effectsToRemove.push(effect.instanceID);
                    events.push({ type: "EFFECT_REMOVED", targetCreatureId: targetState.id, sourceCreatureId: effect.sourceCreatureId, sourceDefinitionId: effect.sourceDefinitionId, timestamp: Date.now(), details: {effectType: effect.effectType, instanceId: effect.instanceID}, description: `${targetState.name} loses effect ${effect.effectType || effect.details} from ${effect.sourceDefinitionId}.` } as any);
                }
            }
        }
        if (effectsToRemove.length > 0) {
            targetState.activeEffects = targetState.activeEffects.filter(eff => !effectsToRemove.includes(eff.instanceID));
        }

        // Process Active Conditions
        for (let i = targetState.activeConditions.length - 1; i >= 0; i--) {
            const cond = targetState.activeConditions[i];
            if (cond.remainingDurationRounds !== undefined) {
                cond.remainingDurationRounds--;
                if (cond.remainingDurationRounds <= 0) {
                    conditionsToRemove.push(cond.conditionID); 
                     events.push({ type: "CONDITION_REMOVED", targetCreatureId: targetState.id, sourceCreatureId: cond.sourceCreatureID, sourceDefinitionId: cond.sourceDefinitionID, conditionID_Ref: cond.conditionID, timestamp: Date.now(), description: `${targetState.name} is no longer ${cond.definition?.fullName || cond.conditionID}.` } as any);
                }
            }
            // TODO: Handle conditions that allow a save at the end of turn (e.g., some poisons, ongoing fear)
            // if (cond.saveToEndDC && cond.saveAbilityID_Ref && (cond.saveFrequency === 'END_OF_TURN' || cond.saveFrequency === 'EACH_TURN')) { ... }
        }
         if (conditionsToRemove.length > 0) {
            // Before removing the condition, remove its associated effects from targetState.activeEffects
            for(const condIdToRemove of conditionsToRemove){
                const condDef = targetState.activeConditions.find(c => c.conditionID === condIdToRemove)?.definition;
                if(condDef?.parsedEffects_List){
                    targetState.activeEffects = targetState.activeEffects.filter(ae => {
                        // This is tricky: effects from conditions don't have unique instance IDs unless we make them.
                        // A simpler way is to filter by sourceDefinitionId matching the conditionId.
                        return ae.sourceDefinitionId !== condIdToRemove;
                    });
                }
            }
            targetState.activeConditions = targetState.activeConditions.filter(c => !conditionsToRemove.includes(c.conditionID));
        }
        
        // If any effects or conditions were removed, stats might change
        if (effectsToRemove.length > 0 || conditionsToRemove.length > 0) {
             CalculationService.updateCalculatedStats(targetState); 
        }

        return events;
    }
}
const AbilityScoreDefinition_ids = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];