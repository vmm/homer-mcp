import net from 'net';
import { Device, DeviceState, KasaResponse, DeviceControlRequest } from '../../../shared/src/types.js';

export class KasaDevice {
  private ip: string;
  private port = 9999;
  private timeout = 5000;

  constructor(ip: string) {
    this.ip = ip;
  }

  // Kasa encryption - XOR with autokey
  private encrypt(buffer: string): Buffer {
    let key = 171;
    const result = Buffer.alloc(buffer.length + 4);
    
    // Add length header (4 bytes, big endian)
    const length = buffer.length;
    result.writeUInt32BE(length, 0);
    
    // Encrypt payload
    for (let i = 0; i < buffer.length; i++) {
      const encrypted = buffer.charCodeAt(i) ^ key;
      key = encrypted;
      result[i + 4] = encrypted;
    }
    
    return result;
  }

  // Kasa decryption
  private decrypt(buffer: Buffer): string {
    let key = 171;
    let result = '';
    
    // Skip the 4-byte length header if present
    const start = buffer.length > 4 && buffer.readUInt32BE(0) === buffer.length - 4 ? 4 : 0;
    
    for (let i = start; i < buffer.length; i++) {
      const decrypted = buffer[i] ^ key;
      key = buffer[i];
      result += String.fromCharCode(decrypted);
    }
    
    return result;
  }

