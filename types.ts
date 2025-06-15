// types.ts
// A. Esquemas de Definiciones Fundamentales Absolutas

export interface AbilityScoreDefinition {
  abilityID: string;
  fullName: string;
  abbreviation: string;
  description: string;
}

export interface SkillDefinition {
  skillID: string;
  fullName:string;
  description: string;
  defaultAbilityScoreID_Ref: string; // Refers to AbilityScoreDefinition.abilityID
  defaultAbilityScore?: AbilityScoreDefinition; // Resolved
}

export interface DamageTypeDefinition {
  damageTypeID: string;
  fullName: string;
  description: string;
}

// B.1. Effect Types Catalog (Initial)
export type EffectTypeStrings =
  | "DEAL_DAMAGE"
  | "DEAL_DAMAGE_ON_ATTACK_HIT" // For effects tied to attack success
  | "APPLY_CONDITION"
  | "HEAL"
  | "GRANT_BONUS" // Generic bonus to various rolls or stats
  | "GRANT_ADVANTAGE_ON_ROLL" // Specific to rolls
  | "IMPOSE_DISADVANTAGE_ON_ROLL" // Specific to rolls
  | "GRANT_ADVANTAGE_TO_ATTACKERS" // e.g. Blinded
  | "GRANT_DISADVANTAGE_TO_ATTACKERS" // e.g. Invisible, Prone (conditional)
  | "AUTO_FAIL_CHECK" // e.g. Blinded + sight based check
  | "AUTO_FAIL_SAVE" // e.g. Paralyzed + STR/DEX saves
  | "RESTRICT_TARGETING" // e.g. Charmed
  | "GRANT_ADVANTAGE_TO_OTHER" // e.g. Charmed (social checks by charmer)
  | "RESTRICT_MOVEMENT" // e.g. Frightened
  | "SET_SPEED" // e.g. Grappled, Paralyzed
  | "NEGATE_BONUS" // e.g. Grappled (speed bonuses)
  | "PREVENT_ACTIONS" // e.g. Incapacitated
  | "PREVENT_REACTIONS" // e.g. Incapacitated
  | "CONSIDERED_HEAVILY_OBSCURED_FOR_HIDING" // e.g. Invisible
  | "CANNOT_SPEAK" // e.g. Paralyzed
  | "ATTACKS_BECOME_CRITICAL" // e.g. Paralyzed + attacker within 5ft
  | "UNAWARE_OF_SURROUNDINGS" // e.g. Petrified
  | "GRANT_RESISTANCE"
  | "GRANT_IMMUNITY"
  | "CEASE_AGING" // e.g. Petrified
  | "WEIGHT_MULTIPLIER" // e.g. Petrified
  | "MOVEMENT_OPTION_CRAWL_ONLY_OR_STAND" // e.g. Prone
  | "SPEAK_FALTERINGLY" // e.g. Stunned
  | "DROP_HELD_ITEMS" // e.g. Unconscious
  | "PREVENT_MOVEMENT_ON_FIRST_TURN" // e.g. Surprised
  | "PREVENT_ACTION_ON_FIRST_TURN" // e.g. Surprised
  | "PREVENT_REACTION_UNTIL_FIRST_TURN_ENDS" // e.g. Surprised
  | "SET_BASE_AC" // e.g. Mage Armor
  | "INCREASE_MAX_HP" // e.g. Tough feat
  | "NEGATE_ADVANTAGE_FOR_ATTACKERS" // e.g. Alert feat
  | "OPTIONAL_ROLL_BONUS" // e.g. Human Resourcefulness
  | "GRANT_SENSE" // e.g. Darkvision
  | "MODIFY_REST" // e.g. Elf Trance
  | "GRANT_PROFICIENCY" // e.g. Keen Senses
  | "SOCIAL_BENEFIT" // e.g. Background features
  | "RECOVER_SPELL_SLOTS" // e.g. Arcane Recovery
  | "GRANT_SUBCLASS_CHOICE" // e.g. Class feature
  | "GRANT_ABILITY_SCORE_INCREASE_OR_FEAT_CHOICE"
  | "MODIFY_SPELL_EFFECT" // e.g. Sculpt Spells
  | "REDUCE_COST_COPY_SPELL" // e.g. Evoker Savant
  | "MODIFY_CANTRIP_EFFECT_ON_SAVE" // e.g. Potent Cantrip
  | "GRANT_CHOICE_FROM_LIST" // e.g. Fighting Style
  | "GRANT_ADDITIONAL_ACTION" // e.g. Action Surge
  | "MODIFY_ACTION" // e.g. Extra Attack
  | "GRANT_RESOURCE" // e.g. Combat Superiority Dice
  | "DEFINE_SAVE_DC" // e.g. Maneuver Save DC
  | "GRANT_PROFICIENCY_CHOICE" // e.g. Student of War
  | "INFORMATION_GATHERING_ABILITY" // e.g. Know Your Enemy
  | "PREVENT_OPPORTUNITY_ATTACKS_ON_SELF_MOVEMENT" // e.g. Disengage
  | "ATTEMPT_HIDE" // e.g. Hide Action
  | "GRANT_SPELL_CHOICE" // e.g. Magic Initiate
  | "ENABLE_SPELLCASTING" // e.g. Wizard Spellcasting feature
  | "OTHER_CUSTOM_EFFECT"; // Fallback for highly specific effects

export interface ParsedEffect {
  effectType: EffectTypeStrings | string; // Allow string for future extension
  targetScope?: string; // e.g., SELF, TARGET, ALLIES_IN_RADIUS, SELF_CONSUMER, SELF_WIELDER
  targetSelector?: string; // More detailed targeting if needed by effectType
  
  // Common fields, specific effectTypes will use a subset or add more
  condition_Ref?: string; // For APPLY_CONDITION, refers to ConditionDefinition.conditionID
  condition?: ConditionDefinition; // Resolved
  conditionsToEnd_List?: string[]; // For effects like Mage Armor
  
  onRollType_Ref_List?: string[]; // Refers to RollTypeDefinition.rollTypeID
  onRollType?: RollTypeDefinition[]; // Resolved
  
