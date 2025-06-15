
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { getItemById, getItemsByPathPrefix } from '../../src/services/dataService'; 
import { AttackCalculatorState, AttackSource, AttackResult, RolledDamageInstance, DamageTypeDefinition } from '../../types';
import { parseDiceString, rollSingleDie as rollSingleDiceUtil } from '../../src/engines/utils/diceUtils'; // UPDATED IMPORT

const getInitialAttackSource = (damageTypes: DamageTypeDefinition[]): AttackSource => ({
  id: Date.now().toString(),
  name: 'Bonus Damage',
  damageDice: '1d6',
  damageTypeID_Ref: damageTypes[0]?.damageTypeID || 'SLASHING', 
  isEnabled: true,
});

const getInitialState = (damageTypes: DamageTypeDefinition[]): AttackCalculatorState => ({
  attackBonus: 5,
  baseAttackName: 'Longsword',
  baseDamageDice: '1d8',
  baseDamageTypeID_Ref: damageTypes.find(dt => dt.damageTypeID === 'SLASHING')?.damageTypeID || damageTypes[0]?.damageTypeID || 'SLASHING',
  additionalSources: [],
  advantage: false,
  disadvantage: false,
  forceCritical: false,
  flatAttackBonus: 0,
  flatDamageBonus: 0,
  targetDefenses: {},
  targetAC: 15,
});

