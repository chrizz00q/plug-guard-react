/**
 * Local, browser-only stand-in for the original Payload/Figma backend.
 *
 *  - Everything is stored in localStorage (key: "plugguard-db").
 *  - Telemetry is SIMULATED: every few seconds each device gets new readings.
 *  - Overheat alerts follow the same thresholds as the original app
 *    (open above 60 °C, resolve at or below 55 °C).
 *
 * To connect a real backend later, keep the function signatures in
 * `src/lib/api.ts` and replace the bodies with fetch() calls.
 */
import type { Snapshot, Telemetry } from "../types"
import { ApiFailure } from "./errors"

const DB_KEY = "plugguard-db"
const TICK_MS = 3000
const TRIGGER_C = 60
const CLEAR_C = 55

type User = { id: string; displayName: string; email: string; passwordHash: string }
type Device = {
  id: string
  userId: string
  hardwareId: string | null
  name: string
  room: string
  setupKey: string
  // Pairing (mock): a new device waits for a code to be "used", then comes online a few seconds later.
  // Devices saved by older versions have none of these fields and count as paired.
  paired?: boolean
  pairingCode?: string | null
  pairingExpiresAt?: string | null
  pairAt?: number | null
  // Set when the device is fed by a sensor-hub channel (the normal case now). Older devices have neither.
  hubId?: string
  channelNo?: number
  operationalStatus: "provisioning" | "online"
  lastSeenAt: string | null
  latestTelemetry: Telemetry | null
  baseWatts: number
  targetTempC: number
  updatedAt: string
}
/** A fake sensor hub: an ESP32 with `channelCount` PZEM + DS18B20 channels, of which the first `workingChannels` have sensors. */
type Hub = {
  id: string
  userId: string
  name: string
  hardwareId: string | null
  paired: boolean
  pairingCode?: string | null
  pairingExpiresAt?: string | null
  pairAt?: number | null
  lastSeenAt: string | null
  channelCount: number
  workingChannels: number
  /** channels (among the working ones) that have no DS18B20 */
  noProbe?: number[]
}
type Alert = {
  id: string
  userId: string
  deviceId: string
  title: string
  severity: "warning" | "critical"
  status: "open" | "acknowledged" | "resolved"
  triggeredAt: string
  displayValue: string
}
type DB = {
  users: User[]
  devices: Device[]
  hubs: Hub[]
  alerts: Alert[]
  sessionUserId: string | null
  lastTickAt: number
}


const uid = () => crypto.randomUUID()
const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms))
const rand = (min: number, max: number) => min + Math.random() * (max - min)

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function load(): DB {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      const db = JSON.parse(raw) as DB
      db.hubs ??= [] // saved by an older version that had no hubs
      return db
    }
  } catch {
    /* fall through to fresh db */
  }
  return { users: [], devices: [], hubs: [], alerts: [], sessionUserId: null, lastTickAt: 0 }
}

function save(db: DB) {
  localStorage.setItem(DB_KEY, JSON.stringify(db))
}

/* ---------- Seed data ---------- */

const demoDevices = [
  { name: "Living Room Appliance", room: "Living Room", hardwareId: "PG-LIVING-ROOM-01", baseWatts: 180, targetTempC: 38 },
  { name: "Kitchen Appliance", room: "Kitchen", hardwareId: "PG-KITCHEN-01", baseWatts: 850, targetTempC: 42 },
  { name: "Air Conditioner", room: "Bedroom", hardwareId: "PG-BEDROOM-AC-01", baseWatts: 1100, targetTempC: 44 },
]

function seedDemoDevices(db: DB, userId: string) {
  const now = new Date().toISOString()
  for (const demo of demoDevices) {
    db.devices.push({
      id: uid(),
      userId,
      ...demo,
      setupKey: "demo-setup-key",
      operationalStatus: "online",
      lastSeenAt: now,
      latestTelemetry: null,
      updatedAt: now,
    })
  }
}

