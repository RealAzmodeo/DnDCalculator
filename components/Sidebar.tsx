// THIS COMPONENT IS NO LONGER USED BY APP.TSX AND IS DEPRECATED.
// IT IS REPLACED BY CombatSimulator.tsx
// It can be removed in a future cleanup.

import React, { useState, useEffect } from 'react';
import { getMasterIndexKeys, getPathForId, getItemById } from '../src/services/dataService';

// Define categories based on the directory structure
const DATA_CATEGORIES = [
  { id: 'foundational_definitions', name: 'Foundational Definitions', subPath: 'foundational_definitions' },
  { id: 'items', name: 'Items', subPath: 'items' },
  { id: 'spells', name: 'Spells', subPath: 'spells' },
  { id: 'feats', name: 'Feats', subPath: 'feats' },
  { id: 'features', name: 'Features', subPath: 'features' },
  { id: 'species', name: 'Species', subPath: 'species' },
  { id: 'backgrounds', name: 'Backgrounds', subPath: 'backgrounds' },
  { id: 'classes', name: 'Classes', subPath: 'classes' },
  { id: 'subclasses', name: 'Subclasses', subPath: 'subclasses' },
  { id: 'creature_templates', name: 'Creature Templates', subPath: 'creature_templates' },
];

interface SidebarProps {
  onSelectCategory: (category: string | null) => void;
  selectedCategory: string | null;
  onSelectItem: (itemId: string | null) => void;
  selectedItemId: string | null;
  toggleSidebar: () => void;
}

const SidebarCategoryItem: React.FC<{
  label: string;
  categoryId: string;
  isSelected: boolean;
  onSelect: () => void;
  itemCount: number;
}> = ({ label, categoryId, isSelected, onSelect, itemCount }) => {
  return (
    <button
      onClick={onSelect}
      className={`
        w-full text-left px-4 py-3 rounded-md text-sm font-medium transition-colors duration-150 ease-in-out
        focus:outline-none focus:ring-2 focus:ring-indigo-500
        flex justify-between items-center
        ${isSelected 
          ? 'bg-indigo-600 text-white shadow-lg' 
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
        }
      `}
      aria-expanded={isSelected}
    >
      <span>{label}</span>
      <span className={`text-xs px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-indigo-400 text-white' : 'bg-gray-200 dark:bg-gray-600'}`}>{itemCount}</span>
    </button>
  );
};

const SidebarConcreteItem: React.FC<{
  label: string;
  itemId: string;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ label, itemId, isSelected, onSelect }) => {
   return (
    <button
      onClick={onSelect}
      className={`
        w-full text-left pl-8 pr-4 py-2 rounded-md text-xs font-medium transition-colors duration-150 ease-in-out
        focus:outline-none focus:ring-1 focus:ring-indigo-400
        ${isSelected 
          ? 'bg-indigo-500 text-white' 
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
        }
      `}
    >
      {label}
    </button>
  );
};