const InputField: React.FC<{ label: string, type?: string, value: string | number, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void, id: string, name: string, options?: { value: string, label: string }[], className?: string }> = 
  ({ label, type = "text", value, onChange, id, name, options, className }) => (
  <div className={`mb-4 ${className}`}>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
    {type === 'select' && options ? (
      <select id={id} name={name} value={value} onChange={onChange} className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
        {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    ) : (
      <input type={type} id={id} name={name} value={value} onChange={onChange} className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
    )}
  </div>
);

const CheckboxField: React.FC<{ label: string, checked: boolean, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, id: string, name: string }> =
 ({ label, checked, onChange, id, name }) => (
  <div className="flex items-center mb-2">
    <input id={id} name={name} type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 text-indigo-600 border-gray-300 dark:border-gray-600 rounded focus:ring-indigo-500 bg-white dark:bg-gray-700" />
    <label htmlFor={id} className="ml-2 block text-sm text-gray-700 dark:text-gray-300">{label}</label>
  </div>
);

// Renamed to avoid conflict if DiceRoller engine is also imported here
const rollSingleDieForCalculator = rollSingleDiceUtil; 

export const AttackCalculator: React.FC = () => {
  const [damageTypes, setDamageTypes] = useState<DamageTypeDefinition[]>([]);
  const [state, setState] = useState<AttackCalculatorState | null>(null); 
  const [result, setResult] = useState<AttackResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadInitialData() {
      try {
        setIsLoading(true);
        setError(null);
        
        const fetchedDamageTypes = await getItemsByPathPrefix('database/foundational_definitions/damage_types/');
        
        const validDamageTypes = fetchedDamageTypes.filter(
          (item: any): item is DamageTypeDefinition => 
            item && item.damageTypeID && typeof item.fullName === 'string' && typeof item.description === 'string'
        );

        if (validDamageTypes.length === 0) {
           console.warn("No damage types found at 'database/foundational_definitions/damage_types/'. Attempting fallback fetch for common damage types.");
           const commonDamageTypeIDs = ["FIRE", "SLASHING", "BLUDGEONING", "PIERCING", "POISON_DAMAGE", "ACID", "COLD", "RADIANT", "NECROTIC", "LIGHTNING", "THUNDER", "FORCE", "PSYCHIC"];
           const typesPromises = commonDamageTypeIDs.map(id => getItemById(id).catch(e => {
             console.warn(`Fallback: Failed to load damage type ${id}:`, e.message);
             return null;
            }));
           const typesResults = await Promise.all(typesPromises);
           const fallbackValidTypes = typesResults.filter(t => t !== null) as DamageTypeDefinition[];
           
           if (fallbackValidTypes.length > 0) {
             setDamageTypes(fallbackValidTypes);
             setState(getInitialState(fallbackValidTypes));
           } else {
             setError("Could not load any damage types, even with fallback.");
             setDamageTypes([]); 
             setState(getInitialState([])); 
           }
        } else {
            setDamageTypes(validDamageTypes);
            setState(getInitialState(validDamageTypes));
        }
        
      } catch (err: any) {
        console.error("Failed to load damage types for calculator:", err);
        setError(`Failed to load necessary data for the calculator. ${err.message}`);
        setDamageTypes([]);
        setState(getInitialState([]));
      } finally {
        setIsLoading(false);
      }
    }
    loadInitialData();
  }, []);


  const damageTypeOptions = useMemo(() => {
      if (damageTypes.length === 0 && !isLoading) {
          return [{ value: 'LOADING_FAILED', label: 'Error: No Damage Types Loaded' }];
      }
      return damageTypes.map(dt => ({ value: dt.damageTypeID, label: dt.fullName }))
    }, [damageTypes, isLoading]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (!state) return;
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setState(prevState => ({
      ...prevState!,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? parseFloat(value) || 0 : value),
    }));
  };

  const handleAdditionalSourceChange = (index: number, e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (!state) return;
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    const newSources = [...state.additionalSources];
    const fieldName = name.split('-')[0]; 
    (newSources[index] as any)[fieldName] = type === 'checkbox' ? checked : value;
    if (fieldName === 'damageTypeID_Ref') {
        newSources[index].damageTypeID_Ref = value;
    }
    setState(prevState => ({ ...prevState!, additionalSources: newSources }));
  };

  const addAdditionalSource = () => {
    if (!state) return;
     if (damageTypes.length === 0) {
        console.warn("Cannot add damage source: Damage types not loaded.");
        return;
    }
    setState(prevState => ({
      ...prevState!,
      additionalSources: [...prevState!.additionalSources, { ...getInitialAttackSource(damageTypes), id: Date.now().toString() }]
    }));
  };

  const removeAdditionalSource = (index: number) => {
    if (!state) return;
    setState(prevState => ({
      ...prevState!,
      additionalSources: prevState!.additionalSources.filter((_, i) => i !== index)
    }));
  };
  
  const handleTargetDefenseChange = (damageTypeID: string, value: 'none' | 'resistance' | 'vulnerability' | 'immunity') => {
    if (!state) return;
    setState(prevState => ({
      ...prevState!,
      targetDefenses: {
        ...prevState!.targetDefenses,
        [damageTypeID]: value,
      }
    }));
  };

  const calculateAttack = useCallback(async () => {
    if (!state) return;

    let d20Roll1 = rollSingleDieForCalculator(20);
    let d20Roll2 = state.advantage || state.disadvantage ? rollSingleDieForCalculator(20) : d20Roll1;
    let chosenD20Roll = d20Roll1;

    if (state.advantage && !state.disadvantage) {
      chosenD20Roll = Math.max(d20Roll1, d20Roll2);
    } else if (state.disadvantage && !state.advantage) {
      chosenD20Roll = Math.min(d20Roll1, d20Roll2);
    }
    
    const finalAttackRoll = chosenD20Roll + state.attackBonus + state.flatAttackBonus;
    const isCriticalHit = state.forceCritical || chosenD20Roll === 20;
    const isCriticalMiss = chosenD20Roll === 1;
    const isHit = !isCriticalMiss && (isCriticalHit || finalAttackRoll >= state.targetAC);

    const damageBreakdown: RolledDamageInstance[] = [];
    let totalDamage = 0;
    let totalDamageAfterDefenses = 0;

    const allDamageSources = [
      { name: state.baseAttackName, damageDice: state.baseDamageDice, damageTypeID_Ref: state.baseDamageTypeID_Ref, isBase: true, isEnabled: true },
      ...state.additionalSources.map(s => ({ ...s, isBase: false }))
    ];

    for (const source of allDamageSources) {
      if (!source.isEnabled) continue;

      const parsedDice = parseDiceString(source.damageDice);
      let currentRolls: number[] = [];
      let rawDamageThisSource = 0;
      
      const diceToRoll = isCriticalHit ? parsedDice.count * 2 : parsedDice.count;

      for (let i = 0; i < diceToRoll; i++) {
        const roll = rollSingleDieForCalculator(parsedDice.faces);
        currentRolls.push(roll);
        rawDamageThisSource += roll;
      }
      rawDamageThisSource += parsedDice.modifier; // Add flat modifier from dice string (e.g., 2d6+2)
      
      // Add flat damage bonus from state only to the base attack
      if (source.isBase) {
        rawDamageThisSource += state.flatDamageBonus;
      }
      
      rawDamageThisSource = Math.max(0, rawDamageThisSource); // Damage cannot be negative

      let modifiedDamageThisSource = rawDamageThisSource; // This will be raw damage before defenses
      let damageAfterDefensesThisSource = rawDamageThisSource;
      const defense = state.targetDefenses[source.damageTypeID_Ref] || 'none';

      if (isHit) {
        if (defense === 'immunity') {
            damageAfterDefensesThisSource = 0;
        } else if (defense === 'vulnerability') {
            damageAfterDefensesThisSource = Math.floor(rawDamageThisSource * 2); // Vulnerability doubles
        } else if (defense === 'resistance') {
            damageAfterDefensesThisSource = Math.floor(rawDamageThisSource / 2); // Resistance halves
        }
      } else { // If not a hit, no damage is dealt from this source for the attack
        modifiedDamageThisSource = 0;
        damageAfterDefensesThisSource = 0;
      }

      const damageTypeObject = damageTypes.find(dt => dt.damageTypeID === source.damageTypeID_Ref);

      damageBreakdown.push({
        sourceName: source.name,
        typeID_Ref: source.damageTypeID_Ref,
        typeName: damageTypeObject?.fullName || source.damageTypeID_Ref,
        dice: source.damageDice,
        rolls: currentRolls,
        rawTotal: rawDamageThisSource, // Original total from dice rolls + flat mod from dice string + flat state bonus (if base)
        modifiedTotal: modifiedDamageThisSource, // Damage if hit, before defenses. For a miss, this is 0.
        finalTotal: damageAfterDefensesThisSource, // Damage after defenses are applied. For a miss, this is 0.
        isCrit: isCriticalHit,
      });
      
      totalDamage += modifiedDamageThisSource; // Summing up damage *if it's a hit*, before defenses
      totalDamageAfterDefenses += damageAfterDefensesThisSource; // Summing up damage *after defenses*
    }
    
    setResult({
      d20Rolls: [d20Roll1, d20Roll2].filter((r, i, arr) => arr.indexOf(r) === i || (state.advantage || state.disadvantage)),
      finalAttackRoll,
      isHit,
      isCriticalHit,
      isCriticalMiss, // Added to result
      damageBreakdown,
      totalDamage, // This is total damage if hit, before target defenses
      totalDamageAfterDefenses,
    });

  }, [state, damageTypes]);

  const involvedDamageTypes = useMemo(() => {
    if (!state) return [];
    const types = new Set<string>();
    if(state.baseDamageTypeID_Ref) types.add(state.baseDamageTypeID_Ref);
    state.additionalSources.forEach(s => {
        if (s.isEnabled && s.damageTypeID_Ref) types.add(s.damageTypeID_Ref);
    });
    return Array.from(types);
  }, [state]);


  if (isLoading) {
    return <div className="p-4 text-center">Loading Attack Calculator...</div>;
  }
  if (error) {
    return <div className="p-4 text-center text-red-500">{error}</div>;
  }
  if (!state) {
     return <div className="p-4 text-center text-red-500">Calculator could not be initialized. State is null.</div>;
  }


  return (
    <div className="p-4 space-y-8 bg-gray-50 dark:bg-gray-800 rounded-lg shadow-md">
      <div className="p-6 bg-white dark:bg-gray-900 rounded-lg shadow">
        <h3 className="text-xl font-semibold mb-4 text-indigo-600 dark:text-indigo-400">Base Attack</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputField label="Attack Name" id="baseAttackName" name="baseAttackName" value={state.baseAttackName} onChange={handleChange} />
          <InputField label="Attack Bonus (e.g., 5 for +5)" type="number" id="attackBonus" name="attackBonus" value={state.attackBonus} onChange={handleChange} />
          <InputField label="Base Damage Dice (e.g., 1d8, 2d6+2)" id="baseDamageDice" name="baseDamageDice" value={state.baseDamageDice} onChange={handleChange} />
          <InputField label="Base Damage Type" type="select" options={damageTypeOptions} id="baseDamageTypeID_Ref" name="baseDamageTypeID_Ref" value={state.baseDamageTypeID_Ref} onChange={handleChange} />
        </div>
      </div>

      <div className="p-6 bg-white dark:bg-gray-900 rounded-lg shadow">
        <h3 className="text-xl font-semibold mb-4 text-indigo-600 dark:text-indigo-400">Additional Damage Sources</h3>
        {state.additionalSources.map((source, index) => (
          <div key={source.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end border-b dark:border-gray-700 pb-4 mb-4">
            <InputField label={`Source ${index + 1} Name`} id={`sourceName-${index}`} name={`name-${index}`} value={source.name} onChange={(e) => handleAdditionalSourceChange(index, e)} />
            <InputField label="Damage Dice" id={`sourceDamageDice-${index}`} name={`damageDice-${index}`} value={source.damageDice} onChange={(e) => handleAdditionalSourceChange(index, e)} />
            <InputField label="Damage Type" type="select" options={damageTypeOptions} id={`sourceDamageTypeID_Ref-${index}`} name={`damageTypeID_Ref-${index}`} value={source.damageTypeID_Ref} onChange={(e) => handleAdditionalSourceChange(index, e)} />
            <div className="flex flex-col space-y-2 md:flex-row md:items-end md:space-y-0 md:space-x-2">
              <CheckboxField label="Enabled" id={`sourceIsEnabled-${index}`} name={`isEnabled-${index}`} checked={source.isEnabled} onChange={(e) => handleAdditionalSourceChange(index, e)} />
              <button onClick={() => removeAdditionalSource(index)} className="px-3 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors">Remove</button>
            </div>
          </div>
        ))}
        <button onClick={addAdditionalSource} className="mt-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md shadow-sm transition-colors">
          Add Damage Source
        </button>
      </div>

      <div className="p-6 bg-white dark:bg-gray-900 rounded-lg shadow">
        <h3 className="text-xl font-semibold mb-4 text-indigo-600 dark:text-indigo-400">Roll Modifiers</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          <InputField label="Flat Bonus to Attack Roll" type="number" id="flatAttackBonus" name="flatAttackBonus" value={state.flatAttackBonus} onChange={handleChange} />
          <InputField label="Flat Bonus to Base Damage" type="number" id="flatDamageBonus" name="flatDamageBonus" value={state.flatDamageBonus} onChange={handleChange} />
          <div className="space-y-2">
            <CheckboxField label="Advantage on Attack Roll" id="advantage" name="advantage" checked={state.advantage} onChange={handleChange} />
            <CheckboxField label="Disadvantage on Attack Roll" id="disadvantage" name="disadvantage" checked={state.disadvantage} onChange={handleChange} />
            <CheckboxField label="Force Critical Hit" id="forceCritical" name="forceCritical" checked={state.forceCritical} onChange={handleChange} />
          </div>
        </div>
      </div>
      
      <div className="p-6 bg-white dark:bg-gray-900 rounded-lg shadow">
        <h3 className="text-xl font-semibold mb-4 text-indigo-600 dark:text-indigo-400">Target Defenses</h3>
         <InputField label="Target AC" type="number" id="targetAC" name="targetAC" value={state.targetAC} onChange={handleChange} className="mb-6" />
        {involvedDamageTypes.map(typeId => {
          const typeName = damageTypes.find(dt => dt.damageTypeID === typeId)?.fullName || typeId;
          const defenseSelectId = `targetDefense-${typeId}`;
          return (
            <div key={typeId} className="mb-3">
              <label htmlFor={defenseSelectId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{typeName}</label>
              <select 
                id={defenseSelectId}
                name={defenseSelectId}
                value={state.targetDefenses[typeId] || 'none'} 
                onChange={(e) => handleTargetDefenseChange(typeId, e.target.value as any)}
                className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="none">None</option>
                <option value="resistance">Resistance</option>
                <option value="vulnerability">Vulnerability</option>
                <option value="immunity">Immunity</option>
              </select>
            </div>
          );
        })}
      </div>

      <button onClick={calculateAttack} className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md shadow-md hover:shadow-lg transition-all duration-150 ease-in-out text-lg">
        Calculate Attack & Damage
      </button>

      {result && (
        <div className="mt-8 p-6 bg-white dark:bg-gray-900 rounded-lg shadow-xl">
          <h3 className="text-2xl font-semibold mb-6 text-indigo-700 dark:text-indigo-300 border-b-2 dark:border-gray-700 pb-2">Results</h3>
          
          <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-md">
            <p className="text-lg font-medium">
              <span className="text-gray-700 dark:text-gray-300">Attack Roll: </span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">{result.finalAttackRoll}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                (d20 rolls: {result.d20Rolls.join(' & ')})
              </span>
            </p>
            <p className={`text-lg font-semibold ${result.isHit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {result.isCriticalMiss ? 'Critical Miss!' : (result.isHit ? 'Hit!' : 'Miss!')}
              {result.isCriticalHit && !result.isCriticalMiss && <span className="ml-2 px-2 py-0.5 bg-yellow-400 text-yellow-800 text-xs font-bold rounded-full">CRITICAL HIT!</span>}
            </p>
          </div>

          <h4 className="text-xl font-semibold mb-3 text-gray-700 dark:text-gray-300">Damage Breakdown:</h4>
          <div className="space-y-3 mb-6">
            {result.damageBreakdown.map((item, index) => (
              <div key={index} className="p-3 border dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800">
                <p className="font-medium text-gray-800 dark:text-gray-200">
                  {item.sourceName} ({item.typeName}): 
                  <span className={`font-bold ml-2 ${item.isCrit ? 'text-yellow-600 dark:text-yellow-400' : 'text-blue-600 dark:text-blue-400'}`}>
                    {item.finalTotal}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                    (Rolled: {item.rolls.join(', ')}; Raw Dice: {item.rawTotal}; Modified: {item.modifiedTotal})
                  </span>
                </p>
                 {item.modifiedTotal !== item.finalTotal && (
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    After defenses: {item.finalTotal} (was {item.modifiedTotal})
                  </p>
                )}
              </div>
            ))}
          </div>
          
          <div className="text-right mt-6 p-4 bg-indigo-100 dark:bg-indigo-800/50 rounded-md">
            <p className="text-xl font-bold text-indigo-700 dark:text-indigo-300">
              Total Damage Dealt: <span className="text-2xl">{result.totalDamageAfterDefenses}</span>
            </p>
             {result.totalDamage !== result.totalDamageAfterDefenses && 
                <p className="text-sm text-gray-600 dark:text-gray-400">(Before defenses: {result.totalDamage})</p>
             }
          </div>
        </div>
      )}
    </div>
  );
};