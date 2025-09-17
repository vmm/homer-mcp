# Implementation Roadmap - Smart Home MCP Server

## 🚀 Phase 1: Foundation & Discovery (Day 1-2)

### Step 1: Network Discovery & Device Identification
**Goal**: Identify all smart devices on your network and their protocols

#### Tasks:
1. **Scan network for devices**
   ```bash
   # From MacBook, scan guest network
   nmap -sn 192.168.87.0/24
   
   # Get ARP table
   arp -a | grep "192.168.87"
   ```

2. **Create device inventory spreadsheet**
   - MAC address
   - IP address  
   - Device name (from Google Home)
   - Brand (if known)
   - Type (bulb/plug)
   - Capabilities (color/dimming/on-off)

3. **Test device accessibility**
   ```bash
   # Test Kasa devices (port 9999)
   nc -zv 192.168.87.x 9999
   
   # Test Tuya devices (port 6668)
   nc -zv 192.168.87.x 6668
   ```

### Step 2: Create Device Registry System
**Goal**: Build persistent storage for device mappings

#### Files to create:
```typescript
// packages/shared/src/types.ts
export interface Device {
  id: string;
  mac: string;
  name: string;
  type: 'light' | 'plug' | 'switch';
  brand: 'kasa' | 'tuya' | 'unknown';
  capabilities: DeviceCapability[];
  room?: string;
  ip?: string;
  online?: boolean;
  lastSeen?: Date;
}

export type DeviceCapability = 
  | 'power'
  | 'brightness'
  | 'color'
  | 'temperature';

// data/device-registry.json
{
  "devices": [
    {
      "id": "desk-lamp",
      "mac": "XX:XX:XX:XX:XX:XX",
      "name": "Desk Lamp",
      "type": "light",
      "brand": "kasa",
      "capabilities": ["power", "brightness", "color"],
      "room": "office"
    }
  ]
}
```

### Step 3: Setup Local Testing Environment
**Goal**: Create basic project structure and test connectivity

#### Commands:
```bash
# Initialize project
mkdir home-automation && cd home-automation
npm init -y

# Create package structure
mkdir -p packages/{mcp-server,smart-home-api,shared}/src
mkdir -p data scripts docs examples

# Install initial dependencies
npm install -D typescript @types/node tsx
npm install express dotenv node-fetch

# Initialize TypeScript
npx tsc --init
```

---

## 🔧 Phase 2: Device Control Implementation (Day 3-4)

### Step 4: Implement TP-Link Kasa Protocol
**Goal**: Control Kasa devices directly

#### Implementation:
```typescript
// packages/smart-home-api/src/devices/kasa.ts
import crypto from 'crypto';

export class KasaDevice {
  private ip: string;
  private port = 9999;

  constructor(ip: string) {
    this.ip = ip;
  }

  // Kasa XOR encryption
  private encrypt(command: string): Buffer {
    let key = 171;
    const buffer = Buffer.alloc(command.length);
    
    for (let i = 0; i < command.length; i++) {
      const encrypted = command.charCodeAt(i) ^ key;
      key = encrypted;
      buffer[i] = encrypted;
    }
    
    return buffer;
  }

  private decrypt(buffer: Buffer): string {
    let key = 171;
    let result = '';
    
    for (let i = 0; i < buffer.length; i++) {
      const decrypted = buffer[i] ^ key;
      key = buffer[i];
      result += String.fromCharCode(decrypted);
    }
    
    return result;
  }

  async sendCommand(command: object): Promise<any> {
    const json = JSON.stringify(command);
    const encrypted = this.encrypt(json);
    
    // Send via TCP socket
    return this.tcpSend(encrypted);
  }

  async turnOn(): Promise<void> {
    await this.sendCommand({
      'system': { 'set_relay_state': { 'state': 1 } }
    });
  }

  async turnOff(): Promise<void> {
    await this.sendCommand({
      'system': { 'set_relay_state': { 'state': 0 } }
    });
  }

  async setBrightness(brightness: number): Promise<void> {
    await this.sendCommand({
      'smartlife.iot.dimmer': {
        'set_brightness': { 'brightness': brightness }
      }
    });
  }

  async setColor(hue: number, saturation: number, brightness: number): Promise<void> {
    await this.sendCommand({
      'smartlife.iot.lightStrip': {
        'set_light_state': {
          'hue': hue,
          'saturation': saturation,
          'brightness': brightness,
          'on_off': 1
        }
      }
    });
  }
}
```

