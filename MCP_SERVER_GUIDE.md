# MCP Server Implementation Guide for Smart Home Control

## 📦 MCP Server Structure

Based on the official MCP guidelines, here's how we'll structure your smart home MCP server:

```
/Users/veli/Documents/Cline/MCP/smart-home-mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # Main MCP server
│   ├── types/
│   │   └── device.ts      # Device type definitions
│   ├── services/
│   │   ├── api-client.ts  # REST API client
│   │   └── registry.ts    # Device registry client
│   └── tools/
│       ├── lighting.ts    # Light control tools
│       ├── scenes.ts      # Scene management tools
│       └── discovery.ts   # Device discovery tools
└── build/
    └── index.js           # Compiled output
```

## 🚀 Step-by-Step MCP Server Creation

### Step 1: Bootstrap the MCP Server

```bash
# Create MCP server in the standard location
cd /Users/veli/Documents/Cline/MCP
npx @modelcontextprotocol/create-server smart-home-mcp
cd smart-home-mcp

# Install dependencies
npm install axios zod @modelcontextprotocol/sdk
npm install -D @types/node typescript
```

### Step 2: Core MCP Server Implementation

```typescript
// src/index.ts
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from 'axios';

// Configuration from environment
const API_URL = process.env.SMART_HOME_API_URL || 'http://localhost:3001';
const API_TOKEN = process.env.SMART_HOME_API_TOKEN;

// Create axios instance for API calls
const api = axios.create({
  baseURL: API_URL,
  headers: API_TOKEN ? { 'Authorization': `Bearer ${API_TOKEN}` } : {},
  timeout: 5000
});

// Create MCP server
const server = new McpServer({
  name: "smart-home-controller",
  version: "1.0.0"
});

// Tool: Control Light
server.tool(
  "control_light",
  {
    device: z.string().describe("Device name or ID (e.g., 'desk-lamp', 'living-room-light')"),
    action: z.enum(['on', 'off', 'toggle']).describe("Power action to perform"),
    brightness: z.number().min(0).max(100).optional().describe("Brightness level (0-100)"),
    color: z.object({
      r: z.number().min(0).max(255).describe("Red value (0-255)"),
      g: z.number().min(0).max(255).describe("Green value (0-255)"),
      b: z.number().min(0).max(255).describe("Blue value (0-255)")
    }).optional().describe("RGB color values")
  },
  async ({ device, action, brightness, color }) => {
    try {
      // Handle power state
      if (action === 'on' || action === 'off') {
        await api.post(`/api/devices/${device}/power`, { state: action });
      } else if (action === 'toggle') {
        // Get current state first
        const { data: deviceData } = await api.get(`/api/devices/${device}`);
        const newState = deviceData.state === 'on' ? 'off' : 'on';
        await api.post(`/api/devices/${device}/power`, { state: newState });
      }

      // Handle brightness if provided
      if (brightness !== undefined && action === 'on') {
        await api.post(`/api/devices/${device}/brightness`, { level: brightness });
      }

      // Handle color if provided
      if (color && action === 'on') {
        await api.post(`/api/devices/${device}/color`, color);
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully ${action === 'toggle' ? 'toggled' : `turned ${action}`} ${device}${
              brightness ? ` at ${brightness}% brightness` : ''
            }${color ? ` with color RGB(${color.r}, ${color.g}, ${color.b})` : ''}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to control ${device}: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Set Scene
server.tool(
  "set_scene",
  {
    scene: z.string().describe("Scene name (e.g., 'work', 'relax', 'movie', 'sleep', 'party', 'build-success', 'build-failure')"),
    transition: z.number().min(0).max(10).optional().describe("Transition time in seconds")
  },
  async ({ scene, transition }) => {
    try {
      const response = await api.post(`/api/scenes/${scene}/activate`, { 
        transition: transition || 0 
      });

      return {
        content: [
          {
            type: "text",
            text: `Scene '${scene}' activated successfully${transition ? ` with ${transition}s transition` : ''}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to activate scene '${scene}': ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: List Devices
