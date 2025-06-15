// src/engines/TurnAndRoundManager.ts
import *_ from "https://esm.sh/lodash@4.17.21";
import * as GameTypes from '../../types';
import { DiceRoller } from './DiceRoller';
import { CalculationService } from './CalculationService';
import { EffectExecutionEngine } from './EffectExecutionEngine';
import { SpellcastingEngine } from './SpellcastingEngine';
import { AttackResolutionEngine } from './AttackResolutionEngine'; 
import { DamageApplicationEngine } from './DamageApplicationEngine';
import { getItemById } from '../services/dataService';
import { FormulaParser } from '../services/FormulaParser';
import { ResourceManagementEngine } from './ResourceManagementEngine';
import { v4 as uuidv4 } from 'uuid';


export class TurnAndRoundManager {
    private combatState: GameTypes.CombatStateSnapshot | null = null;

    constructor() {}

    public async initializeCombatant(combatantState: GameTypes.CreatureRuntimeState): Promise<void> {
        // Ensure all derived stats are up-to-date before combat begins
        await CalculationService.updateCalculatedStats(combatantState);
        // Initialize resources like Hit Dice if not already present
        await ResourceManagementEngine.initializeCreatureResources(combatantState);
    }


    public async startCombat(combatantInitialStates_List: GameTypes.CreatureRuntimeState[]): Promise<GameTypes.CombatStateSnapshot> {
        const initiativeOrder: { creatureId: string, initiativeRoll: number }[] = [];
        const processedCombatants: GameTypes.CreatureRuntimeState[] = [];

        for (const combatant of combatantInitialStates_List) {
            const freshCombatantState = _.cloneDeep(combatant); // Work with a copy
            await this.initializeCombatant(freshCombatantState); // Ensure stats are calculated
            processedCombatants.push(freshCombatantState);

            const initiativeMod = CalculationService.calculateInitiativeModifier(freshCombatantState);
            const initiativeRollResult = DiceRoller.rollD20(initiativeMod, {
                // TODO: Check for advantage/disadvantage on initiative from effects
                // For now, assume a straight roll or that it's handled by CalculationService.calculateInitiativeModifier effects.
                hasAdvantage: freshCombatantState.activeEffects.some(e => e.effectType === "GRANT_ADVANTAGE_ON_ROLL" && e.bonusTo_Ref === "INITIATIVE_ROLL"), 
                hasDisadvantage: freshCombatantState.activeEffects.some(e => e.effectType === "IMPOSE_DISADVANTAGE_ON_ROLL" && e.bonusTo_Ref === "INITIATIVE_ROLL"),
                rollType: 'Initiative',
            });
            freshCombatantState.currentInitiativeRoll = initiativeRollResult.result;
            initiativeOrder.push({ creatureId: freshCombatantState.id, initiativeRoll: initiativeRollResult.result });
        }

        initiativeOrder.sort((a, b) => {
            if (b.initiativeRoll !== a.initiativeRoll) {
                return b.initiativeRoll - a.initiativeRoll;
            }
            const combatantA = processedCombatants.find(c => c.id === a.creatureId);
            const combatantB = processedCombatants.find(c => c.id === b.creatureId);
            const dexA = CalculationService.getAbilityModifier(combatantA?.abilityScores_Effective?.["DEX"] || 10);
            const dexB = CalculationService.getAbilityModifier(combatantB?.abilityScores_Effective?.["DEX"] || 10);
            if (dexB !== dexA) return dexB - dexA;
            // Fallback for identical initiative and dex: random or stable sort based on original order
            return combatantInitialStates_List.findIndex(c => c.id === a.creatureId) - combatantInitialStates_List.findIndex(c => c.id === b.creatureId);
        });

        this.combatState = {
            roundNumber: 1,
            currentTurnCreatureId: initiativeOrder[0]?.creatureId || null,
            initiativeOrder,
            combatants: processedCombatants,
            log: [{ type: "COMBAT_STARTED", timestamp: Date.now(), description: "Combat has begun!" } as GameTypes.GameEventBase],
        };
        
        if (this.combatState.currentTurnCreatureId) {
            this.beginTurnForCreature(this.combatState.currentTurnCreatureId);
        }

        const firstActorName = this.combatState.combatants.find(c => c.id === this.combatState.currentTurnCreatureId)?.name || "Unknown";
        this.combatState.log.push({ type: "ROUND_STARTED", round: 1, timestamp: Date.now(), details: { currentTurnCreatureId: this.combatState.currentTurnCreatureId}, description: `Round 1 started. ${firstActorName}'s turn.` } as any);
        return _.cloneDeep(this.combatState);
    }

