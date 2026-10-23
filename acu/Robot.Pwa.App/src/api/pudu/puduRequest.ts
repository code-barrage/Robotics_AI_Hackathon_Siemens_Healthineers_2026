import CryptoJS from "crypto-js";

interface PuduRequestConfig {
  puduUrlCss: string;
  robotSn: string;
  apiAppKey: string;
  apiAppSecret: string;
}

export function buildPuduPointRequest(config: PuduRequestConfig, now = new Date()) {
  const baseUrl = config.puduUrlCss.trim().replace(/\/+$/, "");
  const appKey = config.apiAppKey.trim();
  const appSecret = config.apiAppSecret.trim();
  const sn = config.robotSn.trim();
  if (!appKey || !appSecret || !sn) {
    throw new Error("Pudu Cloud app key, app secret, and robot SN are required.");
  }
  const base = /^(https?:\/\/[^/?#\s]+)(\/[^?#\s]*)?$/i.exec(baseUrl);
  if (!base) {
    throw new Error("Pudu Cloud URL must use HTTP or HTTPS without a query string or fragment.");
  }
  // React Native's URL implementation adds a trailing slash; sign and send one identical path.
  const resourcePath = `${base[2] || ""}/map-service/v1/open/point?sn=${encodeURIComponent(sn)}`;
  const xDate = now.toUTCString();
  const accept = "application/json";
  const contentType = "application/json";
  const signingString = [`x-date: ${xDate}`, "GET", accept, contentType, "", resourcePath].join("\n");
  const signature = CryptoJS.HmacSHA1(signingString, appSecret).toString(CryptoJS.enc.Base64);
  return {
    url: `${base[1]}${resourcePath}`,
    headers: {
      Authorization: `hmac id="${appKey}", algorithm="hmac-sha1", headers="x-date", signature="${signature}"`,
      "x-date": xDate,
      Accept: accept,
      "Content-Type": contentType,
    },
  };
}
