import type { ByteAddress, ByteValue, Int32, RegisterIndex, Signed12Immediate } from "./types";

export function toInt32(value: number): Int32 {
  return (value | 0) as Int32;
}

export function toUint32(value: number): number {
  return value >>> 0;
}

export function toHex32(value: number): string {
  return `0x${toUint32(value).toString(16).padStart(8, "0")}`;
}

export function toByteValue(value: number): ByteValue {
  return (value & 0xff) as ByteValue;
}

export function toByteAddress(value: number): ByteAddress {
  return value as ByteAddress;
}

export function toRegisterIndex(value: number): RegisterIndex {
  return value as RegisterIndex;
}

export function toSigned12Immediate(value: number): Signed12Immediate {
  return value as Signed12Immediate;
}
