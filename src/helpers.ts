/**
 * Helper functions for advanced data conversions and encodings
 * Implements specialized conversion functions that are too complex for simple formulas
 */

export interface VelocityData {
  speedOverGround?: number;  // m/s
  courseOverGround?: number; // radians
  verticalSpeed?: number;    // m/s (positive = up, negative = down)
}

export interface GADVelocity {
  horizontalSpeed: number;    // km/h (0-2047)
  bearing: number;           // degrees (0-359) 
  verticalSpeed: number;     // km/h (0-255)
  verticalDirection: boolean; // true = up, false = down
  horizontalUncertainty: number; // km/h (0-255)
  verticalUncertainty: number;   // km/h (0-255)
}

/**
 * Converts Signal K velocity data to 3GPP TS 23.032 GAD velocity format
 * According to 3GPP TS 23.032 Universal Geographical Area Description
 * 
 * @param velocityData Signal K velocity information
 * @returns GAD velocity structure compliant with 3GPP TS 23.032
 */
export function encode3GPPVelocity(velocityData: VelocityData): GADVelocity {
  // Convert horizontal speed from m/s to km/h and clamp to valid range
  const horizontalSpeedKmh = (velocityData.speedOverGround || 0) * 3.6;
  const horizontalSpeed = Math.min(Math.max(Math.round(horizontalSpeedKmh), 0), 2047);
  
  // Convert bearing from radians to degrees and normalize to 0-359
  let bearing = 0; // Default to 0 (unknown) when no course data
  if (velocityData.courseOverGround !== undefined && velocityData.courseOverGround !== null) {
    bearing = (velocityData.courseOverGround * 180 / Math.PI) % 360;
    if (bearing < 0) bearing += 360;
  }
  
  // Convert vertical speed from m/s to km/h and handle direction
  // For marine applications, vertical speed is always 0
  const verticalSpeedMs = velocityData.verticalSpeed || 0;
  const verticalSpeedKmh = Math.abs(verticalSpeedMs) * 3.6;
  const verticalSpeed = Math.min(Math.max(Math.round(verticalSpeedKmh), 0), 255);
  const verticalDirection = true; // Default to up when no vertical movement
  
  // Set default uncertainty values (can be made configurable)
  const horizontalUncertainty = 0; // 0 = unknown/not available
  const verticalUncertainty = 0;   // 0 = unknown/not available
  
  return {
    horizontalSpeed,
    bearing: Math.round(bearing),
    verticalSpeed,
    verticalDirection,
    horizontalUncertainty,
    verticalUncertainty
  };
}

/**
 * Encodes GAD velocity into binary format according to 3GPP TS 23.032
 * This creates the actual binary representation used in mobile networks
 * 
 * @param gadVelocity GAD velocity structure
 * @returns Buffer containing the binary encoded velocity
 */
