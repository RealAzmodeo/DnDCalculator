// src/engines/ResourceManagementEngine.ts
import *_ from "https://esm.sh/lodash@4.17.21";
import * as GameTypes from '../../types';
import { getItemById } from '../services/dataService';
import { CalculationService } from './CalculationService'; // For Max HP during rests

export class ResourceManagementEngine {

    /**
     * Spends a specified amount of a resource for a creature.
     * @param targetState The runtime state of the creature.
     * @param resourceID The ID of the resource to spend (e.g., "SPELL_SLOT_L1", "SUPERIORITY_DICE", "HIT_DICE_D8").
     * @param amount The amount of the resource to spend (defaults to 1).
     * @returns An object indicating success or failure and a reason.
     */
    public static spendResource(
        targetState: GameTypes.CreatureRuntimeState,
        resourceID: string,
        amount: number = 1
    ): { success: boolean; reason?: string } {
        const resource = targetState.trackedResources.find(r => r.resourceID === resourceID);

        if (!resource) {
            return { success: false, reason: `Resource ${resourceID} not found on ${targetState.name}.` };
        }

        if (resource.currentValue < amount) {
            return { success: false, reason: `Not enough ${resourceID}. Has ${resource.currentValue}, needs ${amount}.` };
        }

        resource.currentValue -= amount;
        
        // TODO: Generate GameEvent for RESOURCE_SPENT
        
        return { success: true };
    }

    /**
     * Recovers a specified amount of a resource for a creature.
     * @param targetState The runtime state of the creature.
     * @param resourceID The ID of the resource to recover.
     * @param amount The amount to recover (defaults to 1, or full if undefined for some resources).
     * @param ignoreMax If true, can recover beyond the defined maximum (rarely used).
     * @returns An object indicating success.
     */
    public static recoverResource(
        targetState: GameTypes.CreatureRuntimeState,
        resourceID: string,
        amount?: number,
        ignoreMax: boolean = false
    ): { success: boolean, recoveredAmount?: number } {
        let resource = targetState.trackedResources.find(r => r.resourceID === resourceID);

        if (!resource) {
            // If resource doesn't exist, try to add it based on a definition if applicable
            // For now, assume it must exist to be recovered, unless it's HP.
            if (resourceID === "HP") {
                 // Handled by applyRestEffects or specific healing effects
                 return { success: false }; // HP recovery is more complex
            }
            console.warn(`Resource ${resourceID} not found for recovery on ${targetState.name}. Cannot recover.`);
            return { success: false };
        }
        
        const maxVal = resource.maxValue;
        let recoverAmount = amount === undefined ? (maxVal !== undefined ? maxVal - resource.currentValue : 1) : amount;
        recoverAmount = Math.max(0, recoverAmount); // Cannot recover negative amount

        const oldValue = resource.currentValue;
        resource.currentValue += recoverAmount;

        if (!ignoreMax && maxVal !== undefined && resource.currentValue > maxVal) {
            resource.currentValue = maxVal;
        }
        
        const actualRecoveredAmount = resource.currentValue - oldValue;

        // TODO: Generate GameEvent for RESOURCE_GAINED
        
        return { success: true, recoveredAmount: actualRecoveredAmount };
    }

    /**
     * Applies the effects of a rest (short or long) to a creature.
     * @param targetState The runtime state of the creature.
     * @param restType_Ref The ID of the RestTypeDefinition (e.g., "SHORT_REST", "LONG_REST").
     */
    public static async applyRestEffects(
        targetState: GameTypes.CreatureRuntimeState,
        restType_Ref: string
    ): Promise<void> {
        const restDef = await getItemById(restType_Ref) as GameTypes.RestTypeDefinition;
        if (!restDef) {
            console.error(`Rest type ${restType_Ref} definition not found.`);
            return;
        }

        // 1. HP Recovery (simplified for now)
        if (restType_Ref === "LONG_REST") {
            // Fully heal HP
            targetState.currentHP = targetState.maxHP_Calculated; 
            targetState.temporaryHP = 0; // Temp HP typically lost on long rest

            // Recover all hit dice (or half, depending on rules variant - 5e default is half)
            targetState.trackedResources.filter(r => r.resourceID.startsWith("HIT_DICE_")).forEach(hdResource => {
                if (hdResource.maxValue !== undefined) {
                    const amountToRecover = Math.max(1, Math.floor(hdResource.maxValue / 2));
                    this.recoverResource(targetState, hdResource.resourceID, amountToRecover, false);
                }
            });
        }
        // Short rest HP recovery involves spending Hit Dice, which is an active choice, not automatic here.
        // This engine part would trigger "can spend hit dice" state.

        // 2. Resource Recovery based on their definitions
        for (const resource of targetState.trackedResources) {
            // Fetch resource definition if it exists and has recharge rules
            // Assuming resource.definition is populated if it's a complex resource with specific recharge rules.
            // For simple string-based resourceIDs, this check might be basic.
            const resourceDef = resource.definition as GameTypes.ResourceDefinition | undefined; 
            
            if (resourceDef?.rechargeOn_Ref_List?.includes(restType_Ref)) {
                 this.recoverResource(targetState, resource.resourceID, resource.maxValue, false); 
            } else if (resource.definition?.rechargeOn_Ref_List?.includes(restType_Ref)) { // Fallback if definition is an object but not strictly ResourceDefinition
                 this.recoverResource(targetState, resource.resourceID, resource.maxValue, false); 
            }
        }
        
        // 3. Reset Action Economy (usually happens at start of turn, but good to ensure here too for rests)
        targetState.actionEconomyState = { 
            hasAction: true, 
            hasBonusAction: true, 
            hasReaction: true, 
            movementUsedThisTurn: 0 
        };

        // 4. End conditions/effects that end on this rest type
        targetState.activeConditions = targetState.activeConditions.filter(cond => {
            if (restType_Ref === "LONG_REST" && cond.conditionID === "EXHAUSTED_LVL1_2024") { 
                // TODO: Logic for reducing exhaustion level, not just removing
                return true; 
            }
            // Add more conditions that end on short/long rest
            return true; 
        });
        targetState.activeEffects = targetState.activeEffects.filter(eff => {
            // Check eff.duration or specific properties that might end on rest
            // For effects with remainingDurationRounds, they are handled by end of turn, not directly by rest type usually.
            // But some special effects might explicitly end on rest.
            return true;
        });

        console.log(`${targetState.name} completed a ${restDef.fullName}.`);
        // TODO: Generate GameEvent for REST_COMPLETED
        await CalculationService.updateCalculatedStats(targetState); // Recalculate stats after rest
    }

