// src/engines/SpellcastingEngine.ts
import * as GameTypes from '../../types';
import { getItemById } from '../services/dataService';
import { EffectExecutionEngine } from './EffectExecutionEngine';
import { ResourceManagementEngine } from './ResourceManagementEngine';
import { CalculationService } from './CalculationService'; 
import *_ from "https://esm.sh/lodash@4.17.21";

export class SpellcastingEngine {

    /**
     * Manages the process of a creature casting a spell.
     * @param casterState The runtime state of the creature casting the spell.
     * @param spellDefinitionID_Ref The ID of the SpellDefinition to cast.
     * @param targetsInfo Information about the spell's targets.
     * @param spellSlotLevel The level of the spell slot being used (0 for cantrips).
     * @param allCombatantsInContext List of all combatants for target resolution.
     * @param options Additional options for casting (e.g., metamagic).
     * @returns An object indicating success or failure, modified entities, and any generated game events.
     */
    public static async castSpell(
        casterState: GameTypes.CreatureRuntimeState,
        spellDefinitionID_Ref: string,
        targetsInfo: GameTypes.TargetInfo,
        spellSlotLevel: number, 
        allCombatantsInContext: GameTypes.CreatureRuntimeState[],
        options?: GameTypes.SpellCastOptions
    ): Promise<{
        success: boolean;
        reason?: string;
        modifiedEntities: GameTypes.CreatureRuntimeState[];
        gameEvents: GameTypes.GameEventBase[];
    }> {
        const gameEvents: GameTypes.GameEventBase[] = [];
        let modifiedEntities: GameTypes.CreatureRuntimeState[] = [];

        const spellDef = await getItemById(spellDefinitionID_Ref) as GameTypes.SpellDefinition;
        if (!spellDef) {
            return { success: false, reason: `Spell definition ${spellDefinitionID_Ref} not found.`, modifiedEntities, gameEvents };
        }

        let actionUsed: 'ACTION' | 'BONUS_ACTION' | 'REACTION' | 'OTHER' = 'OTHER';
        if (spellDef.castingTime.actionTypeID_Ref === "ACTION") actionUsed = 'ACTION';
        else if (spellDef.castingTime.actionTypeID_Ref === "BONUS_ACTION") actionUsed = 'BONUS_ACTION';
        else if (spellDef.castingTime.actionTypeID_Ref === "REACTION") actionUsed = 'REACTION';


        // Components (simplified)
        if (spellDef.components.material && spellDef.components.materialCost && !options?.materialComponentOverride) {
            return { success: false, reason: `Missing material components worth ${spellDef.components.materialCost}.`, modifiedEntities, gameEvents };
        }
        
        // Concentration - Handled by EffectExecutionEngine/TurnAndRoundManager more directly now by setting isConcentratingOn from effect
        if (casterState.isConcentratingOn && spellDef.duration.durationTypeID_Ref === "CONCENTRATION") {
            const oldEffectId = casterState.isConcentratingOn.effectInstanceId;
            casterState.activeEffects = casterState.activeEffects.filter(eff => eff.instanceID !== oldEffectId);
            gameEvents.push({ type: "EFFECT_REMOVED", targetCreatureId: casterState.id, sourceDefinitionId: casterState.isConcentratingOn.spellId, effectType: "CONCENTRATION_ENDED_OLD", timestamp: Date.now(), description: `${casterState.name} stops concentrating on ${casterState.isConcentratingOn.spellId}.`} as any);
            casterState.isConcentratingOn = undefined; // Clear old concentration
        }

        // Consume Resources (Spell Slot)
        if (spellDef.level > 0 && !options?.skipResourceCost) { 
            const spellSlotResourceID = `SPELL_SLOT_L${spellSlotLevel}`;
            const spendResult = ResourceManagementEngine.spendResource(casterState, spellSlotResourceID);
            if (!spendResult.success) {
                return { success: false, reason: spendResult.reason || `Failed to spend spell slot ${spellSlotResourceID}.`, modifiedEntities, gameEvents };
            }
            gameEvents.push({ type: "RESOURCE_SPENT", sourceCreatureId: casterState.id, resourceID: spellSlotResourceID, amount: 1, timestamp: Date.now(), description: `${casterState.name} spends a level ${spellSlotLevel} spell slot.` } as any);
        }

        // Prepare Execution Context
        const executionContext: GameTypes.EffectExecutionContext = {
            spellSlotLevel: spellSlotLevel,
            userChoices: options?.metamagicUsed ? { metamagic: options.metamagicUsed } : {},
            sourceDefinitionId: spellDefinitionID_Ref
        };
        
        // Determine actual targets
        let finalTargetStates: GameTypes.CreatureRuntimeState[] = [];
        if (targetsInfo.selfTarget) {
            const selfInContext = allCombatantsInContext.find(c => c.id === casterState.id);
            if(selfInContext) finalTargetStates.push(selfInContext);
        }
        if (targetsInfo.creatureIDs) {
            targetsInfo.creatureIDs.forEach(id => {
                const targetInContext = allCombatantsInContext.find(c => c.id === id);
                if (targetInContext && !finalTargetStates.some(ft => ft.id === id)) {
                    finalTargetStates.push(targetInContext);
                }
            });
        }
        // TODO: Resolve AoE targets based on targetsInfo.point and spellDef.areaOfEffect
        // If finalTargetStates is empty and it's not a self-only AoE, it might be an issue or an AoE with no valid targets.

        // Apply Spell Effects
        const effectResult = await EffectExecutionEngine.applyEffects(
            spellDefinitionID_Ref,
            "SPELL",
            spellDef.parsedEffects_List,
            casterState, // Pass the original caster state as the originator
            finalTargetStates, 
            executionContext
        );
        
        gameEvents.push(...effectResult.generatedGameEvents_List);
        modifiedEntities = effectResult.modifiedEntitiesState_List;
        
        // Update casterState with its own modified version from the effect results.
        const casterModifiedState = modifiedEntities.find(m => m.id === casterState.id);
        if (casterModifiedState) {
            Object.assign(casterState, casterModifiedState); // Apply changes to original casterState reference
        }


        // Handle new concentration if an effect from *this* spell requires it
        const concentrationEffectFromThisSpell = casterState.activeEffects.find(
             eff => eff.sourceDefinitionId === spellDefinitionID_Ref && eff.concentration
        );
        if (concentrationEffectFromThisSpell) {
            casterState.isConcentratingOn = { spellId: spellDefinitionID_Ref, effectInstanceId: concentrationEffectFromThisSpell.instanceID };
            gameEvents.push({ type: "EFFECT_APPLIED", targetCreatureId: casterState.id, sourceDefinitionId: spellDefinitionID_Ref, effectType: "CONCENTRATION_STARTED", timestamp: Date.now(), description: `${casterState.name} starts concentrating on ${spellDef.fullName}.` } as any);
        }


        gameEvents.push({
            type: "SPELL_CAST",
            sourceCreatureId: casterState.id,
            sourceDefinitionId: spellDefinitionID_Ref,
            spellLevel: spellDef.level,
            slotUsedLevel: spellSlotLevel,
            targets: targetsInfo, 
            actionUsed: actionUsed,
            timestamp: Date.now(),
            description: `${casterState.name} casts ${spellDef.fullName} (Level ${spellDef.level}, Slot ${spellSlotLevel}). Targets: ${targetsInfo.creatureIDs?.join(', ') || (targetsInfo.selfTarget ? 'Self' : 'Area')}.`
        } as GameTypes.SpellCastEvent);

        return { success: true, modifiedEntities, gameEvents };
    }
}