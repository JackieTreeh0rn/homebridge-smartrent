import axios, {
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosInstance,
  AxiosRequestHeaders,
} from 'axios';
import {
  API_URL,
  API_CLIENT_HEADERS,
  WS_API_URL,
  WS_VERSION,
} from './request.js';
import { SmartRentAuthClient } from './auth.js';
import { SmartRentPlatform } from '../platform.js';
import WebSocket from 'ws';
import { Logger } from 'homebridge';

export type WSDeviceList = `devices:${string}`;
export type WSEvent = {
  id: number;
  name:
    | 'leak'
    | 'fan_mode'
    | 'current_temp'
    | 'current_humidity'
    | 'heating_setpoint'
    | 'cooling_setpoint'
    | 'mode'
    | 'locked'
    | 'on'
    | 'notifications';
  remote_id: string;
  type: string;
  last_read_state: string;
  last_read_state_changed_at: string;
};
export type WSPayload = [null, null, WSDeviceList, string, WSEvent];

export class SmartRentApiClient {
  private readonly authClient: SmartRentAuthClient;
  private readonly apiClient: AxiosInstance;
  protected readonly log: Logger | Console;

  constructor(readonly platform: SmartRentPlatform) {
    this.authClient = new SmartRentAuthClient(
      platform.api.user.storagePath(),
      platform.log
    );
    this.log = platform.log ?? console;
    this.apiClient = this._initializeApiClient();
  }

  /**
   * Initialize Axios instance for SmartRent API requests
   * @returns Axios instance
   */
  private _initializeApiClient() {
    const apiClient = axios.create({
      baseURL: API_URL,
      headers: API_CLIENT_HEADERS,
    });
    apiClient.interceptors.request.use(this._handleRequest.bind(this));
    apiClient.interceptors.response.use(this._handleResponse.bind(this));
    return apiClient;
  }

  /**
   * Get the SmartRent API access token
   * @returns Oauth access token
   */
  public async getAccessToken() {
    return this.authClient.getAccessToken({
      email: this.platform.config.email,
      password: this.platform.config.password,
      tfaSecret: this.platform.config.tfaSecret,
    });
  }

  /**
   * Get the SmartRent API access token
   * @returns Oauth access token
   */
  public async getWebSocketToken() {
    return this.authClient.getWebSocketToken({
      email: this.platform.config.email,
      password: this.platform.config.password,
      tfaSecret: this.platform.config.tfaSecret,
    });
  }