    /**
     * Gets the current state of a specific resource for a creature.
     * @param targetState The runtime state of the creature.
     * @param resourceID The ID of the resource.
     * @returns The resource state or null if not found.
     */
    public static getResourceState(
        targetState: GameTypes.CreatureRuntimeState,
        resourceID: string
    ): { current: number; max?: number } | null {
        const resource = targetState.trackedResources.find(r => r.resourceID === resourceID);
        if (resource) {
            return { current: resource.currentValue, max: resource.maxValue };
        }
        if (resourceID === "HP") {
            return { current: targetState.currentHP, max: targetState.maxHP_Calculated };
        }
        if (resourceID === "TEMP_HP") {
            return { current: targetState.temporaryHP }; // Temp HP usually doesn't have a max other than what was granted
        }
        return null;
    }

    /**
     * Initializes default resources for a creature based on its definition (e.g. Hit Dice).
     * Call this when a creature is added to combat or created.
     */
    public static async initializeCreatureResources(targetState: GameTypes.CreatureRuntimeState): Promise<void> {
        if (!targetState.creatureDefinition && !targetState.isPlayerCharacter) return; 

        // Initialize Hit Dice for creatures with definitions (monsters)
        if (targetState.creatureDefinition?.hitPoints?.diceFormula) {
            const hitDiceDef = targetState.creatureDefinition.hitPoints.diceFormula;
            const hitDiceCount = hitDiceDef.diceCount;
            const hitDieType = hitDiceDef.diceID_Ref; 
            
            if (hitDiceCount > 0 && hitDieType) {
                const hitDiceResourceID = `HIT_DICE_${hitDieType}`;
                if (!targetState.trackedResources.find(r => r.resourceID === hitDiceResourceID)) {
                    targetState.trackedResources.push({
                        resourceID: hitDiceResourceID,
                        currentValue: hitDiceCount,
                        maxValue: hitDiceCount,
                    });
                }
            }
        }
        
        // TODO: Initialize resources for Player Characters based on class levels and features
        // This would involve iterating through class features that grant resources (e.g. Spell Slots, Ki, Superiority Dice).
        // Example for Spell Slots (very simplified):
        if (targetState.isPlayerCharacter) {
            for (const classLevel of targetState.classLevels_List) {
                const classDef = classLevel.class || await getItemById(classLevel.classID_Ref) as GameTypes.ClassDefinition;
                if(classDef?.levelProgressionTable) {
                    for(let i=1; i <= classLevel.level; i++){
                        const progression = classDef.levelProgressionTable[i];
                        if(progression?.spellcasting?.spellSlots) {
                            Object.entries(progression.spellcasting.spellSlots).forEach(([slotLevelStr, numSlots]) => {
                                if(slotLevelStr === "cantripsKnown") return; // Skip cantrips count here
                                const slotLevel = parseInt(slotLevelStr.replace('L',''));
                                if (isNaN(slotLevel) || numSlots <= 0) return;
                                const resourceId = `SPELL_SLOT_L${slotLevel}`;
                                let existingSlot = targetState.trackedResources.find(r => r.resourceID === resourceId);
                                if (!existingSlot) {
                                    existingSlot = { resourceID: resourceId, currentValue: 0, maxValue: 0 };
                                    targetState.trackedResources.push(existingSlot);
                                }
                                existingSlot.maxValue = (existingSlot.maxValue || 0) + numSlots; // Accumulate slots if gained at multiple levels
                                existingSlot.currentValue = existingSlot.maxValue; // Start with full slots
                            });
                        }
                    }
                }
            }
        }
    }
}