export function encodeGADVelocityBinary(gadVelocity: GADVelocity): Buffer {
  // 3GPP TS 23.032 velocity encoding:
  // - Horizontal Speed: 11 bits (0-2047 km/h)
  // - Bearing: 9 bits (0-359 degrees, values 360-511 are invalid)
  // - Vertical Speed: 8 bits (0-255 km/h)
  // - Vertical Direction: 1 bit (0=down, 1=up)
  // - Horizontal Uncertainty: 8 bits (0-255 km/h)
  // - Vertical Uncertainty: 8 bits (0-255 km/h)
  // Total: 45 bits = 6 bytes (with 3 padding bits)
  
  const buffer = Buffer.alloc(6);
  
  // Pack the data into the buffer
  let bitOffset = 0;
  
  // Horizontal Speed (11 bits)
  const horizontalSpeed = Math.min(gadVelocity.horizontalSpeed, 2047);
  buffer.writeUInt16BE((horizontalSpeed << 5) & 0xFFE0, 0);
  bitOffset += 11;
  
  // Bearing (9 bits) - continues from horizontal speed
  const bearing = Math.min(gadVelocity.bearing, 359);
  const existingBits = buffer.readUInt16BE(0);
  buffer.writeUInt16BE(existingBits | (bearing >> 4), 0);
  buffer[2] = (bearing & 0x0F) << 4;
  bitOffset += 9;
  
  // Vertical Speed (8 bits)
  const verticalSpeed = Math.min(gadVelocity.verticalSpeed, 255);
  buffer[2] |= (verticalSpeed >> 4) & 0x0F;
  buffer[3] = (verticalSpeed & 0x0F) << 4;
  bitOffset += 8;
  
  // Vertical Direction (1 bit)
  if (gadVelocity.verticalDirection) {
    buffer[3] |= 0x08;
  }
  bitOffset += 1;
  
  // Horizontal Uncertainty (8 bits)
  const horizontalUncertainty = Math.min(gadVelocity.horizontalUncertainty, 255);
  buffer[3] |= (horizontalUncertainty >> 5) & 0x07;
  buffer[4] = (horizontalUncertainty & 0x1F) << 3;
  bitOffset += 8;
  
  // Vertical Uncertainty (8 bits)
  const verticalUncertainty = Math.min(gadVelocity.verticalUncertainty, 255);
  buffer[4] |= (verticalUncertainty >> 5) & 0x07;
  buffer[5] = (verticalUncertainty & 0x1F) << 3;
  bitOffset += 8;
  
  return buffer;
}

/**
 * Converts Signal K navigation data to 3GPP TS 23.032 velocity format
 * Handles the specific case where we get data from multiple Signal K paths
 * 
 * @param navigationData Object containing speedOverGround and courseOverGround from Signal K
 * @returns Hex string representation of the binary GAD velocity
 */
export function convertNavigationTo3GPPVelocity(navigationData: any): string {
  const velocityData: VelocityData = {
    speedOverGround: navigationData.speedOverGround || 0,
    courseOverGround: navigationData.courseOverGround, // Can be null - will default to 0
    verticalSpeed: 0 // Always zero for marine applications
  };
  
  // Convert to GAD format
  const gadVelocity = encode3GPPVelocity(velocityData);
  
  // Encode to binary
  const binaryData = encodeGADVelocityBinary(gadVelocity);
  
  // Return as hex string for transmission
  return binaryData.toString('hex').toUpperCase();
}

/**
 * Converts just speed to 3GPP TS 23.032 binary format (no course data)
 * This is for when we only have speedOverGround available
 * 
 * @param speed Speed in m/s from Signal K
 * @returns Hex string representation of the binary GAD velocity
 */
export function convertSpeedTo3GPPVelocity(speed: number): string {
  const velocityData: VelocityData = {
    speedOverGround: speed,
    courseOverGround: undefined, // No course data available
    verticalSpeed: 0             // Always zero for marine applications
  };
  
  // Convert to GAD format
  const gadVelocity = encode3GPPVelocity(velocityData);
  
  // Encode to binary
  const binaryData = encodeGADVelocityBinary(gadVelocity);
  
  // Return as hex string for transmission
  return binaryData.toString('hex').toUpperCase();
}

/**
 * Converts Signal K velocity data directly to 3GPP TS 23.032 binary format
 * This is the main function to use for the "3gpp_ts_23032_velocity" conversion
 * 
 * @param signalKVelocity Signal K velocity object or speed value
 * @returns Hex string representation of the binary GAD velocity
 */