    private beginTurnForCreature(creatureId: string) {
        if (!this.combatState) return;
        const creature = this.combatState.combatants.find(c => c.id === creatureId);
        if (!creature) return;

        creature.actionEconomyState = {
            hasAction: true,
            hasBonusAction: true,
            hasReaction: true, 
            movementUsedThisTurn: 0,
        };
        
        this.combatState.log.push({ type: "TURN_STARTED", sourceCreatureId: creature.id, round: this.combatState.roundNumber, timestamp: Date.now(), description: `Turn started for ${creature.name} (Round ${this.combatState.roundNumber}).` } as any);
    }
    
    private endTurnForCreature(creatureId: string) {
        if (!this.combatState) return;
        const creature = this.combatState.combatants.find(c => c.id === creatureId);
        if (!creature) return;

        if(this.combatState){ // Ensure combatState is still valid
            const endOfTurnEvents = EffectExecutionEngine.processEndOfTurnEffects(creature, this.combatState.roundNumber);
            this.combatState.log.push(...endOfTurnEvents);
             // Re-calculate stats if effects ended that might change them (e.g. AC, saves)
            if (endOfTurnEvents.some(e => e.type === "EFFECT_REMOVED" || e.type === "CONDITION_REMOVED")) {
                CalculationService.updateCalculatedStats(creature);
            }
        }

        this.combatState.log.push({ type: "TURN_ENDED", sourceCreatureId: creature.id, round: this.combatState.roundNumber, timestamp: Date.now(), description: `Turn ended for ${creature.name}.` } as any);
    }


    public progressToNextTurn(): GameTypes.CombatStateSnapshot | null {
        if (!this.combatState || !this.combatState.currentTurnCreatureId) return null;

        this.endTurnForCreature(this.combatState.currentTurnCreatureId);

        const currentIndex = this.combatState.initiativeOrder.findIndex(
            item => item.creatureId === this.combatState!.currentTurnCreatureId
        );

        let nextIndex = currentIndex + 1;
        
        let foundNextActiveTurn = false;
        for (let i = 0; i < this.combatState.initiativeOrder.length; i++) {
            const potentialNextIndex = (currentIndex + 1 + i) % this.combatState.initiativeOrder.length;
            const nextCreatureId = this.combatState.initiativeOrder[potentialNextIndex].creatureId;
            const nextCreature = this.combatState.combatants.find(c => c.id === nextCreatureId);

            if (nextCreature && nextCreature.currentHP > 0 && 
                !nextCreature.activeConditions.some(c => c.conditionID === "INCAPACITATED" || c.conditionID === "STUNNED" || c.conditionID === "PARALYZED" || c.conditionID === "UNCONSCIOUS" || c.conditionID === "PETRIFIED")) {
                nextIndex = potentialNextIndex;
                foundNextActiveTurn = true;
                break;
            }
        }
        
        if (!foundNextActiveTurn) {
            // All remaining combatants are incapacitated, combat effectively ends or is stuck
            this.combatState.log.push({ type: "COMBAT_ENDED", timestamp: Date.now(), description: "Combat ends: No active combatants remaining."} as any);
            this.combatState.currentTurnCreatureId = null; // Mark combat as effectively over
            return _.cloneDeep(this.combatState);
        }


        if (nextIndex <= currentIndex) { // Wrapped around to the start of the order
            this.combatState.roundNumber++;
            this.combatState.log.push({ type: "ROUND_ENDED", round: this.combatState.roundNumber -1, timestamp: Date.now(), description: `Round ${this.combatState.roundNumber-1} ended.`} as any);
            const nextActorName = this.combatState.combatants.find(c => c.id === this.combatState.initiativeOrder[nextIndex]?.creatureId)?.name || "Unknown";
            this.combatState.log.push({ type: "ROUND_STARTED", round: this.combatState.roundNumber, details: { currentTurnCreatureId: this.combatState.initiativeOrder[nextIndex]?.creatureId || null}, timestamp: Date.now(), description: `Round ${this.combatState.roundNumber} started. ${nextActorName}'s turn.`} as any);
        }
        
        this.combatState.currentTurnCreatureId = this.combatState.initiativeOrder[nextIndex]?.creatureId || null;
        
        if (this.combatState.currentTurnCreatureId) {
            this.beginTurnForCreature(this.combatState.currentTurnCreatureId);
        }

        return _.cloneDeep(this.combatState);
    }

