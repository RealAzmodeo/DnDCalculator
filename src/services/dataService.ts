
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

// Recursively resolves references within an item.
// References are identified by keys ending in '_Ref' (for single references)
// or '_Ref_List' (for lists of references).
async function resolveReferences(item: any, serviceHost: { getItemById: (id: string) => Promise<any> }): Promise<any> {
  // If the item is not an object or is null, it cannot contain references, so return it as is.
  if (typeof item !== 'object' || item === null) {
    return item;
  }

  // If the item is an array, iterate over its elements and resolve references for each element.
  if (Array.isArray(item)) {
    return Promise.all(item.map(element => resolveReferences(element, serviceHost)));
  }

  const resolvedItem: any = { ...item }; // Shallow copy to avoid modifying the original item.

  // Iterate over the keys of the item.
  for (const key in resolvedItem) {
    if (Object.prototype.hasOwnProperty.call(resolvedItem, key)) {
      const value = resolvedItem[key];

      // Handle single references: if key ends with '_Ref' and value is a string (the ID).
      if (key.endsWith('_Ref') && typeof value === 'string') {
        const baseKey = key.substring(0, key.length - 4); // Remove _Ref suffix to get the actual key name.
        // console.log(`Resolving single ref: ${key} -> ${value}`);
        try {
          // Fetch the referenced item and replace the reference with the actual item.
          resolvedItem[baseKey] = await serviceHost.getItemById(value);
        } catch (error) {
          console.warn(`Could not resolve reference for ${key}: ID "${value}"`, error);
          // If resolution fails, set the baseKey to null to indicate the missing reference.
          resolvedItem[baseKey] = null; 
        }
      // Handle list references: if key ends with '_Ref_List' and value is an array of strings (IDs).
      } else if (key.endsWith('_Ref_List') && Array.isArray(value)) {
        const baseKey = key.substring(0, key.length - 9); // Remove _Ref_List suffix.
        // console.log(`Resolving list ref: ${key} -> ${value.join(', ')}`);
         try {
          // Fetch all referenced items in the list.
          resolvedItem[baseKey] = await Promise.all(
            value.map(async (refId: any) => {
              if (typeof refId === 'string') {
                return serviceHost.getItemById(refId);
              }
              console.warn(`Invalid refId in ${key}: ${refId}`);
              // If a refId is not a string, resolve it as null.
              return Promise.resolve(null); 
            })
          );
        } catch (error) {
          console.warn(`Could not resolve references for ${key}: IDs "${value.join(', ')}"`, error);
          // If any list resolution fails, maintain the array structure with nulls for failed references.
          resolvedItem[baseKey] = value.map(() => null); // Maintain array structure with nulls for failed refs
        }
      // Recursively call resolveReferences for nested objects that are not direct references themselves.
      } else if (typeof value === 'object' && value !== null) { // Check for nested objects/arrays that are not direct refs
        resolvedItem[key] = await resolveReferences(value, serviceHost);
      }
    }
  }

  return resolvedItem;
}

// Retrieves an item by its ID.
// It uses a cache (`cache`) to store previously fetched and resolved items.
// It also uses `fetchingPromises` to prevent redundant fetches for the same ID if a fetch is already in progress.
export async function getItemById(id: string): Promise<any> {
  // Ensure the master index is loaded. This is crucial for finding the path to the item's data file.
  if (!masterIndex) {
    await initializeDataService(); // Ensures masterIndex is loaded
    if (!masterIndex) { // Check again after the initialization attempt
       console.error('Master index failed to load after initializeDataService call.');
       throw new Error('Master index failed to load.'); // Critical error if master index isn't available.
    }
  }

  // Cache check: If the item is already in the cache, return it directly.
  if (cache[id]) {
    // console.log(`Cache hit for ID: ${id}`);
    return cache[id];
  }

  // In-flight fetch check: If a fetch for this ID is already in progress,
  // return the existing promise to avoid redundant network requests.
  if (fetchingPromises.has(id)) {
    // console.log(`Fetch in progress for ID: ${id}. Returning existing promise.`);
    return fetchingPromises.get(id);
  }

  // Retrieve the path to the item's data file from the master index.
  const path = masterIndex[id];
  if (!path) {
    // Error handling: If the ID is not found in the master index, it's an invalid ID.
    console.error(`ID "${id}" not found in master index.`);
    throw new Error(`ID "${id}" not found in master index.`);
  }

  // console.log(`Fetching ID: ${id} from path: ${path}`);
  // Create a new promise for fetching and processing the item.
  // This promise is stored in `fetchingPromises` to handle concurrent requests for the same ID.
  const fetchPromise = (async () => {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        // Error handling: If the fetch request fails (e.g., network error, file not found).
        throw new Error(`Failed to fetch data for ID "${id}" from "${path}": ${response.statusText} (${response.status})`);
      }
      const rawData = await response.json();
      // console.log(`Raw data fetched for ID: ${id}`, rawData);
      
      // After fetching the raw data, resolve any references within it.
      const resolvedData = await resolveReferences(rawData, { getItemById });
      // Cache the resolved data for future requests.
      cache[id] = resolvedData;
      // console.log(`Resolved data cached for ID: ${id}`, resolvedData);
      return resolvedData;
    } catch (error) {
      console.error(`Error fetching or resolving ID "${id}":`, error);
      // Error handling: If any error occurs during fetch or resolution,
      // ensure the item is not added to the cache (or an error marker could be cached).
      delete cache[id]; 
      throw error; // Re-throw the error to be handled by the caller.
    } finally {
      // Clean up: Remove the promise from `fetchingPromises` once it has settled (either resolved or rejected).
      fetchingPromises.delete(id);
      // console.log(`Promise for ID: ${id} removed from fetchingPromises.`);
    }
  })();

  // Store the promise in the map and return it.
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

/*
Future Enhancements:
- More sophisticated error reporting: Instead of just console.error, errors could be sent to a monitoring service.
  This would help in proactively identifying and diagnosing issues in a production environment.
- Advanced caching strategies:
    - LRU (Least Recently Used): To automatically evict less frequently accessed items when the cache size exceeds a limit.
    - TTL (Time To Live): To expire cached items after a certain period, ensuring data freshness.
- Detection of circular dependencies in `resolveReferences`: The current implementation might loop indefinitely if there are
  circular references (e.g., item A refers to item B, and item B refers back to item A). A mechanism to detect and
  handle such scenarios would make the service more robust. This could involve tracking the path of resolved IDs
  and breaking the loop if a circular reference is detected.
- Batching requests in `resolveReferences` for `_Ref_List`: If a `_Ref_List` contains many items, resolving them one by one
  (even with `Promise.all`) might lead to many concurrent `getItemById` calls. A batching mechanism could group these
  and potentially fetch multiple items in a more optimized way if the backend supports it.
- More granular cache invalidation: Currently, cache entries are deleted on error or live indefinitely. Mechanisms for
  invalidating specific cache entries when underlying data changes would be beneficial.
*/
