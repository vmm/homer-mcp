# Smart Home Automation System - Development Spec

## 🎯 Project Overview
Build a **modular smart home automation system** that bridges IoT devices with AI agents via Model Context Protocol (MCP). Designed as a monorepo for development efficiency, but structured for easy splitting into multiple GitHub repos later.

## 🏗️ Architecture

```
GitHub/n8n → Cloudflare Tunnel → Raspberry Pi → IoT Network (Smart Devices)
              ↓
          MCP Server ← → Smart Home API ← → Device Controllers
```

## 📁 Monorepo Structure

```
smart-home-automation/
├── README.md (system overview)
├── docker-compose.yml (full stack)
├── packages/
│   ├── smart-home-core/        # → Future: smart-home-api repo
│   │   ├── package.json & README.md (standalone)
│   │   ├── Dockerfile & docker-compose.yml
│   │   └── src/
│   │       ├── controllers/ (device APIs)
│   │       ├── devices/ (kasa.ts, tuya.ts, hue.ts)
│   │       └── app.ts (Express server)
│   ├── smart-home-mcp/         # → Future: smart-home-mcp repo
│   │   ├── package.json & README.md (standalone)
│   │   ├── Dockerfile & docker-compose.yml
│   │   └── src/
│   │       ├── tools/ (lighting.ts, scenes.ts, alerts.ts)
│   │       └── server.ts (MCP server)
│   ├── smart-home-dashboard/   # → Future: smart-home-dashboard repo
│   │   └── src/ (React app for manual control)
│   └── shared-types/           # → Future: @yourname/smart-home-types npm
│       └── src/ (TypeScript interfaces)
├── tools/
│   └── split-repos.sh (automated repo splitting)
└── examples/
    ├── n8n-workflows/
    └── claude-config/
```

## 🔧 Technology Stack

- **Languages**: TypeScript/Node.js
- **Deployment**: Docker + Docker Compose
- **Networking**: Cloudflare Tunnel (Pi → Internet)
- **Hardware**: Raspberry Pi (any version)
- **Devices**: TP-Link Kasa, Tuya-based smart lights/plugs
- **AI Integration**: Model Context Protocol (MCP)

## 🚀 Development Phases

### **Phase 1: Core Infrastructure** (Weekend 1)
1. **Setup Raspberry Pi** with fresh OS + Docker
2. **Build smart-home-core** package:
   - Express.js server on port 3001
   - Device discovery and control
   - REST API endpoints: `/api/lights/:id/color`, `/api/scenes/:name`
3. **Test device control** with direct HTTP calls
4. **Docker deployment** working locally

### **Phase 2: MCP Integration** (Weekend 2)
1. **Build smart-home-mcp** package:
   - MCP server on port 3000
   - Tools: `setBuildStatus()`, `createFocusEnvironment()`, `flashAlert()`
   - Wraps smart-home-core API calls
2. **Test with Claude Desktop** locally
3. **Setup Cloudflare Tunnel** for external access
4. **n8n integration** via MCP Client Tool node

### **Phase 3: Automation & Polish** (Weekend 3)
1. **GitHub webhook workflows** in n8n
2. **Web dashboard** for manual control
3. **Documentation** and demos
4. **Prepare for repo splitting**

## 🛠️ Key Implementation Details

### **Device Control Examples**
```typescript
// TP-Link Kasa
await fetch(`http://${ip}:9999`, { 
  method: 'POST', 
  body: kasaEncrypt(command) 
});

// Tuya devices  
const tuya = new TuyaDevice({ ip, id, key });
await tuya.set({ switch: true });
```

### **MCP Tools**
```typescript
export const tools = {
  setBuildStatus: async (status: 'success' | 'failure' | 'running') => {
    await fetch('http://localhost:3001/api/scenes/build-status', {
      method: 'POST',
      body: JSON.stringify({ status })
    });
  }
};
```

### **n8n Integration**
```
GitHub Webhook → Parse Build Status → MCP Client Tool → Lights Change Color
```

## 🔄 Future Repo Split Strategy

**Target GitHub repos after splitting:**
1. **smart-home-api** - Device control server
2. **smart-home-mcp** - AI integration layer  
3. **smart-home-dashboard** - Web interface
4. **smart-home-examples** - Workflows & configs
5. **@yourname/smart-home-types** - NPM package

**Split command**: `./tools/split-repos.sh` (automated with git subtree)

## 🌐 Networking Setup

### **Network Architecture**
- **Main Network**: Pi + NAS (192.168.1.x)
- **IoT Network**: Smart devices (192.168.50.x) 
- **Pi Bridge**: Connect both networks OR firewall rules

### **External Access**
- **Cloudflare Tunnel**: `smart-home.yourdomain.com` → Pi:3000
- **Security**: Optional Bearer token auth

## 📋 Prerequisites Checklist

- [ ] Raspberry Pi (any version) with network access
- [ ] Smart devices (TP-Link Kasa or Tuya-based)
- [ ] Device IPs identified on IoT network  
- [ ] Docker installed on Pi
- [ ] Cloudflare account (free tier)
- [ ] n8n instance running (Hostinger)

## 🎨 Portfolio Value

**Demonstrates:**
- Microservices architecture
- IoT device integration  
- AI tooling (MCP) knowledge
- Docker containerization
- Network security awareness
- Modern TypeScript development
- API design (REST + MCP)

## 🚀 Getting Started Tonight

1. **Flash Pi with latest Raspberry Pi OS**
2. **Install Docker**: `curl -fsSL https://get.docker.com | sh`
3. **Clone/create monorepo structure**
4. **Start with device discovery**: Scan network, identify device IPs
5. **Build basic Express server** for device control
6. **Test with one light** using direct API calls

**Success criteria for tonight**: Turn one smart light on/off via HTTP API call to your Pi.

---

**Time Estimate**: 2-3 weekends for full system, 2-4 hours tonight for basic proof of concept.

**Immediate next step**: Get Pi online and scan for your smart device IPs!