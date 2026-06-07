import type {
  ByteAddress,
  ByteValue,
  Int32,
  RegisterIndex,
  ShiftAmountImmediate,
  Signed12Immediate,
  Upper20Immediate,
} from "./types";

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

export function toShiftAmountImmediate(value: number): ShiftAmountImmediate {
  return value as ShiftAmountImmediate;
}

export function toUpper20Immediate(value: number): Upper20Immediate {
  return value as Upper20Immediate;
}
