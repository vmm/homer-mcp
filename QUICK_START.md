# 🚀 Quick Start Guide - Smart Home MCP Server

## Prerequisites Checklist
- [ ] MacBook for development
- [ ] Node.js v18+ installed
- [ ] 5-10 smart devices on guest network (192.168.87.x)
- [ ] Access to Google WiFi router settings
- [ ] VS Code with Cline extension
- [ ] N8N instance on VPS (for later integration)

## 🎯 Tonight's Goal
Get one smart light responding to HTTP commands from your MacBook.

## Step 1: Network Discovery (15 minutes)

```bash
# 1. Install network tools
brew install nmap

# 2. Scan your guest network for devices
nmap -sn 192.168.87.0/24

# 3. Get MAC addresses
arp -a | grep "192.168.87"

# 4. Save the output to a file
echo "# My Smart Devices" > device-inventory.txt
arp -a | grep "192.168.87" >> device-inventory.txt
```

## Step 2: Initialize Project (10 minutes)

```bash
# Create project directory
mkdir -p ~/code/automation/home-automation
cd ~/code/automation/home-automation

# Initialize with package structure
npm init -y
mkdir -p packages/{smart-home-api,mcp-server,shared}/src
mkdir -p data scripts docs examples

# Install base dependencies
npm install -D typescript @types/node tsx nodemon
npm install express dotenv axios zod

# Initialize TypeScript
npx tsc --init
```

## Step 3: Test TP-Link Kasa Device (20 minutes)

Create a test script to verify you can control a Kasa device:

```typescript
// scripts/test-kasa.ts
import net from 'net';

// Kasa encryption/decryption
function encrypt(buffer: string): Buffer {
  let key = 171;
  const result = Buffer.alloc(buffer.length);
  
  for (let i = 0; i < buffer.length; i++) {
    const encrypted = buffer.charCodeAt(i) ^ key;
    key = encrypted;
    result[i] = encrypted;
  }
  
  return result;
}

function decrypt(buffer: Buffer): string {
  let key = 171;
  let result = '';
  
  for (let i = 0; i < buffer.length; i++) {
    const decrypted = buffer[i] ^ key;
    key = buffer[i];
    result += String.fromCharCode(decrypted);
  }
  
  return result;
}

// Test turning on a Kasa device
async function testKasaDevice(ip: string) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    
    // Command to turn on
    const command = JSON.stringify({
      'system': { 'set_relay_state': { 'state': 1 } }
    });
    
    client.connect(9999, ip, () => {
      console.log(`Connected to ${ip}`);
      client.write(encrypt(command));
    });
    
    client.on('data', (data) => {
      const response = decrypt(data);
      console.log('Response:', response);
      client.destroy();
      resolve(response);
    });
    
    client.on('error', (err) => {
      console.error('Error:', err.message);
      reject(err);
    });
  });
}

// Replace with your device IP
const DEVICE_IP = '192.168.87.XX';  // <-- PUT YOUR DEVICE IP HERE

console.log('Testing Kasa device at', DEVICE_IP);
testKasaDevice(DEVICE_IP)
  .then(() => console.log('✅ Success!'))
  .catch(err => console.error('❌ Failed:', err.message));
```

Run it:
```bash
npx tsx scripts/test-kasa.ts
```

## Step 4: Create Device Registry (10 minutes)

```json
// data/device-registry.json
{
  "devices": [
    {
      "id": "desk-lamp",
      "mac": "XX:XX:XX:XX:XX:XX",
      "name": "Desk Lamp",
      "type": "light",
      "brand": "kasa",
      "ip": "192.168.87.XX",
      "capabilities": ["power", "brightness", "color"],
      "room": "office"
    },
    {
      "id": "living-room-plug",
      "mac": "YY:YY:YY:YY:YY:YY", 
      "name": "Living Room Plug",
      "type": "plug",
      "brand": "kasa",
      "ip": "192.168.87.YY",
      "capabilities": ["power"],
      "room": "living_room"
    }
  ]
}
```

## Step 5: Build Minimal API Server (30 minutes)

