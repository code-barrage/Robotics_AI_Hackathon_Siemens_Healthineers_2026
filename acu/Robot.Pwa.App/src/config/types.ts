export interface PuduConfig {
  apiAppKey: string;
  apiAppSecret: string;
  puduUrlCss: string;
  robotSn: string;
  acuUrl: string;
}

export interface DeviceInfo {
  deviceId: string;
  name: string;
  ip: string;
  mac: string;
  firmware: string;
}