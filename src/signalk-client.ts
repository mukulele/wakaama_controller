// Signal K to LwM2M Bridge - Subscribes to Signal K server and maps data to Wakaama LwM2M client
import WebSocket from 'ws';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import LwM2MController from './lwm2m-controller';
import { applyConversion, validateMandatoryResourcesFast, initializeMandatoryResourcesCache, ensureObject3336Coordinates } from './helpers';

// Types for Signal K data and our mapping configuration
interface SignalKDelta {
  context: string;
  updates: Array<{
    source: {
      label: string;
      type: string;
    };
    timestamp: string;
    values: Array<{
      path: string;
      value: any;
    }>;
  }>;
}

interface LwM2MMapping {
  signalkPath: string;
  object_id?: number;        // Optional: for data collection only
  instance_id?: number;      // Optional: for data collection only  
  resource_id?: number;      // Optional: for data collection only
  conversion?: string;
  description: string;
  // Optional Signal K subscription overrides
  period?: number;
  format?: string;
  policy?: string;
  minPeriod?: number;
  // Template mapping fields for Object 3336
  template_mapping?: boolean;
  instance_mapping?: { [notificationType: string]: number };
  resources?: { [resourceId: string]: string };
}

interface SystemConfig {
  signalk: {
    server: string;
    reconnectDelay: number;
    maxReconnectAttempts: number;
    subscription: {
      period: number;
      format: string;
      policy: string;
      minPeriod: number;
    };
  };
  lwm2m: {
    clientPath: string;
    clientOptions: string;
  };
}

interface MappingConfig {
  version: string;
  description: string;
  mappings: LwM2MMapping[];
}

export class SignalKSubscriber {
  private wsUrl: string;
  private apiUrl: string;
  private ws: WebSocket | null = null;
  private controller: LwM2MController;
  private mappingConfig: MappingConfig | null = null;
  private systemConfig: SystemConfig | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;
  private subscribedPaths: string[] = [];
  private helperPathData: { [key: string]: any } = {}; // Store data for synthetic paths

  constructor(
    private configPath: string = '../config/signalk-lwm2m-mapping.json',
    private systemConfigPath: string = '../config/default.json',
    lwm2mClientPath?: string
  ) {
    // Initialize mandatory resources cache for fast validation
    initializeMandatoryResourcesCache();
    
    // Will be set after loading system config
    this.wsUrl = '';
    this.apiUrl = '';
    this.controller = new LwM2MController(lwm2mClientPath);
    this.setupLwM2MEventHandlers();
  }

  private setupLwM2MEventHandlers(): void {
    this.controller.on('ready', () => {
      console.log('🚀 LwM2M Client ready - will receive Signal K data');
    });

    this.controller.on('output', (data: string) => {
      console.log('LwM2M:', data.trim());
    });

    this.controller.on('error', (error: string) => {
      console.error('LwM2M Error:', error);
    });
  }

  async start(): Promise<void> {
    console.log('🚢 Starting Signal K to LwM2M Bridge...');
    
    // Load system configuration first
    await this.loadSystemConfig();
    
    // Load mapping configuration
    await this.loadMappingConfig();
    
    // Test connectivity to Signal K server
    try {
      const discovery = await axios.get(`http://${this.systemConfig!.signalk.server}/signalk/`);
      console.log(`✅ Connected to Signal K Server v${discovery.data.server.version}`);
    } catch (error) {
      console.error(`❌ Cannot reach Signal K server at ${this.systemConfig!.signalk.server}`);
      throw error;
    }

    // Start LwM2M controller
    this.controller.start();
    
    // Connect to Signal K WebSocket for receiving data
    this.connectWebSocket();
  }

  private async loadSystemConfig(): Promise<void> {
    try {
      const configFilePath = path.resolve(__dirname, this.systemConfigPath);
      const configData = fs.readFileSync(configFilePath, 'utf8');
      this.systemConfig = JSON.parse(configData);
      
      // Set up URLs from system config
      this.wsUrl = `ws://${this.systemConfig!.signalk.server}/signalk/v1/stream?subscribe=none`;
      this.apiUrl = `http://${this.systemConfig!.signalk.server}/signalk/v1/api`;
      
      // Update reconnection settings
      this.maxReconnectAttempts = this.systemConfig!.signalk.maxReconnectAttempts;
      this.reconnectDelay = this.systemConfig!.signalk.reconnectDelay;
      
      console.log(`✅ Loaded system config: Signal K server at ${this.systemConfig!.signalk.server}`);
    } catch (error) {
      console.error(`❌ Failed to load system config from ${this.systemConfigPath}:`, error);
      throw error;
    }
  }