### Step 5: Implement Tuya Protocol
**Goal**: Control Tuya devices locally

#### Implementation:
```typescript
// packages/smart-home-api/src/devices/tuya.ts
import TuyAPI from 'tuyapi';

export class TuyaDevice {
  private device: any;

  constructor(config: {
    id: string;
    key: string;
    ip: string;
  }) {
    this.device = new TuyAPI({
      id: config.id,
      key: config.key,
      ip: config.ip,
      version: '3.3'
    });
  }

  async connect(): Promise<void> {
    await this.device.find();
    await this.device.connect();
  }

  async turnOn(): Promise<void> {
    await this.device.set({ dps: 1, set: true });
  }

  async turnOff(): Promise<void> {
    await this.device.set({ dps: 1, set: false });
  }

  async setBrightness(brightness: number): Promise<void> {
    // Brightness is typically 10-1000 for Tuya
    const tuyaBrightness = Math.round(brightness * 10);
    await this.device.set({ dps: 3, set: tuyaBrightness });
  }

  async setColor(r: number, g: number, b: number): Promise<void> {
    // Convert RGB to Tuya hex format
    const hex = this.rgbToHex(r, g, b);
    await this.device.set({ dps: 5, set: hex });
  }

  private rgbToHex(r: number, g: number, b: number): string {
    return [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }
}
```

---

## 🌐 Phase 3: API & MCP Server (Day 5-6)

### Step 6: Build REST API Server
**Goal**: Create HTTP API for device control

#### Implementation:
```typescript
// packages/smart-home-api/src/app.ts
import express from 'express';
import { DeviceController } from './controllers/device.controller';
import { DeviceRegistry } from './services/registry';

const app = express();
app.use(express.json());

const registry = new DeviceRegistry('./data/device-registry.json');
const deviceController = new DeviceController(registry);

// Device endpoints
app.get('/api/devices', async (req, res) => {
  const devices = await deviceController.listDevices();
  res.json(devices);
});

app.get('/api/devices/:id', async (req, res) => {
  const device = await deviceController.getDevice(req.params.id);
  res.json(device);
});

app.post('/api/devices/:id/power', async (req, res) => {
  const { state } = req.body; // 'on' or 'off'
  await deviceController.setPower(req.params.id, state);
  res.json({ success: true });
});

app.post('/api/devices/:id/brightness', async (req, res) => {
  const { level } = req.body; // 0-100
  await deviceController.setBrightness(req.params.id, level);
  res.json({ success: true });
});

app.post('/api/devices/:id/color', async (req, res) => {
  const { r, g, b } = req.body;
  await deviceController.setColor(req.params.id, { r, g, b });
  res.json({ success: true });
});

// Scene endpoints
app.get('/api/scenes', async (req, res) => {
  const scenes = await deviceController.listScenes();
  res.json(scenes);
});

app.post('/api/scenes/:name/activate', async (req, res) => {
  await deviceController.activateScene(req.params.name);
  res.json({ success: true });
});

const PORT = process.env.API_PORT || 3001;
app.listen(PORT, () => {
  console.log(`Smart Home API running on port ${PORT}`);
});
```

### Step 7: Create MCP Server
**Goal**: Build MCP server for LLM integration

#### MCP Server Creation Instructions:
```bash
# First, fetch the MCP server creation instructions
# This will provide the official template and setup process
```

