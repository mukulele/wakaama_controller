import { validateMandatoryResources } from './helpers';

/**
 * Pre-computed mandatory resource information extracted from LwM2M XML specifications
 * Generated at startup to optimize validation performance
 */
export interface MandatoryResourceInfo {
  objectId: string;
  objectName: string;
  mandatoryResources: string[]; // Array of resource IDs that are mandatory
  lastUpdated: string; // ISO timestamp when this was generated
}

/**
 * Cache structure for mandatory resources by object ID
 */
export interface MandatoryResourcesCache {
  version: string;
  generatedAt: string;
  objects: { [objectId: string]: MandatoryResourceInfo };
}

/**
 * Extract mandatory resource information from all LwM2M XML specifications
 * and save to mandatory-resources.json for fast access
 */
export function generateMandatoryResourcesCache(): MandatoryResourcesCache {
  const fs = require('fs');
  const path = require('path');
  
  const configDir = path.resolve(__dirname, '../config');
  const cache: MandatoryResourcesCache = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    objects: {}
  };

  console.log('🔍 Scanning for LwM2M object specifications...');

  try {
    // Find all lwm2m-object-*.xml files
    const xmlFiles = fs.readdirSync(configDir)
      .filter((file: string) => file.match(/^lwm2m-object-\d+\.xml$/))
      .sort();

    console.log(`📁 Found ${xmlFiles.length} LwM2M object specifications`);

    for (const xmlFile of xmlFiles) {
      const objectIdMatch = xmlFile.match(/lwm2m-object-(\d+)\.xml$/);
      if (!objectIdMatch) continue;

      const objectId = objectIdMatch[1];
      const xmlPath = path.join(configDir, xmlFile);

      try {
        const xmlContent = fs.readFileSync(xmlPath, 'utf8');
        
        // Extract object name
        const objectNameMatch = xmlContent.match(/<Name>([^<]+)<\/Name>/);
        const objectName = objectNameMatch ? objectNameMatch[1] : `Object ${objectId}`;

        // Extract mandatory resources
        const mandatoryResources: string[] = [];
        const resourceMatches = xmlContent.match(/<Item ID="([^"]+)"[\s\S]*?<\/Item>/g);
        
        if (resourceMatches) {
          resourceMatches.forEach((resourceXml: string) => {
            const idMatch = resourceXml.match(/<Item ID="([^"]+)"/);
            const mandatoryMatch = resourceXml.match(/<Mandatory>([^<]+)<\/Mandatory>/);
            
            if (idMatch && mandatoryMatch && mandatoryMatch[1].toLowerCase() === 'mandatory') {
              mandatoryResources.push(idMatch[1]);
            }
          });
        }

        cache.objects[objectId] = {
          objectId,
          objectName,
          mandatoryResources,
          lastUpdated: new Date().toISOString()
        };

        const resourceCount = mandatoryResources.length;
        if (resourceCount > 0) {
          console.log(`✅ Object ${objectId} (${objectName}): ${resourceCount} mandatory resources [${mandatoryResources.join(', ')}]`);
        } else {
          console.log(`📝 Object ${objectId} (${objectName}): No mandatory resources`);
        }

      } catch (error) {
        console.error(`❌ Error parsing ${xmlFile}:`, error);
      }
    }

    // Save cache to file
    const cacheFilePath = path.join(configDir, 'mandatory-resources.json');
    fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));
    console.log(`💾 Saved mandatory resources cache to ${cacheFilePath}`);

    return cache;

  } catch (error) {
    console.error('❌ Error generating mandatory resources cache:', error);
    return cache;
  }
}

/**
 * Load mandatory resources cache from file or generate if missing
 */
export function loadMandatoryResourcesCache(): MandatoryResourcesCache {
  const fs = require('fs');
  const path = require('path');
  
  const cacheFilePath = path.resolve(__dirname, '../config/mandatory-resources.json');
  
  try {
    if (fs.existsSync(cacheFilePath)) {
      const cacheContent = fs.readFileSync(cacheFilePath, 'utf8');
      const cache = JSON.parse(cacheContent) as MandatoryResourcesCache;
      console.log(`📋 Loaded mandatory resources cache (${Object.keys(cache.objects).length} objects)`);
      return cache;
    }
  } catch (error) {
    console.warn('⚠️ Error loading mandatory resources cache, regenerating:', error);
  }

  // Generate new cache if file doesn't exist or failed to load
  console.log('🔄 Generating new mandatory resources cache...');
  return generateMandatoryResourcesCache();
}

/**
 * In-memory cache for fast access
 */
let mandatoryResourcesCache: MandatoryResourcesCache | null = null;

/**
 * Initialize the mandatory resources cache at startup
 */
export function initializeMandatoryResourcesCache(): void {
  console.log('🚀 Initializing mandatory resources cache...');
  mandatoryResourcesCache = loadMandatoryResourcesCache();
  console.log('✅ Mandatory resources cache ready');
}

/**
 * Fast validation using pre-computed mandatory resources
 * @param objectId The LwM2M object ID
 * @param providedResources Object containing the resource values being sent
 * @returns Validation result with missing mandatory resources
 */
export function validateMandatoryResourcesFast(
  objectId: number, 
  providedResources: { [resourceId: string]: any }
): { valid: boolean; missingMandatory: string[]; objectName: string } {
  
  if (!mandatoryResourcesCache) {
    console.warn('⚠️ Mandatory resources cache not initialized - falling back to XML parsing');
    return validateMandatoryResources(objectId, providedResources);
  }

  const objectInfo = mandatoryResourcesCache.objects[objectId.toString()];
  
  if (!objectInfo) {
    // If we don't have the spec, allow the operation but warn
    console.warn(`⚠️ No specification found for Object ${objectId} - skipping mandatory validation`);
    return { valid: true, missingMandatory: [], objectName: `Object ${objectId}` };
  }

  const missingMandatory: string[] = [];
  
  // Check each mandatory resource
  objectInfo.mandatoryResources.forEach(resourceId => {
    if (!providedResources.hasOwnProperty(resourceId)) {
      missingMandatory.push(`Resource ${resourceId}`);
    }
  });

  return {
    valid: missingMandatory.length === 0,
    missingMandatory,
    objectName: objectInfo.objectName
  };
}