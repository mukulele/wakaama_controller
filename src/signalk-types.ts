// Signal K Data Types and Interfaces

export interface SignalKValue {
  value: any;
  timestamp: string;
  source?: {
    label: string;
    type?: string;
    bus?: string;
  };
}

export interface SignalKDelta {
  context: string;
  updates: Array<{
    source: {
      label: string;
      type?: string;
    };
    timestamp: string;
    values: Array<{
      path: string;
      value: any;
    }>;
  }>;
}

export interface SignalKMessage {
  version: string;
  timestamp: string;
  self: string;
  vessels?: {
    [key: string]: any;
  };
}

export interface Position {
  latitude: number;
  longitude: number;
  altitude?: number;
}

export interface Navigation {
  position?: Position;
  courseOverGroundTrue?: number;
  speedOverGround?: number;
}

export interface Environment {
  temperature?: number;
  humidity?: number;
  pressure?: number;
}

export interface VesselData {
  navigation?: Navigation;
  environment?: Environment;
  sensors?: {
    [key: string]: any;
  };
}

// Signal K Path Mappings from LwM2M Objects
export const SIGNALK_PATHS = {
  // Navigation paths
  POSITION: 'navigation.position',
  COURSE_OVER_GROUND: 'navigation.courseOverGroundTrue',
  SPEED_OVER_GROUND: 'navigation.speedOverGround',
  
  // Environment paths
  TEMPERATURE: 'environment.outside.temperature',
  HUMIDITY: 'environment.outside.humidity',
  PRESSURE: 'environment.barometricPressure',
  
  // Sensor paths (generic)
  SENSOR_TEMPERATURE: (id: string) => `sensors.temperature.${id}.value`,
  SENSOR_GENERIC: (type: string, id: string) => `sensors.${type}.${id}.value`,
} as const;

// LwM2M to Signal K mapping
export const LWM2M_TO_SIGNALK_MAP = {
  // Location Object (6) - GPS coordinates
  '/6/0/0': SIGNALK_PATHS.POSITION, // latitude
  '/6/0/1': SIGNALK_PATHS.POSITION, // longitude
  
  // Temperature Sensor (3303)
  '/3303/0/5700': SIGNALK_PATHS.TEMPERATURE,
  
  // Generic Sensor (3300) - can be temperature, pressure, etc.
  '/3300/0/5700': SIGNALK_PATHS.SENSOR_TEMPERATURE('0'),
  '/3300/1/5700': SIGNALK_PATHS.SENSOR_TEMPERATURE('1'),
} as const;