const HUB_CHANNELS = 5
const ONLINE_MS = 90_000

/** The demo account gets a paired hub with 5 channels; its 3 demo devices use channels 1-3, so 2 are free. */
function seedDemoHub(db: DB, userId: string) {
  if (db.hubs.some((h) => h.userId === userId)) return
  const hub: Hub = {
    id: uid(),
    userId,
    name: "Sensor Hub",
    hardwareId: "PG-DEMO-HUB-01",
    paired: true,
    lastSeenAt: new Date().toISOString(),
    channelCount: HUB_CHANNELS,
    workingChannels: HUB_CHANNELS,
    noProbe: [HUB_CHANNELS], // channel 5 has a PZEM but no probe: shows the "no overheat protection" warning
  }
  db.hubs.push(hub)
  db.devices
    .filter((d) => d.userId === userId && !d.hubId)
    .slice(0, HUB_CHANNELS)
    .forEach((d, i) => {
      d.hubId = hub.id
      d.channelNo = i + 1
      d.hardwareId = `${hub.hardwareId} · CH${i + 1}`
    })
}

async function ensureDemoUser(db: DB) {
  const existing = db.users.find((u) => u.email === "demo@plugguard.app")
  if (existing) {
    seedDemoHub(db, existing.id)
    return
  }
  const user: User = {
    id: uid(),
    displayName: "Demo User",
    email: "demo@plugguard.app",
    passwordHash: await sha256("plugguard123"),
  }
  db.users.push(user)
  seedDemoDevices(db, user.id)
  seedDemoHub(db, user.id)
  const kitchen = db.devices.find((d) => d.userId === user.id && d.room === "Kitchen")
  if (kitchen) {
    db.alerts.push({
      id: uid(),
      userId: user.id,
      deviceId: kitchen.id,
      title: "Sustained high wattage",
      severity: "warning",
      status: "resolved",
      triggeredAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      displayValue: "1,620 W",
    })
  }
  save(db)
}

/* ---------- Telemetry simulation ---------- */

function tick(db: DB) {
  const now = Date.now()
  const elapsedS = db.lastTickAt ? Math.min((now - db.lastTickAt) / 1000, 60) : TICK_MS / 1000
  db.lastTickAt = now
  const iso = new Date(now).toISOString()

  for (const hub of db.hubs) {
    if (hub.pairAt && now >= hub.pairAt) {
      // Pretend the ESP32 entered the code a few seconds after the dialog opened
      hub.paired = true
      hub.hardwareId = hub.hardwareId ?? `PG-MOCK-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
      hub.pairingCode = null
      hub.pairingExpiresAt = null
      hub.pairAt = null
    }
    if (hub.paired) hub.lastSeenAt = iso // a paired hub reports every tick
  }

  for (const device of db.devices) {
    if (device.paired === false) {
      if (device.pairAt && now >= device.pairAt) {
        // Pretend the ESP32 entered the code a few seconds after the dialog opened
        device.paired = true
        device.pairingCode = null
        device.pairingExpiresAt = null
        device.hardwareId = device.hardwareId ?? `PG-MOCK-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
      } else if (!device.lastSeenAt) {
        continue // brand-new device: silent until its code is used (a re-paired one keeps reporting on its old key)
      }
    }
    const prev = device.latestTelemetry
    const prevTemp = prev?.temperatureC ?? device.targetTempC
    const temperatureC = prevTemp + (device.targetTempC - prevTemp) * 0.18 + rand(-0.4, 0.4)
    const heatLoad = Math.max(0, temperatureC - 45) * 18
    const watts = Math.max(0, device.baseWatts + heatLoad + rand(-25, 25))
    const voltageV = 220 + rand(-1.8, 1.8)
    device.latestTelemetry = {
      capturedAt: iso,
      voltageV,
      watts,
      frequencyHz: 60 + rand(-0.06, 0.06),
      currentA: watts / voltageV,
      energyKWh: (prev?.energyKWh ?? rand(1, 8)) + (watts * elapsedS) / 3_600_000,
      powerFactorPercent: 92 + rand(-2, 4),
      temperatureC,
    }
    device.lastSeenAt = iso
    device.operationalStatus = "online"
    device.updatedAt = iso

    const open = db.alerts.find(
      (a) => a.deviceId === device.id && a.title === "Extreme Overheat Detected" && a.status !== "resolved",
    )
    if (!open && temperatureC > TRIGGER_C) {
      db.alerts.push({
        id: uid(),
        userId: device.userId,
        deviceId: device.id,
        title: "Extreme Overheat Detected",
        severity: "critical",
        status: "open",
        triggeredAt: iso,
        displayValue: `${Math.round(temperatureC)}°C`,
      })
    } else if (open && temperatureC <= CLEAR_C) {
      open.status = "resolved"
    }
  }
}