    public async processAction(actionChoice: GameTypes.ActionChoice): Promise<{ success: boolean; reason?: string; generatedGameEvents_List: GameTypes.GameEventBase[] }> {
        if (!this.combatState || this.combatState.currentTurnCreatureId !== actionChoice.actorId) {
            return { success: false, reason: "Not the actor's turn or combat not active.", generatedGameEvents_List: [] };
        }

        const actorIndexInCombatants = this.combatState.combatants.findIndex(c => c.id === actionChoice.actorId);
        if (actorIndexInCombatants === -1) {
            return { success: false, reason: "Actor not found in combat state.", generatedGameEvents_List: [] };
        }
        const currentActorState = this.combatState.combatants[actorIndexInCombatants];


        let results: { success: boolean; reason?: string; generatedGameEvents_List: GameTypes.GameEventBase[] } = 
            { success: false, reason: "Action type not processed.", generatedGameEvents_List: []};
        let spellCastEngineResult: { success: boolean; reason?: string; modifiedEntities: GameTypes.CreatureRuntimeState[]; gameEvents: GameTypes.GameEventBase[]; } | undefined;


        switch (actionChoice.actionType) {
            case "SPELL":
                if (!actionChoice.spellID_Ref || !actionChoice.targetInfo || actionChoice.spellSlotLevel === undefined) {
                    results = { success: false, reason: "Missing parameters for spell action.", generatedGameEvents_List: [] };
                    break;
                }
                
                // For creature "spells" from action list, we might need a dummy SpellDefinition or handle differently
                // For now, assume actionChoice.spellID_Ref is a valid SpellDefinition ID if it's a "real" spell.
                // If it's a creature actionName used as a spell proxy:
                const spellDefToCast = actionChoice.spellID_Ref.includes("_ACTION_AS_SPELL_") // A made-up convention for creature spell-like actions
                    ? ({ /* create dummy SpellDefinition from CreatureAction here */ } as GameTypes.SpellDefinition)
                    : await getItemById(actionChoice.spellID_Ref) as GameTypes.SpellDefinition;

                if (!spellDefToCast) { // Real spell def not found
                     results = { success: false, reason: `Spell definition ${actionChoice.spellID_Ref} not found.`, generatedGameEvents_List: [] };
                     break;
                }
                
                let spellCastingTimeActionType = spellDefToCast.castingTime?.actionTypeID_Ref;
                // If it was a creature action used as a spell, determine action type from that
                if (actionChoice.spellID_Ref.includes("_ACTION_AS_SPELL_")){
                    const originalActionName = actionChoice.spellID_Ref.split("_ACTION_AS_SPELL_")[0];
                    const creatureActionForSpell = currentActorState.creatureDefinition?.actions_List?.find(a => a.actionName === originalActionName);
                    // Assume creature actions that are spell-like use their standard action economy or specify. This is complex.
                    // For now, assume 'ACTION' if not specified otherwise in creatureAction.
                    spellCastingTimeActionType = creatureActionForSpell?.activationUses?.rechargeOn_Ref_List ? "ACTION" : "ACTION"; // Placeholder for more complex action economy mapping
                }


                let actionTypeUsed: 'ACTION' | 'BONUS_ACTION' | 'REACTION' | 'OTHER' = 'OTHER';
                if (spellCastingTimeActionType === "ACTION") {
                    if (!currentActorState.actionEconomyState.hasAction) {
                        results = { success: false, reason: "No action available for this spell.", generatedGameEvents_List: [] };
                        break;
                    }
                    actionTypeUsed = 'ACTION';
                } else if (spellCastingTimeActionType === "BONUS_ACTION") {
                     if (!currentActorState.actionEconomyState.hasBonusAction) {
                        results = { success: false, reason: "No bonus action available for this spell.", generatedGameEvents_List: [] };
                        break;
                    }
                    actionTypeUsed = 'BONUS_ACTION';
                }
                

                spellCastEngineResult = await SpellcastingEngine.castSpell(
                    currentActorState, 
                    actionChoice.spellID_Ref, // This needs to be the actual SpellDefinition ID
                    actionChoice.targetInfo,
                    actionChoice.spellSlotLevel,
                    this.combatState.combatants 
                );
                
                results.success = spellCastEngineResult.success;
                results.reason = spellCastEngineResult.reason;
                results.generatedGameEvents_List.push(...spellCastEngineResult.gameEvents);

                if (spellCastEngineResult.success) {
                    if (actionTypeUsed === 'ACTION') currentActorState.actionEconomyState.hasAction = false;
                    else if (actionTypeUsed === 'BONUS_ACTION') currentActorState.actionEconomyState.hasBonusAction = false;
                    
                    spellCastEngineResult.modifiedEntities.forEach(modifiedEntity => {
                        const index = this.combatState!.combatants.findIndex(c => c.id === modifiedEntity.id);
                        if (index !== -1) {
                            this.combatState!.combatants[index] = _.cloneDeep(modifiedEntity);
                        }
                    });
                     // Ensure the current actor's state is updated if modified by the spell itself
                    const modifiedActor = spellCastEngineResult.modifiedEntities.find(m => m.id === currentActorState.id);
                    if (modifiedActor) {
                         this.combatState!.combatants[actorIndexInCombatants] = _.cloneDeep(modifiedActor);
                    }
                }
                break;
            
            case "ATTACK":
                if (!currentActorState.actionEconomyState.hasAction) {
                    return { success: false, reason: "No action available for attack.", generatedGameEvents_List: [] };
                }
                if (!actionChoice.targetInfo?.creatureIDs || actionChoice.targetInfo.creatureIDs.length === 0) {
                     return { success: false, reason: "No target specified for attack.", generatedGameEvents_List: [] };
                }
                const targetId = actionChoice.targetInfo.creatureIDs[0];
                const targetIndexInCombatants = this.combatState.combatants.findIndex(c => c.id === targetId);
                if (targetIndexInCombatants === -1) return { success: false, reason: "Target not found.", generatedGameEvents_List: [] };
                const targetState = this.combatState.combatants[targetIndexInCombatants];


                let attackSourceDefinition: GameTypes.ItemDefinition | GameTypes.CreatureAction | undefined;
                let parsedAttackAction: GameTypes.ParsedAttackAction | undefined;
                let onHitEffectsToProcess: GameTypes.ParsedEffect[] = [];

                if (actionChoice.itemID_Ref) { 
                    attackSourceDefinition = await getItemById(actionChoice.itemID_Ref) as GameTypes.ItemDefinition;
                    if (!attackSourceDefinition || !attackSourceDefinition.properties.weaponSpecifics) {
                        return { success: false, reason: `Item ${actionChoice.itemID_Ref} is not a valid weapon.`, generatedGameEvents_List: [] };
                    }
                    const weaponSpec = attackSourceDefinition.properties.weaponSpecifics;
                    const isFinesse = weaponSpec.weaponProperties_Tag_List?.includes("FINESSE");
                    const strMod = CalculationService.getAbilityModifier(currentActorState.abilityScores_Effective.STR || 10);
                    const dexMod = CalculationService.getAbilityModifier(currentActorState.abilityScores_Effective.DEX || 10);
                    const associatedAbility = isFinesse && dexMod > strMod ? "DEX" : "STR";
                    
                    parsedAttackAction = {
                        sourceDefinitionId: attackSourceDefinition.itemID,
                        actionName: attackSourceDefinition.fullName,
                        associatedAbilityID_Ref: associatedAbility,
                        attackBonusFormula: `ABILITY_MODIFIER:${associatedAbility} + PROFICIENCY_BONUS`, 
                        range: weaponSpec.range,
                    };
                    if(attackSourceDefinition.parsedEffects_List) { // Item effects like Flametongue
                        onHitEffectsToProcess.push(...attackSourceDefinition.parsedEffects_List.filter(e => e.trigger === "ON_ATTACK_HIT"));
                    }

                } else if (actionChoice.actionName && currentActorState.creatureDefinition?.actions_List) { 
                    const creatureAction = currentActorState.creatureDefinition.actions_List.find(a => a.actionName === actionChoice.actionName);
                    if (!creatureAction || !creatureAction.actionType.includes("ATTACK")) {
                         return { success: false, reason: `Creature action "${actionChoice.actionName}" not found or not an attack.`, generatedGameEvents_List: [] };
                    }
                    attackSourceDefinition = creatureAction;
                    parsedAttackAction = {
                        sourceDefinitionId: `${currentActorState.creatureDefinitionID_Ref}_${creatureAction.actionName.replace(/\s+/g, '_')}`,
                        actionName: creatureAction.actionName,
                        associatedAbilityID_Ref: undefined, 
                        attackBonusFormula: creatureAction.attackBonusFormula,
                        fixedAttackBonus: creatureAction.attackBonusValue,
                        range: creatureAction.range || creatureAction.reach,
                    };
                    if (creatureAction.onHitEffects_List) {
                        onHitEffectsToProcess.push(...creatureAction.onHitEffects_List);
                    }
                } else {
                     return { success: false, reason: "No valid attack source (item or actionName) specified.", generatedGameEvents_List: [] };
                }

                if (!parsedAttackAction) return { success: false, reason: "Failed to parse attack action.", generatedGameEvents_List: [] };

                const attackOutcome = await AttackResolutionEngine.resolveAttack(currentActorState, targetState, parsedAttackAction);
                results.generatedGameEvents_List.push({ type: "ATTACK_MADE", sourceCreatureId: currentActorState.id, targetCreatureId: targetState.id, sourceDefinitionId: parsedAttackAction.sourceDefinitionId, details: attackOutcome, timestamp: Date.now(), description: `${currentActorState.name} attacks ${targetState.name} with ${parsedAttackAction.actionName || parsedAttackAction.sourceDefinitionId}. Outcome: ${attackOutcome.outcome} (Roll: ${attackOutcome.attackRollResult} vs AC ${attackOutcome.targetACValue}).` } as GameTypes.AttackMadeEvent);

                if (attackOutcome.outcome === 'Hit' || attackOutcome.outcome === 'CriticalHit') {
                    let baseDamageRolls: GameTypes.DamageRoll[] = [];
                    if (attackSourceDefinition && 'properties' in attackSourceDefinition && attackSourceDefinition.properties.weaponSpecifics) { 
                        baseDamageRolls = _.cloneDeep(attackSourceDefinition.properties.weaponSpecifics.damageRolls_List);
                         // Handle versatile
                        if (attackSourceDefinition.properties.weaponSpecifics.versatileDamageRoll /* && some_condition_for_two_handed_use */) {
                           // baseDamageRolls = [_.cloneDeep(attackSourceDefinition.properties.weaponSpecifics.versatileDamageRoll)];
                        }
                    } else if (attackSourceDefinition && 'onHitEffects_List' in attackSourceDefinition) { 
                        // Creature actions often define damage directly in onHitEffects
                        const dealDamageEffect = attackSourceDefinition.onHitEffects_List?.find(e => e.effectType === "DEAL_DAMAGE" || e.effectType === "DEAL_DAMAGE_ON_ATTACK_HIT");
                        if (dealDamageEffect?.damageRolls_List) {
                            baseDamageRolls = _.cloneDeep(dealDamageEffect.damageRolls_List);
                        }
                    } else if (attackSourceDefinition && 'parsedEffects_List' in attackSourceDefinition) {
                        // For items that grant an attack action via a parsed effect
                         const dealDamageEffect = attackSourceDefinition.parsedEffects_List?.find(e => e.effectType === "DEAL_DAMAGE_ON_ATTACK_HIT");
                         if (dealDamageEffect?.damageRolls_List) {
                            baseDamageRolls = _.cloneDeep(dealDamageEffect.damageRolls_List);
                        }
                    }


                    const processedDamageRolls: GameTypes.DamageRoll[] = [];
                    for (const dmgRoll of baseDamageRolls) {
                        let bonusDmg = dmgRoll.bonusDamage || 0;
                        if (dmgRoll.bonusDamageFormula) {
                            const formulaContext: GameTypes.FormulaContext = {
                                actor: currentActorState, target: targetState,
                                item: (attackSourceDefinition && 'itemID' in attackSourceDefinition) ? attackSourceDefinition : undefined,
                                feature: (attackSourceDefinition && 'actionName' in attackSourceDefinition) ? { featureID: parsedAttackAction.sourceDefinitionId, fullName: parsedAttackAction.actionName, parsedEffects_List: (attackSourceDefinition as GameTypes.CreatureAction).onHitEffects_List } as any : undefined,
                            };
                            const parsedBonus = FormulaParser.parseAndEvaluate(dmgRoll.bonusDamageFormula, formulaContext);
                            if (parsedBonus.value !== null) bonusDmg += parsedBonus.value;
                            else console.warn(`Failed to parse bonusDamageFormula "${dmgRoll.bonusDamageFormula}" for ${parsedAttackAction.sourceDefinitionId}: ${parsedBonus.error}`);
                        }
                        processedDamageRolls.push({ ...dmgRoll, bonusDamage: bonusDmg });
                    }
                    
                    const damageRollResult = await DiceRoller.rollSpecificDamage(processedDamageRolls, attackOutcome.outcome === 'CriticalHit');
                    const attackResultForEffects: GameTypes.AttackResult = {
                        d20Rolls: attackOutcome.d20NaturalRolls, finalAttackRoll: attackOutcome.attackRollResult,
                        isHit: true, 
                        isCriticalHit: attackOutcome.outcome === 'CriticalHit',
                        isCriticalMiss: false, 
                        damageBreakdown: damageRollResult.damageBreakdown, totalDamage: damageRollResult.totalDamage,
                        totalDamageAfterDefenses: 0, 
                    };

                    const appliedDamageInstances: GameTypes.AppliedDamageInstance[] = damageRollResult.damageBreakdown.map(dr => ({
                        rawAmount: dr.modifiedTotal, damageTypeID_Ref: dr.typeID_Ref,
                        isMagicalSource: parsedAttackAction?.attackBonusFormula?.includes("SPELL_ABILITY_MODIFIER") || (attackSourceDefinition && 'parsedEffects_List' in attackSourceDefinition && attackSourceDefinition.parsedEffects_List?.some(e=>e.isMagical)),
                         sourceEffectID_Ref: parsedAttackAction?.sourceDefinitionId,
                    }));

                    if(appliedDamageInstances.length > 0) {
                        const hpBeforeDamageApplication = targetState.currentHP;
                        const damageApplicationResult = await DamageApplicationEngine.applyDamage(targetState, appliedDamageInstances, currentActorState, parsedAttackAction.sourceDefinitionId);
                        
                        targetState.currentHP += damageApplicationResult.hpDelta; // Apply delta to the actual object in combatState
                        targetState.temporaryHP += damageApplicationResult.tempHpDelta;
                        if(targetState.currentHP < 0) targetState.currentHP = 0; // Don't let HP go below 0 visually
                        
                        const primaryDamageType = appliedDamageInstances[0]?.damageTypeID_Ref || "UNKNOWN";
                        const damageEventDetails: GameTypes.DamageAppliedEventDetails = {
                            totalAmount: damageApplicationResult.finalDamageAppliedOverall,
                            breakdown: damageApplicationResult.detailedBreakdown.map(db => ({
                                type: db.type, raw: db.raw, modified: db.modifiedByReduction, finalApplied: db.finalAppliedToHPOrTempHP
                            })),
                            hpReduced: Math.abs(damageApplicationResult.hpDelta), tempHpReduced: Math.abs(damageApplicationResult.tempHpDelta),
                            wasLethal: targetState.currentHP <=0 && hpBeforeDamageApplication > 0,
                            isCriticalHit: attackOutcome.outcome === 'CriticalHit', damageTypeID_Ref: primaryDamageType
                        };
                        results.generatedGameEvents_List.push({
                            type: "DAMAGE_APPLIED", sourceCreatureId: currentActorState.id, targetCreatureId: targetState.id,
                            sourceDefinitionId: parsedAttackAction.sourceDefinitionId, timestamp: Date.now(), details: damageEventDetails,
                            description: `${targetState.name} takes ${damageApplicationResult.finalDamageAppliedOverall} ${primaryDamageType} damage from ${currentActorState.name}'s attack. HP: ${targetState.currentHP}/${targetState.maxHP_Calculated}. TempHP: ${targetState.temporaryHP}.`
                        } as GameTypes.DamageAppliedEvent);

                        for (const condId of damageApplicationResult.newConditions_Ref_List) {
                            const effectApplicationResult = await EffectExecutionEngine.applyEffects(
                                parsedAttackAction.sourceDefinitionId, "ATTACK_HIT_CONDITION_TRIGGER",
                                [{effectType: "APPLY_CONDITION", condition_Ref: condId }], 
                                currentActorState, [targetState], { attackRollResult: attackResultForEffects }
                            );
                             results.generatedGameEvents_List.push(...effectApplicationResult.generatedGameEvents_List);
                            const modifiedTargetFromCondition = effectApplicationResult.modifiedEntitiesState_List.find(me => me.id === targetState.id);
                            if (modifiedTargetFromCondition) {
                                Object.assign(this.combatState.combatants[targetIndexInCombatants], modifiedTargetFromCondition);
                            }
                        }
                         await CalculationService.updateCalculatedStats(this.combatState.combatants[targetIndexInCombatants]); // Recalculate if conditions changed AC etc.
                    }

                    const allOnHitEffects = [...onHitEffectsToProcess];
                     currentActorState.activeEffects.forEach(ae => {
                        if (ae.trigger === "ON_ATTACK_HIT") allOnHitEffects.push(ae);
                    });

                    if (allOnHitEffects.length > 0) {
                       const onHitContext: GameTypes.EffectExecutionContext = { 
                           attackRollResult: attackResultForEffects, currentRound: this.combatState.roundNumber, 
                           currentTurnCreatureID: currentActorState.id, sourceDefinitionId: parsedAttackAction.sourceDefinitionId
                        };
                       const onHitApplicationResult = await EffectExecutionEngine.applyEffects(
                           parsedAttackAction.sourceDefinitionId, 
                           (attackSourceDefinition && 'itemID' in attackSourceDefinition) ? "ITEM" : "CREATURE_ACTION",
                           allOnHitEffects, currentActorState, [targetState], onHitContext
                       );
                       results.generatedGameEvents_List.push(...onHitApplicationResult.generatedGameEvents_List);
                        onHitApplicationResult.modifiedEntitiesState_List.forEach(modifiedEntity => {
                            const idx = this.combatState!.combatants.findIndex(c => c.id === modifiedEntity.id);
                            if (idx !== -1) this.combatState!.combatants[idx] = _.cloneDeep(modifiedEntity);
                        });
                    }
                }
                currentActorState.actionEconomyState.hasAction = false;
                results.success = true;
                break;

            case "MOVE":
                 const baseMovement = currentActorState.currentSpeeds_Map?.["WALK"] || 0;
                 const movementAvailable = baseMovement - currentActorState.actionEconomyState.movementUsedThisTurn;
                if (movementAvailable > 0) {
                    // For now, just log it. Actual movement distance would be another input.
                    // Assume they use all remaining movement if "MOVE" action is chosen this way.
                    currentActorState.actionEconomyState.movementUsedThisTurn = baseMovement;
                    results = { success: true, reason: "Move action declared.", generatedGameEvents_List: [{type: "MOVE_ACTION", sourceCreatureId: currentActorState.id, timestamp: Date.now(), description: `${currentActorState.name} uses their movement.`} as any] };
                } else {
                    results = { success: false, reason: "Not enough movement remaining.", generatedGameEvents_List: [] };
                }
                break;
            
            case "DODGE":
                if (currentActorState.actionEconomyState.hasAction) {
                    currentActorState.actionEconomyState.hasAction = false;
                    const dodgeEffects: GameTypes.ParsedEffect[] = [
                        {
                            effectType: "GRANT_DISADVANTAGE_TO_ATTACKERS",
                            targetScope: "SELF",
                            duration: "1 ROUND", 
                            details: "Attack rolls against this creature have disadvantage if it can see the attacker.",
                            instanceID: uuidv4(), sourceDefinitionId:"DODGE_ACTION", sourceCreatureId: currentActorState.id
                        },
                        {
                            effectType: "GRANT_ADVANTAGE_ON_ROLL",
                            targetScope: "SELF",
                            bonusTo_Ref: "DEX_SAVE", 
                            duration: "1 ROUND",
                            details: "Makes Dexterity saving throws with advantage.",
                            instanceID: uuidv4(), sourceDefinitionId:"DODGE_ACTION", sourceCreatureId: currentActorState.id
                        }
                    ];
                    const dodgeApplyResults = await EffectExecutionEngine.applyEffects(
                        "DODGE_ACTION", "ACTION", dodgeEffects, currentActorState, [currentActorState], {}
                    );
                    results = { success: true, reason: "Dodge action taken.", generatedGameEvents_List: dodgeApplyResults.generatedGameEvents_List};
                    results.generatedGameEvents_List.push({type: "EFFECT_APPLIED", sourceCreatureId: currentActorState.id, targetCreatureId: currentActorState.id, sourceDefinitionId: "DODGE_ACTION", timestamp: Date.now(), description: `${currentActorState.name} takes the Dodge action.`} as any);
                    
                    const modifiedActorFromDodge = dodgeApplyResults.modifiedEntitiesState_List.find(me => me.id === currentActorState.id);
                    if (modifiedActorFromDodge) { // Update currentActorState with changes from effects
                        Object.assign(this.combatState.combatants[actorIndexInCombatants], modifiedActorFromDodge);
                    }
                     await CalculationService.updateCalculatedStats(this.combatState.combatants[actorIndexInCombatants]);


                } else {
                     results = { success: false, reason: "No action available for Dodge.", generatedGameEvents_List: [] };
                }
                break;

            case "PASS_TURN":
                currentActorState.actionEconomyState.hasAction = false;
                currentActorState.actionEconomyState.hasBonusAction = false;
                // Movement is not explicitly consumed by passing, but turn ends.
                results = { success: true, reason: "Turn passed.", generatedGameEvents_List: [{type: "TURN_ENDED", sourceCreatureId: currentActorState.id, timestamp: Date.now(), description: `${currentActorState.name} passes their turn.`} as any] };
                break;

            default:
                results = { success: false, reason: `Action type ${actionChoice.actionType} not recognized.`, generatedGameEvents_List: [] };
        }
        
        if (results.success && this.combatState) {
            this.combatState.log.push(...results.generatedGameEvents_List);
        }
        
        // Update the main combatState with the potentially modified actor/target states
        if(this.combatState) {
            this.combatState.combatants[actorIndexInCombatants] = currentActorState; // Persist currentActorState changes
            if (actionChoice.targetInfo?.creatureIDs && actionChoice.targetInfo.creatureIDs.length > 0) {
                 const targetId = actionChoice.targetInfo.creatureIDs[0];
                 const targetIndex = this.combatState.combatants.findIndex(c => c.id === targetId);
                 if (targetIndex !== -1) {
                    // Target state was already a direct reference from this.combatState.combatants[targetIndexInCombatants]
                    // If any engine returned a modified *copy* of the target, it would need to be assigned back here.
                    // EffectExecutionEngine returns modified copies, so they need to be re-assigned.
                    // This is partially handled by the forEach loop in SPELL and ATTACK if modifiedEntities are returned correctly.
                 }
            }
        }

        return results;
    }

    public endCombat(): void {
        if (!this.combatState) return;
        this.combatState.log.push({ type: "COMBAT_ENDED", timestamp: Date.now(), description: "Combat has ended." } as GameTypes.GameEventBase);
        this.combatState = null;
    }

    public getCombatState(): GameTypes.CombatStateSnapshot | null {
        return this.combatState ? _.cloneDeep(this.combatState) : null;
    }
}