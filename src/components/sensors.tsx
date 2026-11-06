import type { NoSensorDetail } from "../lib/errors"
import type { SensorChannel, SensorHub, Sensors } from "../types"
import { AlertIcon } from "./shared"

/* ---------- Which channels can be picked ---------- */

export type ChannelOption = { hub: SensorHub; channel: SensorChannel }

/** Channels a new device can be put on: hub online, PZEM answering, nothing on it yet. */
export function pickableChannels(sensors: Sensors): ChannelOption[] {
  return sensors.hubs
    .filter((hub) => hub.online)
    .flatMap((hub) =>
      hub.channels
        .filter((channel) => channel.pzemOk && !channel.deviceId)
        .map((channel) => ({ hub, channel })),
    )
}

export const channelKey = (hubId: string, channel: number) => `${hubId}:${channel}`

/** Power on every channel right now, to spot which one an appliance was switched on at. */
export function wattBaseline(sensors: Sensors): Record<string, number> {
  const out: Record<string, number> = {}
  for (const hub of sensors.hubs) {
    for (const c of hub.channels) out[channelKey(hub.id, c.channel)] = c.watts ?? 0
  }
  return out
}

/** Same reasons (and same rules) as the server's NO_SENSOR_AVAILABLE, worked out from the dashboard data. */
export function localNoSensor(sensors: Sensors): NoSensorDetail {
  const pairedHubs = sensors.hubs.filter((h) => h.paired).length
  const onlineHubs = sensors.hubs.filter((h) => h.online).length
  let inUse = 0
  let faulty = 0
  for (const hub of sensors.hubs.filter((h) => h.online)) {
    for (const c of hub.channels) {
      if (c.deviceId) inUse++
      else if (!c.pzemOk) faulty++
    }
  }
  const reason: NoSensorDetail["reason"] =
    pairedHubs === 0
      ? "NO_HUB"
      : onlineHubs === 0
        ? "HUB_OFFLINE"
        : faulty > 0 || inUse === 0
          ? "SENSOR_FAULT"
          : "ALL_IN_USE"
  return { error: "NO_SENSOR_AVAILABLE", reason, sensors: { pairedHubs, onlineHubs, free: 0, noProbe: 0, inUse, faulty } }
}

/* ---------- Notification: nothing to pick ---------- */

export function NoSensorNotice({
  detail,
  working,
  onPairHub,
}: {
  detail: NoSensorDetail
  working: boolean
  onPairHub: () => void
}) {
  const { reason, sensors } = detail
  const copy: Record<NoSensorDetail["reason"], { title: string; text: string; action?: string }> = {
    NO_HUB: {
      title: "No sensor hub is paired yet",
      text: "Devices get their readings from a sensor hub (an ESP32 with PZEM + DS18B20 channels). Pair a hub first, then add this device.",
      action: "Pair a sensor hub",
    },
    HUB_OFFLINE: {
      title: "Your sensor hub is offline",
      text: "No sensor can be assigned while the hub is silent. Check that it is powered and connected to Wi-Fi; this window updates by itself when it comes back.",
    },
    SENSOR_FAULT: {
      title: "No working sensor available",
      text:
        sensors.faulty > 0
          ? `The PZEM is not answering on ${sensors.faulty} channel${sensors.faulty === 1 ? "" : "s"}, and every working channel is taken. Check the wiring (type t in the hub's Serial Monitor to see each channel).`
          : "The hub is online but none of its channels has a working PZEM. Check the sensor wiring.",
    },
    ALL_IN_USE: {
      title: "All sensors are in use",
      text: `All ${sensors.inUse} working sensor channel${sensors.inUse === 1 ? " is" : "s are"} already assigned to a device. Delete a device to free its sensor, or pair another hub.`,
      action: "Pair another hub",
    },
  }
  const { title, text, action } = copy[reason] ?? copy.NO_HUB
  return (
    <div className="pg-sensor-notice" role="alert">
      <span aria-hidden="true" className="pg-sensor-notice__icon">
        <AlertIcon size={18} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
        {action && (
          <button className="pg-btn pg-btn--secondary" disabled={working} onClick={onPairHub} type="button">
            {working ? "Working…" : action}
          </button>
        )}
      </div>
    </div>
  )
}

/* ---------- Picker: which channel is the appliance on? ---------- */

const DETECT_WATTS = 25 // a rise of this much since the dialog opened counts as "load detected"