function maybeTick(db: DB) {
  if (Date.now() - db.lastTickAt >= TICK_MS) {
    tick(db)
    save(db)
  }
}

/* ---------- Public API ---------- */

export async function login(email: string, password: string) {
  await delay()
  const db = load()
  await ensureDemoUser(db)
  const user = db.users.find((u) => u.email === email.trim().toLowerCase())
  if (!user || user.passwordHash !== (await sha256(password))) {
    throw new ApiFailure("INVALID_CREDENTIALS")
  }
  db.sessionUserId = user.id
  save(db)
  return { id: user.id, displayName: user.displayName, email: user.email }
}

export async function register(displayName: string, email: string, password: string) {
  await delay()
  const db = load()
  await ensureDemoUser(db)
  const normalized = email.trim().toLowerCase()
  if (displayName.trim().length < 2 || password.length < 10 || db.users.some((u) => u.email === normalized)) {
    throw new ApiFailure("ACCOUNT_NOT_CREATED")
  }
  const user: User = {
    id: uid(),
    displayName: displayName.trim(),
    email: normalized,
    passwordHash: await sha256(password),
  }
  db.users.push(user)
  db.sessionUserId = user.id
  save(db)
  return { id: user.id, displayName: user.displayName, email: user.email }
}

export async function logout() {
  const db = load()
  db.sessionUserId = null
  save(db)
}

export async function getSession() {
  const db = load()
  await ensureDemoUser(db)
  return db.users.find((u) => u.id === db.sessionUserId) ?? null
}

/* ---------- Sensor hubs ---------- */

const hubOf = (db: DB, device: Device) => (device.hubId ? db.hubs.find((h) => h.id === device.hubId) : undefined)
const hubOnline = (hub: Hub) =>
  hub.paired && !!hub.lastSeenAt && Date.now() - Date.parse(hub.lastSeenAt) <= ONLINE_MS

/** Same shape (and same rules) as the PHP backend's sensor_overview(). */
function sensorOverview(db: DB, userId: string) {
  const out = { hubs: [] as Snapshot["sensors"]["hubs"], freeChannels: 0, inUseChannels: 0 }
  for (const hub of db.hubs.filter((h) => h.userId === userId)) {
    const online = hubOnline(hub)
    const channels = Array.from({ length: hub.channelCount }, (_, i) => {
      const channel = i + 1
      const working = online && channel <= hub.workingChannels
      const tempOk = working && !hub.noProbe?.includes(channel)
      const device = db.devices.find((d) => d.hubId === hub.id && d.channelNo === channel)
      if (online) {
        if (device) out.inUseChannels++
        else if (working) out.freeChannels++ // a missing probe is allowed (with a warning)
      }
      const t = device?.latestTelemetry
      return {
        channel,
        pzemOk: working,
        tempOk,
        watts: working ? (t?.watts ?? 0) : null,
        temperatureC: tempOk ? (t?.temperatureC ?? 26) : null,
        tripped: false,
        deviceId: device?.id ?? null,
        deviceName: device?.name ?? null,
      }
    })
    out.hubs.push({
      id: hub.id,
      name: hub.name,
      hardwareId: hub.hardwareId,
      paired: hub.paired,
      online,
      simulated: true, // the whole mock is fake data
      pairingExpiresAt:
        hub.pairingExpiresAt && Date.parse(hub.pairingExpiresAt) > Date.now() ? hub.pairingExpiresAt : null,
      channels,
    })
  }
  return out
}

