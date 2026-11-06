const store = new Map<string, string>()
;(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
;(globalThis as any).window = globalThis
const m = await import("../src/lib/mockServer.ts")
import type { ApiFailure } from "../src/lib/errors.ts"

let fails = 0
const check = (name: string, ok: boolean, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "   -> " + detail}`); if (!ok) fails++ }
const expectFail = async (p: Promise<unknown>) => { try { await p; return null } catch (e) { return e as ApiFailure } }

await m.login("demo@plugguard.app", "plugguard123")
let snap = (await m.getSnapshot())!
const hub = snap.sensors.hubs[0]
check("demo user has a hub with 5 channels", !!hub && hub.channels.length === 5, JSON.stringify(snap.sensors).slice(0, 200))
check("3 demo devices use channels 1-3; free channels = 2 (ch4, ch5)", snap.sensors.inUseChannels === 3 && snap.sensors.freeChannels === 2, JSON.stringify([snap.sensors.inUseChannels, snap.sensors.freeChannels]))
check("hub and devices are flagged SIMULATED", hub.simulated && snap.devices.every((d) => d.simulated))
check("channel 5 has a PZEM but no probe", hub.channels[4].pzemOk && !hub.channels[4].tempOk)
check("in-use channels carry the device name", hub.channels[0].deviceName !== null)

let e = await expectFail(m.addDevice({ name: "Kettle", room: "Kitchen", hubId: hub.id, channel: 1 }))
check("pick a taken channel -> CHANNEL_TAKEN", e?.code === "CHANNEL_TAKEN", String(e?.code))
e = await expectFail(m.addDevice({ name: "Kettle", room: "Kitchen", hubId: hub.id, channel: 9 }))
check("pick a channel that doesn't exist -> CHANNEL_UNAVAILABLE", e?.code === "CHANNEL_UNAVAILABLE", String(e?.code))

const r = await m.addDevice({ name: "Fan", room: "Bedroom", hubId: hub.id, channel: 5 })
check("channel 5 (no probe) can be picked, flagged probeMissing", r.sensor.channel === 5 && r.sensor.probeMissing === true, JSON.stringify(r.sensor))
const r4 = await m.addDevice({ name: "Lamp", room: "Bedroom", hubId: hub.id, channel: 4 })
check("channel 4 can be picked, probe present", r4.sensor.channel === 4 && r4.sensor.probeMissing === false)

e = await expectFail(m.addDevice({ name: "Toaster", room: "Kitchen" }))
const detail = e?.detail as any
check("nothing left -> NO_SENSOR_AVAILABLE / ALL_IN_USE", e?.code === "NO_SENSOR_AVAILABLE" && detail?.reason === "ALL_IN_USE" && detail?.sensors?.inUse === 5, JSON.stringify(detail))

snap = (await m.getSnapshot())!
const fan = snap.devices.find((d) => d.name === "Fan")!
check("device shows hub + channel as hardware id", fan.hardwareId?.endsWith("CH5") === true && fan.sensorChannel?.channel === 5, JSON.stringify(fan))
await m.deleteDevice(fan.id)
snap = (await m.getSnapshot())!
check("deleting a device frees its channel", snap.sensors.freeChannels === 1 && snap.sensors.hubs[0].channels[4].deviceId === null)

const rm = await expectFail(m.deleteHub(hub.id))
check("hub removal refused while devices use it -> HUB_IN_USE", rm?.code === "HUB_IN_USE", String(rm?.code))

await m.logout()
await m.register("New", "new@example.com", "password12345")
e = await expectFail(m.addDevice({ name: "Kettle", room: "Kitchen" }))
check("new account, no hub -> NO_HUB", (e?.detail as any)?.reason === "NO_HUB", JSON.stringify(e?.detail))
const h2 = await m.addHub()
check("first hub is named 'Sensor Hub'", h2.name === "Sensor Hub")
const h3 = await m.addHub()
check("second hub is auto-numbered 'Sensor Hub 2'", h3.name === "Sensor Hub 2", h3.name)
e = await expectFail(m.addDevice({ name: "Kettle", room: "Kitchen" }))
check("hub exists but not paired yet -> still NO_SENSOR_AVAILABLE (never picks)", e?.code === "NO_SENSOR_AVAILABLE", String(e?.code))

console.log(`\n${fails === 0 ? "ALL MOCK CHECKS PASSED" : fails + " FAILED"}`)
process.exit(fails ? 1 : 0)
