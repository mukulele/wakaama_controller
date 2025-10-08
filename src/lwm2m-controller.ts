import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

interface SensorUpdate {
  instanceId: number;
  value: number;
}

export { SensorUpdate };

interface LwM2MConfig {
  lwm2m: {
    clientPath: string;
    clientOptions: string;
  };
}

export default class LwM2MController extends EventEmitter {
  private clientPath: string;
  private args: string[];
  private client: ChildProcessWithoutNullStreams | null = null;
  public ready: boolean = false;
  private buffer: string = '';

  constructor(clientPath?: string, args: string[] = [], configPath?: string) {
    super();
    
    // Load configuration from default.json
    const config = this.loadConfig(configPath);
    
    this.clientPath = clientPath || config.lwm2m.clientPath;
    // Convert string options to array format for spawn()
    this.args = args.length > 0 ? args : config.lwm2m.clientOptions.split(' ');
  }

  private loadConfig(configPath?: string): LwM2MConfig {
    try {
      const defaultConfigPath = configPath || path.resolve(__dirname, '../config/default.json');
      const configData = fs.readFileSync(defaultConfigPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      console.warn('⚠️ Failed to load config, using fallback defaults:', error);
      // Fallback to hardcoded defaults if config loading fails
      return {
        lwm2m: {
          clientPath: '/home/pi/wakaama/my-client-project/udp/build/my-lwm2m-client',
          clientOptions: '-h localhost -p 5683 -4'
        }
      };
    }
  }

  start(): void {
    if (this.client) {
      console.log('Client already started');
      return;
    }

    this.client = spawn(this.clientPath, this.args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.client.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      this.buffer += output;
      this.emit('output', output);
      
      if (output.includes('STATE_READY') || output.includes('> ')) {
        this.ready = true;
        this.emit('ready');
      }
    });

    this.client.stderr.on('data', (data: Buffer) => {
      this.emit('error', data.toString());
    });

    this.client.on('close', (code: number) => {
      this.ready = false;
      this.client = null;
      this.emit('close', code);
    });

    this.client.on('error', (error: Error) => {
      this.emit('error', error.message);
    });
  }
  updateObjectResource(objectId: number, instanceId: number, resourceId: number, value: any): void {
    this.sendCommand(`change /${objectId}/${instanceId}/${resourceId} ${value}`);
  }

  listObjects(): void {
    this.sendCommand('ls');
  }

  triggerUpdate(serverId: number): void {
    this.sendCommand(`update ${serverId}`);
  }

  // sendCommand() - Generic lwm2m CLI Interface
  // Used by multiple methods (updateObjectResource(), listObjects(), triggerUpdate(), stop())
  // Handles graceful degradation when client is not ready
  // Single point of control for all LwM2M client communication
  sendCommand(command: string): void {
    if (!this.client || !this.ready) {
      console.log(`⚠️ LwM2M client not ready, dropping command: ${command}`);
      return; // Graceful degradation - drop command instead of throwing
    }
    this.client.stdin.write(command + '\n');
  }

  stop(): void {
    if (this.client) {
      this.sendCommand('quit');
      setTimeout(() => {
        if (this.client) {
          this.client.kill('SIGTERM');
        }
      }, 2000);
    }
  }
}