export const Sidebar: React.FC<SidebarProps> = ({ 
  onSelectCategory, 
  selectedCategory, 
  onSelectItem,
  selectedItemId,
  toggleSidebar 
}) => {
  const [itemLists, setItemLists] = useState<Record<string, {id: string, name: string}[]>>({});
  const [loadingError, setLoadingError] = useState<string | null>(null);

  useEffect(() => {
    const allMasterKeys = getMasterIndexKeys();
    if (!allMasterKeys || allMasterKeys.length === 0) {
        // Master index might not be loaded yet, dataService will handle loading it on first getItemById or getPathForId call.
        // For now, we assume it gets populated. If this is an issue, App.tsx needs to ensure service is fully ready.
        console.warn("Sidebar: Master index keys not available yet.");
    }

    const categorizedLists: Record<string, {id: string, name: string}[]> = {};
    DATA_CATEGORIES.forEach(cat => {
      categorizedLists[cat.id] = allMasterKeys
        .filter(key => {
            const path = getPathForId(key);
            return path && path.includes(`/${cat.subPath}/`);
        })
        .map(key => ({ id: key, name: key })); // Initially use ID as name, could fetch actual name later if needed
    });
    setItemLists(categorizedLists);

  }, []); // Run once on mount

  // Simple loading of item names (fullName) if a category is selected
  useEffect(() => {
    if (selectedCategory && itemLists[selectedCategory]) {
      const itemsToFetchNames = itemLists[selectedCategory].filter(item => item.name === item.id); // Only fetch if name is still ID
      if (itemsToFetchNames.length > 0) {
        Promise.all(itemsToFetchNames.map(item => getItemById(item.id)))
          .then(loadedItemsData => {
            setItemLists(prevLists => {
              // Ensure selectedCategory is valid and exists in prevLists
              if (!selectedCategory || !prevLists[selectedCategory]) {
                return prevLists;
              }

              // Create a map of ID to new fullName for efficient lookup
              const idToFullNameMap = new Map<string, string>();
              loadedItemsData.forEach((loadedItem, index) => {
                // itemsToFetchNames[index].id is the ID of the item that loadedItem corresponds to
                const originalItemId = itemsToFetchNames[index].id;
                if (loadedItem && loadedItem.fullName) {
                  idToFullNameMap.set(originalItemId, loadedItem.fullName);
                }
              });

              // Update the specific category's list
              const updatedCategoryItems = prevLists[selectedCategory].map(item => {
                if (idToFullNameMap.has(item.id)) {
                  return { ...item, name: idToFullNameMap.get(item.id)! };
                }
                return item;
              });

              return {
                ...prevLists,
                [selectedCategory]: updatedCategoryItems,
              };
            });
          })
          .catch(err => {
            console.error(`Error fetching item names for sidebar category "${selectedCategory}":`, err);
            setLoadingError(`Failed to load items for ${selectedCategory}.`);
          });
      }
    }
  }, [selectedCategory, itemLists]); // itemLists is a dependency here, re-evaluate if this causes loops (should be fine with proper state updates)


  return (
    <div className="w-64 md:w-72 bg-white dark:bg-gray-800 shadow-lg h-full flex flex-col p-4 space-y-1 overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-indigo-700 dark:text-indigo-400">Data Explorer</h1>
        <button onClick={toggleSidebar} className="md:hidden p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {loadingError && <div className="text-red-500 p-2 text-sm">{loadingError}</div>}

      {DATA_CATEGORIES.map((category) => (
        <div key={category.id}>
          <SidebarCategoryItem
            label={category.name}
            categoryId={category.id}
            isSelected={selectedCategory === category.id}
            onSelect={() => onSelectCategory(selectedCategory === category.id ? null : category.id)}
            itemCount={(itemLists[category.id] || []).length}
          />
          {selectedCategory === category.id && (itemLists[category.id] || []).length > 0 && (
            <div className="py-1 space-y-1 mt-1 max-h-60 overflow-y-auto border-l-2 border-indigo-200 dark:border-indigo-700 ml-2">
              {(itemLists[category.id]).sort((a,b) => a.name.localeCompare(b.name)).map((item) => (
                <SidebarConcreteItem
                  key={item.id}
                  label={item.name || item.id}
                  itemId={item.id}
                  isSelected={selectedItemId === item.id}
                  onSelect={() => onSelectItem(item.id)}
                />
              ))}
            </div>
          )}
           {selectedCategory === category.id && (itemLists[category.id] || []).length === 0 && (
            <p className="pl-8 pr-4 py-2 text-xs text-gray-500 dark:text-gray-400">No items found.</p>
           )}
        </div>
      ))}
       <div className="mt-auto pt-4 text-center text-xs text-gray-500 dark:text-gray-400">
        D&D 2024 Modeler v2.0
      </div>
    </div>
  );
};