#### Implementation:
```typescript
// packages/mcp-server/src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const API_URL = process.env.API_URL || 'http://localhost:3001';

// Initialize MCP server
const server = new Server(
  {
    name: 'smart-home-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool: Control device power
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'control_light',
      description: 'Turn a light on/off or adjust its settings',
      inputSchema: {
        type: 'object',
        properties: {
          device: { type: 'string', description: 'Device name or ID' },
          action: { 
            type: 'string', 
            enum: ['on', 'off', 'toggle'],
            description: 'Power action'
          },
          brightness: { 
            type: 'number', 
            minimum: 0, 
            maximum: 100,
            description: 'Brightness level (0-100)'
          },
          color: {
            type: 'object',
            properties: {
              r: { type: 'number', minimum: 0, maximum: 255 },
              g: { type: 'number', minimum: 0, maximum: 255 },
              b: { type: 'number', minimum: 0, maximum: 255 }
            }
          }
        },
        required: ['device', 'action']
      }
    },
    {
      name: 'set_scene',
      description: 'Activate a predefined lighting scene',
      inputSchema: {
        type: 'object',
        properties: {
          scene: { 
            type: 'string',
            enum: ['work', 'relax', 'movie', 'sleep', 'party'],
            description: 'Scene name'
          }
        },
        required: ['scene']
      }
    },
    {
      name: 'list_devices',
      description: 'Get list of all available smart devices',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    }
  ]
}));

// Handle tool execution
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'control_light': {
      const response = await fetch(`${API_URL}/api/devices/${args.device}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      return { 
        content: [{ 
          type: 'text', 
          text: `Light ${args.device} turned ${args.action}` 
        }] 
      };
    }

    case 'set_scene': {
      const response = await fetch(`${API_URL}/api/scenes/${args.scene}/activate`, {
        method: 'POST'
      });
      return { 
        content: [{ 
          type: 'text', 
          text: `Scene '${args.scene}' activated` 
        }] 
      };
    }

    case 'list_devices': {
      const response = await fetch(`${API_URL}/api/devices`);
      const devices = await response.json();
      return { 
        content: [{ 
          type: 'text', 
          text: JSON.stringify(devices, null, 2) 
        }] 
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Smart Home MCP Server running');
```

---

## 🔌 Phase 4: Network & Integration (Day 7-8)

### Step 8: Configure Cross-Network Communication
**Goal**: Enable communication between main and guest networks

#### Network Configuration:
1. **Option A: Port Forwarding Rules**
   ```bash
   # Google WiFi doesn't easily support this
   # May need to put server on guest network
   ```

2. **Option B: Bridge Mode**
   ```bash
   # Run discovery service on guest network
   # Connect via specific ports
   ```

3. **Option C: mDNS/Bonjour**
   ```typescript
   // Use multicast DNS for discovery
   import bonjour from 'bonjour';
   const bonjourInstance = bonjour();
   
   // Advertise service
   bonjourInstance.publish({
     name: 'Smart Home API',
     type: 'http',
     port: 3001
   });
   ```

### Step 9: Build Device Discovery Tools
**Goal**: Create tools for finding and mapping devices

#### Discovery Script:
```typescript
// scripts/discover-devices.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function discoverDevices() {
  console.log('🔍 Scanning network for devices...\n');
  
  // Scan guest network
  const { stdout } = await execAsync('nmap -sn 192.168.87.0/24');
  
  // Parse results
  const devices = [];
  const lines = stdout.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Nmap scan report')) {
      const ipMatch = lines[i].match(/(\d+\.\d+\.\d+\.\d+)/);
      if (ipMatch && i + 2 < lines.length) {
        const macMatch = lines[i + 2].match(/([0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2})/i);
        
        if (macMatch) {
          devices.push({
            ip: ipMatch[1],
            mac: macMatch[1],
            timestamp: new Date()
          });
        }
      }
    }
  }
  
  // Test each device for known protocols
  for (const device of devices) {
    console.log(`Testing ${device.ip} (${device.mac})...`);
    
    // Test Kasa
    try {
      await testPort(device.ip, 9999);
      device.type = 'kasa';
      console.log('  ✅ Kasa device detected');
    } catch {}
    
    // Test Tuya
    try {
      await testPort(device.ip, 6668);
      device.type = 'tuya';
      console.log('  ✅ Tuya device detected');
    } catch {}
  }
  
  // Save results
  await fs.writeFile(
    './data/discovered-devices.json',
    JSON.stringify(devices, null, 2)
  );
  
  console.log(`\n📊 Found ${devices.length} devices`);
  return devices;
}

async function testPort(ip: string, port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      reject(false);
    });
    
    socket.on('error', () => {
      reject(false);
    });
    
    socket.connect(port, ip);
  });
}