  abilityID_Ref?: string; // For saves, checks using a specific ability
  abilityID_Ref_List?: string[]; // For multiple abilities (e.g. auto-fail STR & DEX saves)
  skillID_Ref?: string; // For skill-specific effects

  bonusTo_Ref?: string; // What is being bonused (e.g., INITIATIVE_ROLL, ARMOR_CLASS, specific skillID or abilityID)
  bonusTo?: RollTypeDefinition | SkillDefinition | AbilityScoreDefinition; // Resolved
  bonusValue?: number;
  bonusValueFormula?: string; // e.g., "PROFICIENCY_BONUS", "CLASS_LEVEL:WIZARD"
  bonusDice?: { diceCount: number, diceID_Ref: string, dice?: DiceDefinition };
  bonusType?: string; // e.g., "ARMOR", "SHIELD", "MORALE", "UNTYPED", "CIRCUMSTANCE"

  duration?: string | DurationTypeDefinition | SpellDuration; // Can be simple string or structured
  durationValue?: DurationValue; // if simple duration string
  
  damageRolls_List?: DamageRoll[];
  healingRolls_List?: HealingRoll[];
  healingFormulaBonus_List?: HealingFormulaBonus[];
  
  savingThrow?: SavingThrowInfo;
  attackType?: "MELEE_WEAPON_ATTACK" | "RANGED_WEAPON_ATTACK" | "MELEE_SPELL_ATTACK" | "RANGED_SPELL_ATTACK";

  value?: any; // Generic value field (e.g. for SET_SPEED)
  valueFormula?: string; // e.g. "13 + TARGET_DEX_MOD" for Mage Armor AC
  acValueFormula?: string; // Specific for SET_BASE_AC for clarity, overlaps with valueFormula

  trigger?: string; // e.g., ON_ACTIVATION, ON_CONSUME, ON_HIT, ON_SHORT_REST_COMPLETION, ON_USER_CHOICE_BEFORE_OUTCOME, ON_ATTACK_HIT
  
  details?: string; // Human-readable summary or extra context
  notes?: string;
  
  // Specific fields for certain effectTypes
  resistanceScope?: "ALL_DAMAGE" | string; // or specific DamageTypeID_Ref
  resistanceType?: "RESISTANCE" | "VULNERABILITY"; // For GRANT_RESISTANCE to specify type.
  immunityToCondition_Ref?: string; // Refers to ConditionDefinition.conditionID
  immunityToCondition?: ConditionDefinition; // Resolved
  immunityToEffectType?: string; // e.g., MAGICAL_SLEEP
  specificImmunities_List?: { immunityType: "DAMAGE" | "CONDITION" | "CONCEPT", damageTypeID_Ref?: string, conditionID_Ref?: string, conceptName?: string }[];
  
  spellSchoolRestriction_Ref?: string; // For effects like Evoker Savant
  spellListSources?: string[]; // e.g. ["WIZARD_SPELL_LIST"]
  preparationType?: string; // e.g. "PREPARED_FROM_SPELLBOOK"
  spellcastingAbility_Ref?: string;
  isMagical?: boolean; // If the effect itself is magical (e.g. for damage resistance bypass)
  
  maxTotalSlotLevelFormula?: string; // For Arcane Recovery
  maxIndividualSlotLevel?: number; // For Arcane Recovery

  choiceCategory?: string; // e.g., "FIGHTING_STYLE_WARRIOR"
  count?: number; // For choices

  [key: string]: any; // For other dynamic properties
}


export interface HealingRoll {
  diceCount: number;
  diceID_Ref: string; // Refers to DiceDefinition.diceID
  dice?: DiceDefinition; // Resolved
  bonusHealing?: number;
}

export interface HealingFormulaBonus {
  bonusSource: string; // e.g., CLASS_LEVEL, ABILITY_MODIFIER
  classID_Ref?: string; // Refers to ClassDefinition.classID
  class?: ClassDefinition; // Resolved
  abilityID_Ref?: string; // Refers to AbilityScoreDefinition.abilityID
  ability?: AbilityScoreDefinition; // Resolved
  multiplier: number;
}

export interface ConditionDefinition {
  conditionID: string;
  fullName: string;
  sourceSystem: string;
  description: string;
  parsedEffects_List: ParsedEffect[];
  endingConditions_List?: string[]; // Conditions that might end this condition (e.g. for Grappled)
}

export interface AreaOfEffectShapeDefinition {
  shapeID: string;
  fullName: string;
  description: string;
  dimensionParametersNeeded: string[];
}

export interface DiceDefinition {
  diceID: string;
  faces: number;
}

export interface ActionTypeDefinition {
  actionTypeID: string;
  fullName: string;
  description: string;
}

export interface DurationTypeDefinition {
  durationTypeID: string;
  fullName: string;
  description: string;
  needsMaxValue: boolean;
  needsMaxUnit: boolean;
}

export interface SchoolOfMagicDefinition {
  schoolID: string;
  fullName: string;
  description: string;
}

export interface CurrencyDefinition {
  currencyID: string;
  fullName: string;
  abbreviation: string;
  baseValueInCopper: number;
}

export interface LanguageDefinition {
  languageID: string;
  fullName: string;
  script: string;
  typicalSpeakers_List: string[];
}

export interface Cost {
  amount: number;
  currencyID_Ref: string; // Refers to CurrencyDefinition.currencyID
  currency?: CurrencyDefinition; // Resolved
}

export interface AssociatedSkillCheck {
  skillID_Ref: string; // Refers to SkillDefinition.skillID
  skill?: SkillDefinition; // Resolved
  task_description: string;
}

export interface ToolDefinition {
  toolID: string;
  fullName: string;
  category: string;
  cost: Cost;
  weight: number;
  description: string;
  associatedSkillChecks_List?: AssociatedSkillCheck[];
}

export interface SizeCategoryDefinition {
  sizeID: string;
  name: string;
  space: string;
}

export interface CreatureTypeDefinition {
  typeID: string;
  name: string;
}

