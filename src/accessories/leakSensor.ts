import { CharacteristicValue, Service } from 'homebridge';
import { SmartRentPlatform } from '../platform.js';
import type { SmartRentAccessory } from './index.js';
import { WSEvent } from '../lib/client.js';
import { findStateByName } from '../lib/utils.js';

/**
 * Leak Sensor Accessory
 * An instance of this class is created for each accessory the platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class LeakSensorAccessory {
  private readonly service: Service;

  private readonly state: {
    hubId: string;
    deviceId: string;
    leak: {
      current: CharacteristicValue;
    };
  };

  constructor(
    private readonly platform: SmartRentPlatform,
    private readonly accessory: SmartRentAccessory
  ) {
    this.state = {
      hubId: this.accessory.context.device.room.hub_id.toString(),
      deviceId: this.accessory.context.device.id.toString(),
      leak: {
        current:
          this.platform.api.hap.Characteristic.LeakDetected.LEAK_NOT_DETECTED,
      },
    };

    // set accessory information
    this.accessory
      .getService(this.platform.api.hap.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.api.hap.Characteristic.SerialNumber,
        this.accessory.context.device.id.toString()
      );

    // get the LeakDetected service if it exists, otherwise create a new LeakSensor service
    this.service =
      this.accessory.getService(this.platform.api.hap.Service.LeakSensor) ||
      this.accessory.addService(this.platform.api.hap.Service.LeakSensor);

    // set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(
      this.platform.api.hap.Characteristic.Name,
      accessory.context.device.name
    );

    // create handlers for required characteristics
    // see https://developers.homebridge.io/#/service/LeakSensor
    this.service
      .getCharacteristic(this.platform.api.hap.Characteristic.LeakDetected)
      .onGet(this.handleLeakDetected.bind(this));

    // subscribe to device events
    this.platform.smartRentApi.websocket.event[this.state.deviceId] = (
      event: WSEvent
    ) => this.handleDeviceStateChanged(event);
  }

  /**
   * Handle requests to get the current value of the "Leak Detected" characteristic
   */
  async handleLeakDetected(): Promise<CharacteristicValue> {
    this.platform.log.debug('Triggered GET LeakDetected');
    const leakAttributes = await this.platform.smartRentApi.getState(
      this.state.hubId,
      this.state.deviceId
    );
    const leak = findStateByName(leakAttributes, 'leak') as boolean;
    const currentValue = leak
      ? this.platform.api.hap.Characteristic.LeakDetected.LEAK_DETECTED
      : this.platform.api.hap.Characteristic.LeakDetected.LEAK_NOT_DETECTED;
    this.state.leak.current = currentValue;
    return currentValue;
  }

  /**
   * Handle device state changed events
   * @param event
   */
  handleDeviceStateChanged(event: WSEvent) {
    this.platform.log.debug('Received websocket leak event:', event);

    if (event.name !== 'leak') {
      return;
    }
    const leak =
      event.last_read_state === 'true'
        ? this.platform.api.hap.Characteristic.LeakDetected.LEAK_DETECTED
        : this.platform.api.hap.Characteristic.LeakDetected.LEAK_NOT_DETECTED;
    this.state.leak.current = leak;
    this.service.updateCharacteristic(
      this.platform.api.hap.Characteristic.LeakDetected,
      leak
    );
  }
}
