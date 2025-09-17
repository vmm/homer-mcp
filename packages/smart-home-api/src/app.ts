import express from 'express';
import { DeviceRegistry } from './services/device-registry.js';
import { KasaDevice } from './devices/kasa.js';
import { Device, DeviceControlRequest, ApiResponse } from '../../shared/src/types.js';

const app = express();
app.use(express.json());

// Initialize device registry
const registry = new DeviceRegistry();

// CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Helper function to create API response
function createResponse<T>(success: boolean, data?: T, error?: string): ApiResponse<T> {
  return {
    success,
    data,
    error,
    timestamp: new Date().toISOString()
  };
}

// Helper function to get device controller
function getDeviceController(device: Device) {
  switch (device.brand) {
    case 'kasa':
      return new KasaDevice(device.ip);
    case 'tuya':
      // TODO: Implement Tuya controller
      throw new Error('Tuya devices not yet supported');
    default:
      throw new Error(`Unsupported device brand: ${device.brand}`);
  }
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json(createResponse(true, { status: 'healthy', timestamp: new Date().toISOString() }));
});

// Get all devices
app.get('/api/devices', async (req, res) => {
  try {
    const { room, type, brand, online } = req.query;
    let devices = registry.getAllDevices();

    // Apply filters
    if (room) {
      devices = devices.filter(d => d.room?.toLowerCase() === (room as string).toLowerCase());
    }
    if (type) {
      devices = devices.filter(d => d.type === type);
    }
    if (brand) {
      devices = devices.filter(d => d.brand === brand);
    }
    if (online !== undefined) {
      const isOnline = online === 'true';
      devices = devices.filter(d => d.online === isOnline);
    }

    res.json(createResponse(true, devices));
  } catch (error) {
    res.status(500).json(createResponse(false, undefined, error instanceof Error ? error.message : String(error)));
  }
});

// Get device by ID
app.get('/api/devices/:id', async (req, res) => {
  try {
    const device = registry.getDevice(req.params.id);
    if (!device) {
      return res.status(404).json(createResponse(false, undefined, 'Device not found'));
    }

    // Try to get current state
    try {
      const controller = getDeviceController(device);
      const state = await controller.getState();
      device.state = state;
      device.online = true;
      registry.updateDevice(device.id, { state, online: true });
    } catch {
      device.online = false;
      registry.setDeviceOnlineStatus(device.id, false);
    }

    res.json(createResponse(true, device));
  } catch (error) {
    res.status(500).json(createResponse(false, undefined, error instanceof Error ? error.message : String(error)));
  }
});

// Search devices
app.get('/api/devices/search/:query', async (req, res) => {
  try {
    const devices = registry.searchDevices(req.params.query);
    res.json(createResponse(true, devices));
  } catch (error) {
    res.status(500).json(createResponse(false, undefined, error instanceof Error ? error.message : String(error)));
  }
});

// Control device
app.post('/api/devices/:id/control', async (req, res) => {
  try {
    const device = registry.getDevice(req.params.id);
    if (!device) {
      return res.status(404).json(createResponse(false, undefined, 'Device not found'));
    }

    const controlRequest: DeviceControlRequest = req.body;
    const controller = getDeviceController(device);

    // Execute control command
    await controller.control(controlRequest);

    // Get updated state
    const state = await controller.getState();
    registry.updateDeviceState(device.id, state);
    registry.setDeviceOnlineStatus(device.id, true);

    res.json(createResponse(true, { 
      device: device.name, 
      action: controlRequest.action,
      state 
    }));
  } catch (error) {
    registry.setDeviceOnlineStatus(req.params.id, false);
    res.status(500).json(createResponse(false, undefined, error instanceof Error ? error.message : String(error)));
  }
});

// Set device power
app.post('/api/devices/:id/power', async (req, res) => {
  try {
    const device = registry.getDevice(req.params.id);
    if (!device) {
      return res.status(404).json(createResponse(false, undefined, 'Device not found'));
    }

    const { state } = req.body;
    if (!state || !['on', 'off'].includes(state)) {
      return res.status(400).json(createResponse(false, undefined, 'State must be "on" or "off"'));
    }

    const controller = getDeviceController(device);
    
    if (state === 'on') {
      await controller.turnOn();
    } else {
      await controller.turnOff();
    }

    const currentState = await controller.getState();
    registry.updateDeviceState(device.id, currentState);
    registry.setDeviceOnlineStatus(device.id, true);

    res.json(createResponse(true, { 
      device: device.name, 
      state,
      currentState 
    }));
  } catch (error) {
    registry.setDeviceOnlineStatus(req.params.id, false);
    res.status(500).json(createResponse(false, undefined, error instanceof Error ? error.message : String(error)));
  }
});