export interface RestTypeDefinition {
  restTypeID: string;
  fullName: string;
  description: string;
}

export interface RollTypeDefinition {
  rollTypeID: string;
  fullName: string;
  description: string;
}


// B. Esquemas de Entidades de Juego Principales

export interface DamageRoll {
  diceCount: number;
  diceID_Ref: string; // Refers to DiceDefinition.diceID
  dice?: DiceDefinition; // Resolved
  damageTypeID_Ref: string; // Refers to DamageTypeDefinition.damageTypeID
  damageType?: DamageTypeDefinition; // Resolved
  bonusDamage?: number; // Static bonus
  bonusDamageFormula?: string | null; // e.g. "STR_MOD", "SPELL_ABILITY_MOD"
  diceCountIncrement?: number; // For scaling
}

export interface WeaponSpecifics {
  damageRolls_List: DamageRoll[];
  versatileDamageRoll?: DamageRoll;
  range?: RangeValue | null;
  weaponProperties_Tag_List: string[];
}

export interface ConsumableSpecifics {
  actionToConsume_Ref: string; // Refers to ActionTypeDefinition.actionTypeID
  actionToConsume?: ActionTypeDefinition; // Resolved
}

export interface ItemProperties {
  weaponSpecifics?: WeaponSpecifics;
  consumableSpecifics?: ConsumableSpecifics;
  armorSpecifics?: ArmorSpecifics; // Added for armor items
  [key: string]: any; // For other specific item properties
}

// Added for armor items
export interface ArmorSpecifics {
    baseAC?: number;
    addDexModifier?: boolean;
    maxDexModifier?: number | null;
    stealthDisadvantage?: boolean;
    strengthRequirement?: number;
    acBonus?: number; // For shields or magical armor bonus
    acFormula?: string; // E.g. for Plate Armor: "18", for Mage Armor effect item: "13 + TARGET_DEX_MOD"
}


export interface ItemDefinition {
  itemID: string;
  fullName: string;
  itemCategory: string; // e.g., WEAPON_MARTIAL_MELEE, POTION, ARMOR_LIGHT, ARMOR_SHIELD
  sourceSystem: string;
  description: string;
  cost?: Cost;
  weight?: number;
  requiresAttunement: boolean;
  properties: ItemProperties;
  parsedEffects_List?: ParsedEffect[]; // e.g., Shield AC bonus, Potion of Healing effect
}

export interface CastingTime {
  value: number;
  actionTypeID_Ref: string; // Refers to ActionTypeDefinition.actionTypeID
  actionType?: ActionTypeDefinition; // Resolved
}

export interface RangeValue {
  value: number;
  unit: string; // e.g., FEET, TOUCH, SELF
  shapeAtOriginIfSelf_Ref?: string | null; // Refers to AreaOfEffectShapeDefinition.shapeID
  shapeAtOriginIfSelf?: AreaOfEffectShapeDefinition | null; // Resolved
  short?: number; // For weapon ranges
  long?: number; // For weapon ranges
}

export interface AreaOfEffect {
  shapeID_Ref: string; // Refers to AreaOfEffectShapeDefinition.shapeID
  shape?: AreaOfEffectShapeDefinition; // Resolved
  dimensions: { [key: string]: number }; // e.g., { "radius": 20 }
  originatesFrom: string; // e.g., SELF, POINT_IN_RANGE
}

export interface SpellComponents {
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  materialDescription?: string | null;
  materialConsumed?: boolean;
  materialCost?: Cost | null;
}

export interface DurationValue {
  value: number | null;
  unit: string | null; // e.g., ROUNDS, MINUTES, HOURS, null for INSTANTANEOUS
}

export interface SpellDuration extends DurationValue {
  durationTypeID_Ref: string; // Refers to DurationTypeDefinition.durationTypeID
  durationType?: DurationTypeDefinition; // Resolved
}

export interface HigherLevelScaling {
  description: string;
  // parsedEffectIncrements_List: ParsedEffect[]; // Old structure
  // New proposed structure for higher level scaling
  levelBasedIncrements?: { // For cantrip-style scaling based on character level
    [characterLevel: number]: {
      // modifications for effects in parsedEffects_List
      effectModifications?: { effectToModifyIndex: number, modification: any }[];
    };
  };
  perSpellSlotLevel?: { // For spells cast with higher level slots
    incrementPerLevelAboveBase: number; // e.g. 1 for "each slot level above X"
    effectModifications?: { effectToModifyIndex: number, modification: any }[];
  };
   parsedEffectIncrements_List?: ParsedEffect[]; // Keep for compatibility or specific cases
}


export interface SavingThrowInfo {
  abilityID_Ref: string; // Refers to AbilityScoreDefinition.abilityID
  ability?: AbilityScoreDefinition; // Resolved
  dcFormula?: string; // e.g., "CASTER_SPELL_SAVE_DC", "FIXED_VALUE:15", "FEATURE_DC:BATTLEMASTER_MANEUVER"
  dcFixedValue?: number; // if dcFormula is FIXED_VALUE
  effectOnSuccess: string; // e.g., HALF_DAMAGE, NO_EFFECT, CUSTOM_EFFECT_ID
  effectOnFailure?: string; // Optional, default is full effect
}

export interface SpellDefinition {
  spellID: string;
  fullName: string;
  level: number; // 0 for cantrips
  schoolOfMagicID_Ref: string; // Refers to SchoolOfMagicDefinition.schoolID
  schoolOfMagic?: SchoolOfMagicDefinition; // Resolved
  sourceSystem: string;
  ritual: boolean;
  castingTime: CastingTime;
  range: RangeValue;
  areaOfEffect?: AreaOfEffect;
  components: SpellComponents;
  duration: SpellDuration;
  descriptionShort: string;
  descriptionFull: string;
  higherLevelScaling?: HigherLevelScaling;
  parsedEffects_List: ParsedEffect[];
}

