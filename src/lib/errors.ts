export class ApiFailure extends Error {
  constructor(
    public code: string,
    /** the server's whole error body, when it sent one (e.g. the reason behind NO_SENSOR_AVAILABLE) */
    public detail?: unknown,
  ) {
    super(code)
  }
}

/** Why "Add device" found no sensor to give the new device. */
export type NoSensorReason =
  | "NO_HUB" //       no sensor hub is paired yet
  | "HUB_OFFLINE" //  hub(s) paired, but silent for 90+ seconds
  | "SENSOR_FAULT" // hub online, but its channels' PZEM is not answering
  | "ALL_IN_USE" //   every working channel already has a device

export type NoSensorDetail = {
  error: "NO_SENSOR_AVAILABLE"
  reason: NoSensorReason
  sensors: { pairedHubs: number; onlineHubs: number; free: number; noProbe: number; inUse: number; faulty: number }
}