```typescript
// packages/smart-home-api/src/app.ts
import express from 'express';
import { readFileSync } from 'fs';
import net from 'net';

const app = express();
app.use(express.json());

// Load device registry
const registry = JSON.parse(
  readFileSync('./data/device-registry.json', 'utf8')
);

// Kasa helper functions
function kasaEncrypt(buffer: string): Buffer {
  let key = 171;
  const result = Buffer.alloc(buffer.length);
  
  for (let i = 0; i < buffer.length; i++) {
    const encrypted = buffer.charCodeAt(i) ^ key;
    key = encrypted;
    result[i] = encrypted;
  }
  
  return result;
}

// Send command to Kasa device
async function sendKasaCommand(ip: string, command: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const cmd = JSON.stringify(command);
    
    client.connect(9999, ip, () => {
      client.write(kasaEncrypt(cmd));
    });
    
    client.on('data', (data) => {
      client.destroy();
      resolve({ success: true });
    });
    
    client.on('error', reject);
    
    setTimeout(() => {
      client.destroy();
      reject(new Error('Timeout'));
    }, 3000);
  });
}

// API Endpoints
app.get('/api/devices', (req, res) => {
  res.json(registry.devices);
});

app.post('/api/devices/:id/power', async (req, res) => {
  const device = registry.devices.find(d => d.id === req.params.id);
  
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }
  
  const state = req.body.state === 'on' ? 1 : 0;
  
  try {
    if (device.brand === 'kasa') {
      await sendKasaCommand(device.ip, {
        'system': { 'set_relay_state': { 'state': state } }
      });
    }
    
    res.json({ success: true, device: device.name, state: req.body.state });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🏠 Smart Home API running on http://localhost:${PORT}`);
  console.log('📱 Devices loaded:', registry.devices.length);
});
```

Run the server:
```bash
npx tsx packages/smart-home-api/src/app.ts
```

## Step 6: Test the API (5 minutes)

```bash
# List devices
curl http://localhost:3001/api/devices

# Turn on desk lamp
curl -X POST http://localhost:3001/api/devices/desk-lamp/power \
  -H "Content-Type: application/json" \
  -d '{"state": "on"}'

# Turn off desk lamp  
curl -X POST http://localhost:3001/api/devices/desk-lamp/power \
  -H "Content-Type: application/json" \
  -d '{"state": "off"}'
```

## Step 7: Create MCP Server (20 minutes)

```bash
# Create MCP server
cd /Users/veli/Documents/Cline/MCP
npx @modelcontextprotocol/create-server smart-home-mcp
cd smart-home-mcp
npm install axios zod @modelcontextprotocol/sdk
```

Create minimal MCP server:

```typescript
// src/index.ts
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from 'axios';

const API_URL = process.env.SMART_HOME_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
  timeout: 5000
});

const server = new McpServer({
  name: "smart-home",
  version: "0.1.0"
});

// Simple light control tool
server.tool(
  "control_light",
  {
    device: z.string().describe("Device ID (e.g., 'desk-lamp')"),
    action: z.enum(['on', 'off']).describe("Turn light on or off")
  },
  async ({ device, action }) => {
    try {
      await api.post(`/api/devices/${device}/power`, { state: action });
      return {
        content: [{
          type: "text",
          text: `Turned ${action} ${device}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Failed: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Smart Home MCP server running');
```

Build and install:
```bash
npm run build

# Add to MCP settings (VS Code Cline)
# The system will auto-detect and configure
```

## 🎉 Success Checklist

If you've completed all steps, you should be able to:

- [ ] See your smart devices with `nmap` scan
- [ ] Control a Kasa device with the test script
- [ ] Turn devices on/off via HTTP API
- [ ] Use the MCP server to control lights from Claude/Cline

## 📝 Next Session Goals

1. **Add Tuya device support**
2. **Implement brightness and color control**
3. **Create lighting scenes**
4. **Setup device discovery automation**
5. **Configure N8N workflows**

## 🆘 Troubleshooting

### Can't find devices on network?
```bash
# Try pinging the subnet
ping -c 1 192.168.87.1
# Check if you can reach the guest network
```

### Kasa device not responding?
```bash
# Test with netcat
nc -zv 192.168.87.XX 9999
# Should show "Connection succeeded"
```

### API server can't reach devices?
- Check firewall settings
- Verify your MacBook can reach guest network
- Try running server with sudo (temporarily)

### MCP server not working?
- Check if API server is running
- Verify localhost:3001 is accessible
- Look at MCP logs in VS Code output

## 📚 Resources

- [TP-Link Kasa Protocol Docs](https://github.com/softScheck/tplink-smartplug)
- [Tuya Local Control](https://github.com/codetheweb/tuyapi)
- [MCP SDK](https://github.com/modelcontextprotocol/sdk)
- [Project Documentation](./PROJECT_PLAN.md)

---

**Time to complete: ~90 minutes**

**Remember**: The goal tonight is just to turn one light on/off programmatically. Everything else builds on this foundation!