export interface Device {
  id: string;
  mac?: string;
  name: string;
  alias?: string;
  type: 'light' | 'plug' | 'switch';
  brand: 'kasa' | 'tuya' | 'unknown';
  model?: string;
  ip: string;
  capabilities: DeviceCapability[];
  room?: string;
  deviceId?: string;
  sw_ver?: string;
  hw_ver?: string;
  features?: DeviceFeatures;
  note?: string;
  online?: boolean;
  lastSeen?: Date;
  state?: DeviceState;
}

export type DeviceCapability = 
  | 'power'
  | 'brightness'
  | 'color'
  | 'color_temp';

export interface DeviceFeatures {
  is_dimmable?: boolean;
  is_color?: boolean;
  is_variable_color_temp?: boolean;
}

export interface DeviceState {
  power?: 'on' | 'off';
  brightness?: number; // 0-100
  color?: {
    r: number; // 0-255
    g: number; // 0-255
    b: number; // 0-255
  };
  hue?: number; // 0-360
  saturation?: number; // 0-100
  color_temp?: number; // Kelvin
}

export interface Scene {
  id: string;
  name: string;
  description?: string;
  devices: SceneDevice[];
}

export interface SceneDevice {
  deviceId: string;
  state: DeviceState;
  transition?: number; // seconds
}

export interface KasaResponse {
  system?: {
    get_sysinfo?: {
      sw_ver: string;
      hw_ver: string;
      model: string;
      deviceId: string;
      oemId: string;
      hwId: string;
      rssi: number;
      latitude_i: number;
      longitude_i: number;
      alias: string;
      status: string;
      mic_type: string;
      feature?: string;
      mac: string;
      updating: number;
      led_off: number;
      relay_state?: number;
      on_time?: number;
      icon_hash: string;
      dev_name: string;
      active_mode: string;
      next_action?: {
        type: number;
      };
      err_code: number;
      // Light-specific fields
      is_dimmable?: number;
      is_color?: number;
      is_variable_color_temp?: number;
      light_state?: {
        on_off: number;
        mode: string;
        hue: number;
        saturation: number;
        color_temp: number;
        brightness: number;
      };
      preferred_state?: Array<{
        index: number;
        hue: number;
        saturation: number;
        color_temp: number;
        brightness: number;
      }>;
    };
    set_relay_state?: {
      err_code: number;
    };
  };
  [key: string]: any;
}

export interface NetworkScanResult {
  ip: string;
  mac?: string;
  hostname?: string;
  timestamp: Date;
  deviceType?: 'kasa' | 'tuya' | 'unknown';
  ports?: number[];
}

export interface DeviceControlRequest {
  action: 'on' | 'off' | 'toggle';
  brightness?: number;
  color?: {
    r: number;
    g: number;
    b: number;
  };
  color_temp?: number;
  hue?: number;
  saturation?: number;
  transition?: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}