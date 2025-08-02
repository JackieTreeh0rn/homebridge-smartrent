import { DeviceAttribute } from '../devices/index.js';

export function findStateByName(
  objects: DeviceAttribute[],
  name: string
): string | number | boolean | null {
  return objects.find(obj => obj.name === name)?.state ?? null;
}
