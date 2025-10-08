# Signal K LwM2M Bridge

A **Signal K server** that bridges LwM2M IoT devices to the Signal K marine data standard, converting sensor data to real-time marine navigation and environmental data streams.

## Features

- � **Signal K Server**: Full Signal K v1.0 server with WebSocket streaming and REST API
- 🌊 **Marine Data Standard**: Converts LwM2M sensor data to Signal K navigation and environmental paths
- � **WebSocket Streaming**: Real-time data updates via Signal K delta messages
- �️ **Navigation Data**: GPS coordinates → `navigation.position`, sensor data → `environment.*`
- 🚀 **LwM2M Bridge**: Controls Wakaama LwM2M client as a child process
- 🔧 **TypeScript**: Full type safety with Signal K data types and interfaces
- 🛠️ **VS Code Integration**: Tasks and launch configurations for easy development

## Project Structure

```
lwm2m-node-controller/
├── package.json              # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── README.md                # This file
├── .vscode/                 # VS Code configuration
│   ├── tasks.json          # Build and run tasks
│   └── launch.json         # Debug configurations
├── src/
│   ├── lwm2m-controller.ts # Main LwM2MController class
│   ├── api-server.ts       # Express API server
│   ├── sensor-manager.ts   # Sensor management utilities
│   ├── types.ts            # TypeScript type definitions
│   ├── demo.ts             # Interactive demonstration
│   └── example-usage.ts    # API usage examples
└── dist/                   # Compiled JavaScript (after build)
```

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Start the API server:**
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

4. **Run the interactive demo:**
   ```bash
   npm run demo
   ```

## API Endpoints

| Method | Endpoint | Description | Body |
|--------|----------|-------------|------|
| `POST` | `/command` | Send raw CLI command to client | `{ "command": "ls" }` |
| `POST` | `/sensor/:id/value` | Update sensor value | `{ "value": 23.5 }` |
| `GET` | `/objects` | List all objects/instances | - |
| `POST` | `/quit` | Stop the client process | - |

## Usage Examples

### Direct Controller Usage

```typescript
import { LwM2MController } from './src/lwm2m-controller';

const controller = new LwM2MController(
  '/path/to/my-lwm2m-client',
  ['-h', 'lwm2m.server.com', '-p', '5683']
);

controller.on('ready', () => {
  controller.listObjects();
  controller.updateSensor(0, 25.5);
});

controller.start();
```

### REST API Usage

```javascript
// Update temperature sensor
const response = await fetch('http://localhost:3000/sensor/0/value', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ value: 23.5 })
});

// Send custom command
await fetch('http://localhost:3000/command', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ command: 'disp' })
});
```

## Events

The `LwM2MController` emits the following events:

- `ready`: Client is ready to accept commands
- `output`: Raw output from the client
- `error`: Error messages from the client
- `close`: Client process has terminated


**Prerequisites**: Node.js 16+, TypeScript, and a compiled Wakaama LwM2M client.

# IPSO Objects
https://san.win.tue.nl/education/IoT-inf4all/files/IPSO-Smart-Objects-Starter-Pack.pdf
https://san.win.tue.nl/education/IoT-inf4all/files/IPSO-Smart-Objects-Expansion-Pack.pdf?

## Downloaded LwM2M Object Specifications

| Object ID | Name | Description | Use Case |
|-----------|------|-------------|----------|
| **3316** | Voltage | Voltage sensor measurements | Electrical monitoring |
| **3317** | Current | Current sensor measurements | Electrical monitoring |
| **3322** | Load | Load/weight measurements | Marine cargo/ballast |
| **3323** | Pressure | Pressure sensor readings | Marine depth/weather |
| **3328** | Power | Power consumption/generation | Electrical systems |
| **3342** | On/Off Switch | Digital switch control | Equipment control |
| **3347** | Push Button | Button press detection | User interfaces |
| **3201** | Digital Output | Digital output control | Relay/switch control |
| **3202** | Analog Input | Analog sensor readings | Continuous measurements |
| **3203** | Analog Output | Analog output control | Variable output control |
| **3300** | Generic Sensor | General purpose sensor | Universal sensor interface |
| **3311** | Light Control | Lighting control system | Marine/navigation lights |

## Resources of Digital Input (Object 3200)
wget https://raw.githubusercontent.com/OpenMobileAlliance/lwm2m-registry/prod/3200.xml
save it to /config

| Resource ID | Name                  | Access              | Mandatory / Optional | Type    | Description / Notes                                                                                 |
| ----------- | --------------------- | ------------------- | -------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| 5500        | Digital Input State   | Read (R)            | **Mandatory**        | Boolean | Current state of the digital input (0 / 1) |
| 5501        | Digital Input Counter | Read (R)            | Optional             | Integer | Counts number of transitions from 0 → 1 (i.e. how many times input went “on”)|
| 5750        | Application Type      | Read / Write (R, W) | Optional             | String  | A textual label for the digital input (e.g. “door sensor”, “switch #1”) |

Full description here:
https://www.openmobilealliance.org/tech/profiles/lwm2m-archive/3200.xml?