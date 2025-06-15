
import React, { useState, useEffect, useCallback } from 'react';
import * as GameTypes from '../types';
import { getItemsByPathPrefix, getItemById } from '../src/services/dataService';
import { TurnAndRoundManager } from '../src/engines/TurnAndRoundManager';
import { ObjectViewer } from './ObjectViewer'; // For debugging if needed
import { v4 as uuidv4 } from 'uuid';
import _ from "https://esm.sh/lodash@4.17.21";

interface EncounterCreatureSetup {
  templateId: string;
  name: string; // Custom name for this instance, e.g., "Goblin 1"
  id: string; // Unique ID for this instance in the encounter
}

const InputField: React.FC<{ label: string, type?: string, value: string | number, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void, id?: string, name?: string, options?: { value: string, label: string }[], className?: string, disabled?: boolean }> =
    ({ label, type = "text", value, onChange, id, name, options, className, disabled }) => (
    <div className={`mb-3 ${className}`}>
        <label htmlFor={id || name} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
        {type === 'select' ? (
        <select id={id || name} name={name || id} value={value} onChange={onChange} disabled={disabled} className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50">
            {options?.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        ) : (
        <input type={type} id={id || name} name={name || id} value={value} onChange={onChange} disabled={disabled} className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50" />
        )}
    </div>
);

const LoadingBar: React.FC<{ progress: number; message: string }> = ({ progress, message }) => (
    <div className="w-full max-w-md mx-auto p-4 text-center">
        <p className="text-lg text-gray-700 dark:text-gray-300 mb-2">{message}</p>
        <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700 shadow-inner">
            <div
                className="bg-indigo-600 h-4 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                role="progressbar"
                aria-label="Loading progress"
            ></div>
        </div>
        <p className="text-sm text-indigo-600 dark:text-indigo-400 mt-1">{progress}%</p>
    </div>
);

export const CombatSimulator: React.FC = () => {
    const [availableTemplates, setAvailableTemplates] = useState<GameTypes.CreatureTemplateDefinition[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [customCreatureName, setCustomCreatureName] = useState<string>('');
    const [encounterSetupList, setEncounterSetupList] = useState<EncounterCreatureSetup[]>([]);
    
    const [turnManager, setTurnManager] = useState<TurnAndRoundManager | null>(null);
    const [combatState, setCombatState] = useState<GameTypes.CombatStateSnapshot | null>(null);
    
    // Enhanced loading state
    const [isAppLoading, setIsAppLoading] = useState<boolean>(true); // Overall loading state for the component
    const [loadingMessage, setLoadingMessage] = useState<string>("Initializing Simulator...");
    const [loadingProgress, setLoadingProgress] = useState<number>(0);

    const [error, setError] = useState<string | null>(null);

    // Action panel state
    const [selectedActionType, setSelectedActionType] = useState<GameTypes.ActionChoice['actionType'] | ''>('');
    const [selectedAttackName, setSelectedAttackName] = useState<string>(''); // For creature actions
    const [selectedItemId, setSelectedItemId] = useState<string>(''); // For item-based attacks (e.g. LONGSWORD)
    const [selectedTargetId, setSelectedTargetId] = useState<string>('');
    const [selectedSpellId, setSelectedSpellId] = useState<string>('');
    const [selectedSpellSlotLevel, setSelectedSpellSlotLevel] = useState<number>(0);


    useEffect(() => {
        const loadInitialData = async () => {
            try {
                setIsAppLoading(true);
                setError(null);
                console.log("[CombatSim] Initializing loadInitialData...");
                
                setLoadingMessage("Preparing combat engine...");
                setLoadingProgress(10);
                console.log("[CombatSim] Checkpoint Init: Combat engine preparation phase.");
                setTurnManager(new TurnAndRoundManager());

                setLoadingMessage("Fetching creature template definitions...");
                setLoadingProgress(30);
                console.log("[CombatSim] Checkpoint A: Starting to fetch template definitions list.");
                const templatesPromise = getItemsByPathPrefix('database/creature_templates/') as Promise<GameTypes.CreatureTemplateDefinition[]>;
                
                setLoadingProgress(60);
                console.log("[CombatSim] Checkpoint B: Template definitions list promise created. Awaiting resolution (this may take time). UI shows 60%.");
                
                const templates = await templatesPromise;
                console.log(`[CombatSim] Checkpoint C: Template definitions list resolved. ${templates.length} items initially fetched.`);

                setLoadingMessage(`Processing ${templates.length} creature templates...`);
                setLoadingProgress(80);
                console.log("[CombatSim] Checkpoint D: UI shows 80%. Starting to process templates.");

                const validTemplates = templates.filter(t => t && t.creatureDefinitionID && t.fullName);
                setAvailableTemplates(validTemplates);
                console.log(`[CombatSim] Processed and found ${validTemplates.length} valid templates.`);

                if (validTemplates.length > 0) {
                    setSelectedTemplateId(validTemplates[0].creatureDefinitionID);
                    setCustomCreatureName(validTemplates[0].fullName + " 1");
                } else {
                    console.warn("[CombatSim] No valid creature templates found after processing.");
                    setError("No creature templates found. Please check 'database/creature_templates/'.");
                }
                setLoadingProgress(100);
                setLoadingMessage("Simulator ready for setup.");
                console.log("[CombatSim] Checkpoint E: Simulator setup complete. UI shows 100%.");
                
                await new Promise(resolve => setTimeout(resolve, 300)); // Brief pause for UI
                setIsAppLoading(false);
                console.log("[CombatSim] Initial loading screen hidden.");

            } catch (err: any) {
                console.error("[CombatSim] Error during loadInitialData:", err);
                setError(`Failed to load initial simulator data: ${err.message}`);
                setLoadingMessage(`Error: ${err.message}`);
                setLoadingProgress(0); 
                setIsAppLoading(false); 
            }
        };
        loadInitialData();
    }, []);

    const handleAddCreatureToEncounter = () => {
        if (!selectedTemplateId) {
            alert("Please select a creature template.");
            return;
        }
        const template = availableTemplates.find(t => t.creatureDefinitionID === selectedTemplateId);
        if (!template) {
            alert("Selected template not found.");
            return;
        }
        const creatureName = customCreatureName.trim() || `${template.fullName} ${encounterSetupList.filter(c => c.templateId === selectedTemplateId).length + 1}`;
        
        setEncounterSetupList(prev => [...prev, { templateId: selectedTemplateId, name: creatureName, id: uuidv4() }]);
        
        if (customCreatureName.startsWith(template.fullName)) {
             const count = encounterSetupList.filter(c => c.templateId === selectedTemplateId).length; 
             setCustomCreatureName(`${template.fullName} ${count + 1}`);
        } else if (!customCreatureName.trim()) {
            setCustomCreatureName(`${template.fullName} 1`); // Reset to 1 if empty before
        } else {
            // If custom name doesn't match template, don't auto-increment/change it
        }
    };

    const handleStartCombat = async () => {
        if (encounterSetupList.length === 0) {
            alert("Add at least one creature to the encounter.");
            return;
        }
        if (!turnManager) {
            setError("Turn manager not initialized.");
            return;
        }
        try {
            setIsAppLoading(true); 
            setLoadingMessage("Initializing combatants...");
            setLoadingProgress(25);
            setError(null);
            console.log("[CombatSim] Starting combat initialization...");

            const creatureRuntimePromises = encounterSetupList.map(async (setupCreature) => {
                const template = await getItemById(setupCreature.templateId) as GameTypes.CreatureTemplateDefinition;
                if (!template) throw new Error(`Template ${setupCreature.templateId} not found during combat start.`);
                
                const runtimeState: GameTypes.CreatureRuntimeState = {
                    id: setupCreature.id,
                    name: setupCreature.name,
                    isPlayerCharacter: false,
                    creatureDefinitionID_Ref: template.creatureDefinitionID,
                    creatureDefinition: _.cloneDeep(template), 
                    classLevels_List: [], 
                    totalCharacterLevel: 0, 
                    currentHP: template.hitPoints.average,
                    temporaryHP: 0,
                    maxHP_Base: template.hitPoints.average,
                    maxHP_Calculated: template.hitPoints.average, 
                    abilityScores_Base: template.abilityScores.reduce((acc, score) => {
                        acc[score.abilityID_Ref] = score.value;
                        return acc;
                    }, {} as GameTypes.CreatureAbilityScores),
                    abilityScores_Effective: {}, 
                    proficiencyBonus_Calculated: template.proficiencyBonus, 
                    currentAC_Calculated: template.armorClass.value, 
                    currentSpeeds_Map: { ...template.speed },
                    senses_Effective: { ...template.senses },
                    trackedResources: [], 
                    equippedItems_Map: {}, 
                    inventoryItemInstanceIDs_List: [],
                    attunedItemInstanceIDs_List: [],
                    activeConditions: [],
                    activeEffects: [],
                    currentInitiativeRoll: null,
                    actionEconomyState: { hasAction: true, hasBonusAction: true, hasReaction: true, movementUsedThisTurn: 0 },
                    spellcastingAbility_Ref: template.actions_List?.find(a => a.actionType.includes("SPELL_ATTACK") || a.parsedEffects_List?.some(e => e.savingThrow?.dcFormula?.includes("SPELL_SAVE_DC"))) ? "INT" : undefined, 
                };
                return runtimeState;
            });

            const initialStates = await Promise.all(creatureRuntimePromises);
            console.log(`[CombatSim] ${initialStates.length} combatant runtime states created.`);
            setLoadingMessage("Rolling initiative...");
            setLoadingProgress(75);
            const newCombatState = await turnManager.startCombat(initialStates);
            setCombatState(newCombatState);
            console.log("[CombatSim] Combat started. Initial combat state set.");
            setLoadingProgress(100);
            setIsAppLoading(false);
            setSelectedActionType('');
            setSelectedAttackName('');
            setSelectedItemId('');
            setSelectedTargetId('');
            setSelectedSpellId('');
        } catch (err: any) {
            console.error("[CombatSim] Error starting combat:", err);
            setError(`Failed to start combat: ${err.message}`);
            setLoadingMessage(`Error: ${err.message}`);
            setLoadingProgress(0);
            setIsAppLoading(false);
        }
    };
    
    const handleProcessAction = async () => {
        if (!turnManager || !combatState || !combatState.currentTurnCreatureId || !selectedActionType) return;
        
        const actorId = combatState.currentTurnCreatureId;
        let actionChoice: GameTypes.ActionChoice = { actorId, actionType: selectedActionType };

        if (selectedActionType === 'ATTACK') {
            if ((!selectedAttackName && !selectedItemId) || !selectedTargetId) {
                alert("Please select an attack/item and a target.");
                return;
            }
            if(selectedAttackName) actionChoice.actionName = selectedAttackName;
            if(selectedItemId) actionChoice.itemID_Ref = selectedItemId; // Not currently settable by UI for attacks
            actionChoice.targetInfo = { creatureIDs: [selectedTargetId] };
        } else if (selectedActionType === 'SPELL') {
            if (!selectedSpellId || !selectedTargetId) { 
                 alert("Please select a spell and a target.");
                 return;
            }
            actionChoice.spellID_Ref = selectedSpellId;
            actionChoice.spellSlotLevel = selectedSpellSlotLevel; 
            actionChoice.targetInfo = { creatureIDs: [selectedTargetId] };
        }
        
        try {
            setIsAppLoading(true);
            setLoadingMessage("Processing action...");
            setLoadingProgress(50);
            setError(null);
            console.log(`[CombatSim] Processing action: ${actionChoice.actionType} by ${actorId}`);
            const result = await turnManager.processAction(actionChoice);
            if (!result.success) {
                console.warn(`[CombatSim] Action failed: ${result.reason}`);
                setError(`Action failed: ${result.reason || 'Unknown reason'}`);
            } else {
                console.log(`[CombatSim] Action processed successfully. Events: ${result.generatedGameEvents_List.length}`);
            }
            setCombatState(turnManager.getCombatState()); 
            setLoadingProgress(100);
            setIsAppLoading(false);
            // Reset some selections after action, but not target if multiple attacks might be made
            // setSelectedActionType(''); 
            // setSelectedAttackName('');
            // setSelectedSpellId('');
        } catch (err: any) {
            console.error("[CombatSim] Error processing action:", err);
            setError(`Error processing action: ${err.message}`);
            setIsAppLoading(false);
        }
    };

    const handleEndTurn = async () => {
        if (!turnManager) return;
        try {
            setIsAppLoading(true);
            setLoadingMessage("Ending turn...");
            setLoadingProgress(50);
            setError(null);
            console.log("[CombatSim] Ending turn...");
            const newState = await turnManager.progressToNextTurn();
            setCombatState(newState);
            setSelectedActionType('');
            setSelectedAttackName('');
            setSelectedItemId('');
            setSelectedTargetId('');
            setSelectedSpellId('');
            setLoadingProgress(100);
            setIsAppLoading(false);
            console.log("[CombatSim] Turn progressed. New current actor:", newState?.currentTurnCreatureId);
        } catch (err: any) {
            console.error("[CombatSim] Error progressing turn:", err);
            setError(`Error progressing turn: ${err.message}`);
            setIsAppLoading(false);
        }
    };

    const currentActor = combatState?.combatants.find(c => c.id === combatState.currentTurnCreatureId);
    const potentialTargets = combatState?.combatants.filter(c => c.id !== currentActor?.id && c.currentHP > 0) || [];
    
    const availableActorAttacks = currentActor?.creatureDefinition?.actions_List?.filter(a => a.actionType.includes("ATTACK")) || [];
    // Creature "spell-like abilities" are often just actions with saving throws or spell attack rolls.
    const availableActorSpells = currentActor?.creatureDefinition?.actions_List?.filter(a => 
        (a.actionType.includes("SPELL_ATTACK") || a.parsedEffects_List?.some(eff => eff.savingThrow)) && !a.actionType.includes("WEAPON_ATTACK")
    ) || [];


    if (isAppLoading && !combatState && !error && loadingProgress < 100) { 
      return <div className="flex justify-center items-center h-full"><LoadingBar progress={loadingProgress} message={loadingMessage} /></div>;
    }
    

    return (
        <div className="container mx-auto p-2 md:p-4 space-y-4">
            {isAppLoading && combatState && <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex justify-center items-center z-50"><LoadingBar progress={loadingProgress} message={loadingMessage} /></div>}
            {error && <div className="p-4 mb-4 text-center text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/50 rounded-md border border-red-300 dark:border-red-700">Error: {error} <button onClick={()=>setError(null)} className="ml-2 text-sm underline">Dismiss</button></div>}

            {!combatState && (
                <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl">
                    <h2 className="text-2xl font-semibold mb-4 text-indigo-700 dark:text-indigo-300 border-b pb-2 dark:border-gray-700">Encounter Setup</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 items-end">
                        <InputField label="Creature Template" type="select" id="select-template" name="select-template" value={selectedTemplateId} 
                            options={availableTemplates.map(t => ({ value: t.creatureDefinitionID, label: t.fullName }))}
                            onChange={(e) => {
                                setSelectedTemplateId(e.target.value);
                                const template = availableTemplates.find(t => t.creatureDefinitionID === e.target.value);
                                const count = encounterSetupList.filter(c => c.templateId === e.target.value).length;
                                setCustomCreatureName(template ? `${template.fullName} ${count + 1}` : '');
                            }}
                            disabled={availableTemplates.length === 0 || isAppLoading}
                        />
                         <InputField label="Instance Name" id="custom-creature-name" name="custom-creature-name" value={customCreatureName} onChange={(e) => setCustomCreatureName(e.target.value)} disabled={isAppLoading}/>
                        <button onClick={handleAddCreatureToEncounter} disabled={!selectedTemplateId || isAppLoading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md shadow h-10 transition-colors disabled:opacity-60">Add to Encounter</button>
                    </div>
                    <div className="mt-6">
                        <h3 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-300">Encounter List:</h3>
                        {encounterSetupList.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400 italic">No creatures added yet.</p> : (
                            <ul className="list-none space-y-1 max-h-48 overflow-y-auto bg-gray-50 dark:bg-gray-700/50 p-3 rounded-md border dark:border-gray-600">
                                {encounterSetupList.map((c) => (
                                    <li key={c.id} className="text-sm flex justify-between items-center py-1">
                                        <span>{c.name} <span className="text-gray-500 dark:text-gray-400">({availableTemplates.find(t=>t.creatureDefinitionID === c.templateId)?.fullName})</span></span>
                                        <button onClick={() => setEncounterSetupList(prev => prev.filter(item => item.id !== c.id))} 
                                                className="ml-3 text-red-500 hover:text-red-700 text-xs font-medium">[Remove]</button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <button onClick={handleStartCombat} disabled={encounterSetupList.length === 0 || isAppLoading}
                            className="mt-6 w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold text-lg rounded-md shadow-md hover:shadow-lg transition-all duration-150 ease-in-out disabled:opacity-60">
                        {isAppLoading && loadingMessage.includes("Initializing combatants") ? 'Starting...' : 'Start Combat'}
                    </button>
                </div>
            )}

            {combatState && currentActor && (
                <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl">
                    <div className="flex flex-wrap justify-between items-center mb-4 border-b pb-3 dark:border-gray-700">
                        <h2 className="text-2xl font-semibold text-indigo-700 dark:text-indigo-300">Combat - Round {combatState.roundNumber}</h2>
                        <button onClick={() => { setCombatState(null); setEncounterSetupList([]); setError(null); setIsAppLoading(false); setLoadingMessage("Simulator ready for setup."); setLoadingProgress(0); }} 
                                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white font-medium rounded-md shadow transition-colors">End Combat</button>
                    </div>
                    <p className="mb-4 text-xl">Current Turn: <span className="text-green-600 dark:text-green-400 font-bold">{currentActor.name}</span></p>
                    <p className="mb-1 text-sm">Action: {currentActor.actionEconomyState.hasAction ? 'Available' : 'Used'}, Bonus: {currentActor.actionEconomyState.hasBonusAction ? 'Available' : 'Used'}, Reaction: {currentActor.actionEconomyState.hasReaction ? 'Available' : 'Used'}</p>
                    <p className="mb-4 text-sm">Movement: { (currentActor.currentSpeeds_Map?.["WALK"] || 0) - currentActor.actionEconomyState.movementUsedThisTurn} / {currentActor.currentSpeeds_Map?.["WALK"] || 0} ft</p>


                    <div className="mb-6 p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700/30 shadow-sm">
                        <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">Take Action:</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                            <InputField label="Action Type" type="select" id="select-action-type" name="select-action-type" value={selectedActionType} 
                                options={[
                                    {value: "", label: "Select Action..."},
                                    {value: "ATTACK", label: "Attack"},
                                    {value: "SPELL", label: "Cast Spell-like Ability"},
                                    {value: "DODGE", label: "Dodge"},
                                    {value: "MOVE", label: "Declare Move (placeholder)"},
                                    {value: "PASS_TURN", label: "Pass Turn"}
                                ]}
                                onChange={(e) => {setSelectedActionType(e.target.value as any); setSelectedAttackName(''); setSelectedItemId(''); setSelectedTargetId(''); setSelectedSpellId('');}}
                                disabled={isAppLoading}
                            />
                            {selectedActionType === 'ATTACK' && (
                                <>
                                    <InputField label="Select Attack" type="select" id="select-attack-name" name="select-attack-name" value={selectedAttackName}
                                        options={[{value: "", label:"Select creature attack..."}, ...availableActorAttacks.map(a => ({value: a.actionName, label: a.actionName}))]}
                                        onChange={(e) => setSelectedAttackName(e.target.value)}
                                        disabled={availableActorAttacks.length === 0 || isAppLoading}
                                    />
                                    <InputField label="Select Target" type="select" id="select-attack-target" name="select-attack-target" value={selectedTargetId}
                                        options={[{value: "", label:"Select target..."}, ...potentialTargets.map(t => ({value: t.id, label: `${t.name} (AC ${t.currentAC_Calculated})`}))]}
                                        onChange={(e) => setSelectedTargetId(e.target.value)}
                                        disabled={potentialTargets.length === 0 || isAppLoading}
                                    />
                                </>
                            )}
                            {selectedActionType === 'SPELL' && (
                                <>
                                    <InputField label="Select Spell-like Ability" type="select" id="select-spell-id" name="select-spell-id" value={selectedSpellId}
                                        options={[
                                            {value: "", label:"Select ability..."}, 
                                            ...availableActorSpells.map(s => ({
                                                value: `${currentActor?.creatureDefinitionID_Ref}_${s.actionName.replace(/\s+/g, '_')}_ACTION_AS_SPELL_`, 
                                                label: s.actionName
                                            }))
                                        ]}
                                        onChange={(e) => setSelectedSpellId(e.target.value)}
                                        disabled={availableActorSpells.length === 0 || isAppLoading}
                                    />
                                    <InputField label="Select Target" type="select" id="select-spell-target" name="select-spell-target" value={selectedTargetId}
                                        options={[{value: "", label:"Select target..."}, ...potentialTargets.map(t => ({value: t.id, label: `${t.name} (AC ${t.currentAC_Calculated})`}))]}
                                        onChange={(e) => setSelectedTargetId(e.target.value)}
                                        disabled={potentialTargets.length === 0 || isAppLoading}
                                    />
                                </>
                            )}
                        </div>
                        <div className="mt-4 flex space-x-3">
                            <button onClick={handleProcessAction} 
                                    disabled={!selectedActionType || isAppLoading || (selectedActionType === 'ATTACK' && (!selectedAttackName && !selectedItemId || !selectedTargetId)) || (selectedActionType === 'SPELL' && (!selectedSpellId || !selectedTargetId)) }
                                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md shadow transition-colors flex-1 disabled:opacity-60">
                                Process Action
                            </button>
                            <button onClick={handleEndTurn} disabled={isAppLoading}
                                    className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-medium rounded-md shadow transition-colors flex-1 disabled:opacity-60">
                                End Turn
                            </button>
                        </div>
                    </div>

                    {/* Combatants Display */}
                    <div className="mt-6">
                        <h3 className="text-xl font-semibold mb-3 text-gray-800 dark:text-gray-200">Combatants (Turn Order):</h3>
                        <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                            {combatState.initiativeOrder.map(({ creatureId, initiativeRoll }) => {
                                const combatant = combatState.combatants.find(c => c.id === creatureId);
                                if (!combatant) return null;
                                const isActive = combatant.id === combatState.currentTurnCreatureId;
                                const isDead = combatant.currentHP <= 0;
                                return (
                                    <div key={combatant.id} 
                                         className={`p-3 rounded-lg shadow border-2 ${isActive ? 'border-green-500 bg-green-50 dark:bg-green-900/30' : 'border-gray-300 dark:border-gray-600'} ${isDead ? 'opacity-60 bg-red-100 dark:bg-red-900/40' : 'bg-white dark:bg-gray-800'}`}
                                         role="listitem"
                                         aria-current={isActive ? "step" : undefined}
                                         >
                                        <div className="flex justify-between items-center">
                                            <p className={`text-lg font-semibold ${isDead ? 'line-through text-red-700 dark:text-red-400' : (isActive ? 'text-green-700 dark:text-green-300' : 'text-gray-800 dark:text-gray-200')}`}>
                                                {combatant.name} {isDead ? '(Defeated)' : ''}
                                            </p>
                                            <span className="text-sm text-gray-600 dark:text-gray-400">Initiative: {initiativeRoll}</span>
                                        </div>
                                        <div className="text-sm mt-1">
                                            <span className={`font-medium ${combatant.currentHP <= combatant.maxHP_Calculated / 4 ? 'text-red-500' : (combatant.currentHP <= combatant.maxHP_Calculated / 2 ? 'text-yellow-500' : 'text-green-500')}`}>
                                                HP: {combatant.currentHP} / {combatant.maxHP_Calculated}
                                            </span>
                                            {combatant.temporaryHP > 0 && <span className="ml-2 text-blue-500">(+{combatant.temporaryHP} Temp)</span>}
                                            <span className="ml-3 text-gray-600 dark:text-gray-400">AC: {combatant.currentAC_Calculated}</span>
                                        </div>
                                        {combatant.activeConditions.length > 0 && (
                                            <div className="mt-1 text-xs">
                                                <span className="font-medium text-purple-600 dark:text-purple-400">Conditions: </span>
                                                {combatant.activeConditions.map(cond => cond.definition?.fullName || cond.conditionID).join(', ')}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    
                    {/* Game Log */}
                    <div className="mt-6">
                        <h3 className="text-xl font-semibold mb-3 text-gray-800 dark:text-gray-200">Game Log:</h3>
                        <div className="h-64 overflow-y-auto p-3 bg-gray-100 dark:bg-gray-900 rounded-md shadow-inner border dark:border-gray-700 space-y-1.5" role="log" aria-live="polite">
                            {combatState.log.slice().reverse().map((event, index) => ( 
                                <p key={`${event.timestamp}-${index}-${event.type}`} className="text-xs text-gray-700 dark:text-gray-300 leading-tight">
                                    <span className="font-mono text-gray-500 dark:text-gray-400 mr-1">[{new Date(event.timestamp).toLocaleTimeString()}]</span>
                                    {event.description || `${event.type} event occurred.`}
                                </p>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};