export interface Prerequisite {
  type: string; // e.g., "MINIMUM_ABILITY_SCORE", "CLASS_LEVEL", "FEAT", "SPELLCASTING_ABILITY"
  abilityID_Ref?: string;
  minValue?: number;
  classID_Ref?: string;
  level?: number;
  featID_Ref?: string;
  notes?: string;
  [key: string]: any;
}

export interface FeatDefinition {
  featID: string;
  fullName: string;
  sourceSystem: string;
  prerequisites_Structured_List: Prerequisite[];
  description: string;
  parsedEffects_List: ParsedEffect[];
}

export interface FeatureUses {
  count?: number; // Static count
  countFormula?: string; // e.g., "PROFICIENCY_BONUS", "WIS_MOD"
  rechargeOn_Ref_List: string[]; // Refers to RestTypeDefinition.restTypeID
  rechargeOn?: RestTypeDefinition[]; // Resolved
}

export interface FeatureDefinition {
  featureID: string;
  fullName: string;
  sourceType: string; // e.g., CLASS_FEATURE, SPECIES_FEATURE, BACKGROUND_FEATURE, FEAT_COMPONENT (if a feat grants a feature-like ability)
  sourceID_Ref: string; // Refers to ClassDefinition.classID or SpeciesDefinition.speciesID etc.
  source?: ClassDefinition | SpeciesDefinition | BackgroundDefinition | FeatDefinition; // Resolved
  levelRequirement: number; // Character level or class level depending on context
  description: string;
  uses?: FeatureUses;
  activationAction_Ref?: string; // Refers to ActionTypeDefinition.actionTypeID, if the feature needs to be activated
  activationAction?: ActionTypeDefinition; // Resolved
  parsedEffects_List: ParsedEffect[];
  // Example for feature-specific DC:
  // definedSaveDCs?: { dcName: string; dcFormula: string; }[] 
  // e.g. { dcName: "BATTLEMASTER_MANEUVER_DC", dcFormula: "8 + PROFICIENCY_BONUS + MAX(STR_MOD, DEX_MOD)" }
}

export interface AbilityScoreIncreaseOption {
  type: string; // e.g., CHOOSE_TWO_DIFFERENT_PLUS_ONE, FIXED_INCREASES
  notes: string;
  fixedIncreases?: { abilityID_Ref: string, value: number }[];
  choices?: { count: number, value: number, from?: string[] /* list of abilityID_Refs */ }[];
}

export interface LanguageOptions {
  count: number;
  type: string; // e.g., CHOOSE_FROM_ANY_STANDARD, CHOOSE_FROM_LIST
  availableLanguages_Ref_List?: string[];
}

export interface FeatOptions {
  count: number;
  type: string; // e.g., CHOOSE_ANY_QUALIFIED_LVL1, CHOOSE_FROM_LIST
  availableFeats_Ref_List?: string[];
}

export interface SpeciesDefinition {
  speciesID: string;
  fullName: string;
  sourceSystem: string;
  description: string;
  sizeCategoryID_Ref: string; // Refers to SizeCategoryDefinition.sizeID
  sizeCategory?: SizeCategoryDefinition; // Resolved
  baseSpeed: { [type: string]: number }; // e.g., { "WALK": 30, "FLY": 0 }
  abilityScoreIncreases_Option?: AbilityScoreIncreaseOption; // Often moved to Background in newer rules
  languages_List_Ref?: string[]; // Refers to LanguageDefinition.languageID
  languages?: LanguageDefinition[]; // Resolved
  languageOptions?: LanguageOptions;
  grantedFeatures_List_Ref?: string[]; // Refers to FeatureDefinition.featureID
  grantedFeatures?: FeatureDefinition[]; // Resolved
  featOptions?: FeatOptions;
  lineageOptions_List_Ref?: string[]; // Could refer to other FeatureDefinition bundles (e.g. subraces as features)
  lineageOptions?: FeatureDefinition[]; // Resolved
}

export interface BackgroundDefinition {
  backgroundID: string;
  fullName: string;
  sourceSystem: string;
  description: string;
  abilityScoreIncreases?: { abilityID_Ref: string, value: number }[]; // Newer rule: ASI from background
  grantedSkillProficiencies_List_Ref?: string[]; // Refers to SkillDefinition.skillID
  grantedSkillProficiencies?: SkillDefinition[]; // Resolved
  grantedLanguageOptions?: LanguageOptions;
  grantedToolProficiencies_List_Ref?: string[]; // Refers to ToolDefinition.toolID
  grantedToolProficiencies?: ToolDefinition[]; // Resolved
  startingEquipment_Text?: string;
  startingWealth?: Cost;
  grantedFeat_Ref?: string; // Newer rule: Background feat
  grantedFeat?: FeatDefinition; // Resolved
  grantedFeature_Ref?: string; // Refers to FeatureDefinition.featureID for the background's unique feature
  grantedFeature?: FeatureDefinition; // Resolved
}

export interface SkillProficiencyOptions {
  count: number;
  availableSkillIDs_Ref_List: string[]; // Refers to SkillDefinition.skillID
  availableSkills?: SkillDefinition[]; // Resolved
}

export interface StartingEquipmentOption {
  choice?: string; // Text description of choice
  item?: string; // If it's a fixed item
  item_Ref?: string; // Ref to ItemDefinition.itemID
  itemDef?: ItemDefinition; // Resolved
  quantity?: number;
  options?: StartingEquipmentOption[]; // For nested choices
}

export interface SpellcastingSlotInfo {
  [level: string]: number; // e.g. "1": 2 (2 level 1 slots), "cantripsKnown": 3
}

export interface LevelProgression {
  featuresGained_Ref_List?: string[]; // Refers to FeatureDefinition.featureID
  featuresGained?: FeatureDefinition[]; // Resolved
  proficiencyBonus?: number; // Usually at class level 1, but could change (e.g. multiclassing context)
  notes?: string;
  spellcasting?: {
    cantripsKnown?: number;
    spellsKnown?: number; // For sorcerers, bards etc.
    spellSlots?: SpellcastingSlotInfo; // Per level spell slots gained at this class level
    newSpellsPreparedFormula?: string; // If rules for preparing new spells change at this level
  };
  // Add other per-level details as needed
  [key: string]: any;
}

