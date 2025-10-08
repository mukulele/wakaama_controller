/* Status of api-server.ts Module:
This is a Signal K Server implementation that was built for the opposite data flow direction from what we're currently implementing. Here's the analysis:

Current Purpose:
LwM2M → Signal K Server: Takes LwM2M client data and serves it as a Signal K server
Provides Signal K WebSocket streams for other clients to consume
REST API endpoints for LwM2M control and Signal K data access
Key Components:
Signal K Server: Express.js server with WebSocket support
REST API: /signalk/v1/api/* endpoints for Signal K protocol
WebSocket Stream: /signalk/v1/stream for real-time Signal K deltas
LwM2M Integration: Controls LwM2M client and converts output to Signal K format
Status Assessment:
✅ What Works:
Complete Signal K server implementation
WebSocket streaming infrastructure
REST API for vessel data
LwM2M controller integration
⚠️ Current Issues:
Wrong Data Direction: This serves LwM2M data TO Signal K clients
Unused in Current Architecture: We're building Signal K subscriber, not server
Conflicts with Our Bridge: Our signalk-client.ts connects to existing Signal K server
API URL Unused: The this.apiUrl line in signalk-client.ts is indeed unused
Recommendation:
For Current Signal K Bridge Project:

Keep as Reference: Good example of Signal K server implementation
Not Currently Used: Our bridge connects to existing Signal K server at rpi.local:3000
Remove API URL: The unused this.apiUrl line can be removed from signalk-client.ts
Future Use: Could be useful for reverse direction (LwM2M → Signal K) later
Should I:

Remove unused apiUrl from signalk-client.ts?
Keep api-server.ts as reference but not include in build?
Document the difference between server (this) vs. subscriber (our current bridge)?
The module is complete but serves a different use case than our current Signal K → LwM2M bridge.
*/


import express, { Express, Request, Response, NextFunction } from 'express';
import { json } from 'body-parser';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server as HttpServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import LwM2MController from './lwm2m-controller';
import { 
  SignalKMessage, 
  SignalKDelta, 
  VesselData, 
  Position,
  SIGNALK_PATHS,
  LWM2M_TO_SIGNALK_MAP 
} from './signalk-types';

class SignalKServer {
  private app: Express;
  private port: number;
  private controller: LwM2MController;
  private httpServer: HttpServer;
  private wsServer: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private vesselUuid: string;
  private vesselData: VesselData = {};
  
  constructor(port: number = 3000, vesselUuid?: string) {
    this.port = port;
    this.vesselUuid = vesselUuid || uuidv4();
    this.app = express();
    this.controller = new LwM2MController();
    
    // Create HTTP server
    this.httpServer = createServer(this.app);
    
    // Create WebSocket server
    this.wsServer = new WebSocketServer({ 
      server: this.httpServer,
      path: '/signalk/v1/stream'
    });
    
    this.setupMiddleware();
    this.setupSignalKRoutes();
    this.setupWebSocketHandlers();
    this.setupLwM2MEventHandlers();
  }

