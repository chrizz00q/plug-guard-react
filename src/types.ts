export type Severity = "normal" | "warning" | "critical"

export type Telemetry = {
  capturedAt?: string | null
  voltageV?: number | null
  watts?: number | null
  frequencyHz?: number | null
  currentA?: number | null
  energyKWh?: number | null
  powerFactorPercent?: number | null
  temperatureC?: number | null
}

/** One PZEM + DS18B20 pair on a sensor hub. */
export type SensorChannel = {
  channel: number
  /** the PZEM answered in the hub's last report */
  pzemOk: boolean
  /** the DS18B20 answered in the hub's last report */
  tempOk: boolean
  /** live power on this channel (lets the user switch an appliance on and see which channel reacts) */
  watts: number | null
  temperatureC: number | null
  /** the hub's local safety cutoff has cut this channel's power */
  tripped: boolean
  /** the device using this channel, or null while it is free */
  deviceId: string | null
  deviceName: string | null
}

/** One ESP32 carrying several sensor channels. */
export type SensorHub = {
  id: string
  name: string
  hardwareId: string | null
  paired: boolean
  online: boolean
  /** the hub says its readings are FAKE (firmware SIMULATE_SENSORS 1) */
  simulated: boolean
  /** set while an unused pairing code is still valid */
  pairingExpiresAt: string | null
  channels: SensorChannel[]
}

export type Sensors = {
  hubs: SensorHub[]
  /** channels that can be picked right now: hub online, PZEM answering, no device on it yet */
  freeChannels: number
  inUseChannels: number
}

export type Snapshot = {
  household: {
    id: string
    name: string
    timezone?: string | null
  }
  user: {
    displayName?: string | null
    email: string
  }
  devices: Array<{
    id: string
    /** null until the ESP32 pairs; then "PG-<its MAC address>" */
    hardwareId: string | null
    name: string
    room: string
    operationalStatus: string
    /** true once the hardware has exchanged a pairing code for its key */
    paired?: boolean
    /** set while an unused pairing code is still valid */
    pairingExpiresAt?: string | null
    /** readings come from a hub that is sending FAKE data */
    simulated?: boolean
    /** which hub channel feeds this device; absent/null for older single-sensor devices */
    sensorChannel?: { hubId: string; hubName: string; channel: number } | null
    latestTelemetry?: Telemetry | null
  }>
  sensors: Sensors
  alerts: Array<{
    id: string
    deviceId: string
    deviceName: string
    room: string
    title: string
    severity: "warning" | "critical"
    status: string
    triggeredAt: string
    triggerValues?: { displayValue?: string | null } | null
  }>
  unresolvedAlertCount: number
  canManageDevices: boolean
  lastSafetyAt: string | null
  cursor: string
}

export type ApiError = { error: string }