export interface ClassDefinition {
  classID: string;
  fullName: string;
  sourceSystem: string;
  description: string;
  hitDie_Ref: string; // Refers to DiceDefinition.diceID
  hitDie?: DiceDefinition; // Resolved
  primaryAbilitySuggestion_List_Ref?: string[]; // Refers to AbilityScoreDefinition.abilityID
  primaryAbilitySuggestion?: AbilityScoreDefinition[]; // Resolved
  savingThrowProficiencies_List_Ref: string[]; // Refers to AbilityScoreDefinition.abilityID
  savingThrowProficiencies?: AbilityScoreDefinition[]; // Resolved
  armorProficiencies_Tag_List: string[]; // e.g. "LIGHT_ARMOR", "SHIELD"
  weaponProficiencies_Tag_List: string[]; // e.g. "SIMPLE_WEAPONS", "LONGSWORDS"
  toolProficiencyOptions?: any; // Define more strictly if needed
  skillProficiencyOptions: SkillProficiencyOptions;
  startingEquipmentOptions_Structured?: StartingEquipmentOption[];
  levelProgressionTable: { [level: number]: LevelProgression };
  subclassChoiceLevel: number;
  subclassTitle: string;
  spellcastingAbility_Ref?: string | null; // Refers to AbilityScoreDefinition.abilityID
  spellcastingAbility?: AbilityScoreDefinition | null; // Resolved
  spellPreparationRules?: {
    canPrepare: boolean;
    preparationFormula: string; // e.g., "INT_MOD + WIZARD_LEVEL (min 1)"
    spellListSourceID_Ref: string; // e.g. "WIZARD_SPELL_LIST"
  };
}

export interface SubclassDefinition {
  subclassID: string;
  fullName: string;
  classID_Ref: string; // Refers to ClassDefinition.classID
  class?: ClassDefinition; // Resolved
  sourceSystem: string;
  description: string;
  levelProgressionTable: { [level: number]: LevelProgression }; // Only subclass-specific features
}

// C. Creature Definition (Monster Templates)

export interface CreatureType { // Used in CreatureTemplateDefinition
  type_Ref: string; // Refers to CreatureTypeDefinition.typeID
  type?: CreatureTypeDefinition; // Resolved
  tags_List?: string[]; // e.g. "GOBLINOID", "DEMON"
}

export interface ArmorClassInfo { // Renamed from ArmorClass for clarity
  value: number; // Base AC if simple
  calculationDetails: string; // e.g., "Leather armor, shield", "Natural armor"
  acFormula?: string; // e.g. "10 + DEX_MOD", "ITEM_AC + DEX_MOD (max 2)"
  sources_List_Ref?: string[]; // Refers to ItemDefinition.itemID for equipped armor/shield
  sources?: ItemDefinition[]; // Resolved
}

export interface HitPointsInfo { // Renamed from HitPoints for clarity
  average: number;
  diceFormula: {
    diceCount: number;
    diceID_Ref: string; // Refers to DiceDefinition.diceID
    dice?: DiceDefinition; // Resolved
    bonus: number; // Flat bonus after rolling dice
    bonusFormula?: string; // e.g. "CON_MOD * HIT_DICE_COUNT"
  };
}

export interface CreatureAbilityScore {
  abilityID_Ref: string; // Refers to AbilityScoreDefinition.abilityID
  ability?: AbilityScoreDefinition; // Resolved
  value: number;
  // modifier is calculated: Math.floor((value - 10) / 2)
}

export interface CreatureSkillProficiency {
  skillID_Ref: string; // Refers to SkillDefinition.skillID
  skill?: SkillDefinition; // Resolved
  modifierOverride?: number; // If the final modifier is fixed, not just proficiency
  hasProficiency?: boolean; // More explicit than relying on override
  expertise?: boolean;
  notes?: string;
}

export interface CreatureSenses {
  darkvision?: number;
  blindsight?: number;
  tremorsense?: number;
  truesight?: number;
  passivePerception?: number; // Added for explicit storage if needed, though usually calculated
  [key: string]: any; 
}

export interface CreatureAction {
  actionName: string;
  actionType: string; // e.g., MELEE_WEAPON_ATTACK, RANGED_SPELL_ATTACK, SPECIAL_ABILITY
  description?: string; // Description of the action if not fully covered by parsedEffects
  attackBonusFormula?: string; // e.g., "STR_MOD + PROF_BONUS"
  attackBonusValue?: number; // If fixed
  reach?: RangeValue;
  range?: RangeValue; // For ranged attacks
  targetDescription?: string; // e.g. "One target", "Each creature in a 15-foot cone"
  onHitEffects_List?: ParsedEffect[];
  activationUses?: FeatureUses; // If the action has limited uses
  parsedEffects_List?: ParsedEffect[]; // For actions that are not attacks but have defined effects
  notes?: string;
}

export interface CreatureTemplateDefinition {
  creatureDefinitionID: string;
  fullName: string;
  sourceBookRef?: string;
  sizeCategoryID_Ref: string; // Refers to SizeCategoryDefinition.sizeID
  sizeCategory?: SizeCategoryDefinition; // Resolved
  creatureType: CreatureType;
  alignmentSuggestion_List?: string[];
  armorClass: ArmorClassInfo;
  hitPoints: HitPointsInfo;
  speed: { [type: string]: number }; // e.g., { "WALK": 30, "FLY": 60 }
  abilityScores: CreatureAbilityScore[];
  savingThrowProficiencies_List?: string[]; // AbilityScoreDefinition IDs where proficiency is applied
  savingThrowBonuses?: { abilityID_Ref: string, bonus: number }[]; // For specific fixed bonuses
  skillProficiencies_List?: CreatureSkillProficiency[];
  senses: CreatureSenses;
  languages_List_Ref?: string[]; // Refers to LanguageDefinition.languageID
  languages?: LanguageDefinition[]; // Resolved
  challengeRating: string; // e.g. "1/4", "5"
  proficiencyBonus: number; // Derived from CR usually
  specialAbilities_Ref_List?: string[]; // Refs to FeatureDefinition.featureID for passive traits or special actions not in action lists
  specialAbilities?: FeatureDefinition[]; // Resolved
  actions_List?: CreatureAction[];
  bonusActions_List?: CreatureAction[]; // For creatures with defined bonus actions
  reactions_List?: CreatureAction[];
  legendaryActions_List?: CreatureAction[];
  lairActions_List?: CreatureAction[];
}