// Run discovery
discoverDevices().catch(console.error);
```

---

## 🚀 Phase 5: External Access & Automation (Day 9-10)

### Step 10: Setup Cloudflare Tunnel
**Goal**: Expose MCP server securely to internet

#### Setup Steps:
```bash
# Install cloudflared
brew install cloudflare/cloudflare/cloudflared

# Login to Cloudflare
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create smart-home

# Configure tunnel (config.yml)
cat > ~/.cloudflared/config.yml << EOF
url: http://localhost:3000
tunnel: <TUNNEL_ID>
credentials-file: /Users/veli/.cloudflared/<TUNNEL_ID>.json
EOF

# Route tunnel to domain
cloudflared tunnel route dns smart-home smart-home.yourdomain.com

# Run tunnel
cloudflared tunnel run smart-home
```

### Step 11: Integrate with N8N
**Goal**: Create automation workflows

#### N8N Workflow Examples:

1. **GitHub Build Status**
```json
{
  "nodes": [
    {
      "name": "GitHub Webhook",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "github-build",
        "responseMode": "onReceived"
      }
    },
    {
      "name": "Parse Status",
      "type": "n8n-nodes-base.function",
      "parameters": {
        "functionCode": "const status = $input.first().json.state;\nreturn [{json: {status}}];"
      }
    },
    {
      "name": "MCP Call",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://smart-home.yourdomain.com/api/scenes/build-status",
        "method": "POST",
        "bodyParameters": {
          "status": "={{$json.status}}"
        }
      }
    }
  ]
}
```

2. **Time-based Scenes**
```json
{
  "nodes": [
    {
      "name": "Schedule",
      "type": "n8n-nodes-base.cron",
      "parameters": {
        "triggerTimes": {
          "item": [{
            "hour": 21,
            "minute": 0
          }]
        }
      }
    },
    {
      "name": "Evening Scene",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://smart-home.yourdomain.com/api/scenes/evening/activate",
        "method": "POST"
      }
    }
  ]
}
```

---

## 📝 Phase 6: Documentation & Testing (Day 11-12)

### Step 12: Create Documentation
**Goal**: Document API, setup, and usage

#### Documentation Structure:
```markdown
# docs/API_REFERENCE.md
## Endpoints
### Devices
- GET /api/devices
- GET /api/devices/:id
- POST /api/devices/:id/power
- POST /api/devices/:id/brightness
- POST /api/devices/:id/color

### Scenes
- GET /api/scenes
- POST /api/scenes/:name/activate

# docs/MCP_INTEGRATION.md
## Claude Desktop Setup
1. Install MCP server
2. Configure claude_desktop_config.json
3. Available commands

# docs/DEVICE_SETUP.md
## Supported Devices
### TP-Link Kasa
### Tuya Devices
### Generic WiFi Devices
```

### Step 13: Implement Scene Management
**Goal**: Create predefined lighting scenes

#### Scene Configuration:
```typescript
// data/scenes.json
{
  "scenes": {
    "work": {
      "name": "Work Mode",
      "devices": {
        "desk-lamp": {
          "power": "on",
          "brightness": 100,
          "color": { "r": 255, "g": 255, "b": 255 }
        },
        "office-light": {
          "power": "on",
          "brightness": 80
        }
      }
    },
    "relax": {
      "name": "Relax Mode",
      "devices": {
        "living-room": {
          "power": "on",
          "brightness": 40,
          "color": { "r": 255, "g": 200, "b": 100 }
        }
      }
    },
    "build-success": {
      "name": "Build Success",
      "devices": {
        "desk-lamp": {
          "power": "on",
          "color": { "r": 0, "g": 255, "b": 0 }
        }
      }
    },
    "build-failure": {
      "name": "Build Failure",
      "devices": {
        "desk-lamp": {
          "power": "on",
          "color": { "r": 255, "g": 0, "b": 0 }
        }
      }
    }
  }
}
```

---

## 🔒 Phase 7: Security & Deployment (Day 13-14)

### Step 14: Add Security & Authentication
**Goal**: Secure the API and MCP server

#### Implementation:
```typescript
// packages/smart-home-api/src/middleware/auth.ts
export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token || token !== process.env.API_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}

