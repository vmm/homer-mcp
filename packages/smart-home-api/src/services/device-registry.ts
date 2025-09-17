import { readFileSync, writeFileSync } from 'fs';
import { Device } from '../../../shared/src/types.js';

export class DeviceRegistry {
  private devices: Map<string, Device> = new Map();
  private registryPath: string;

  constructor(registryPath: string = './data/device-registry.json') {
    this.registryPath = registryPath;
    this.loadRegistry();
  }

  private loadRegistry(): void {
    try {
      const data = readFileSync(this.registryPath, 'utf8');
      const registry = JSON.parse(data);
      
      if (registry.devices && Array.isArray(registry.devices)) {
        for (const device of registry.devices) {
          this.devices.set(device.id, device);
        }
      }
      
      console.log(`Loaded ${this.devices.size} devices from registry`);
    } catch (error) {
      console.error('Failed to load device registry:', error instanceof Error ? error.message : String(error));
      console.log('Starting with empty registry');
    }
  }

  private saveRegistry(): void {
    try {
      const registry = {
        devices: Array.from(this.devices.values()),
        last_updated: new Date().toISOString(),
        notes: [
          "This registry contains both verified and discovered devices",
          "Verified devices have complete information from device queries",
          "Discovered devices need to be queried for full details"
        ]
      };
      
      writeFileSync(this.registryPath, JSON.stringify(registry, null, 2));
      console.log(`Saved ${this.devices.size} devices to registry`);
    } catch (error) {
      console.error('Failed to save device registry:', error instanceof Error ? error.message : String(error));
    }
  }

  // Get all devices
  getAllDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  // Get device by ID
  getDevice(id: string): Device | undefined {
    return this.devices.get(id);
  }

  // Get device by IP
  getDeviceByIP(ip: string): Device | undefined {
    return Array.from(this.devices.values()).find(device => device.ip === ip);
  }

  // Get device by name (fuzzy search)
  getDeviceByName(name: string): Device | undefined {
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    return Array.from(this.devices.values()).find(device => {
      const deviceName = device.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const deviceAlias = device.alias?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
      const deviceId = device.id.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      return deviceName.includes(normalizedName) || 
             deviceAlias.includes(normalizedName) ||
             deviceId.includes(normalizedName) ||
             normalizedName.includes(deviceName) ||
             normalizedName.includes(deviceAlias) ||
             normalizedName.includes(deviceId);
    });
  }

  // Get devices by room
  getDevicesByRoom(room: string): Device[] {
    return Array.from(this.devices.values()).filter(device => 
      device.room?.toLowerCase() === room.toLowerCase()
    );
  }

  // Get devices by type
  getDevicesByType(type: 'light' | 'plug' | 'switch'): Device[] {
    return Array.from(this.devices.values()).filter(device => device.type === type);
  }

  // Get devices by brand
  getDevicesByBrand(brand: 'kasa' | 'tuya' | 'unknown'): Device[] {
    return Array.from(this.devices.values()).filter(device => device.brand === brand);
  }

  // Get online devices only
  getOnlineDevices(): Device[] {
    return Array.from(this.devices.values()).filter(device => device.online !== false);
  }

  // Add or update device
  addDevice(device: Device): void {
    this.devices.set(device.id, {
      ...device,
      lastSeen: new Date()
    });
    this.saveRegistry();
  }

  // Update device
  updateDevice(id: string, updates: Partial<Device>): boolean {
    const device = this.devices.get(id);
    if (!device) {
      return false;
    }

    this.devices.set(id, {
      ...device,
      ...updates,
      lastSeen: new Date()
    });
    this.saveRegistry();
    return true;
  }

  // Remove device
  removeDevice(id: string): boolean {
    const deleted = this.devices.delete(id);
    if (deleted) {
      this.saveRegistry();
    }
    return deleted;
  }

  // Mark device as online/offline
  setDeviceOnlineStatus(id: string, online: boolean): boolean {
    const device = this.devices.get(id);
    if (!device) {
      return false;
    }

    device.online = online;
    device.lastSeen = new Date();
    this.devices.set(id, device);
    this.saveRegistry();
    return true;
  }

  // Update device state
  updateDeviceState(id: string, state: any): boolean {
    const device = this.devices.get(id);
    if (!device) {
      return false;
    }

    device.state = state;
    device.lastSeen = new Date();
    this.devices.set(id, device);
    this.saveRegistry();
    return true;
  }

  // Search devices
  searchDevices(query: string): Device[] {
    const normalizedQuery = query.toLowerCase();
    
    return Array.from(this.devices.values()).filter(device => {
      return device.name.toLowerCase().includes(normalizedQuery) ||
             device.alias?.toLowerCase().includes(normalizedQuery) ||
             device.id.toLowerCase().includes(normalizedQuery) ||
             device.room?.toLowerCase().includes(normalizedQuery) ||
             device.model?.toLowerCase().includes(normalizedQuery) ||
             device.type.toLowerCase().includes(normalizedQuery) ||
             device.brand.toLowerCase().includes(normalizedQuery);
    });
  }

  // Get registry statistics
  getStats(): {
    total: number;
    byType: Record<string, number>;
    byBrand: Record<string, number>;
    byRoom: Record<string, number>;
    online: number;
    offline: number;
  } {
    const devices = Array.from(this.devices.values());
    
    const stats = {
      total: devices.length,
      byType: {} as Record<string, number>,
      byBrand: {} as Record<string, number>,
      byRoom: {} as Record<string, number>,
      online: 0,
      offline: 0
    };

    for (const device of devices) {
      // Count by type
      stats.byType[device.type] = (stats.byType[device.type] || 0) + 1;
      
      // Count by brand
      stats.byBrand[device.brand] = (stats.byBrand[device.brand] || 0) + 1;
      
      // Count by room
      const room = device.room || 'unknown';
      stats.byRoom[room] = (stats.byRoom[room] || 0) + 1;
      
      // Count online/offline
      if (device.online === false) {
        stats.offline++;
      } else {
        stats.online++;
      }
    }

    return stats;
  }
}