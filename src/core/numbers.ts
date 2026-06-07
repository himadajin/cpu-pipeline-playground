export function toInt32(value: number): number {
  return value | 0;
}

export function toUint32(value: number): number {
  return value >>> 0;
}

export function toHex32(value: number): string {
  return `0x${toUint32(value).toString(16).padStart(8, "0")}`;
}