export async function getSnapshot(): Promise<Snapshot | null> {
  const db = load()
  const user = db.users.find((u) => u.id === db.sessionUserId)
  if (!user) return null
  maybeTick(db)

  const devices = db.devices
    .filter((d) => d.userId === user.id)
    .sort((a, b) => a.name.localeCompare(b.name))
  const byId = new Map(devices.map((d) => [d.id, d]))
  const alerts = db.alerts
    .filter((a) => a.userId === user.id && byId.has(a.deviceId))
    .sort((a, b) => Date.parse(b.triggeredAt) - Date.parse(a.triggeredAt))
    .slice(0, 50)

  const now = Date.now()
  const lastSafetyAt =
    devices
      .map((d) => d.latestTelemetry?.capturedAt)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null

  return {
    household: { id: user.id, name: `${user.displayName}'s Home`, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    user: { displayName: user.displayName, email: user.email },
    devices: devices.map((d) => ({
      id: d.id,
      hardwareId: d.hardwareId,
      name: d.name,
      room: d.room,
      operationalStatus: !d.lastSeenAt
        ? "provisioning"
        : now - Date.parse(d.lastSeenAt) > 90_000
          ? "offline"
          : d.operationalStatus,
      paired: d.paired !== false,
      pairingExpiresAt:
        d.paired === false && d.pairingExpiresAt && Date.parse(d.pairingExpiresAt) > now ? d.pairingExpiresAt : null,
      simulated: true,
      sensorChannel: hubOf(db, d) && d.channelNo ? { hubId: d.hubId!, hubName: hubOf(db, d)!.name, channel: d.channelNo } : null,
      latestTelemetry: d.latestTelemetry,
    })),
    sensors: sensorOverview(db, user.id),
    alerts: alerts.map((a) => {
      const d = byId.get(a.deviceId)!
      return {
        id: a.id,
        deviceId: a.deviceId,
        deviceName: d.name,
        room: d.room,
        title: a.title,
        severity: a.severity,
        status: a.status,
        triggeredAt: a.triggeredAt,
        triggerValues: { displayValue: a.displayValue },
      }
    }),
    unresolvedAlertCount: alerts.filter((a) => a.status !== "resolved").length,
    canManageDevices: true,
    lastSafetyAt,
    cursor: new Date().toISOString(),
  }
}

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const PAIRING_TTL_MS = 30 * 60_000
const MOCK_PAIR_DELAY_MS = 9_000

function newPairingCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const raw = Array.from(bytes, (b) => PAIRING_ALPHABET[b % PAIRING_ALPHABET.length]).join("")
  return `${raw.slice(0, 4)}-${raw.slice(4)}`
}