  // Send command to device
  private async sendCommand(command: object): Promise<KasaResponse> {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      const cmd = JSON.stringify(command);
      
      client.connect(this.port, this.ip, () => {
        client.write(this.encrypt(cmd));
      });
      
      client.on('data', (data) => {
        try {
          const decrypted = this.decrypt(data);
          const response = JSON.parse(decrypted) as KasaResponse;
          client.destroy();
          resolve(response);
        } catch (error) {
          client.destroy();
          reject(new Error(`Failed to parse response: ${error instanceof Error ? error.message : String(error)}`));
        }
      });
      
      client.on('error', (err) => {
        client.destroy();
        reject(new Error(`Connection error: ${err.message}`));
      });
      
      client.on('timeout', () => {
        client.destroy();
        reject(new Error('Connection timeout'));
      });
      
      client.setTimeout(this.timeout);
    });
  }

  // Get device information
  async getDeviceInfo(): Promise<KasaResponse> {
    return await this.sendCommand({
      'system': { 'get_sysinfo': {} }
    });
  }

  // Turn device on
  async turnOn(): Promise<void> {
    const response = await this.sendCommand({
      'system': { 'set_relay_state': { 'state': 1 } }
    });
    
    if (response.system?.set_relay_state?.err_code !== 0) {
      throw new Error('Failed to turn on device');
    }
  }

  // Turn device off
  async turnOff(): Promise<void> {
    const response = await this.sendCommand({
      'system': { 'set_relay_state': { 'state': 0 } }
    });
    
    if (response.system?.set_relay_state?.err_code !== 0) {
      throw new Error('Failed to turn off device');
    }
  }

  // Set brightness (for bulbs)
  async setBrightness(brightness: number): Promise<void> {
    if (brightness < 0 || brightness > 100) {
      throw new Error('Brightness must be between 0 and 100');
    }

    await this.sendCommand({
      'smartlife.iot.smartbulb.lightingservice': {
        'transition_light_state': {
          'brightness': brightness,
          'ignore_default': 1
        }
      }
    });
  }

  // Set color (for color bulbs)
  async setColor(hue: number, saturation: number, brightness?: number): Promise<void> {
    if (hue < 0 || hue > 360) {
      throw new Error('Hue must be between 0 and 360');
    }
    if (saturation < 0 || saturation > 100) {
      throw new Error('Saturation must be between 0 and 100');
    }

    const command: any = {
      'smartlife.iot.smartbulb.lightingservice': {
        'transition_light_state': {
          'hue': hue,
          'saturation': saturation,
          'ignore_default': 1
        }
      }
    };

    if (brightness !== undefined) {
      if (brightness < 0 || brightness > 100) {
        throw new Error('Brightness must be between 0 and 100');
      }
      command['smartlife.iot.smartbulb.lightingservice']['transition_light_state']['brightness'] = brightness;
    }

    await this.sendCommand(command);
  }

  // Set color temperature (for bulbs with temp control)
  async setColorTemperature(colorTemp: number, brightness?: number): Promise<void> {
    if (colorTemp < 2500 || colorTemp > 9000) {
      throw new Error('Color temperature must be between 2500K and 9000K');
    }

    const command: any = {
      'smartlife.iot.smartbulb.lightingservice': {
        'transition_light_state': {
          'color_temp': colorTemp,
          'ignore_default': 1
        }
      }
    };

    if (brightness !== undefined) {
      if (brightness < 0 || brightness > 100) {
        throw new Error('Brightness must be between 0 and 100');
      }
      command['smartlife.iot.smartbulb.lightingservice']['transition_light_state']['brightness'] = brightness;
    }

    await this.sendCommand(command);
  }

  // Set RGB color (converts to HSV internally)
  async setRGBColor(r: number, g: number, b: number, brightness?: number): Promise<void> {
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
      throw new Error('RGB values must be between 0 and 255');
    }

    // Convert RGB to HSV
    const { h, s } = this.rgbToHsv(r, g, b);
    await this.setColor(h, s, brightness);
  }

  // RGB to HSV conversion
  private rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    let h = 0;
    let s = max === 0 ? 0 : diff / max;
    let v = max;

    if (diff !== 0) {
      switch (max) {
        case r:
          h = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / diff + 2) / 6;
          break;
        case b:
          h = ((r - g) / diff + 4) / 6;
          break;
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      v: Math.round(v * 100)
    };
  }

  // Control device with unified interface
  async control(request: DeviceControlRequest): Promise<void> {
    const { action, brightness, color, color_temp, hue, saturation } = request;

    // Handle power state
    switch (action) {
      case 'on':
        await this.turnOn();
        break;
      case 'off':
        await this.turnOff();
        return; // Don't apply other settings when turning off
      case 'toggle':
        const info = await this.getDeviceInfo();
        const currentState = info.system?.get_sysinfo?.relay_state || 
                           info.system?.get_sysinfo?.light_state?.on_off;
        if (currentState === 1) {
          await this.turnOff();
          return;
        } else {
          await this.turnOn();
        }
        break;
    }

    // Apply additional settings for bulbs
    if (color) {
      await this.setRGBColor(color.r, color.g, color.b, brightness);
    } else if (hue !== undefined && saturation !== undefined) {
      await this.setColor(hue, saturation, brightness);
    } else if (color_temp) {
      await this.setColorTemperature(color_temp, brightness);
    } else if (brightness !== undefined) {
      await this.setBrightness(brightness);
    }
  }

  // Get current device state
  async getState(): Promise<DeviceState> {
    const info = await this.getDeviceInfo();
    const sysinfo = info.system?.get_sysinfo;
    
    if (!sysinfo) {
      throw new Error('Unable to get device info');
    }

    const state: DeviceState = {};

    // Power state
    if (sysinfo.relay_state !== undefined) {
      // Smart plug
      state.power = sysinfo.relay_state === 1 ? 'on' : 'off';
    } else if (sysinfo.light_state) {
      // Smart bulb
      state.power = sysinfo.light_state.on_off === 1 ? 'on' : 'off';
      state.brightness = sysinfo.light_state.brightness;
      state.hue = sysinfo.light_state.hue;
      state.saturation = sysinfo.light_state.saturation;
      state.color_temp = sysinfo.light_state.color_temp;
    }

    return state;
  }

  // Test connectivity
  async testConnection(): Promise<boolean> {
    try {
      await this.getDeviceInfo();
      return true;
    } catch {
      return false;
    }
  }

  // Convert device info to Device object
  static fromDeviceInfo(ip: string, info: KasaResponse): Partial<Device> {
    const sysinfo = info.system?.get_sysinfo;
    if (!sysinfo) {
      throw new Error('Invalid device info response');
    }

    const capabilities: Array<'power' | 'brightness' | 'color' | 'color_temp'> = ['power'];
    
    // Determine capabilities based on device type
    if (sysinfo.is_dimmable === 1) {
      capabilities.push('brightness');
    }
    if (sysinfo.is_color === 1) {
      capabilities.push('color');
    }
    if (sysinfo.is_variable_color_temp === 1) {
      capabilities.push('color_temp');
    }

    return {
      mac: sysinfo.mac,
      name: sysinfo.alias || sysinfo.dev_name,
      alias: sysinfo.alias,
      type: sysinfo.mic_type?.includes('SMARTBULB') ? 'light' : 'plug',
      brand: 'kasa',
      model: sysinfo.model,
      ip,
      capabilities,
      deviceId: sysinfo.deviceId,
      sw_ver: sysinfo.sw_ver,
      hw_ver: sysinfo.hw_ver,
      features: {
        is_dimmable: sysinfo.is_dimmable === 1,
        is_color: sysinfo.is_color === 1,
        is_variable_color_temp: sysinfo.is_variable_color_temp === 1
      }
    };
  }
}