export function convertTo3GPPVelocity(signalKVelocity: any): string {
  let velocityData: VelocityData = {};
  
  // Handle different Signal K velocity formats
  if (typeof signalKVelocity === 'number') {
    // Simple speed value
    velocityData.speedOverGround = signalKVelocity;
  } else if (typeof signalKVelocity === 'object' && signalKVelocity !== null) {
    // Signal K velocity object with speed and course
    velocityData = {
      speedOverGround: signalKVelocity.speedOverGround,
      courseOverGround: signalKVelocity.courseOverGround,
      verticalSpeed: signalKVelocity.verticalSpeed
    };
  }
  
  // Convert to GAD format
  const gadVelocity = encode3GPPVelocity(velocityData);
  
  // Encode to binary
  const binaryData = encodeGADVelocityBinary(gadVelocity);
  
  // Return as hex string for transmission
  return binaryData.toString('hex').toUpperCase();
}

/**
 * Simple conversion functions that can be used in the JSON config
 * These are exported for backward compatibility with the existing system
 */
export const conversions = {
  kelvin_to_celsius: (value: number): number => value - 273.15,
  radians_to_degrees: (value: number): number => value * 180 / Math.PI,
  meters_per_second_to_knots: (value: number): number => value * 1.94384,
  meters_per_second_to_kmh: (value: number): number => value * 3.6,
  ratio_to_percentage: (value: number): number => value * 100,
  none: (value: number): number => value,
  
  // Special 3GPP conversions
  '3gpp_ts_23032_velocity': convertTo3GPPVelocity,
  '3gpp_ts_23032_velocity_from_speed': convertSpeedTo3GPPVelocity,
  '3gpp_ts_23032_velocity_navigation': convertNavigationTo3GPPVelocity
};



/**
 * Interface for LwM2M resource definition from XML specifications
 */
export interface LwM2MResourceSpec {
  id: string;
  name: string;
  mandatory: boolean;
  type: string;
  operations: string;
}

/**
 * Interface for LwM2M object specification
 */
export interface LwM2MObjectSpec {
  objectId: string;
  name: string;
  resources: { [resourceId: string]: LwM2MResourceSpec };
}

/**
 * Cache for parsed LwM2M object specifications
 */
const objectSpecCache: { [objectId: string]: LwM2MObjectSpec } = {};

/**
 * Parse LwM2M object XML specification to extract resource definitions
 * @param objectId The LwM2M object ID (e.g., "3303", "6", "3336")
 * @returns Parsed object specification or null if not found
 */
export function parseLwM2MObjectSpec(objectId: string): LwM2MObjectSpec | null {
  // Check cache first
  if (objectSpecCache[objectId]) {
    return objectSpecCache[objectId];
  }

  try {
    const fs = require('fs');
    const path = require('path');
    
    const xmlPath = path.resolve(__dirname, `../config/lwm2m-object-${objectId}.xml`);
    
    if (!fs.existsSync(xmlPath)) {
      console.warn(`⚠️ LwM2M Object ${objectId} specification not found at ${xmlPath}`);
      return null;
    }

    const xmlContent = fs.readFileSync(xmlPath, 'utf8');
    
    // Simple XML parsing for resource definitions
    const resources: { [resourceId: string]: LwM2MResourceSpec } = {};
    const resourceMatches = xmlContent.match(/<Item ID="([^"]+)"[\s\S]*?<\/Item>/g);
    
    if (resourceMatches) {
      resourceMatches.forEach((resourceXml: string) => {
        const idMatch = resourceXml.match(/<Item ID="([^"]+)"/);
        const nameMatch = resourceXml.match(/<Name>([^<]+)<\/Name>/);
        const mandatoryMatch = resourceXml.match(/<Mandatory>([^<]+)<\/Mandatory>/);
        const typeMatch = resourceXml.match(/<Type>([^<]+)<\/Type>/);
        const operationsMatch = resourceXml.match(/<Operations>([^<]+)<\/Operations>/);
        
        if (idMatch && nameMatch) {
          const resourceId = idMatch[1];
          resources[resourceId] = {
            id: resourceId,
            name: nameMatch[1],
            mandatory: mandatoryMatch ? mandatoryMatch[1].toLowerCase() === 'mandatory' : false,
            type: typeMatch ? typeMatch[1] : 'Unknown',
            operations: operationsMatch ? operationsMatch[1] : 'Unknown'
          };
        }
      });
    }

    // Extract object name
    const objectNameMatch = xmlContent.match(/<Name>([^<]+)<\/Name>/);
    const objectName = objectNameMatch ? objectNameMatch[1] : `Object ${objectId}`;

    const spec: LwM2MObjectSpec = {
      objectId,
      name: objectName,
      resources
    };

    // Cache the result
    objectSpecCache[objectId] = spec;
    
    return spec;
    
  } catch (error) {
    console.error(`❌ Error parsing LwM2M Object ${objectId} specification:`, error);
    return null;
  }
}

