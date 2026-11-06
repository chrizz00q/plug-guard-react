/**
 * The only file the UI talks to.
 *
 *  - Default: real PHP backend (XAMPP) through the Vite proxy at /api.
 *  - Set VITE_USE_MOCK=true in .env to use the in-browser fake backend instead.
 */
import * as mock from "./mockServer"
import { ApiFailure } from "./errors"
import type { Snapshot } from "../types"

export { ApiFailure }

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true"
const BASE = "/api"

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    })
  } catch {
    throw new ApiFailure("NETWORK") // backend not reachable (Apache stopped?)
  }
  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new ApiFailure(data?.error ?? `HTTP_${response.status}`, data)
  return data as T
}

const send = (method: string, path: string, body?: unknown) =>
  request<any>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

/** Returns null when nobody is signed in. */
export async function getSnapshot(): Promise<Snapshot | null> {
  if (USE_MOCK) return mock.getSnapshot()
  try {
    return await request<Snapshot>("/dashboard")
  } catch (error) {
    if (error instanceof ApiFailure && error.code === "UNAUTHENTICATED") return null
    throw error
  }
}

export const login = (email: string, password: string) =>
  USE_MOCK ? mock.login(email, password) : send("POST", "/auth/login", { email, password })

export const register = (displayName: string, email: string, password: string) =>
  USE_MOCK
    ? mock.register(displayName, email, password)
    : send("POST", "/auth/register", { displayName, email, password })

export const logout = () => (USE_MOCK ? mock.logout() : send("POST", "/auth/logout", {}))

/** A short one-time code the hardware trades for its own key, so nobody has to copy a long secret. */
export type PairingGrant = { pairingCode: string; pairingExpiresAt: string }

/** The sensor channel a new device was set up on. */
export type SensorAssignment = { hubId: string; hubName: string; channel: number; probeMissing: boolean }

/**
 * Adds a device on the sensor channel the user picked (hubId + channel). Resolves when the device is set up.
 * Rejects with ApiFailure:
 *   "NO_SENSOR_AVAILABLE" (detail: NoSensorDetail) when nothing at all can be picked,
 *   "CHANNEL_TAKEN" / "CHANNEL_UNAVAILABLE" when the picked channel was taken or stopped answering meanwhile.
 */
export const addDevice = (input: { name: string; room: string; hubId?: string; channel?: number }) =>
  USE_MOCK
    ? mock.addDevice(input)
    : (send("POST", "/devices", input) as Promise<{
        device: { id: string; hardwareId: string | null; name: string; room: string; operationalStatus: string }
        sensor: SensorAssignment
      }>)

/** Starts pairing a new sensor hub: returns the one-time code to type into the ESP32's setup page. */
export const addHub = (name?: string) =>
  USE_MOCK
    ? mock.addHub(name)
    : (send("POST", "/hubs", { name }) as Promise<PairingGrant & { hubId: string; name: string }>)

/** New pairing code for an existing hub (replaced board, wiped flash). Its channels and devices are kept. */
export const repairHub = (hubId: string) =>
  USE_MOCK
    ? mock.repairHub(hubId)
    : (send("POST", "/hubs/pairing", { hubId }) as Promise<PairingGrant & { hubId: string }>)

/** Removes a hub. The server refuses (HUB_IN_USE) while devices still use its channels. */
export const deleteHub = (hubId: string) =>
  USE_MOCK ? mock.deleteHub(hubId) : send("DELETE", "/hubs", { hubId })

/** New pairing code for an older single-sensor device. Hub devices re-pair through their hub instead. */
export const repairDevice = (deviceId: string) =>
  USE_MOCK
    ? mock.repairDevice(deviceId)
    : (send("POST", "/devices/pairing", { deviceId }) as Promise<PairingGrant & { deviceId: string }>)

export const deleteDevice = (deviceId: string) =>
  USE_MOCK ? mock.deleteDevice(deviceId) : send("DELETE", "/devices", { deviceId })

export const acknowledgeAlert = (alertId: string) =>
  USE_MOCK ? mock.acknowledgeAlert(alertId) : send("POST", "/alerts/acknowledge", { alertId })
