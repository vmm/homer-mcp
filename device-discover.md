**Exactly!** Google's fragmented UI is super annoying - they have all the info but split it across different screens. You're absolutely right to build a mapping layer.

## 🗺️ MAC Address Mapping Strategy

### **The Reality Check:**
```
Google Home App: "Desk Lamp" (no MAC) 😤
Google WiFi App: "68:C6:3A:12:34:56" (no name) 😤
Your Brain: These are the same device! 🤯
```

### **Your Solution:**
```typescript
// packages/smart-home-core/src/config/device-registry.ts
export const DEVICE_REGISTRY = {
  // MAC -> Device Info mapping
  '68:C6:3A:12:34:56': {
    name: 'Desk Lamp',
    type: 'light',
    brand: 'kasa',
    room: 'office',
    capabilities: ['brightness', 'color'],
    // Will be auto-discovered later
    ip: null, // Will be resolved dynamically
  },
  '84:0D:8E:45:67:89': {
    name: 'Kitchen Light', 
    type: 'light',
    brand: 'tuya',
    room: 'kitchen',
    capabilities: ['brightness'],
    ip: null,
  },
  'A0:F3:C1:98:76:54': {
    name: 'Living Room Plug',
    type: 'plug', 
    brand: 'kasa',
    room: 'living_room',
    capabilities: ['power'],
    ip: null,
  }
};
```

## 🔍 Discovery + Mapping Integration

### **Smart Device Resolution:**
```typescript
// packages/smart-home-core/src/services/device-resolver.ts
export class DeviceResolver {
  async resolveDevices(): Promise<ResolvedDevice[]> {
    // 1. Scan network for IP -> MAC mapping
    const networkMap = await this.scanNetworkForMACs();
    
    // 2. Cross-reference with our registry
    const resolvedDevices = [];
    
    for (const [mac, deviceInfo] of Object.entries(DEVICE_REGISTRY)) {
      const networkEntry = networkMap.find(n => n.mac === mac);
      
      if (networkEntry) {
        resolvedDevices.push({
          ...deviceInfo,
          mac,
          ip: networkEntry.ip,
          online: true,
          lastSeen: networkEntry.lastSeen
        });
      } else {
        resolvedDevices.push({
          ...deviceInfo,
          mac,
          ip: null,
          online: false,
          lastSeen: null
        });
      }
    }
    
    return resolvedDevices;
  }
  
  private async scanNetworkForMACs(): Promise<NetworkEntry[]> {
    // Method 1: ARP table scan
    return await this.scanARPTable();
  }
  
  private async scanARPTable(): Promise<NetworkEntry[]> {
    return new Promise((resolve) => {
      exec('arp -a', (error, stdout) => {
        if (error) return resolve([]);
        
        const entries = stdout.split('\n')
          .map(line => {
            // Parse: "device-name (192.168.50.101) at 68:c6:3a:12:34:56 on en0"
            const match = line.match(/\(([0-9.]+)\) at ([0-9a-f:]{17})/i);
            return match ? {
              ip: match[1],
              mac: match[2].toUpperCase(),
              lastSeen: new Date()
            } : null;
          })
          .filter(Boolean);
        
        resolve(entries);
      });
    });
  }
}
```

## 🛠️ Practical Setup Process

### **Tonight's MAC Discovery Session:**
```bash
# 1. Scan your IoT network for active devices
nmap -sn 192.168.50.0/24

# 2. Get ARP table (IP to MAC mapping)  
arp -a | grep "192.168.50"

# 3. Alternative: More detailed scan
nmap -sn 192.168.50.0/24 && arp -a
```

### **Device Identification Process:**
1. **Run network scan** - get all IP/MAC pairs
2. **Unplug one device** (e.g., desk lamp)  
3. **Run scan again** - see which MAC disappeared
4. **Record**: "68:C6:3A:12:34:56 = Desk Lamp"
5. **Repeat** for each device

### **Your Device Registry Builder:**
```typescript
// Helper script to build your registry
// packages/tools/build-device-registry.ts
async function buildRegistry() {
  console.log('🔍 Starting device identification wizard...\n');
  
  const registry = {};
  const knownDevices = [
    'Desk Lamp', 'Kitchen Light', 'Living Room Plug', 
    'Bedroom Light', 'Office Fan'
  ];
  
  for (const deviceName of knownDevices) {
    console.log(`📱 Please ensure "${deviceName}" is ON and connected`);
    console.log('Press Enter when ready...');
    await waitForEnter();
    
    const beforeScan = await scanNetwork();
    
    console.log(`🔌 Now UNPLUG "${deviceName}"`);
    console.log('Press Enter after unplugging...');
    await waitForEnter();
    
    await sleep(5000); // Wait for device to go offline
    const afterScan = await scanNetwork();
    
    // Find the missing MAC
    const missingDevice = beforeScan.find(b => 
      !afterScan.find(a => a.mac === b.mac)
    );
    
    if (missingDevice) {
      registry[missingDevice.mac] = {
        name: deviceName,
        ip: missingDevice.ip,
        // Guess device type from name
        type: deviceName.toLowerCase().includes('light') ? 'light' : 'plug'
      };
      console.log(`✅ ${deviceName} = ${missingDevice.mac}\n`);
    } else {
      console.log(`❌ Could not identify ${deviceName}\n`);
    }
    
    console.log(`🔌 Please plug "${deviceName}" back in`);
    await waitForEnter();
  }
  
  // Output TypeScript registry
  console.log('\n🎉 Your device registry:');
  console.log(JSON.stringify(registry, null, 2));
}
```

## 🎯 API Integration

### **Clean Device API:**
```typescript
// Your API becomes much cleaner
app.get('/api/devices', async (req, res) => {
  const devices = await deviceResolver.resolveDevices();
  res.json(devices);
});

app.post('/api/devices/:deviceName/control', async (req, res) => {
  // Find device by human name
  const device = await deviceResolver.findByName(req.params.deviceName);
  if (!device || !device.online) {
    return res.status(404).json({ error: 'Device not found or offline' });
  }
  
  // Control using the resolved IP
  const result = await deviceController.control(device.ip, req.body);
  res.json(result);
});
```

### **MCP Tools with Human Names:**
```typescript
export const tools = {
  controlDevice: async (deviceName: string, action: any) => {
    const response = await fetch(`${API_URL}/api/devices/${deviceName}/control`, {
      method: 'POST',
      body: JSON.stringify(action)
    });
    return await response.json();
  },
  
  setBuildStatus: async (status: string) => {
    // Use human-readable device names
    await controlDevice('Desk Lamp', { 
      color: status === 'failure' ? 'red' : 'green' 
    });
  }
};
```

## 🚀 Tonight's Plan

1. **Run network scan** to get baseline MAC addresses
2. **Start with manual registry** - hardcode 2-3 devices
3. **Build device resolver** that maps MAC → IP dynamically
4. **Test with mock devices** first
5. **Build the identification wizard** as a fun weekend project

**The beauty:** Once you have the MAC registry, device IPs can change and your system will still find them! Much more robust than hardcoded IPs.