  private async loadMappingConfig(): Promise<void> {
    try {
      const configFilePath = path.resolve(__dirname, this.configPath);
      const configData = fs.readFileSync(configFilePath, 'utf8');
      this.mappingConfig = JSON.parse(configData);
      
      // Log template mappings
      const templateMappings = this.mappingConfig!.mappings.filter(m => m.template_mapping);
      templateMappings.forEach(mapping => {
        console.log(`✅ Template mapping for ${mapping.signalkPath} (Object ${mapping.object_id})`);
        if (mapping.instance_mapping) {
          const instances = Object.entries(mapping.instance_mapping)
            .map(([type, id]) => `${type}→${id}`)
            .join(', ');
          console.log(`   Instance mapping: ${instances}`);
        }
      });
      
      // Extract paths to subscribe to
      this.subscribedPaths = this.mappingConfig!.mappings.map(m => m.signalkPath);
      
      console.log(`✅ Loaded mapping config: ${this.mappingConfig!.mappings.length} mappings`);
      console.log('📡 Will subscribe to paths:', this.subscribedPaths);
    } catch (error) {
      console.error(`❌ Failed to load mapping config from ${this.configPath}:`, error);
      throw error;
    }
  }

  private connectWebSocket(): void {
    console.log(`🔌 Connecting to Signal K WebSocket: ${this.wsUrl}`);
    
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      console.log('✅ Connected to Signal K WebSocket stream');
      this.reconnectAttempts = 0;
      
      // Follow Signal K best practices: first unsubscribe all, then subscribe to our paths
      this.unsubscribeAll();
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleSignalKDelta(message);
      } catch (error) {
        console.warn('⚠️ Failed to parse Signal K message:', error);
      }
    });

    this.ws.on('close', () => {
      console.log('🔌 Signal K WebSocket disconnected');
      this.scheduleReconnect();
    });

    this.ws.on('error', (error: Error) => {
      console.error('❌ Signal K WebSocket error:', error.message);
      this.scheduleReconnect();
    });
  }

  private unsubscribeAll(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Send unsubscribe wildcard to clear any existing subscriptions
    const unsubscribe = {
      context: '*',
      unsubscribe: [
        { path: '*' }
      ]
    };

    this.ws.send(JSON.stringify(unsubscribe));
    console.log('🧹 Unsubscribed from all Signal K paths');
    
    // Wait a moment then subscribe to our specific paths
    setTimeout(() => {
      this.subscribeToSignalKPaths();
    }, 100);
  }

  private subscribeToSignalKPaths(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.mappingConfig || !this.systemConfig) {
      return;
    }

    // Get default subscription settings from system config
    const defaults = this.systemConfig.signalk.subscription;

    // Collect all paths we need to subscribe to
    const pathsToSubscribe = new Set<string>();

    // Add regular Signal K paths (but skip helper paths)
    this.mappingConfig.mappings.forEach(mapping => {
      if (!mapping.signalkPath.startsWith('helpers.')) {
        pathsToSubscribe.add(mapping.signalkPath);
      }
    });

    // Add paths needed for helper functions
    const helperMappings = this.mappingConfig.mappings.filter(m => m.signalkPath.startsWith('helpers.'));
    helperMappings.forEach(mapping => {
      const helperType = mapping.signalkPath.replace('helpers.', '');
      if (helperType === '3gpp_ts_23032_velocity') {
        // 3GPP velocity helper needs speed and course data
        pathsToSubscribe.add('navigation.speedOverGround');
        pathsToSubscribe.add('navigation.courseOverGroundTrue');
      }
      // Add more helper types here as needed
    });

    // Send subscription request for our specific paths with merged settings
    const subscription = {
      context: 'vessels.self',
      subscribe: Array.from(pathsToSubscribe).map(path => ({
        path: path,
        period: defaults.period,
        format: defaults.format,
        policy: defaults.policy,
        minPeriod: defaults.minPeriod
      }))
    };

    this.ws.send(JSON.stringify(subscription));
    console.log('📡 Subscribed to Signal K paths with merged configuration:', 
                subscription.subscribe.map(s => `${s.path} (${s.period}ms)`));
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔄 Reconnecting to Signal K (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectDelay/1000}s...`);
      
      setTimeout(() => {
        this.connectWebSocket();
      }, this.reconnectDelay);
    } else {
      console.error('❌ Max reconnection attempts reached');
    }
  }

  private handleSignalKDelta(message: any): void {
    // Only process delta messages
    if (!message.updates || !Array.isArray(message.updates)) {
      return;
    }

    message.updates.forEach((update: any) => {
      if (!update.values || !Array.isArray(update.values)) {
        return;
      }

      update.values.forEach((valueUpdate: any) => {
        this.processSignalKValue(valueUpdate.path, valueUpdate.value);
      });
    });
  }

  private processSignalKValue(signalKPath: string, value: any): void {
    if (!this.mappingConfig) {
      return;
    }

    // Always store data for potential helper path use
    this.updateHelperPathData(signalKPath, value);

    // Check for template mappings first (notifications.*)
    const templateMapping = this.mappingConfig.mappings.find(m => 
      m.template_mapping && this.matchesTemplate(signalKPath, m.signalkPath)
    );
    
    if (templateMapping) {
      this.processTemplateMapping(signalKPath, value, templateMapping);
      return;
    }

    // Find exact mapping for this Signal K path
    const mapping = this.mappingConfig.mappings.find(m => m.signalkPath === signalKPath);
    if (!mapping) {
      return; // Not interested in this path directly
    }

    try {
      // Check if this is a complete LwM2M mapping
      if (mapping.object_id === undefined || mapping.instance_id === undefined || mapping.resource_id === undefined) {
        console.log(`📝 ${signalKPath}: ${value} (no LwM2M mapping - data collection only)`);
        return; // Valid case: just collecting data for helper functions or future use
      }

      // Apply conversion if specified
      let convertedValue = value;
      if (mapping.conversion) {
        convertedValue = this.applyConversion(value, mapping.conversion);
      }

      console.log(`📊 ${signalKPath}: ${value} → LwM2M ${mapping.object_id}/${mapping.instance_id}/${mapping.resource_id}: ${convertedValue}`);

      // Validate resource against LwM2M specification (warning only for single resources)
      const singleResourceData = { [mapping.resource_id.toString()]: convertedValue };
      const validation = validateMandatoryResourcesFast(mapping.object_id, singleResourceData);
      
      if (!validation.valid && validation.missingMandatory.length > 0) {
        console.warn(`⚠️ Single resource update for ${validation.objectName} (Object ${mapping.object_id}):`);
        validation.missingMandatory.forEach((missing: string) => {
          console.warn(`   ❗ Note: ${missing} is mandatory but not provided in this update`);
        });
        console.warn(`   📝 This may cause issues if other mandatory resources are not set elsewhere`);
      }

      // Send to LwM2M client
      // This is the terminus of the Signal K → LwM2M data flow. 
      // Signal K data (after conversion) gets pushed into the LwM2M client but 
      // doesn't automatically flow back out to Signal K. 
      // Any upstream communication (LwM2M server requests, observations, etc.) 
      // would be handled by separate logic @TODO.
      this.controller.updateObjectResource(
        mapping.object_id,
        mapping.instance_id,
        mapping.resource_id,
        convertedValue
      );
    } catch (error) {
      console.error(`❌ Error processing ${signalKPath} → ${mapping.object_id}/${mapping.instance_id}/${mapping.resource_id}:`, error);
    }
  }

  private updateHelperPathData(signalKPath: string, value: any): void {
    // Store data for synthetic helper path generation
    this.helperPathData[signalKPath] = value;
    
    // Debug: Log helper data updates
    if (signalKPath === 'navigation.speedOverGround' || signalKPath === 'navigation.courseOverGroundTrue') {
      console.log(`🔧 Helper data updated: ${signalKPath} = ${value}`);
    }
    
    // Check if we can now generate any synthetic helper paths
    this.processHelperPaths();
  }

  private processHelperPaths(): void {
    if (!this.mappingConfig) return;

    // Find all helper path mappings
    const helperMappings = this.mappingConfig.mappings.filter(m => m.signalkPath.startsWith('helpers.'));

    for (const mapping of helperMappings) {
      const helperType = mapping.signalkPath.replace('helpers.', '');
      
      if (helperType === '3gpp_ts_23032_velocity') {
        this.process3GPPVelocityHelper(mapping);
      }
      // Add more helper types here as needed
    }
  }

  private process3GPPVelocityHelper(mapping: LwM2MMapping): void {
    // Collect velocity-related data from stored paths
    const speedOverGround = this.helperPathData['navigation.speedOverGround'];
    const courseOverGround = this.helperPathData['navigation.courseOverGroundTrue'];
    
    // Only process if we have at least speed data
    if (speedOverGround !== undefined && speedOverGround !== null) {
      // Create velocity data object
      const velocityData = {
        speedOverGround: speedOverGround,
        courseOverGround: courseOverGround,
        verticalSpeed: undefined // Not available from current Signal K data
      };

      try {
        // Use the navigation-specific helper function to create 3GPP velocity data
        const gadVelocityHex = applyConversion(velocityData, '3gpp_ts_23032_velocity_navigation');
        
        console.log(`🔧 Helper: 3GPP Velocity from speed=${speedOverGround} course=${courseOverGround} → ${gadVelocityHex}`);

        // Send to LwM2M client (only if mapping is complete)
        if (mapping.object_id !== undefined && mapping.instance_id !== undefined && mapping.resource_id !== undefined) {
          this.controller.updateObjectResource(
            mapping.object_id,
            mapping.instance_id,
            mapping.resource_id,
            gadVelocityHex
          );
        }
      } catch (error) {
        console.error('❌ Error processing 3GPP velocity helper:', error);
      }
    }
  }

  private matchesTemplate(signalKPath: string, templatePath: string): boolean {
    // Safety check for undefined paths
    if (!signalKPath || !templatePath) {
      return false;
    }
    
    // Handle notifications.* pattern matching
    if (templatePath === 'notifications.*') {
      return signalKPath.startsWith('notifications.') && signalKPath !== 'notifications.*';
    }
    
    // Add more template patterns here as needed
    return false;
  }

  private processTemplateMapping(signalKPath: string, value: any, mapping: LwM2MMapping): void {
    if (!mapping.template_mapping || !mapping.instance_mapping || !mapping.resources) {
      console.warn(`⚠️ Invalid template mapping configuration for ${signalKPath}`);
      return;
    }

    try {
      // Parse notification path: notifications.mob.uuid-123
      const pathParts = signalKPath.split('.');
      if (pathParts.length < 3 || pathParts[0] !== 'notifications') {
        console.warn(`⚠️ Invalid notification path format: ${signalKPath}`);
        return;
      }

      const notificationType = pathParts[1];
      const uuid = pathParts[2];
      
      // Get instance ID for this notification type
      const instanceId = mapping.instance_mapping[notificationType];
      if (instanceId === undefined) {
        console.log(`📝 Unknown notification type '${notificationType}' - not in instance mapping`);
        return;
      }

      console.log(`🚨 Processing notification: ${notificationType} (${uuid}) → Object ${mapping.object_id}/Instance ${instanceId}`);

      // First pass: extract all available resources
      const extractedResources: { [resourceId: string]: any } = {};
      
      Object.entries(mapping.resources).forEach(([resourceId, sourcePath]) => {
        try {
          let extractedValue;
          
          // Special case: extract UUID from path structure
          if (sourcePath === 'uuid') {
            extractedValue = uuid;
          } else {
            // Extract the value using the source path (e.g., "value.message")
            extractedValue = this.extractNestedValue(value, sourcePath);
          }
          
          if (extractedValue !== undefined && extractedValue !== null) {
            extractedResources[resourceId] = extractedValue;
            console.log(`  📊 Resource ${resourceId} (${sourcePath}): ${extractedValue}`);
          } else {
            console.log(`  📝 Resource ${resourceId} (${sourcePath}): (no data)`);
          }
        } catch (error) {
          console.error(`❌ Error extracting ${sourcePath} from notification:`, error);
        }
      });

      // Special handling for Object 3336: ensure coordinates are available for emergency notifications
      let finalResources = extractedResources;
      if (mapping.object_id === 3336) {
        finalResources = ensureObject3336Coordinates(extractedResources);
      }

      // Validate mandatory resources before sending
      const validation = validateMandatoryResourcesFast(mapping.object_id!, finalResources);
      
      if (!validation.valid) {
        console.error(`❌ Mandatory resource validation failed for ${validation.objectName} (Object ${mapping.object_id}):`);
        validation.missingMandatory.forEach((missing: string) => {
          console.error(`   ❗ Missing: ${missing}`);
        });
        console.error(`   🚫 Skipping update to prevent LwM2M client errors`);
        return;
      }

      console.log(`✅ Mandatory resource validation passed for ${validation.objectName}`);

      // Second pass: send validated resources to LwM2M client
      Object.entries(finalResources).forEach(([resourceId, extractedValue]) => {
        this.controller.updateObjectResource(
          mapping.object_id!,
          instanceId,
          parseInt(resourceId),
          extractedValue
        );
      });

    } catch (error) {
      console.error(`❌ Error processing template mapping for ${signalKPath}:`, error);
    }
  }

  private extractNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private applyConversion(value: any, conversionType: string): any {
    // All conversions are now handled in helpers.ts
    return applyConversion(value, conversionType);
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public getSubscribedPaths(): string[] {
    return [...this.subscribedPaths];
  }

  public getMappingConfig(): MappingConfig | null {
    return this.mappingConfig;
  }

  public stop(): void {
    console.log('🛑 Stopping Signal K LwM2M Bridge...');
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.controller.stop();
    console.log('👋 Signal K to LwM2M Bridge stopped');
  }
}

// CLI interface
if (require.main === module) {
  const subscriber = new SignalKSubscriber();
  
  subscriber.start().catch((error: any) => {
    console.error('Failed to start Signal K subscriber:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    subscriber.stop();
    process.exit(0);
  });

  // Status logging
  setInterval(() => {
    if (subscriber.isConnected()) {
      console.log(`📡 Signal K subscriber active, monitoring ${subscriber.getSubscribedPaths().length} paths`);
    } else {
      console.log('⚠️ Signal K subscriber disconnected');
    }
  }, 30000); // Every 30 seconds
}