server.tool(
  "list_devices",
  {
    room: z.string().optional().describe("Filter by room (e.g., 'office', 'living_room', 'kitchen')"),
    type: z.enum(['light', 'plug', 'switch']).optional().describe("Filter by device type"),
    online: z.boolean().optional().describe("Filter by online status")
  },
  async ({ room, type, online }) => {
    try {
      const { data: devices } = await api.get('/api/devices', {
        params: { room, type, online }
      });

      const deviceList = devices.map(d => ({
        name: d.name,
        id: d.id,
        type: d.type,
        room: d.room,
        online: d.online,
        state: d.state,
        capabilities: d.capabilities
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(deviceList, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to list devices: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Get Device Status
server.tool(
  "get_device_status",
  {
    device: z.string().describe("Device name or ID")
  },
  async ({ device }) => {
    try {
      const { data } = await api.get(`/api/devices/${device}`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: data.name,
              type: data.type,
              state: data.state,
              online: data.online,
              brightness: data.brightness,
              color: data.color,
              room: data.room,
              lastSeen: data.lastSeen
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to get status for ${device}: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Flash Alert
server.tool(
  "flash_alert",
  {
    devices: z.array(z.string()).optional().describe("Device names to flash (defaults to all lights)"),
    color: z.object({
      r: z.number().min(0).max(255),
      g: z.number().min(0).max(255),
      b: z.number().min(0).max(255)
    }).describe("Alert color"),
    duration: z.number().min(1).max(10).describe("Flash duration in seconds"),
    count: z.number().min(1).max(5).optional().describe("Number of flashes (default: 3)")
  },
  async ({ devices, color, duration, count = 3 }) => {
    try {
      const response = await api.post('/api/alerts/flash', {
        devices,
        color,
        duration,
        count
      });

      return {
        content: [
          {
            type: "text",
            text: `Alert flashed ${count} times for ${duration} seconds on ${devices?.join(', ') || 'all lights'}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to flash alert: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Discover Devices
server.tool(
  "discover_devices",
  {
    network: z.enum(['main', 'guest', 'all']).optional().describe("Network to scan (default: 'guest')"),
    protocol: z.enum(['kasa', 'tuya', 'all']).optional().describe("Protocol to test (default: 'all')")
  },
  async ({ network = 'guest', protocol = 'all' }) => {
    try {
      const { data } = await api.post('/api/discovery/scan', {
        network,
        protocol
      });

      return {
        content: [
          {
            type: "text",
            text: `Discovery found ${data.count} devices:\n${JSON.stringify(data.devices, null, 2)}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to discover devices: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Create Custom Scene
server.tool(
  "create_scene",
  {
    name: z.string().describe("Scene name"),
    description: z.string().optional().describe("Scene description"),
    devices: z.array(z.object({
      device: z.string().describe("Device name or ID"),
      state: z.enum(['on', 'off']),
      brightness: z.number().min(0).max(100).optional(),
      color: z.object({
        r: z.number().min(0).max(255),
        g: z.number().min(0).max(255),
        b: z.number().min(0).max(255)
      }).optional()
    })).describe("Device states for this scene")
  },
  async ({ name, description, devices }) => {
    try {
      const response = await api.post('/api/scenes', {
        name,
        description,
        devices
      });

      return {
        content: [
          {
            type: "text",
            text: `Scene '${name}' created successfully with ${devices.length} device configurations`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to create scene '${name}': ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Set Build Status (for CI/CD integration)
server.tool(
  "set_build_status",
  {
    status: z.enum(['running', 'success', 'failure', 'warning']).describe("Build status"),
    project: z.string().optional().describe("Project name for context"),
    message: z.string().optional().describe("Status message to display")
  },
  async ({ status, project, message }) => {
    try {
      // Map status to colors and patterns
      const statusConfig = {
        running: { color: { r: 255, g: 200, b: 0 }, pattern: 'pulse' },
        success: { color: { r: 0, g: 255, b: 0 }, pattern: 'solid' },
        failure: { color: { r: 255, g: 0, b: 0 }, pattern: 'flash' },
        warning: { color: { r: 255, g: 150, b: 0 }, pattern: 'pulse' }
      };

      const config = statusConfig[status];
      
      // Activate the build status scene
      await api.post('/api/scenes/build-status/activate', {
        ...config,
        project,
        message
      });

      return {
        content: [
          {
            type: "text",
            text: `Build status set to '${status}'${project ? ` for ${project}` : ''}${message ? `: ${message}` : ''}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to set build status: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Start the MCP server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Smart Home MCP server running on stdio');
```

### Step 3: Build Configuration

```json
// package.json
{
  "name": "smart-home-mcp",
  "version": "1.0.0",
  "description": "MCP server for smart home device control",
  "type": "module",
  "main": "build/index.js",
  "scripts": {
    "build": "tsc && node -e \"require('fs').chmodSync('build/index.js', '755')\"",
    "dev": "tsx src/index.ts",
    "test": "SMART_HOME_API_URL=http://localhost:3001 npm run dev"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "axios": "^1.6.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "tsx": "^4.6.0",
    "typescript": "^5.3.0"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowJs": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "build"]
}
```

### Step 4: MCP Settings Configuration

Add to `/Users/veli/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json`:

```json
{
  "mcpServers": {
    "smart-home": {
      "command": "node",
      "args": ["/Users/veli/Documents/Cline/MCP/smart-home-mcp/build/index.js"],
      "env": {
        "SMART_HOME_API_URL": "http://localhost:3001",
        "SMART_HOME_API_TOKEN": "your-secure-token-here"
      },
      "disabled": false,
      "alwaysAllow": [],
      "disabledTools": []
    }
  }
}
```

For Claude Desktop integration, add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "smart-home": {
      "command": "node",
      "args": ["/Users/veli/Documents/Cline/MCP/smart-home-mcp/build/index.js"],
      "env": {
        "SMART_HOME_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

## 🧪 Testing the MCP Server

### Local Testing Script

```typescript
// test/test-server.ts
import { spawn } from 'child_process';

const server = spawn('node', ['build/index.js'], {
  env: {
    ...process.env,
    SMART_HOME_API_URL: 'http://localhost:3001'
  }
});

// Send test commands
const testCommands = [
  {
    jsonrpc: '2.0',
    method: 'tools/list',
    id: 1
  },
  {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'list_devices',
      arguments: {}
    },
    id: 2
  }
];

testCommands.forEach(cmd => {
  server.stdin.write(JSON.stringify(cmd) + '\n');
});

server.stdout.on('data', (data) => {
  console.log('Response:', data.toString());
});

server.stderr.on('data', (data) => {
  console.error('Server log:', data.toString());
});
```

## 🎯 Usage Examples

Once the MCP server is installed and running, you can use it with natural language commands:

### Basic Light Control
- "Turn on the desk lamp"
- "Turn off all lights in the living room"
- "Set the bedroom light to 50% brightness"
- "Change the office light to blue"

### Scene Management
- "Activate work mode"
- "Set the lights for movie time"
- "Create a party scene with colorful lights"

### Build Status Integration
- "Set build status to success"
- "Show build failure with red lights"
- "Flash yellow for warning status"

### Device Discovery
- "Discover all smart devices on the network"
- "List all online lights"
- "Show devices in the office"

## 🔧 Troubleshooting

### Common Issues and Solutions

1. **MCP server not connecting**
   - Check if the API server is running on port 3001
   - Verify the API_URL in environment variables
   - Ensure build output exists at the specified path

2. **Authentication errors**
   - Add API_TOKEN to environment variables
   - Check if token matches API server configuration

3. **Network communication issues**
   - Verify devices are on the correct network
   - Check firewall rules for cross-network access
   - Test with direct API calls first

4. **Tool execution failures**
   - Check API server logs for errors
   - Verify device names match registry
   - Ensure device protocols are implemented

## 🚀 Next Steps

1. **Extend Tools**: Add more sophisticated controls like:
   - Scheduling and timers
   - Motion-based automation
   - Energy monitoring
   - Group controls

2. **Add Resources**: Implement MCP resources for:
   - Device state monitoring
   - Energy usage data
   - Scene configurations

3. **Improve Error Handling**: Add retry logic and better error messages

4. **Add Logging**: Implement structured logging for debugging

5. **Performance Optimization**: Add caching for device states

## 📚 Additional Resources

- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
- [MCP Server Examples](https://github.com/modelcontextprotocol/servers)
- [Smart Home API Documentation](./API_REFERENCE.md)
- [Device Protocol Guide](./DEVICE_PROTOCOLS.md)