export async function addDevice(input: { name: string; room: string; hubId?: string; channel?: number }) {
  await delay(250)
  const db = load()
  const user = db.users.find((u) => u.id === db.sessionUserId)
  if (!user) throw new ApiFailure("UNAUTHENTICATED")
  const name = input.name.trim()
  const room = input.room.trim()
  if (name.length < 2 || name.length > 80 || room.length < 2 || room.length > 80) {
    throw new ApiFailure("INVALID_DEVICE")
  }
  maybeTick(db) // keep the hubs' "last seen" fresh

  const hubs = db.hubs.filter((h) => h.userId === user.id)
  const taken = (hub: Hub, ch: number) => db.devices.some((d) => d.hubId === hub.id && d.channelNo === ch)
  let claim: { hub: Hub; channelNo: number } | null = null

  if (input.hubId !== undefined && input.channel !== undefined) {
    // The user picked a channel: it must exist, be live (PZEM answering) and not be used yet
    const hub = hubs.find((h) => h.id === input.hubId)
    if (!hub || !hubOnline(hub) || input.channel < 1 || input.channel > hub.workingChannels) {
      throw new ApiFailure("CHANNEL_UNAVAILABLE")
    }
    if (taken(hub, input.channel)) throw new ApiFailure("CHANNEL_TAKEN")
    claim = { hub, channelNo: input.channel }
  } else {
    // No pick: the first channel with BOTH sensors working
    for (const hub of hubs) {
      if (!hubOnline(hub)) continue
      for (let ch = 1; ch <= hub.workingChannels && !claim; ch++) {
        if (!taken(hub, ch) && !hub.noProbe?.includes(ch)) claim = { hub, channelNo: ch }
      }
      if (claim) break
    }
  }

  if (!claim) {
    const overview = sensorOverview(db, user.id)
    const paired = hubs.filter((h) => h.paired).length
    const online = hubs.filter(hubOnline).length
    const faulty = overview.hubs
      .filter((h) => h.online)
      .reduce((n, h) => n + h.channels.filter((c) => !c.deviceId && !c.pzemOk).length, 0)
    const reason =
      paired === 0
        ? "NO_HUB"
        : online === 0
          ? "HUB_OFFLINE"
          : faulty > 0 || overview.inUseChannels === 0
            ? "SENSOR_FAULT"
            : "ALL_IN_USE"
    throw new ApiFailure("NO_SENSOR_AVAILABLE", {
      error: "NO_SENSOR_AVAILABLE",
      reason,
      sensors: { pairedHubs: paired, onlineHubs: online, free: 0, noProbe: 0, inUse: overview.inUseChannels, faulty },
    })
  }

  const { hub, channelNo } = claim
  const device: Device = {
    id: uid(),
    userId: user.id,
    hardwareId: `${hub.hardwareId} · CH${channelNo}`,
    name,
    room,
    setupKey: "",
    hubId: hub.id,
    channelNo,
    operationalStatus: "provisioning",
    lastSeenAt: null,
    latestTelemetry: null,
    baseWatts: rand(80, 900),
    targetTempC: rand(36, 44),
    updatedAt: new Date().toISOString(),
  }
  db.devices.push(device)
  save(db)
  return {
    device: { id: device.id, hardwareId: device.hardwareId, name, room, operationalStatus: device.operationalStatus },
    sensor: {
      hubId: hub.id,
      hubName: hub.name,
      channel: channelNo,
      probeMissing: !!hub.noProbe?.includes(channelNo),
    },
  }
}

export async function addHub(name?: string) {
  await delay(250)
  const db = load()
  const user = db.users.find((u) => u.id === db.sessionUserId)
  if (!user) throw new ApiFailure("UNAUTHENTICATED")
  const pairingCode = newPairingCode()
  const pairingExpiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString()
  const hub: Hub = {
    id: uid(),
    userId: user.id,
    name: name?.trim() || (db.hubs.filter((h) => h.userId === user.id).length === 0 ? "Sensor Hub" : `Sensor Hub ${db.hubs.filter((h) => h.userId === user.id).length + 1}`),
    hardwareId: null,
    paired: false,
    pairingCode,
    pairingExpiresAt,
    pairAt: Date.now() + MOCK_PAIR_DELAY_MS,
    lastSeenAt: null,
    channelCount: HUB_CHANNELS,
    workingChannels: HUB_CHANNELS,
  }
  db.hubs.push(hub)
  save(db)
  return { hubId: hub.id, name: hub.name, pairingCode, pairingExpiresAt }
}

