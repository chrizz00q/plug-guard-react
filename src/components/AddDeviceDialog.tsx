import { useEffect, useState, type FormEvent } from "react"
import * as api from "../lib/api"
import type { NoSensorDetail } from "../lib/errors"
import type { Snapshot } from "../types"
import {
  ChannelPicker,
  NoSensorNotice,
  channelKey,
  localNoSensor,
  pickableChannels,
  wattBaseline,
} from "./sensors"
import { CheckIcon, CloseIcon, deviceCatalog, type DeviceCatalogID } from "./shared"

/** A pairing code on screen: for a sensor hub or for an older single-sensor device. */
export type PairingInfo = {
  target: "hub" | "device"
  id: string
  name: string
  pairingCode: string
  pairingExpiresAt: string
}

type Added = { name: string; hubName: string; channel: number; probeMissing: boolean; simulated: boolean }

/**
 * "Add connected device": the user picks the appliance, where it is, and WHICH SENSOR CHANNEL it is wired to.
 * With nothing to pick, a notification explains why. Also shows the one-time pairing code for hubs / old devices.
 */
export default function AddDeviceDialog({
  snapshot,
  initialPairing,
  onClose,
  onRefresh,
  onDeviceAdded,
}: {
  snapshot: Snapshot
  initialPairing: PairingInfo | null
  onClose: () => void
  onRefresh: () => void | Promise<void>
  onDeviceAdded: (deviceId: string) => void
}) {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState("")
  const [deviceType, setDeviceType] = useState<DeviceCatalogID | "other" | "">("")
  const [picked, setPicked] = useState("") // "hubId:channel"
  const [serverNotice, setServerNotice] = useState<NoSensorDetail | null>(null)
  const [added, setAdded] = useState<Added | null>(null)
  const [pairing, setPairing] = useState<PairingInfo | null>(initialPairing)
  const [codeCopied, setCodeCopied] = useState(false)
  const [hubWorking, setHubWorking] = useState(false)
  // Power on every channel when the dialog opened: a channel that rises afterwards is where the appliance is
  const [baseline] = useState(() => wattBaseline(snapshot.sensors))

  const options = pickableChannels(snapshot.sensors)
  const chosen = options.find(({ hub, channel }) => channelKey(hub.id, channel.channel) === picked)
  // Nothing to pick: say why, straight away (the server would answer the same on submit)
  const notice = options.length === 0 ? (serverNotice ?? localNoSensor(snapshot.sensors)) : null

  // The pick vanished (someone else took it, hub went offline): forget it
  useEffect(() => {
    if (picked && !chosen) setPicked("")
  }, [picked, chosen])

  const pairNewHub = async () => {
    setHubWorking(true)
    setError("")
    try {
      const created = await api.addHub()
      await onRefresh()
      setPairing({
        target: "hub",
        id: created.hubId,
        name: created.name,
        pairingCode: created.pairingCode,
        pairingExpiresAt: created.pairingExpiresAt,
      })
      setCodeCopied(false)
    } catch {
      setError("A pairing code could not be created. Try again.")
    } finally {
      setHubWorking(false)
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!chosen) {
      setError("Pick the sensor channel this appliance is connected to.")
      return
    }
    const data = new FormData(event.currentTarget)
    const catalogDevice = deviceCatalog.find(({ id }) => id === deviceType)
    const name =
      deviceType === "other" ? String(data.get("customName") || "").trim() : catalogDevice?.label
    if (!name) {
      setError("Choose an appliance or enter a custom device name.")
      return
    }
    setWorking(true)
    setError("")
    setServerNotice(null)
    try {
      const result = await api.addDevice({
        name,
        room: String(data.get("room") || ""),
        hubId: chosen.hub.id,
        channel: chosen.channel.channel,
      })
      setAdded({
        name: result.device.name,
        hubName: result.sensor.hubName,
        channel: result.sensor.channel,
        probeMissing: result.sensor.probeMissing,
        simulated: chosen.hub.simulated,
      })
      onDeviceAdded(result.device.id)
      await onRefresh()
    } catch (e) {
      const failure = e instanceof api.ApiFailure ? e : null
      const code = failure?.code ?? ""
      if (code === "NO_SENSOR_AVAILABLE") {
        setServerNotice(failure!.detail as NoSensorDetail)
      } else if (code === "CHANNEL_TAKEN") {
        setError("That channel was just taken by another device. Pick another one.")
        await onRefresh()
      } else if (code === "CHANNEL_UNAVAILABLE") {
        setError("That channel stopped answering. Check its sensors, or pick another one.")
        await onRefresh()
      } else {
        setError(code === "FORBIDDEN" ? "Only household owners can add devices." : "Check the device details and try again.")
      }
    } finally {
      setWorking(false)
    }
  }

  const title = added
    ? "Device ready"
    : pairing
      ? pairing.target === "hub"
        ? "Pair your sensor hub"
        : "Pair your device"
      : "Add connected device"

  return (
    <div className="pg-device-dialog-backdrop">
      <section aria-labelledby="add-device-title" aria-modal="true" className="pg-device-dialog" role="dialog">
        <header className="pg-device-dialog__header">
          <div>
            <span>Hardware setup</span>
            <h2 id="add-device-title">{title}</h2>
          </div>
          <button aria-label="Close device setup" onClick={onClose} type="button">
            <CloseIcon />
          </button>
        </header>

        {added ? (
          <div className="pg-device-success">
            <span className="pg-device-success__icon">
              <CheckIcon />
            </span>
            <div>
              <strong>{added.name} is set up</strong>
              <p>
                It uses sensor channel {added.channel} on {added.hubName}. Live readings appear in a few seconds.
              </p>
              {added.probeMissing && (
                <p className="pg-sensor-warning">
                  No temperature probe is connected to this channel, so there is no overheat protection for this device
                  until a DS18B20 is added.
                </p>
              )}
              {added.simulated && (
                <p className="pg-sensor-warning">This hub is sending simulated (fake) readings.</p>
              )}
            </div>
            <button className="pg-btn pg-btn--primary" onClick={onClose} type="button">
              Done
            </button>
          </div>
        ) : pairing ? (
          (() => {
            const isHub = pairing.target === "hub"
            const live = isHub
              ? snapshot.sensors.hubs.find(({ id }) => id === pairing.id)
              : snapshot.devices.find(({ id }) => id === pairing.id)
            const expired = Date.now() >= Date.parse(pairing.pairingExpiresAt)
            // The code is "used" once the server no longer reports an open pairing window for it.
            const used = Boolean(live) && !live?.pairingExpiresAt && !expired
            const expiresAt = new Date(pairing.pairingExpiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
            return (
              <div className="pg-device-success">
                <span className="pg-device-success__icon">
                  <CheckIcon />
                </span>
                <div>
                  <strong>{used ? `${pairing.name} is paired` : `${pairing.name} is ready to pair`}</strong>
                  <p>
                    {used
                      ? isHub
                        ? (live as Snapshot["sensors"]["hubs"][number]).online
                          ? "The hub is connected. Close this window, then add devices: you pick the channel each one is wired to."
                          : "The hub accepted the code. Waiting for its first report."
                        : (live as Snapshot["devices"][number]).operationalStatus === "online"
                          ? "The device is connected and sending live readings."
                          : "The device accepted the code. Waiting for its first reading."
                      : expired
                        ? "This code has expired. Close this window and tap Re-pair to get a new one."
                        : `Type this code into the device's setup page. It works once and expires at ${expiresAt}.`}
                  </p>
                </div>
                {!used && !expired && (
                  <>
                    <code className="pg-pairing-code">{pairing.pairingCode}</code>
                    <ol className="pg-pairing-steps">
                      <li>
                        Power on the PlugGuard {isHub ? "hub" : "device"} and join its Wi-Fi network{" "}
                        <b>PlugGuard-Setup-XXXX</b> (the last 4 characters of its ID are also in the Serial Monitor;
                        default password <b>plugguard</b>).
                      </li>
                      <li>
                        The setup page opens by itself, or go to <b>192.168.4.1</b>.
                      </li>
                      <li>Choose your home Wi-Fi, enter the server address, and type the pairing code above.</li>
                      <li>
                        Tap <b>Save and restart</b>. This window updates when the {isHub ? "hub" : "device"} connects.
                      </li>
                    </ol>
                    <button
                      className="pg-btn pg-btn--primary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(pairing.pairingCode)
                          setCodeCopied(true)
                        } catch {
                          /* clipboard blocked: the code is selectable on screen */
                        }
                      }}
                      type="button"
                    >
                      {codeCopied ? "Copied" : "Copy code"}
                    </button>
                  </>
                )}
                {(used || expired) && (
                  <button className="pg-btn pg-btn--primary" onClick={onClose} type="button">
                    Done
                  </button>
                )}
              </div>
            )
          })()
        ) : (
          <form className="pg-device-form" onSubmit={submit}>
            <fieldset className="pg-device-picker">
              <legend>Choose the connected appliance</legend>
              <div className="pg-device-picker__grid">
                {deviceCatalog.map((device) => (
                  <button
                    aria-pressed={deviceType === device.id}
                    className={deviceType === device.id ? "is-selected" : ""}
                    key={device.id}
                    onClick={() => {
                      setError("")
                      setDeviceType(device.id)
                    }}
                    type="button"
                  >
                    <span className="pg-device-picker__artwork">
                      <img alt={device.label} src={device.image} />
                    </span>
                    <strong>{device.label}</strong>
                    <span className="pg-device-picker__check">
                      <CheckIcon />
                    </span>
                  </button>
                ))}
              </div>
              <button
                aria-pressed={deviceType === "other"}
                className={`pg-device-picker__other${deviceType === "other" ? " is-selected" : ""}`}
                onClick={() => {
                  setError("")
                  setDeviceType("other")
                }}
                type="button"
              >
                Device not listed above
              </button>
            </fieldset>
            {deviceType === "other" && (
              <label>
                <span>Device name</span>
                <input autoComplete="off" maxLength={80} minLength={2} name="customName" placeholder="e.g. Aquarium Pump" required />
              </label>
            )}
            <label>
              <span>Location</span>
              <input autoComplete="off" maxLength={80} minLength={2} name="room" placeholder="e.g. Living Room" required />
            </label>

            {options.length > 0 && (
              <ChannelPicker
                baseline={baseline}
                onSelect={(hubId, channel) => {
                  setError("")
                  setPicked(channelKey(hubId, channel))
                }}
                options={options}
                selected={picked}
              />
            )}
            {notice && <NoSensorNotice detail={notice} onPairHub={pairNewHub} working={hubWorking} />}
            {error && <p className="pg-device-error">{error}</p>}

            <div className="pg-device-form__actions">
              <button className="pg-btn pg-btn--secondary" onClick={onClose} type="button">
                Cancel
              </button>
              <button className="pg-btn pg-btn--primary" disabled={working || !deviceType || !chosen} type="submit">
                {working ? "Adding Device…" : "Add Device"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