  /**
   * Attach the access token to the SmartRent API request and log the request
   * @param config Axios request config
   * @returns Axios request config
   */
  private async _handleRequest(config: InternalAxiosRequestConfig) {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      this.log.error('No access token available. Aborting API request.');
      throw new Error('Authentication failed: No access token');
    }
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${accessToken}`,
    } as AxiosRequestHeaders;
    this.log.debug(
      `API Request: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`
    );
    return config;
  }

  /**
   * Log the SmartRent API response
   * @param response Axios response
   * @returns SmartRent response data payload
   */
  private _handleResponse(response: AxiosResponse) {
    // Only log response size and status, not the full payload
    const dataSize = JSON.stringify(response.data).length;
    this.log.debug(
      `API Response: ${response.status} ${response.statusText} (${dataSize} bytes)`
    );
    return response;
  }

  // API request methods

  public async get<T, D = unknown>(
    path: string,
    config?: InternalAxiosRequestConfig<D>
  ) {
    const response = await this.apiClient.get<T>(path, config);
    return response.data;
  }

  public async post<T, D = unknown>(
    path: string,
    data?: D,
    config?: InternalAxiosRequestConfig<D>
  ) {
    const response = await this.apiClient.post<T>(path, data, config);
    return response.data;
  }

  public async patch<T, D = unknown>(
    path: string,
    data?: D,
    config?: InternalAxiosRequestConfig<D>
  ) {
    const response = await this.apiClient.patch<T>(path, data, config);
    return response.data;
  }
}

export class SmartRentWebsocketClient extends SmartRentApiClient {
  public wsClient: Promise<WebSocket | undefined>;
  public event: object;
  private readonly devices: number[];

  constructor(readonly platform: SmartRentPlatform) {
    super(platform);
    this.wsClient = this._initializeWsClient();
    this.event = {};
    this.devices = [];
  }

  private _emitize(obj: object, eventName: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    let _subscriptions = new Set<Function>();
    Object.defineProperty(obj, eventName, {
      set(func) {
        _subscriptions.add(func);
      },
      get() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const emit = (...args: any[]) => {
          _subscriptions.forEach(f => f(...args));
        };

        Object.defineProperty(emit, 'off', {
          set(func) {
            _subscriptions.delete(func);
          },
          get() {
            _subscriptions = new Set();
          },
        });

        return emit;
      },
    });
  }

  /**
   * Initialize WebSocket client for SmartRent API
   * @returns WebSocket client
   */
  private async _initializeWsClient() {
    this.log.debug('WebSocket connection opening');
    const token = await this.getAccessToken();
    if (!token || token === 'undefined') {
      this.log.warn(
        'Authentication failed: No access token! SmartRent WebSocket features disabled.'
      );
      return undefined;
    }
    const wsClient = new WebSocket(
      WS_API_URL +
        '?' +
        new URLSearchParams({
          token: String(token),
          vsn: WS_VERSION,
        }).toString()
    );
    wsClient.onopen = this._handleWsOpen.bind(this);
    wsClient.onmessage = this._handleWsMessage.bind(this);
    wsClient.onerror = this._handleWsError.bind(this);
    wsClient.onclose = this._handleWsClose.bind(this);
    return wsClient;
  }

  private _handleWsOpen() {
    this.log.debug('WebSocket connection opened');
    this.devices.forEach(device => this.subscribeDevice(device));
  }

  private _handleWsMessage(message: WebSocket.MessageEvent) {
    this.log.debug(`WebSocket message received: Data: ${message.data}`);
    const data: WSPayload = JSON.parse(String(message.data));
    if (data[3].includes('attribute_state')) {
      const device = data[2].split(':')[1];
      this.log.debug(String(data[4]));
      this.event[device](data[4]);
    }
  }

  private _handleWsError(error: WebSocket.ErrorEvent) {
    this.log.error(`WebSocket error: ${error.message}`);
    this.wsClient
      .then(client => {
        if (client) {
          client.close();
        }
      })
      .then(() => {
        this.wsClient = this._initializeWsClient();
      });
  }

  private _handleWsClose(event: WebSocket.CloseEvent) {
    this.log.debug(
      `WebSocket connection closed: Code: ${event.code}, Reason: ${event.reason}, Event: ${event}`,
      event
    );
    this.wsClient = this._initializeWsClient();
  }

  /**
   * Adds device to websocket client subsciption list and announces events to device handlers
   * @param deviceId Device ID
   */
  public async subscribeDevice(deviceId: number) {
    this.log.debug(`Subscribing to device: ${deviceId}`);
    if (!this.devices.includes(deviceId)) {
      this.devices.push(deviceId);
      this._emitize(this.event, `${deviceId}`);
    }
    try {
      const wsClient = await this.wsClient;
      if (!wsClient) {
        this.log.warn(
          'WebSocket client not initialized. Device subscription skipped.'
        );
        return;
      }
      if (wsClient.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket not ready');
      }
      wsClient.send(
        JSON.stringify(<WSPayload>[
          null,
          null,
          `devices:${deviceId}`,
          'phx_join',
          {},
        ])
      );
      this.log.debug(`Subscribed to device: ${deviceId}`);
    } catch (err) {
      this.log.error(String(err));
      this.log.error(`Dang didnt subscribe ${deviceId}, trying again`);
      setTimeout(() => this.subscribeDevice(deviceId), 1000);
    }
  }
}