// D. Utility types for the data service
export interface MasterIndex {
  [id: string]: string; // entityID: filePath
}

export interface DataCache {
  [id: string]: any; // entityID: resolvedEntityObject
}

// E. Attack Calculator Specific Types (Legacy - review if still needed standalone or merge into engine types)
export interface AttackSource {
  id: string;
  name: string;
  damageDice: string; // e.g., "1d8", "3d6"
  damageTypeID_Ref: string; 
  damageType?: DamageTypeDefinition; 
  isEnabled: boolean;
}

export interface TargetDefense {
  [damageTypeID: string]: 'none' | 'resistance' | 'vulnerability' | 'immunity';
}

export interface AttackCalculatorState {
  attackBonus: number;
  baseAttackName: string;
  baseDamageDice: string;
  baseDamageTypeID_Ref: string;  
  additionalSources: AttackSource[];
  advantage: boolean;
  disadvantage: boolean;
  forceCritical: boolean;
  flatAttackBonus: number;
  flatDamageBonus: number;
  targetDefenses: TargetDefense;
  targetAC: number;
}

export interface RolledDamageInstance {
  sourceName: string;
  typeID_Ref: string; // Damage Type ID
  typeName?: string; // Resolved name
  dice: string;
  rolls: number[];
  rawTotal: number;
  modifiedTotal: number; // After source-side modifiers (e.g. crits doubling dice, flat bonuses) but before target defenses
  finalTotal: number; // After target defenses
  isCrit: boolean;
}
export interface AttackResult {
  d20Rolls: number[];
  finalAttackRoll: number;
  isHit?: boolean;
  isCriticalHit: boolean;
  isCriticalMiss?: boolean; // Added for completeness
  damageBreakdown: RolledDamageInstance[];
  totalDamage: number; // Sum of modifiedTotals
  totalDamageAfterDefenses: number; // Sum of finalTotals
}

// F. Game Engine Specific Types

export interface CreatureAbilityScores {
    [abilityID: string]: number; // e.g. { STR: 10, DEX: 14, ... } stores the score, not modifier
}

export interface TrackedResource {
    resourceID: string; // Matches a definition or is a generic one like "PrimaryResource"
    currentValue: number;
    maxValue?: number;
    definition?: any; // Optional link to a full ResourceDefinition if it exists
}

export interface ActiveCondition {
    conditionID: string; // Ref to ConditionDefinition
    definition?: ConditionDefinition; // Resolved
    sourceEffectID?: string; // ID of the ParsedEffect that applied this condition
    sourceCreatureID?: string; // ID of the creature that applied it
    sourceDefinitionID?: string; // ID of the spell, item, feature, etc., that is the source of this condition.
    sourceDefinition?: SpellDefinition | ItemDefinition | FeatureDefinition | ConditionDefinition; // Resolved source definition
    remainingDurationRounds?: number; // For timed conditions in combat
    saveToEndDC?: number; // If applicable
    saveFrequency?: 'EACH_TURN' | 'END_OF_TURN';
    saveAbilityID_Ref?: string;
    context?: any; // e.g., for Frightened, the source of fear
}

export interface ActiveParsedEffect extends ParsedEffect {
    instanceID: string; // Unique ID for this active instance of an effect
    sourceDefinitionId: string; // e.g. SpellID, FeatureID that this effect came from
    sourceCreatureId?: string; // Creature that applied the effect
    remainingDurationRounds?: number; // For effects with combat round durations
    concentration?: boolean; // If this effect requires concentration
    appliedAtTimestamp?: number; // For non-combat time-based durations
}

// --- NEW CreatureRuntimeState based on detailed specification ---
export interface ClassLevelEntry {
  classID_Ref: string;
  class?: ClassDefinition; // Resolved
  level: number;
  subClassID_Ref?: string;
  subclass?: SubclassDefinition; // Resolved
}

export interface CreatureRuntimeState {
  // --- Identificación y Definición ---
  id: string; // ID único de esta instancia de criatura en el encuentro.
  name: string; // Nombre para mostrar (ej. "Goblin A", "Elara la Hechicera").
  isPlayerCharacter: boolean; // True si es un PJ, false si es PNJ/Monstruo.
  
  creatureDefinitionID_Ref?: string; // Para PNJs/Monstruos, ref a CreatureTemplateDefinition.creatureDefinitionID
  creatureDefinition?: CreatureTemplateDefinition; // Resolved
  
  // --- Para Personajes Jugadores (PCs) ---
  playerCharacterID?: string; // ID único persistente del PJ (si aplica).
  speciesID_Ref?: string; // Ref to SpeciesDefinition.speciesID
  species?: SpeciesDefinition; // Resolved
  backgroundID_Ref?: string; // Ref to BackgroundDefinition.backgroundID
  background?: BackgroundDefinition; // Resolved
  classLevels_List: ClassLevelEntry[];
  totalCharacterLevel: number; // Suma de todos los classLevels_List[i].level.

  // --- Estadísticas de Combate Fundamentales ---
  currentHP: number;
  temporaryHP: number;
  maxHP_Base: number; // Max HP antes de efectos temporales que lo aumenten/reduzcan.
  maxHP_Calculated: number; // Max HP efectivo actual (calculado por CalculationService).

  abilityScores_Base: CreatureAbilityScores; // Puntuaciones base (ej. compradas, tiradas, de la plantilla).
  abilityScores_Effective: CreatureAbilityScores; // Puntuaciones efectivas tras efectos (calculadas por CalculationService).
  
  proficiencyBonus_Calculated: number; // Calculado por CalculationService basado en totalCharacterLevel o CR.
  
