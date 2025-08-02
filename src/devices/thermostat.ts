import { DeviceData } from './base.js';

export type ThermostatFanMode = 'auto' | 'on';
export type ThermostatMode = 'off' | 'cool' | 'heat' | 'auto';

export type ThermostatData = DeviceData<'thermostat', false>;
