export const BASE_URL = 'https://control.smartrent.com';
export const API_URL = `${BASE_URL}/api/v3`;

export const SESSION_PATH = '/authentication/sessions';
export const TFA_PATH = '/authentication/sessions/tfa';
export const WEBSOCKET_TOKEN_PATH = '/api/v1/authentication/websocket-token';

export const APP_VERSION = '18.3.0';

export const WS_API_URL = 'wss://control.smartrent.com/socket/websocket';

export const WS_VERSION = '2.0.0';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15';

const COMMON_HEADERS = {
  Connection: 'keep-alive',
  'User-Agent': USER_AGENT,
  'Accept-Language': 'en-US;q=1.0',
  'Accept-Encoding': 'gzip;q=1.0, compress;q=0.5',
};

export const AUTH_CLIENT_HEADERS = {
  ...COMMON_HEADERS,
  Accept: '*/*',
};

export const API_CLIENT_HEADERS = {
  ...COMMON_HEADERS,
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'X-AppVersion': `safari-resweb-${APP_VERSION}`,
};