export function ChannelPicker({
  options,
  selected,
  baseline,
  onSelect,
}: {
  options: ChannelOption[]
  selected: string
  baseline: Record<string, number>
  onSelect: (hubId: string, channel: number) => void
}) {
  return (
    <fieldset className="pg-channel-picker">
      <legend>Which sensor channel is this appliance connected to?</legend>
      <p>
        Plug the appliance into the outlet whose clamp is on channel&nbsp;N, then switch it on: the channel that shows
        its power is the right one.
      </p>
      <div className="pg-channel-picker__list">
        {options.map(({ hub, channel }) => {
          const key = channelKey(hub.id, channel.channel)
          const rise = (channel.watts ?? 0) - (baseline[key] ?? channel.watts ?? 0)
          const detected = rise >= DETECT_WATTS
          return (
            <button
              aria-pressed={selected === key}
              className={`pg-channel-option${selected === key ? " is-selected" : ""}${detected ? " is-detected" : ""}`}
              key={key}
              onClick={() => onSelect(hub.id, channel.channel)}
              type="button"
            >
              <strong>
                {hub.name} · Channel {channel.channel}
              </strong>
              <span>
                {channel.watts === null ? "-- W" : `${Math.round(channel.watts)} W`}
                {channel.tempOk && channel.temperatureC !== null ? ` · ${channel.temperatureC.toFixed(1)}°C` : ""}
              </span>
              {detected && <em className="pg-tag pg-tag--ok">Load detected</em>}
              {!channel.tempOk && <em className="pg-tag pg-tag--warn">No temperature probe: no overheat protection</em>}
              {hub.simulated && <em className="pg-tag">Simulated</em>}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/* ---------- Hub overview in the hardware section ---------- */

export function SensorHubPanel({
  sensors,
  working,
  error,
  onPair,
  onRepair,
  onRemove,
}: {
  sensors: Sensors
  working: boolean
  error: string
  onPair: () => void
  onRepair: (hub: SensorHub) => void
  onRemove: (hub: SensorHub) => void
}) {
  const anySimulated = sensors.hubs.some((h) => h.simulated && h.paired)
  return (
    <div className="pg-hubs" aria-label="Sensor hubs">
      {anySimulated && (
        <p className="pg-sim-banner" role="status">
          <strong>Simulated data.</strong> A hub is sending FAKE readings (firmware <code>SIMULATE_SENSORS 1</code>).
          Nothing here reflects a real appliance.
        </p>
      )}
      <div className="pg-hubs__summary">
        <span>
          <strong>Sensors</strong>{" "}
          {sensors.hubs.length === 0
            ? "No sensor hub paired yet"
            : `${sensors.freeChannels} free · ${sensors.inUseChannels} in use`}
        </span>
        <button className="pg-repair-device" disabled={working} onClick={onPair} type="button">
          {working ? "Working…" : "Pair a sensor hub"}
        </button>
      </div>
      {sensors.hubs.map((hub) => (
        <div className="pg-hub" key={hub.id}>
          <div className="pg-hub__name">
            <i className={`pg-device-dot pg-device-dot--${hub.online ? "normal" : "warning"}`} />
            <span>
              {hub.name}
              {hub.simulated && hub.paired && <b className="pg-sim-badge">SIMULATED</b>}
              <small>
                {!hub.paired
                  ? hub.pairingExpiresAt
                    ? "Awaiting pairing"
                    : "Not paired (code expired)"
                  : hub.online
                    ? hub.hardwareId
                    : `${hub.hardwareId} · offline`}
              </small>
            </span>
          </div>
          <div className="pg-hub__channels" aria-label={`${hub.name} channels`}>
            {hub.channels.map((c) => {
              const live = hub.online
              const state = c.tripped
                ? "tripped"
                : c.deviceId
                  ? "used"
                  : !live
                    ? "off"
                    : c.pzemOk
                      ? "free"
                      : "fault"
              const label = c.tripped
                ? "safety cutoff open"
                : c.deviceId
                  ? `in use by ${c.deviceName ?? "a device"}`
                  : !live
                    ? "hub offline"
                    : c.pzemOk
                      ? c.tempOk
                        ? "free"
                        : "free, no temperature probe"
                      : "no PZEM answering"
              return (
                <span
                  className={`pg-hub__channel pg-hub__channel--${state}`}
                  key={c.channel}
                  title={`Channel ${c.channel}: ${label}`}
                >
                  {c.channel}
                  <span className="pg-sr-only">: {label}</span>
                </span>
              )
            })}
          </div>
          <div className="pg-hub__actions">
            <button
              className="pg-repair-device"
              disabled={working}
              onClick={() => onRepair(hub)}
              title="Get a new pairing code, e.g. after replacing the ESP32"
              type="button"
            >
              Re-pair
            </button>
            <button className="pg-repair-device" onClick={() => onRemove(hub)} type="button">
              Remove
            </button>
          </div>
        </div>
      ))}
      {sensors.hubs.length > 0 && (
        <p className="pg-hubs__legend">
          <span className="pg-hub__channel pg-hub__channel--free">1</span> free{" "}
          <span className="pg-hub__channel pg-hub__channel--used">2</span> in use{" "}
          <span className="pg-hub__channel pg-hub__channel--fault">3</span> no PZEM{" "}
          <span className="pg-hub__channel pg-hub__channel--tripped">4</span> cutoff open{" "}
          <span className="pg-hub__channel pg-hub__channel--off">5</span> hub offline
        </p>
      )}
      {error && <p className="pg-device-error">{error}</p>}
    </div>
  )
}