// Apply to routes
app.use('/api', authMiddleware);
```

### Step 15: Create Docker Deployment
**Goal**: Containerize for easy deployment

#### Docker Configuration:
```dockerfile
# docker/Dockerfile.api
FROM node:18-alpine
WORKDIR /app
COPY packages/smart-home-api/package*.json ./
RUN npm ci --only=production
COPY packages/smart-home-api/dist ./dist
EXPOSE 3001
CMD ["node", "dist/app.js"]

# docker/Dockerfile.mcp
FROM node:18-alpine
WORKDIR /app
COPY packages/mcp-server/package*.json ./
RUN npm ci --only=production
COPY packages/mcp-server/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.api
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
    environment:
      - API_TOKEN=${API_TOKEN}
    network_mode: host

  mcp:
    build:
      context: .
      dockerfile: docker/Dockerfile.mcp
    ports:
      - "3000:3000"
    environment:
      - API_URL=http://api:3001
      - API_TOKEN=${API_TOKEN}
    depends_on:
      - api
```

---

## 🎯 Testing Checklist

### Local Testing
- [ ] Device discovery finds all devices
- [ ] Can control Kasa device on/off
- [ ] Can control Tuya device on/off
- [ ] Brightness control works
- [ ] Color control works
- [ ] REST API responds correctly
- [ ] MCP server accepts connections
- [ ] Claude Desktop can use MCP tools

### Integration Testing
- [ ] Cross-network communication works
- [ ] Cloudflare tunnel accessible
- [ ] N8N workflow triggers
- [ ] Authentication blocks unauthorized access
- [ ] Scene activation works
- [ ] Multiple devices respond simultaneously

### Production Testing
- [ ] Docker containers run correctly
- [ ] Persistent data survives restarts
- [ ] Error handling prevents crashes
- [ ] Logging captures important events
- [ ] Performance acceptable with all devices

---

## 🚨 Troubleshooting Guide

### Common Issues

**Issue**: Can't discover devices on guest network
**Solution**: Check firewall rules, try running discovery from guest network

**Issue**: Kasa device not responding
**Solution**: Ensure port 9999 is accessible, check encryption implementation

**Issue**: Tuya device requires cloud
**Solution**: Use tuya-cli to get local keys, ensure device in LAN mode

**Issue**: MCP server not connecting
**Solution**: Check claude_desktop_config.json path, verify server is running

**Issue**: Cloudflare tunnel offline
**Solution**: Check tunnel status with `cloudflared tunnel info`, restart service

---

## 📚 Resources & References

### Documentation
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
- [TP-Link Kasa Protocol](https://github.com/softScheck/tplink-smartplug)
- [Tuya Local API](https://github.com/codetheweb/tuyapi)
- [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps)

### Example Repositories
- [MCP Server Examples](https://github.com/modelcontextprotocol/servers)
- [Smart Home Projects](https://github.com/topics/smart-home)

### Tools
- Network Scanner: `nmap`
- Packet Analysis: `wireshark`
- API Testing: `postman` or `insomnia`
- MCP Testing: Claude Desktop

---

## 🎉 Success Criteria

You'll know the project is successful when:

1. **Basic Control**: You can turn lights on/off via API
2. **LLM Integration**: Claude can control your lights
3. **Automation**: N8N workflows change lights automatically
4. **Discovery**: New devices are found automatically
5. **Reliability**: System recovers from network issues
6. **Documentation**: Others could deploy your solution

---

## 📅 Daily Progress Tracker

### Day 1-2: Foundation
- [ ] Network scan complete
- [ ] Device inventory created
- [ ] Project structure setup
- [ ] First device controlled manually

### Day 3-4: Protocols
- [ ] Kasa control working
- [ ] Tuya control working
- [ ] Device registry functional

### Day 5-6: APIs
- [ ] REST API running
- [ ] MCP server running
- [ ] Basic tools working

### Day 7-8: Network
- [ ] Cross-network access solved
- [ ] Discovery tools built
- [ ] All devices mapped

### Day 9-10: Integration
- [ ] Cloudflare tunnel active
- [ ] N8N workflow created
- [ ] External access working

### Day 11-12: Polish
- [ ] Documentation complete
- [ ] Scenes configured
- [ ] Testing complete

### Day 13-14: Production
- [ ] Security implemented
- [ ] Docker deployment ready
- [ ] Production testing done

---

**Remember**: Start small, test often, and iterate. The goal is learning and building something useful, not perfection!