
// src/services/dataService.ts
import { MasterIndex, DataCache } from '../../../types'; // Adjusted path

const MASTER_INDEX_PATH = '/database/master_index.json';
let masterIndex: MasterIndex | null = null;
const cache: DataCache = {};
const fetchingPromises: Map<string, Promise<any>> = new Map(); // Stores promises of fetches in progress

async function populateCacheAndMasterIndex(): Promise<void> {
  if (masterIndex) return;
  console.log('Populating master index...');
  try {
    const response = await fetch(MASTER_INDEX_PATH);
    if (!response.ok) {
      throw new Error(`Failed to fetch master index: ${response.statusText}`);
    }
    masterIndex = await response.json();
    console.log('Master index populated.');
  } catch (error) {
    console.error('Error initializing master index:', error);
    masterIndex = null; // Ensure it's null on error
    throw error;
  }
}

export async function initializeDataService(): Promise<void> {
  if (!masterIndex) {
    await populateCacheAndMasterIndex();
  }
}

async function resolveReferences(item: any, serviceHost: { getItemById: (id: string) => Promise<any> }): Promise<any> {
  if (typeof item !== 'object' || item === null) {
    return item;
  }

  if (Array.isArray(item)) {
    return Promise.all(item.map(element => resolveReferences(element, serviceHost)));
  }

  const resolvedItem: any = { ...item }; // Shallow copy

  for (const key in resolvedItem) {
    if (Object.prototype.hasOwnProperty.call(resolvedItem, key)) {
      const value = resolvedItem[key];
      if (key.endsWith('_Ref') && typeof value === 'string') {
        const baseKey = key.substring(0, key.length - 4); // Remove _Ref suffix
        // console.log(`Resolving single ref: ${key} -> ${value}`);
        try {
          resolvedItem[baseKey] = await serviceHost.getItemById(value);
        } catch (error) {
          console.warn(`Could not resolve reference for ${key}: ID "${value}"`, error);
          resolvedItem[baseKey] = null; 
        }
      } else if (key.endsWith('_Ref_List') && Array.isArray(value)) {
        const baseKey = key.substring(0, key.length - 9); // Remove _Ref_List suffix
        // console.log(`Resolving list ref: ${key} -> ${value.join(', ')}`);
         try {
          resolvedItem[baseKey] = await Promise.all(
            value.map(async (refId: any) => {
              if (typeof refId === 'string') {
                return serviceHost.getItemById(refId);
              }
              console.warn(`Invalid refId in ${key}: ${refId}`);
              return Promise.resolve(null); 
            })
          );
        } catch (error) {
          console.warn(`Could not resolve references for ${key}: IDs "${value.join(', ')}"`, error);
          resolvedItem[baseKey] = value.map(() => null); // Maintain array structure with nulls for failed refs
        }
      } else if (typeof value === 'object' && value !== null) { // Check for nested objects/arrays that are not direct refs
        resolvedItem[key] = await resolveReferences(value, serviceHost);
      }
    }
  }
  return resolvedItem;
}

export async function getItemById(id: string): Promise<any> {
  if (!masterIndex) {
    await initializeDataService(); // Ensures masterIndex is loaded
    if (!masterIndex) { // Check again after attempt
       console.error('Master index failed to load after initializeDataService call.');
       throw new Error('Master index failed to load.');
    }
  }

  if (cache[id]) {
    // console.log(`Cache hit for ID: ${id}`);
    return cache[id];
  }

  if (fetchingPromises.has(id)) {
    // console.log(`Fetch in progress for ID: ${id}. Returning existing promise.`);
    return fetchingPromises.get(id);
  }

  const path = masterIndex[id];
  if (!path) {
    console.error(`ID "${id}" not found in master index.`);
    throw new Error(`ID "${id}" not found in master index.`);
  }

  // console.log(`Fetching ID: ${id} from path: ${path}`);
  const fetchPromise = (async () => {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to fetch data for ID "${id}" from "${path}": ${response.statusText} (${response.status})`);
      }
      const rawData = await response.json();
      // console.log(`Raw data fetched for ID: ${id}`, rawData);
      
      const resolvedData = await resolveReferences(rawData, { getItemById });
      cache[id] = resolvedData;
      // console.log(`Resolved data cached for ID: ${id}`, resolvedData);
      return resolvedData;
    } catch (error) {
      console.error(`Error fetching or resolving ID "${id}":`, error);
      // Do not cache errored items, or cache an error marker if preferred
      delete cache[id]; 
      throw error; // Re-throw to be caught by the caller
    } finally {
      fetchingPromises.delete(id); // Remove promise once it's settled (resolved or rejected)
      // console.log(`Promise for ID: ${id} removed from fetchingPromises.`);
    }
  })();

  fetchingPromises.set(id, fetchPromise);
  return fetchPromise;
}

export async function getItemsByPathPrefix(pathPrefix: string): Promise<any[]> {
  if (!masterIndex) {
    await initializeDataService();
     if (!masterIndex) {
       throw new Error('Master index failed to load.');
    }
  }
  const itemIDs = Object.keys(masterIndex).filter(id => {
    const itemPath = masterIndex![id];
    return itemPath && itemPath.startsWith(pathPrefix);
  });
  
  // console.log(`Found ${itemIDs.length} items with path prefix ${pathPrefix}:`, itemIDs);
  return Promise.all(itemIDs.map(id => getItemById(id).catch(e => {
      console.warn(`Failed to load item ${id} for path prefix ${pathPrefix}:`, e);
      return null; // Return null for failed items to not break Promise.all
  }))).then(results => results.filter(item => item !== null)); // Filter out nulls
}


export function getMasterIndexKeys(): string[] {
    if (!masterIndex) {
        console.warn("Master index not yet loaded. Returning empty array.");
        // Attempt to load it synchronously if called early, though async is preferred for init.
        // This is a fallback, ideally initializeDataService is called at app start.
        // For simplicity here, we rely on prior initialization.
        return [];
    }
    return Object.keys(masterIndex);
}

export function getPathForId(id: string): string | undefined {
    if (!masterIndex) {
        console.warn("Master index not yet loaded when calling getPathForId.");
        return undefined;
    }
    return masterIndex[id];
}