/**
 * Validate that mandatory resources are present for a given object
 * @param objectId The LwM2M object ID
 * @param providedResources Object containing the resource values being sent
 * @returns Validation result with missing mandatory resources
 */
export function validateMandatoryResources(
  objectId: number, 
  providedResources: { [resourceId: string]: any }
): { valid: boolean; missingMandatory: string[]; objectName: string } {
  
  const spec = parseLwM2MObjectSpec(objectId.toString());
  
  if (!spec) {
    // If we don't have the spec, allow the operation but warn
    console.warn(`⚠️ No specification found for Object ${objectId} - skipping mandatory validation`);
    return { valid: true, missingMandatory: [], objectName: `Object ${objectId}` };
  }

  const missingMandatory: string[] = [];
  
  // Check each mandatory resource
  Object.values(spec.resources).forEach(resource => {
    if (resource.mandatory && !providedResources.hasOwnProperty(resource.id)) {
      missingMandatory.push(`Resource ${resource.id} (${resource.name})`);
    }
  });

  return {
    valid: missingMandatory.length === 0,
    missingMandatory,
    objectName: spec.name
  };
}

/**
 * Apply conversion based on conversion type string
 * @param value Input value
 * @param conversionType Conversion function name
 * @returns Converted value
 */
export function applyConversion(value: any, conversionType: string): any {
  const conversionFunc = conversions[conversionType as keyof typeof conversions];
  if (conversionFunc) {
    return conversionFunc(value);
  }
  
  // Fallback to no conversion
  console.warn(`Unknown conversion type: ${conversionType}, using value as-is`);
  return value;
}

/**
 * Provide fallback GPS coordinates for Object 3336 when actual coordinates are unavailable
 * This ensures emergency notifications are never blocked due to missing GPS data
 * @param extractedResources Current resource data being processed
 * @returns Modified resource data with fallback coordinates if needed
 */
export function ensureObject3336Coordinates(extractedResources: { [resourceId: string]: any }): { [resourceId: string]: any } {
  const modifiedResources = { ...extractedResources };
  let coordinatesFilled = false;

  // Check if mandatory latitude (6051) is missing
  if (!modifiedResources.hasOwnProperty('6051') || modifiedResources['6051'] === undefined || modifiedResources['6051'] === null) {
    modifiedResources['6051'] = 0.0; // Default latitude: Equator
    coordinatesFilled = true;
  }

  // Check if mandatory longitude (6052) is missing
  if (!modifiedResources.hasOwnProperty('6052') || modifiedResources['6052'] === undefined || modifiedResources['6052'] === null) {
    modifiedResources['6052'] = 0.0; // Default longitude: Prime Meridian
    coordinatesFilled = true;
  }

  if (coordinatesFilled) {
    console.log('🌍 GPS coordinates unavailable - using fallback coordinates (0.0, 0.0) for emergency notification');
    console.log('   📍 This ensures the notification is sent despite missing GPS data');
  }

  return modifiedResources;
}

// Re-export fast validation functions from mandatory-resources module
export { 
  validateMandatoryResourcesFast, 
  initializeMandatoryResourcesCache,
  generateMandatoryResourcesCache 
} from './mandatory-resources';