  currentAC_Calculated: number; // AC efectivo actual (calculado por AC_CalculationEngine).
  
  currentSpeeds_Map: { [type: string]: number }; // Ej. { "WALK": 30, "FLY": 0 }

  senses_Effective?: CreatureSenses; // Percepción pasiva, visión en la oscuridad, etc. (Calculado).

  // --- Estado de Recursos y Magia (Principalmente para PCs) ---
  trackedResources: TrackedResource[]; // Slots de conjuro, Ki, Dados de Superioridad, Usos de Rasgos.
  
  spellcastingAbility_Ref?: string; // Principal habilidad para lanzar conjuros (INT, WIS, CHA). Map: { [classID_Ref]: abilityID_Ref } for multiclass.
                                   // For simplicity, a single one can be used if primary is clear, or determined by context of spell.

  knownSpellIDs_Ref_List?: string[]; // Ref a SpellDefinition.spellID
  preparedSpellIDs_Ref_List?: string[]; // Ref a SpellDefinition.spellID

  // --- Estado de Equipamiento e Inventario ---
  equippedItems_Map: { // itemInstanceID_Ref (clave podría ser el ID de instancia del objeto en el inventario)
    mainHand?: string; // itemInstanceID_Ref for item in main hand
    offHand?: string;
    armor?: string;
    shield?: string;
    attunementSlot1?: string;
    attunementSlot2?: string;
    attunementSlot3?: string;
    // ... otros slots relevantes (amuleto, anillos, botas, etc.)
    [slotKey: string]: string | undefined; // Allow generic slots
  };
  inventoryItemInstanceIDs_List?: string[]; // Lista de IDs de instancia de objetos en el inventario.
  attunedItemInstanceIDs_List?: string[];   // IDs de instancia de los objetos sintonizados.

  // --- Estado de Efectos y Condiciones Activas ---
  activeConditions: ActiveCondition[];
  activeEffects: ActiveParsedEffect[];

  isConcentratingOn?: {
    spellId?: string; // ID del hechizo que requiere concentración.
    effectInstanceId: string; // ID de la instancia de ActiveParsedEffect que se está concentrando.
  };
  
  // --- Estado de Iniciativa y Acciones en Combate ---
  currentInitiativeRoll: number | null;
  actionEconomyState: {
    hasAction: boolean;
    hasBonusAction: boolean;
    hasReaction: boolean;
    movementUsedThisTurn: number;
    // Podría incluir usos de Action Surge, etc.
  };

  // --- Información Adicional ---
  alignment?: string; // Ej. "LAWFUL_GOOD"
  xp?: number; // Para PCs
  // flags: { [key: string]: boolean }; // Para estados binarios diversos (ej. isHidden, hasTakenCover)
}


// G. Event System Types (Initial)
export type GameEventType =
  | "DAMAGE_APPLIED"
  | "HEALING_APPLIED"
  | "CONDITION_GAINED"
  | "CONDITION_REMOVED"
  | "EFFECT_APPLIED"
  | "EFFECT_REMOVED"
  | "SPELL_CAST"
  | "ATTACK_MADE" // Includes hit/miss info
  | "SAVING_THROW_MADE" // Includes success/fail info
  | "SKILL_CHECK_MADE"
  | "RESOURCE_SPENT"
  | "RESOURCE_GAINED"
  | "TURN_STARTED"
  | "TURN_ENDED"
  | "ROUND_STARTED"
  | "ROUND_ENDED"
  | "COMBAT_STARTED"
  | "COMBAT_ENDED"
  | "INITIATIVE_ROLLED"
  | "CREATURE_DIED"
  | "CREATURE_SPAWNED"
  | "MOVE_ACTION"; // Added for TurnAndRoundManager

export interface GameEventBase {
    type: GameEventType;
    timestamp: number; // Date.now()
    sourceCreatureId?: string; // ID of creature causing event
    targetCreatureId?: string; // ID of creature affected by event (if applicable)
    sourceDefinitionId?: string; // e.g. SpellID, ItemID, FeatureID that caused event - MADE OPTIONAL
    description?: string; // Optional human-readable log
    [key: string]: any; // Allow other properties for specific events
}

export interface AttackMadeEventDetails {
    attackRollResult: number;
    d20NaturalRolls: number[];
    chosenNaturalRoll: number;
    targetACValue: number;
    outcome: 'CriticalMiss' | 'Miss' | 'Hit' | 'CriticalHit';
    attackActionSourceId?: string; // e.g., LONGSWORD, GOBLIN_SCIMITAR_ATTACK
}
export interface AttackMadeEvent extends GameEventBase {
    type: "ATTACK_MADE";
    details: AttackMadeEventDetails;
}

export interface DamageAppliedEventDetails {
    totalAmount: number; // Total after defenses if applicable
    breakdown: { type: string, raw: number, modified: number, finalApplied: number }[]; // Raw: dice rolls + source mods. Modified: After source-side things like crit. Final: After target defenses.
    hpReduced: number;
    tempHpReduced: number;
    wasLethal: boolean;
    isCriticalHit: boolean; // Added
    damageTypeID_Ref: string; // Added (Primary type, or first type if multiple)
}

export interface DamageAppliedEvent extends GameEventBase {
    type: "DAMAGE_APPLIED";
    details: DamageAppliedEventDetails;
}

export interface ConditionGainedEvent extends GameEventBase {
    type: "CONDITION_GAINED";
    conditionID_Ref: string;
    durationRounds?: number;
    saveDC?: number;
}

export interface SpellCastEvent extends GameEventBase {
    type: "SPELL_CAST";
    spellLevel: number;
    slotUsedLevel: number;
    targets: TargetInfo;
    actionUsed: 'ACTION' | 'BONUS_ACTION' | 'REACTION' | 'OTHER'; // Added
}
// Add more specific event interfaces as needed...


// H. Engine Specific Context/Options Objects