// Set device brightness
app.post('/api/devices/:id/brightness', async (req, res) => {
  try {
    const device = registry.getDevice(req.params.id);
    if (!device) {
      return res.status(404).json(createResponse(false, undefined, 'Device not found'));
    }

    if (!device.capabilities.includes('brightness')) {
      return res.status(400).json(createResponse(false, undefined, 'Device does not support brightness control'));
    }

    const { level } = req.body;
    if (typeof level !== 'number' || level < 0 || level > 100) {
      return res.status(400).json(createResponse(false, undefined, 'Brightness level must be between 0 and 100'));
    }

    const controller = getDeviceController(device);
    await controller.setBrightness(level);

    const currentState = await controller.getState();
    registry.updateDeviceState(device.id, currentState);
    registry.setDeviceOnlineStatus(device.id, true);

    res.json(createResponse(true, { 
      device: device.name, 
      brightness: level,
      currentState 
    }));
  } catch (error) {
    registry.setDeviceOnlineStatus(req.params.id, false);
    res.status(500).json(createResponse(false, undefined, error instanceof Error ? error.message : String(error)));
  }
});

// Set device color
app.post('/api/devices/:id/color', async (req, res) => {
  try {
    const device = registry.getDevice(req.params.id);
    if (!device) {
      return res.status(404).json(createResponse(false, undefined, 'Device not found'));
    }

    if (!device.capabilities.includes('color')) {
      return res.status(400).json(createResponse(false, undefined, 'Device does not support color control'));
    }

    const { r, g, b, brightness } = req.body;
    if (typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number' ||
        r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
      return res.status(400).json(createResponse(false, undefined, 'RGB values must be between 0 and 255'));
    }

    if (brightness !== undefined && (typeof brightness !== 'number' || brightness < 0 || brightness > 100)) {
      return res.status(400).json(createResponse(false, undefined, 'Brightness must be between 0 and 100'));
    }

    const controller = getDeviceController(device);
    await controller.setRGBColor(r, g, b, brightness);

    const currentState = await controller.getState();
    registry.updateDeviceState(device.id, currentState);
    registry.setDeviceOnlineStatus(device.id, true);

    res.json(createResponse(true, { 
      device: device.name, 
      color: { r, g, b },
      brightness,
      currentState 
    }));
  } catch (error) {
    registry.setDeviceOnlineStatus(req.params.id, false);
    res.status(500).json(createResponse(false, undefined, error instanceof Error ? error.message : String(error)));
  }
});

// Get registry statistics
app.get('/api/registry/stats', (req, res) => {
  try {
    const stats = registry.getStats();
    res.json(createResponse(true, stats));
  } catch (error) {
    res.status(500).json(createResponse(false, undefined, error instanceof Error ? error.message : String(error)));
  }
});

// Discovery endpoints (placeholder for now)
app.post('/api/discovery/scan', async (req, res) => {
  // TODO: Implement network scanning
  res.json(createResponse(true, { 
    message: 'Network scanning not yet implemented',
    count: 0,
    devices: []
  }));
});

// Scene endpoints (placeholder for now)
app.get('/api/scenes', (req, res) => {
  res.json(createResponse(true, [
    { id: 'work', name: 'Work Mode', description: 'Bright white lighting for productivity' },
    { id: 'relax', name: 'Relax Mode', description: 'Warm dim lighting for relaxation' },
    { id: 'movie', name: 'Movie Mode', description: 'Dark ambient lighting' },
    { id: 'party', name: 'Party Mode', description: 'Colorful dynamic lighting' }
  ]));
});

app.post('/api/scenes/:name/activate', (req, res) => {
  // TODO: Implement scene activation
  res.json(createResponse(true, { 
    scene: req.params.name,
    message: 'Scene activation not yet implemented'
  }));
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json(createResponse(false, undefined, 'Internal server error'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json(createResponse(false, undefined, 'Endpoint not found'));
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🏠 Smart Home API server running on port ${PORT}`);
  console.log(`📊 Loaded ${registry.getAllDevices().length} devices from registry`);
  console.log(`🔗 API available at http://localhost:${PORT}`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
});

export default app;