  private setupWebSocketHandlers(): void {
    this.wsServer.on('connection', (ws: WebSocket, req) => {
      console.log('🔌 Signal K client connected from:', req.socket.remoteAddress);
      this.clients.add(ws);

      // Send initial hello message
      this.sendToClient(ws, this.createHelloMessage());

      ws.on('close', () => {
        console.log('🔌 Signal K client disconnected');
        this.clients.delete(ws);
      });

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(ws, message);
        } catch (error) {
          console.error('Invalid WebSocket message:', error);
        }
      });
    });
  }

  private setupLwM2MEventHandlers(): void {
    this.controller.on('ready', () => {
      console.log('🚢 LwM2M Client is ready - Signal K streaming enabled');
      this.broadcastDelta({
        context: `vessels.${this.vesselUuid}`,
        updates: [{
          source: { label: 'lwm2m-controller' },
          timestamp: new Date().toISOString(),
          values: [{ path: 'notifications.onboardSystems.lwm2m.status', value: 'ready' }]
        }]
      });
    });

    this.controller.on('output', (data: string) => {
      console.log('LwM2M:', data.trim());
      // Parse LwM2M output and convert to Signal K deltas
      this.parseLwM2MOutput(data);
    });

    this.controller.on('error', (error: string) => {
      console.error('LwM2M Error:', error);
      this.broadcastDelta({
        context: `vessels.${this.vesselUuid}`,
        updates: [{
          source: { label: 'lwm2m-controller' },
          timestamp: new Date().toISOString(),
          values: [{ path: 'notifications.onboardSystems.lwm2m.error', value: error }]
        }]
      });
    });

    this.controller.on('close', (code: number) => {
      console.log('LwM2M client closed with code:', code);
    });
  }
    
  private setupMiddleware(): void {
        this.app.use(express.json());
        this.app.use(express.static('public'));
        
        // CORS for development
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Content-Type');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
            next();
        });
    }
    
  // Signal K Message Handling
  private createHelloMessage(): any {
    return {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      self: `vessels.${this.vesselUuid}`,
      roles: ['master', 'main'],
      name: 'LwM2M Signal K Server'
    };
  }

  private sendToClient(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcastDelta(delta: SignalKDelta): void {
    const message = JSON.stringify(delta);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  private handleWebSocketMessage(ws: WebSocket, message: any): void {
    // Handle Signal K subscription requests, etc.
    console.log('Received WebSocket message:', message);
  }

  private parseLwM2MOutput(output: string): void {
    // Parse LwM2M output and convert to Signal K
    // This is where you'd parse actual sensor data from LwM2M client output
    // For now, we'll simulate some data updates
    if (output.includes('change') || output.includes('update')) {
      // Extract sensor values and create Signal K deltas
      // This is a placeholder - you'd implement actual parsing here
    }
  }

  private updateVesselData(path: string, value: any): void {
    // Update internal vessel data store
    const pathParts = path.split('.');
    let current = this.vesselData as any;
    
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!current[pathParts[i]]) {
        current[pathParts[i]] = {};
      }
      current = current[pathParts[i]];
    }
    
    current[pathParts[pathParts.length - 1]] = value;

    // Broadcast delta
    this.broadcastDelta({
      context: `vessels.${this.vesselUuid}`,
      updates: [{
        source: { label: 'lwm2m-controller' },
        timestamp: new Date().toISOString(),
        values: [{ path, value }]
      }]
    });
  }

    setupSignalKRoutes() {
        // Signal K API Discovery
        this.app.get('/signalk', (req, res) => {
            res.json({
                version: '1.0.0',
                endpoints: {
                    v1: {
                        version: '1.0.0',
                        'signalk-http': `http://localhost:${this.port}/signalk/v1/api/`,
                        'signalk-ws': `ws://localhost:${this.port}/signalk/v1/stream`
                    }
                }
            });
        });

        // Signal K API Root
        this.app.get('/signalk/v1/api', (req, res) => {
            res.json({
                version: '1.0.0',
                self: `vessels.${this.vesselUuid}`,
                vessels: {
                    [this.vesselUuid]: this.vesselData
                }
            });
        });

        // Get vessel data
        this.app.get('/signalk/v1/api/vessels/self', (req, res) => {
            res.json(this.vesselData);
        });

        // Get specific path data
        this.app.get('/signalk/v1/api/vessels/self/*', (req, res) => {
            const path = (req.params as any)['0'] || '';
            const pathParts = path.split('/').filter((p: string) => p);
            let current = this.vesselData as any;
            
            for (const part of pathParts) {
                if (current && current[part] !== undefined) {
                    current = current[part];
                } else {
                    return res.status(404).json({ error: 'Path not found' });
                }
            }
            
            res.json({
                value: current,
                timestamp: new Date().toISOString(),
                source: { label: 'lwm2m-controller' }
            });
        });

        // Legacy LwM2M endpoints (for backward compatibility)
        this.setupLegacyRoutes();
    }

    private setupLegacyRoutes(): void {
        // Health check (with Signal K format)
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                signalk: {
                    version: '1.0.0',
                    self: `vessels.${this.vesselUuid}`
                },
                lwm2m: {
                    clientReady: this.controller.ready,
                    connectedClients: this.clients.size
                },
                timestamp: new Date().toISOString()
            });
        });
        
        // Send raw LwM2M command and convert response to Signal K
        this.app.post('/lwm2m/command', (req, res) => {
            try {
                const { command } = req.body;
                if (!command) {
                    return res.status(400).json({ error: 'Command is required' });
                }
                
                this.controller.sendCommand(command);
                res.json({ 
                    status: 'sent', 
                    command,
                    signalk: {
                        context: `vessels.${this.vesselUuid}`,
                        path: 'notifications.onboardSystems.lwm2m.command'
                    }
                });
            } catch (error) {
                res.status(503).json({ error: error instanceof Error ? error.message : 'Unknown error' });
            }
        });
        
        // Update sensor value (converts to Signal K navigation/environment data)
        this.app.post('/lwm2m/sensor/:instanceId/value', (req, res) => {
            try {
                const { instanceId } = req.params;
                const { value, type = 'temperature' } = req.body;
                
                if (value === undefined) {
                    return res.status(400).json({ error: 'Value is required' });
                }
                
                // Send to LwM2M - Generic Sensor Object
                this.controller.updateObjectResource(3300, parseInt(instanceId), 5700, value);
                
                // Convert to Signal K and broadcast
                const signalKPath = type === 'temperature' 
                    ? SIGNALK_PATHS.TEMPERATURE 
                    : SIGNALK_PATHS.SENSOR_GENERIC(type, instanceId);
                    
                this.updateVesselData(signalKPath, value);
                
                res.json({ 
                    status: 'updated',
                    lwm2m: { sensor: instanceId, value },
                    signalk: { path: signalKPath, value }
                });
            } catch (error) {
                res.status(503).json({ error: error instanceof Error ? error.message : 'Unknown error' });
            }
        });
        
        // Update location (converts to Signal K navigation.position)
        this.app.post('/lwm2m/location/:instanceId', (req, res) => {
            try {
                const { instanceId } = req.params;
                const { latitude, longitude } = req.body;
                
                if (latitude !== undefined) {
                    // Location Object - Latitude Resource
                    this.controller.updateObjectResource(6, parseInt(instanceId), 0, latitude);
                }
                if (longitude !== undefined) {
                    // Location Object - Longitude Resource
                    this.controller.updateObjectResource(6, parseInt(instanceId), 1, longitude);
                }
                
                // Update Signal K navigation data
                if (latitude !== undefined && longitude !== undefined) {
                    const position: Position = { latitude, longitude };
                    this.updateVesselData(SIGNALK_PATHS.POSITION, position);
                }
                
                res.json({
                    status: 'updated',
                    lwm2m: { location: instanceId, latitude, longitude },
                    signalk: { 
                        path: SIGNALK_PATHS.POSITION, 
                        value: { latitude, longitude } 
                    }
                });
            } catch (error) {
                res.status(503).json({ error: error instanceof Error ? error.message : 'Unknown error' });
            }
        });
    }
    
    setupController() {
        this.controller.on('ready', () => {
            console.log('✅ LwM2M Controller is ready!');
        });
        
        this.controller.on('output', (output) => {
            console.log('LwM2M:', output.trim());
        });
        
        this.controller.on('error', (error) => {
            console.error('LwM2M Error:', error);
        });
    }
    
    start(): void {
        // Start the LwM2M controller first
        this.controller.start();
        
        // Start the Signal K server (HTTP + WebSocket)
        this.httpServer.listen(this.port, () => {
            console.log(`🚢 Signal K Server running on http://localhost:${this.port}`);
            console.log(`🔌 WebSocket stream: ws://localhost:${this.port}/signalk/v1/stream`);
            console.log(`📡 Signal K API: http://localhost:${this.port}/signalk/v1/api/`);
            console.log(`🛠️  LwM2M Control: http://localhost:${this.port}/lwm2m/`);
            console.log(`⚡ Vessel UUID: ${this.vesselUuid}`);
            console.log(`📡 Waiting for LwM2M client to be ready...`);
        });
        
        // Handle shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down Signal K Server...');
            this.clients.forEach(client => client.close());
            this.wsServer.close();
            this.controller.stop();
            this.httpServer.close(() => {
                console.log('👋 Signal K Server stopped');
                process.exit(0);
            });
        });
    }
}

// Start the server if run directly
if (require.main === module) {
    const server = new SignalKServer(3000);
    server.start();
}

export default SignalKServer;