export async function repairHub(hubId: string) {
  await delay(200)
  const db = load()
  const user = db.users.find((u) => u.id === db.sessionUserId)
  if (!user) throw new ApiFailure("UNAUTHENTICATED")
  const hub = db.hubs.find((h) => h.id === hubId && h.userId === user.id)
  if (!hub) throw new ApiFailure("HUB_NOT_FOUND")
  // Like the real backend: the hub keeps working on its current key; the code is just another way in.
  hub.pairingCode = newPairingCode()
  hub.pairingExpiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString()
  hub.pairAt = Date.now() + MOCK_PAIR_DELAY_MS
  save(db)
  return { hubId, pairingCode: hub.pairingCode, pairingExpiresAt: hub.pairingExpiresAt }
}

export async function deleteHub(hubId: string) {
  await delay(200)
  const db = load()
  const user = db.users.find((u) => u.id === db.sessionUserId)
  if (!user) throw new ApiFailure("UNAUTHENTICATED")
  const hub = db.hubs.find((h) => h.id === hubId && h.userId === user.id)
  if (!hub) throw new ApiFailure("HUB_NOT_FOUND")
  if (db.devices.some((d) => d.hubId === hub.id)) throw new ApiFailure("HUB_IN_USE")
  db.hubs = db.hubs.filter((h) => h.id !== hub.id)
  save(db)
  return { deleted: true, hubId }
}

export async function repairDevice(deviceId: string) {
  await delay(200)
  const db = load()
  const user = db.users.find((u) => u.id === db.sessionUserId)
  if (!user) throw new ApiFailure("UNAUTHENTICATED")
  const device = db.devices.find((d) => d.id === deviceId && d.userId === user.id)
  if (!device) throw new ApiFailure("DEVICE_NOT_FOUND")
  // Like the real backend: the device keeps working on its current key; the code is just another way in.
  const pairingCode = newPairingCode()
  const pairingExpiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString()
  device.paired = false
  device.pairingCode = pairingCode
  device.pairingExpiresAt = pairingExpiresAt
  device.pairAt = Date.now() + MOCK_PAIR_DELAY_MS
  save(db)
  return { deviceId, pairingCode, pairingExpiresAt }
}

export async function deleteDevice(deviceId: string) {
  await delay(200)
  const db = load()
  const user = db.users.find((u) => u.id === db.sessionUserId)
  if (!user) throw new ApiFailure("UNAUTHENTICATED")
  const device = db.devices.find((d) => d.id === deviceId && d.userId === user.id)
  if (!device) throw new ApiFailure("DEVICE_NOT_FOUND")
  db.alerts = db.alerts.filter((a) => a.deviceId !== device.id)
  db.devices = db.devices.filter((d) => d.id !== device.id)
  save(db)
  return { deleted: true, deviceId }
}

export async function acknowledgeAlert(alertId: string) {
  const db = load()
  const user = db.users.find((u) => u.id === db.sessionUserId)
  if (!user) throw new ApiFailure("UNAUTHENTICATED")
  const alert = db.alerts.find((a) => a.id === alertId && a.userId === user.id)
  if (!alert) throw new ApiFailure("FORBIDDEN")
  if (alert.status === "open") alert.status = "acknowledged"
  save(db)
  return { id: alert.id, status: alert.status }
}

/* ---------- Dev helpers (open the browser console) ----------
 *   plugguard.heat("PG-KITCHEN-01", 72)  -> push a device above 60 °C
 *   plugguard.heat("PG-KITCHEN-01", 40)  -> cool it back down
 *   plugguard.reset()                    -> wipe all local data
 */
declare global {
  interface Window {
    plugguard?: { heat: (hardwareId: string, tempC: number) => string; reset: () => void }
  }
}

window.plugguard = {
  heat(hardwareId, tempC) {
    const db = load()
    const device = db.devices.find((d) => d.hardwareId === hardwareId)
    if (!device) return `No device with hardware ID "${hardwareId}"`
    device.targetTempC = tempC
    save(db)
    return `${device.name} will drift toward ${tempC}°C`
  },
  reset() {
    localStorage.removeItem(DB_KEY)
    location.reload()
  },
}