// For DiceRoller
export interface D20RollContext {
    hasAdvantage: boolean;
    hasDisadvantage: boolean;
    rollType: 'Attack' | 'SavingThrow' | 'AbilityCheck' | 'Initiative' | 'OtherD20';
}
export interface CreatureContextForDamage { // For DiceRoller.rollSpecificDamage bonusFormula
    abilityScores: CreatureAbilityScores; // Effective scores
    proficiencyBonus: number;
    classLevels?: ClassLevelEntry[];
    characterLevel?: number;
    // Add other relevant stats as needed
}

// For AttackResolutionEngine
export interface ParsedAttackAction { // Represents a defined attack (from weapon, spell, feature)
    sourceDefinitionId: string; // e.g., "LONGSWORD" (Item ID), "FIRE_BOLT" (Spell ID), "GOBLIN_SCIMITAR_ATTACK" (Feature-like ID from CreatureAction)
    actionName?: string; // e.g. "Scimitar", "Javelin" from CreatureAction
    associatedAbilityID_Ref?: string; // STR for melee, DEX for finesse/ranged, Spellcasting Ability for spells
    attackBonusFormula?: string; // e.g. "ABILITY_MODIFIER:STR + PROFICIENCY_BONUS"
    fixedAttackBonus?: number;
    range?: RangeValue;
    // Potentially other properties like if it's a spell attack, weapon properties etc.
}
export interface SituationalAttackModifiers {
    advantageSources?: string[]; // Descriptions of why advantage applies
    disadvantageSources?: string[]; // Descriptions of why disadvantage applies
    flatBonus?: number;
    ignoreCoverLevels?: number;
    grantAdvantage?: boolean; // Overrides sources
    grantDisadvantage?: boolean; // Overrides sources
}

// For SavingThrowResolutionEngine
export interface SituationalSaveModifiers {
    advantageSources?: string[];
    disadvantageSources?: string[];
    flatBonus?: number;
    grantAdvantage?: boolean;
    grantDisadvantage?: boolean;
}

// For SkillCheckResolutionEngine
export interface SituationalSkillCheckModifiers {
    advantageSources?: string[];
    disadvantageSources?: string[];
    flatBonus?: number;
    grantAdvantage?: boolean;
    grantDisadvantage?: boolean;
}

// For DamageApplicationEngine
export interface AppliedDamageInstance {
    rawAmount: number; // Damage after dice rolls and source-side bonuses (like crit doubling, +STR mod), but BEFORE target defenses
    damageTypeID_Ref: string;
    isMagicalSource?: boolean; // If the damage source is magical (for overcoming resistances)
    bypassesResistanceTypes_Ref_List?: string[]; // Specific damage types this instance bypasses for resistance
    bypassesImmunityTypes_Ref_List?: string[]; // Specific damage types this instance bypasses for immunity
    sourceEffectID_Ref?: string; // Effect that caused this damage
}

// For EffectExecutionEngine
export interface EffectExecutionContext {
    spellSlotLevel?: number; // If effect comes from a spell
    userChoices?: { [choiceKey: string]: any }; // For effects requiring choices (e.g. choose targets for Sculpt Spells)
    currentRound?: number;
    currentTurnCreatureID?: string;
    attackRollResult?: AttackResult; // Context from an attack
    saveRollResult?: { outcome: string; roll: number }; // Context from a save
    rolledValue?: number; // Generic rolled value for some effects
    sourceDefinitionId?: string; // Added to carry sourceId into context
}

// For SpellcastingEngine
export interface TargetInfo {
    creatureIDs?: string[];
    point?: {x: number, y: number, z: number}; // For area effects
    selfTarget?: boolean;
}
export interface SpellCastOptions {
    metamagicUsed?: string[]; // IDs of metamagic options
    materialComponentOverride?: boolean; // e.g. if a focus is used or component is ignored
    verbalComponentOverride?: boolean;
    somaticComponentOverride?: boolean;
    skipResourceCost?: boolean; // For free castings
}

// For TurnAndRoundManager (CombatTracker)
export interface ActionChoice {
    actorId: string;
    actionType: 'ATTACK' | 'SPELL' | 'ABILITY' | 'ITEM' | 'MOVE' | 'DODGE' | 'DISENGAGE' | 'HIDE' | 'HELP' | 'READY' | 'OTHER' | 'PASS_TURN';
    actionName?: string; // "Attack with Longsword", "Cast Fireball", or specific CreatureAction.actionName
    targetInfo?: TargetInfo;
    // specific params for action type
    spellID_Ref?: string;
    spellSlotLevel?: number;
    featureID_Ref?: string; // For activating a specific feature
    itemID_Ref?: string; // For using an item or attacking with an item
    destination?: {x:number, y:number}; // for MOVE
    // distance?: number; // for MOVE
}

export interface CombatStateSnapshot {
    roundNumber: number;
    currentTurnCreatureId: string | null;
    initiativeOrder: { creatureId: string, initiativeRoll: number }[];
    combatants: CreatureRuntimeState[];
    log: GameEventBase[];
}

// For AC_CalculationEngine
export interface ACContext {
    forAttackContext?: boolean; // Is this AC calc for a specific incoming attack?
    attackingCreatureId?: string;
    attackIsMelee?: boolean;
    attackIsSpell?: boolean;
    // other context that might affect AC temporarily (e.g. Shield spell)
}

// Represents a resource definition, if we want to model them more deeply than just an ID
export interface ResourceDefinition {
    resourceID: string;
    fullName: string;
    description?: string;
    rechargeOn_Ref_List?: string[]; // SHORT_REST, LONG_REST, DAWN, etc.
    maxFormula?: string; // e.g. "CLASS_LEVEL:WIZARD", "WIS_MOD" (if max can vary)
    maxStatic?: number;
}

// I. Formula Parser Types
export interface FormulaContext {
  actor: CreatureRuntimeState;
  target?: CreatureRuntimeState;
  spell?: SpellDefinition; 
  item?: ItemDefinition;   
  feature?: FeatureDefinition; 
  activeEffect?: ActiveParsedEffect; 
  executionContext?: EffectExecutionContext; 
  sourceDefinition?: SpellDefinition | ItemDefinition | FeatureDefinition | ConditionDefinition; // Added for more context
}