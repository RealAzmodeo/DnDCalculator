// THIS COMPONENT IS NO LONGER USED BY APP.TSX AND IS DEPRECATED.
// IT IS REPLACED BY CombatSimulator.tsx
// It can be removed in a future cleanup.

import React, { useState, useEffect } from 'react';
import { ObjectViewer } from './ObjectViewer';
import { getItemById } from '../src/services/dataService';
import { AttackCalculator } from './calculator/AttackCalculator'; // Keep for now

interface SectionDisplayProps {
  selectedItemType: string | null; // e.g., "spells", "items"
  selectedItemId: string | null; // e.g., "FIREBALL"
}

const DataCard: React.FC<{title?: string, children: React.ReactNode, className?: string}> = ({ title, children, className }) => (
  <div className={`bg-white dark:bg-gray-800 shadow-xl rounded-lg p-6 mb-8 transform transition-all hover:scale-[1.01] ${className}`}>
    {title && <h3 className="text-xl font-semibold mb-3 text-indigo-600 dark:text-indigo-400">{title}</h3>}
    {children}
  </div>
);

export const SectionDisplay: React.FC<SectionDisplayProps> = ({ selectedItemType, selectedItemId }) => {
  const [itemData, setItemData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedItemId) {
      setIsLoading(true);
      setError(null);
      setItemData(null);
      getItemById(selectedItemId)
        .then(data => {
          setItemData(data);
          setIsLoading(false);
        })
        .catch(err => {
          console.error(`Error fetching item ${selectedItemId}:`, err);
          setError(`Failed to load data for ${selectedItemId}. ${err.message}`);
          setIsLoading(false);
        });
    } else {
      setItemData(null);
      setError(null);
      setIsLoading(false);
    }
  }, [selectedItemId]);

  if (isLoading) {
    return (
      <div className="flex-grow p-8 text-center">
        <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">Loading item: {selectedItemId}...</h2>
        <div className="mt-4 animate-pulse">
          <div className="h-8 bg-gray-300 dark:bg-gray-700 rounded w-3/4 mx-auto mb-4"></div>
          <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/2 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-grow p-8 text-center">
        <h2 className="text-2xl font-semibold text-red-600 dark:text-red-400">Error</h2>
        <p className="mt-4 text-gray-600 dark:text-gray-400">{error}</p>
      </div>
    );
  }

  if (selectedItemId && itemData) {
    // Special handling for attack calculator if its ID is 'attackCalculator' or similar
    // For now, this assumes 'attackCalculator' is a unique ID handled differently.
    // This needs to align with how 'attackCalculator' is represented in master_index.json
    if (selectedItemType === 'utility' && selectedItemId === 'ATTACK_CALCULATOR') { // Example ID for calculator
        return (
             <div className="flex-grow p-6 md:p-8 overflow-y-auto h-full">
                <h2 className="text-3xl md:text-4xl font-bold mb-6 md:mb-8 text-gray-800 dark:text-gray-100 border-b-2 border-indigo-500 pb-2">
                    {itemData.title || "Attack Calculator"}
                </h2>
                {itemData.description && (
                <p className="mb-6 text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">{itemData.description}</p>
                )}
                <AttackCalculator />
            </div>
        );
    }

    return (
      <div className="flex-grow p-6 md:p-8 overflow-y-auto h-full">
        <h2 className="text-3xl md:text-4xl font-bold mb-6 md:mb-8 text-gray-800 dark:text-gray-100 border-b-2 border-indigo-500 pb-2">
          {itemData.fullName || itemData.name || selectedItemId}
        </h2>
        {itemData.description && typeof itemData.description === 'string' && (
           <DataCard title="Description" className="prose dark:prose-invert max-w-none">
             <p className="whitespace-pre-line leading-relaxed">{itemData.description}</p>
           </DataCard>
        )}
        <DataCard title="Raw Data">
          <ObjectViewer data={itemData} initialIndent />
        </DataCard>
      </div>
    );
  }
  
  if (selectedItemType) {
    return (
      <div className="flex-grow p-8 text-center">
        <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">
          Selected Category: {selectedItemType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
        </h2>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Select an item from the sidebar to view its details.</p>
      </div>
    );
  }

  return (
    <div className="flex-grow p-8 text-center">
      <h2 className="text-3xl font-bold text-gray-700 dark:text-gray-300">Welcome to the D&D 2024 Modular Data Explorer</h2>
      <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">Select a category and then an item from the sidebar to view its data.</p>
       <div className="mt-8 p-6 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg">
        <h3 className="text-xl font-semibold text-yellow-700 dark:text-yellow-300">Note on Data Loading</h3>
        <p className="mt-2 text-sm text-yellow-600 dark:text-yellow-400">
          This application now loads data on demand. The sidebar lists categories. Clicking a category will show its items.
          Selecting an item fetches its specific data file and resolves its references to other data files.
          For example, viewing the "Fireball" spell will also load data for "Evocation" (its school of magic), "Sphere" (its area of effect shape), and "D6" (its damage die).
        </p>
      </div>
    </div>
  );
};
