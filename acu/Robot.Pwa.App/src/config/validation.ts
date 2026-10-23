import type { PuduConfig } from "./types";

export function isConfigValid(config: PuduConfig): boolean {
  return Boolean(
    config.apiAppKey && config.apiAppSecret && config.puduUrlCss && config.robotSn && config.acuUrl
  );
}