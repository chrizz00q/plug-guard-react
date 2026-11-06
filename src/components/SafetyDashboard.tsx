import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import * as api from "../lib/api"
import type { Severity, Snapshot } from "../types"
import AddDeviceDialog, { type PairingInfo } from "./AddDeviceDialog"
import { SensorHubPanel } from "./sensors"
import {
  AlertIcon,
  CheckIcon,
  CloseIcon,
  FilledIcon,
  findCatalogDevice,
} from "./shared"

const ShieldIcon = () => (
  <FilledIcon size={22}>
    <path d="M12 2.2 4 5.4v5.7c0 5.1 3.4 9.5 8 10.8 4.6-1.3 8-5.7 8-10.8V5.4l-8-3.2Zm-1.1 14.2-3.5-3.5 1.5-1.5 2 2 4.3-4.3 1.5 1.5-5.8 5.8Z" />
  </FilledIcon>
)

const SmartOutletIcon = () => (
  <FilledIcon size={26}>
    <path d="M8 2h2v5h4V2h2v5h2v3c0 3-2.2 5.4-5 5.9V22h-2v-6.1C8.2 15.4 6 13 6 10V7h2V2Z" />
  </FilledIcon>
)

const BoltIcon = () => (
  <FilledIcon size={18}>
    <path d="M13.5 1.8 4.8 13h6.1l-.7 9.2L19.2 10h-6.3l.6-8.2Z" />
  </FilledIcon>
)

const PowerIcon = () => (
  <FilledIcon size={18}>
    <path d="M8 2h2v5h4V2h2v5h2v3c0 3-2.2 5.4-5 5.9V22h-2v-6.1C8.2 15.4 6 13 6 10V7h2V2Z" />
  </FilledIcon>
)

const FrequencyIcon = () => (
  <FilledIcon size={18}>
    <path d="M2 13h4l2.4-7.2a1 1 0 0 1 1.9.1l3.2 11.2L16 10h6v2h-4.6l-3 8.4a1 1 0 0 1-1.9-.1L9.2 9 7.7 13.6a2 2 0 0 1-1.9 1.4H2v-2Z" />
  </FilledIcon>
)

const CurrentIcon = () => (
  <FilledIcon size={18}>
    <path d="m16.6 3.6 4.8 4.8-4.8 4.8-1.4-1.4 2.4-2.4H3v-2h14.6L15.2 5l1.4-1.4ZM7.4 10.8l1.4 1.4-2.4 2.4H21v2H6.4L8.8 19l-1.4 1.4-4.8-4.8 4.8-4.8Z" />
  </FilledIcon>
)

const EnergyIcon = () => (
  <FilledIcon size={18}>
    <path d="M4 3h2v15h15v2H4a2 2 0 0 1-2-2V3h2Zm14.6 3.2 1.4 1.4-5.5 5.5-3-3L7 14.6l-1.4-1.4 5.9-5.9 3 3 4.1-4.1Z" />
  </FilledIcon>
)

const PowerFactorIcon = () => (
  <FilledIcon size={18}>
    <path d="M7 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm10 10a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM18.6 3 5 21H2.4L16 3h2.6Z" />
  </FilledIcon>
)

const HeatIcon = () => (
  <FilledIcon size={18}>
    <path d="M15 13.8V5a5 5 0 0 0-10 0v8.8A6.5 6.5 0 1 0 15 13.8ZM10 21a4.5 4.5 0 0 1-3-7.9V5a3 3 0 0 1 6 0v8.1A4.5 4.5 0 0 1 10 21Zm1-6.8V6H9v8.2a2.5 2.5 0 1 0 2 0Z" />
  </FilledIcon>
)

const BellIcon = () => (
  <FilledIcon>
    <path d="M12 22a2.4 2.4 0 0 0 2.4-2.4H9.6A2.4 2.4 0 0 0 12 22Zm7-6.2V10a7 7 0 0 0-5.5-6.8V2h-3v1.2A7 7 0 0 0 5 10v5.8L2.8 18v1h18.4v-1L19 15.8Z" />
  </FilledIcon>
)

const PlusIcon = () => (
  <FilledIcon size={18}>
    <path d="M10.5 4h3v6.5H20v3h-6.5V20h-3v-6.5H4v-3h6.5V4Z" />
  </FilledIcon>
)

const TrashIcon = () => (
  <FilledIcon size={18}>
    <path d="M8 3V1h8v2h5v2H3V3h5Zm-3 4h14l-1 15H6L5 7Zm4 3v8h2v-8H9Zm4 0v8h2v-8h-2Z" />
  </FilledIcon>
)

const SignOutIcon = () => (
  <FilledIcon>
    <path d="M4 3h11v5h-2V5H6v14h7v-3h2v5H4V3Zm13.6 5.4L16.2 9.8l1.2 1.2H10v2h7.4l-1.2 1.2 1.4 1.4 3.6-3.6-3.6-3.6Z" />
  </FilledIcon>
)

function deriveSeverity(
  device: Snapshot["devices"][number],
  alert?: Snapshot["alerts"][number],
): Severity {
  if (
    alert?.severity === "critical" ||
    (device.latestTelemetry?.temperatureC ?? 0) > 60
  ) {
    return "critical"
  }
  if (alert || device.operationalStatus === "offline") return "warning"
  return "normal"
}

function formatDashboardTime(
  timestamp: string,
  timeZone?: string | null,
  includeSeconds = false,
) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
    timeZone: timeZone || "UTC",
  }).format(new Date(timestamp))
}

export default function SafetyDashboard({
  snapshot,
  onRefresh,
  onSignOut,
}: {
  snapshot: Snapshot
  onRefresh: () => void | Promise<void>
  onSignOut: () => void | Promise<void>
}) {
  const [activeDeviceId, setActiveDeviceId] = useState(
    snapshot.devices[0]?.id ?? "",
  )
  const [notificationOpen, setNotificationOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const [acknowledged, setAcknowledged] = useState<string[]>([])
  // The add-device dialog (null = closed). `pairing` opens it straight on a pairing code (hub or Re-pair).
  const [dialog, setDialog] = useState<{ pairing: PairingInfo | null } | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteWorking, setDeleteWorking] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [repairWorking, setRepairWorking] = useState(false)
  const [repairError, setRepairError] = useState("")
  const [hubWorking, setHubWorking] = useState(false)
  const [hubError, setHubError] = useState("")

  const activeDevice =
    snapshot.devices.find(({ id }) => id === activeDeviceId) ??
    snapshot.devices[0]
  const activeAlert = activeDevice
    ? snapshot.alerts.find(
        ({ deviceId, status }) =>
          deviceId === activeDevice.id && status !== "resolved",
      )
    : undefined
  const severity = activeDevice
    ? deriveSeverity(activeDevice, activeAlert)
    : "normal"
  const temperature = activeDevice?.latestTelemetry?.temperatureC
  const heatFill =
    temperature == null ? 0 : Math.max(0, Math.min(temperature, 100))
  const telemetry = activeDevice?.latestTelemetry
  const metrics = [
    {
      label: "Voltage",
      value: telemetry?.voltageV,
      unit: "V",
      precision: 1,
      detail: "Line potential",
      icon: <BoltIcon />,
    },
    {
      label: "Power",
      value: telemetry?.watts,
      unit: "W",
      precision: 1,
      detail: "Live power draw",
      icon: <PowerIcon />,
    },
    {
      label: "Frequency",
      value: telemetry?.frequencyHz,
      unit: "Hz",
      precision: 1,
      detail: "Grid frequency",
      icon: <FrequencyIcon />,
    },
    {
      label: "Current",
      value: telemetry?.currentA,
      unit: "A",
      precision: 2,
      detail: "Current draw",
      icon: <CurrentIcon />,
    },
    {
      label: "Energy",
      value: telemetry?.energyKWh,
      unit: "kWh",
      precision: 3,
      detail: "Accumulated use",
      icon: <EnergyIcon />,
    },
    {
      label: "Power factor",
      value: telemetry?.powerFactorPercent,
      unit: "%",
      precision: 1,
      detail: "Load efficiency",
      icon: <PowerFactorIcon />,
    },
  ]

  const history = useMemo(() => {
    const events: Array<{
      id: string
      title: string
      detail: string
      timestamp: string
      severity: Severity
      state: "Active" | "Acknowledged" | "Resolved" | "Complete"
    }> = snapshot.alerts.map((alert) => ({
      id: alert.id,
      title: alert.title,
      detail: `${alert.deviceName} · ${alert.room}`,
      timestamp: alert.triggeredAt,
      severity:
        alert.status === "resolved" ? ("normal" as const) : alert.severity,
      state:
        alert.status === "resolved"
          ? ("Resolved" as const)
          : alert.status === "acknowledged" || acknowledged.includes(alert.id)
            ? ("Acknowledged" as const)
            : ("Active" as const),
    }))
    if (snapshot.lastSafetyAt) {
      events.push({
        id: "routine-check",
        title: "Routine hardware check passed",
        detail: `${snapshot.devices.length} connected ${
          snapshot.devices.length === 1 ? "outlet" : "outlets"
        } checked`,
        timestamp: snapshot.lastSafetyAt,
        severity: "normal",
        state: "Complete" as const,
      })
    }
    return events.sort(
      (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
    )
  }, [
    acknowledged,
    snapshot.alerts,
    snapshot.devices.length,
    snapshot.lastSafetyAt,
  ])

  useEffect(() => {
    if (!notificationOpen) return
    const closeMenus = () => setNotificationOpen(false)
    const onPointerDown = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) closeMenus()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenus()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [notificationOpen])

  const acknowledge = async (alertId: string) => {
    try {
      await api.acknowledgeAlert(alertId)
    } catch {
      return
    }
    setAcknowledged((current) => [...current, alertId])
    await onRefresh()
  }

  const signOut = async () => {
    await onSignOut()
  }

  const closeDeleteDialog = () => {
    if (deleteWorking) return
    setDeleteDialogOpen(false)
    setDeleteError("")
  }

  const deleteDevice = async () => {
    if (!activeDevice) return
    setDeleteWorking(true)
    setDeleteError("")
    try {
      await api.deleteDevice(activeDevice.id)
    } catch (error) {
      setDeleteWorking(false)
      const code = error instanceof api.ApiFailure ? error.code : ""
      setDeleteError(
        code === "FORBIDDEN"
          ? "Only household owners can delete devices."
          : code === "DEVICE_NOT_FOUND"
            ? "This device has already been removed."
            : "The device could not be deleted. Try again.",
      )
      return
    }
    setDeleteDialogOpen(false)
    setDeleteWorking(false)
    setActiveDeviceId(
      snapshot.devices.find(({ id }) => id !== activeDevice.id)?.id ?? "",
    )
    await onRefresh()
  }

  // Fresh pairing code for the selected device (replaced board, wiped flash). Its history is kept.
  const startRepair = async () => {
    if (!activeDevice) return
    setRepairWorking(true)
    setRepairError("")
    try {
      const result = await api.repairDevice(activeDevice.id)
      await onRefresh() // so the dialog starts from the new, unused code
      setDialog({
        pairing: {
          target: "device",
          id: activeDevice.id,
          name: activeDevice.name,
          pairingCode: result.pairingCode,
          pairingExpiresAt: result.pairingExpiresAt,
        },
      })
    } catch {
      setRepairError("A new pairing code could not be created. Try again.")
    } finally {
      setRepairWorking(false)
    }
  }

  // Show a one-time pairing code for a sensor hub: a new one (no hubId) or Re-pair of an existing one.
  const startHubPairing = async (hubId?: string, hubName?: string) => {
    setHubWorking(true)
    setHubError("")
    try {
      let id: string
      let name: string
      let grant: { pairingCode: string; pairingExpiresAt: string }
      if (hubId) {
        grant = await api.repairHub(hubId)
        id = hubId
        name = hubName ?? "Sensor Hub"
      } else {
        const created = await api.addHub()
        grant = created
        id = created.hubId
        name = created.name
      }
      await onRefresh() // so the dialog starts from the new, unused code
      setDialog({
        pairing: {
          target: "hub",
          id,
          name,
          pairingCode: grant.pairingCode,
          pairingExpiresAt: grant.pairingExpiresAt,
        },
      })
    } catch {
      setHubError("A pairing code could not be created. Try again.")
    } finally {
      setHubWorking(false)
    }
  }

  const removeHub = async (hubId: string, hubName: string) => {
    if (!window.confirm(`Remove ${hubName}? Its sensors will no longer be available to new devices.`)) return
    setHubError("")
    try {
      await api.deleteHub(hubId)
      await onRefresh()
    } catch (error) {
      const code = error instanceof api.ApiFailure ? error.code : ""
      setHubError(
        code === "HUB_IN_USE"
          ? "This hub still has devices on its channels. Delete those devices first."
          : "The hub could not be removed. Try again.",
      )
    }
  }

  return (
    <div className="pg-console">
      <div className="pg-atmosphere" aria-hidden="true">
        <img
          alt=""
          className="pg-atmosphere__watermark"
          height={760}
          src="/plugguard-logo.png"
          width={760}
        />
      </div>

      <header className="pg-topbar">
        <div className="pg-topbar__inner">
          <div className="pg-brand">
            <span className="pg-brand__mark">
              <img
                alt="PlugGuard"
                height={36}
                src="/plugguard-logo.png"
                width={36}
              />
            </span>
            <span>
              <strong>
                Plug<em>Guard</em>
              </strong>
              <small>Electrical safety</small>
            </span>
          </div>

          <div className="pg-nav-context">
            <span>
              <i aria-hidden="true" />
              Live monitoring
            </span>
            <strong>{snapshot.household.name}</strong>
          </div>

          <div className="pg-account" ref={accountRef}>
            <button
              aria-expanded={notificationOpen}
              aria-haspopup="dialog"
              aria-label={`Open notifications${
                snapshot.unresolvedAlertCount
                  ? ` (${snapshot.unresolvedAlertCount} unresolved)`
                  : ""
              }`}
              className="pg-notification-button"
              onClick={() => setNotificationOpen((open) => !open)}
              type="button"
            >
              <BellIcon />
              {snapshot.unresolvedAlertCount > 0 && (
                <span className="pg-notification-button__dot" />
              )}
            </button>
            <button className="pg-signout" onClick={signOut} type="button">
              <SignOutIcon />
              <span>Sign Out</span>
            </button>
            {notificationOpen && (
              <section
                aria-label="Notifications"
                className="pg-notifications"
                role="dialog"
              >
                <header className="pg-notifications__header">
                  <div>
                    <strong>Notifications</strong>
                    <span>
                      {snapshot.unresolvedAlertCount
                        ? `${snapshot.unresolvedAlertCount} need attention`
                        : "You're all caught up"}
                    </span>
                  </div>
                  <button
                    aria-label="Close notifications"
                    onClick={() => setNotificationOpen(false)}
                    type="button"
                  >
                    <CloseIcon />
                  </button>
                </header>
                <div className="pg-notifications__list">
                  {snapshot.alerts.length ? (
                    snapshot.alerts.slice(0, 5).map((alert) => (
                      <button
                        className={`pg-notification pg-notification--${
                          alert.status === "resolved"
                            ? "normal"
                            : alert.severity
                        }`}
                        key={alert.id}
                        onClick={() => {
                          setActiveDeviceId(alert.deviceId)
                          setNotificationOpen(false)
                        }}
                        type="button"
                      >
                        <span className="pg-notification__icon">
                          {alert.status === "resolved" ? (
                            <CheckIcon />
                          ) : alert.severity === "critical" ? (
                            <CloseIcon />
                          ) : (
                            <AlertIcon size={17} />
                          )}
                        </span>
                        <span className="pg-notification__content">
                          <strong>{alert.title}</strong>
                          <small>
                            {alert.deviceName} · {alert.room}
                          </small>
                        </span>
                        <time dateTime={alert.triggeredAt}>
                          {formatDashboardTime(
                            alert.triggeredAt,
                            snapshot.household.timezone,
                          )}
                        </time>
                      </button>
                    ))
                  ) : (
                    <div className="pg-notifications__empty">
                      <ShieldIcon />
                      <strong>No notifications</strong>
                      <span>Safety updates will appear here.</span>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </header>

      {dialog && (
        <AddDeviceDialog
          initialPairing={dialog.pairing}
          onClose={() => setDialog(null)}
          onDeviceAdded={setActiveDeviceId}
          onRefresh={onRefresh}
          snapshot={snapshot}
        />
      )}

      {deleteDialogOpen && activeDevice && (
        <div className="pg-device-dialog-backdrop">
          <section
            aria-labelledby="delete-device-title"
            aria-describedby="delete-device-copy"
            aria-modal="true"
            className="pg-delete-dialog"
            role="dialog"
          >
            <header className="pg-delete-dialog__header">
              <span aria-hidden="true" className="pg-delete-dialog__badge">
                <TrashIcon />
              </span>
              <h2 id="delete-device-title">Remove Hardware</h2>
              <button
                aria-label="Close delete confirmation"
                className="pg-dialog-close"
                disabled={deleteWorking}
                onClick={closeDeleteDialog}
                type="button"
              >
                <CloseIcon />
              </button>
            </header>
            <div className="pg-delete-dialog__body">
              <div className="pg-delete-dialog__target">
                <span>Target appliance</span>
                <strong>{activeDevice.name}</strong>
                <small>
                  {activeDevice.room} ·{" "}
                  {activeDevice.hardwareId ?? "Awaiting pairing"}
                </small>
              </div>
              <p id="delete-device-copy">
                Removing this outlet disconnects its live telemetry and alert
                history from {snapshot.household.name}. This action cannot be
                undone.
              </p>
              {deleteError && <p className="pg-device-error">{deleteError}</p>}
            </div>
            <footer className="pg-delete-dialog__actions">
              <button
                className="pg-btn pg-btn--secondary"
                disabled={deleteWorking}
                onClick={closeDeleteDialog}
                type="button"
              >
                Cancel
              </button>
              <button
                className="pg-btn pg-btn--danger"
                disabled={deleteWorking}
                onClick={deleteDevice}
                type="button"
              >
                {deleteWorking ? "Deleting…" : "Delete Device"}
              </button>
            </footer>
          </section>
        </div>
      )}

      <main className="pg-dashboard">
        <section className={`pg-alert pg-alert--${severity}`}>
          {activeDevice && severity === "critical" ? (
            <>
              <span className="pg-alert__icon">
                <AlertIcon size={24} />
              </span>
              <div>
                <span>Urgent safety notification</span>
                <strong>
                  Extreme Overheat Detected —{" "}
                  {temperature == null ? "--" : Math.round(temperature)}°C
                </strong>
                <small>
                  {activeDevice.name} · {activeDevice.room} · immediate
                  inspection required
                </small>
              </div>
              {activeAlert && activeAlert.status === "open" && (
                <button
                  onClick={() => acknowledge(activeAlert.id)}
                  type="button"
                >
                  Acknowledge
                </button>
              )}
            </>
          ) : severity === "warning" ? (
            <>
              <span className="pg-alert__icon">
                <AlertIcon size={23} />
              </span>
              <div>
                <span>Attention required</span>
                <strong>{activeAlert?.title || "Hardware is offline"}</strong>
                <small>
                  {activeDevice?.name} · review the latest device status
                </small>
              </div>
            </>
          ) : (
            <>
              <span className="pg-alert__icon">
                <ShieldIcon />
              </span>
              <div>
                <span>Active notifications</span>
                <strong>No immediate safety alerts</strong>
                <small>All monitored thresholds are within safe limits.</small>
              </div>
            </>
          )}
        </section>

        <section className="pg-hardware" aria-labelledby="hardware-title">
          <div className="pg-section-heading">
            <div>
              <span>Connected outlets</span>
              <h1 id="hardware-title">Hardware Information &amp; Status</h1>
            </div>
            <div className="pg-section-actions">
              {snapshot.canManageDevices && activeDevice && !activeDevice.sensorChannel && (
                <button
                  className="pg-repair-device"
                  disabled={repairWorking}
                  onClick={startRepair}
                  title="Get a new pairing code, e.g. after replacing the ESP32"
                  type="button"
                >
                  {repairWorking ? "Working…" : "Re-pair"}
                </button>
              )}
              {snapshot.canManageDevices && activeDevice && (
                <button
                  aria-label={`Delete ${activeDevice.name}`}
                  className="pg-delete-device"
                  onClick={() => setDeleteDialogOpen(true)}
                  type="button"
                >
                  <TrashIcon />
                </button>
              )}
              {snapshot.canManageDevices && (
                <button
                  aria-label="Add device"
                  className="pg-add-device"
                  onClick={() => setDialog({ pairing: null })}
                  type="button"
                >
                  <PlusIcon />
                </button>
              )}
            </div>
          </div>

          {repairError && <p className="pg-device-error">{repairError}</p>}

          {snapshot.canManageDevices && (
            <SensorHubPanel
              sensors={snapshot.sensors}
              working={hubWorking}
              error={hubError}
              onPair={() => startHubPairing()}
              onRepair={(hub) => startHubPairing(hub.id, hub.name)}
              onRemove={(hub) => removeHub(hub.id, hub.name)}
            />
          )}

          {activeDevice ? (
            <>
              <div
                className="pg-device-selector"
                aria-label="Monitored devices"
              >
                {snapshot.devices.map((device) => (
                  <button
                    className={device.id === activeDevice.id ? "is-active" : ""}
                    key={device.id}
                    onClick={() => setActiveDeviceId(device.id)}
                    type="button"
                  >
                    <i
                      className={`pg-device-dot pg-device-dot--${deriveSeverity(
                        device,
                        snapshot.alerts.find(
                          (alert) =>
                            alert.deviceId === device.id &&
                            alert.status !== "resolved",
                        ),
                      )}`}
                    />
                    {device.name}
                  </button>
                ))}
              </div>

              <div className="pg-hardware-body">
                <div className="pg-device-purpose">
                  <div className="pg-device-purpose__lead">
                    {(() => {
                      const artwork = findCatalogDevice(
                        activeDevice.name,
                        activeDevice.room,
                      )
                      return artwork ? (
                        <span className="pg-device-purpose__artwork">
                          <img
                            alt={artwork.label}
                            src={artwork.image}
                          />
                        </span>
                      ) : (
                        <span className="pg-device-purpose__icon">
                          <SmartOutletIcon />
                        </span>
                      )
                    })()}
                    <div>
                      <span>Active hardware purpose</span>
                      <h2>
                        {activeDevice.name}
                        {activeDevice.simulated && (
                          <b className="pg-sim-badge">SIMULATED</b>
                        )}
                      </h2>
                      <p>
                        Monitoring electrical load and physical heat in{" "}
                        {activeDevice.room}.
                      </p>
                    </div>
                  </div>
                  <dl>
                    <div>
                      <dt>Hardware ID</dt>
                      <dd>
                        {activeDevice.hardwareId ??
                          (activeDevice.pairingExpiresAt
                            ? "Awaiting pairing"
                            : "Not paired (code expired)")}
                      </dd>
                    </div>
                    <div>
                      <dt>Location</dt>
                      <dd>{activeDevice.room}</dd>
                    </div>
                    <div>
                      <dt>Last reading</dt>
                      <dd>
                        {activeDevice.latestTelemetry?.capturedAt
                          ? formatDashboardTime(
                              activeDevice.latestTelemetry.capturedAt,
                              snapshot.household.timezone,
                              true,
                            )
                          : "Awaiting data"}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="pg-telemetry">
                  <div className="pg-electrical-metrics">
                    {metrics.map((metric) => (
                      <article key={metric.label}>
                        <span className="pg-metric-icon">{metric.icon}</span>
                        <div>
                          <span>{metric.label}</span>
                          <strong>
                            {metric.value == null
                              ? "--"
                              : metric.value.toLocaleString(undefined, {
                                  maximumFractionDigits: metric.precision,
                                })}
                            <small>{metric.unit}</small>
                          </strong>
                          <em>
                            {metric.value == null
                              ? "Awaiting sensor"
                              : metric.detail}
                          </em>
                        </div>
                      </article>
                    ))}
                  </div>
                  <article className={`pg-heat pg-heat--${severity}`}>
                    <div className="pg-heat__header">
                      <span className="pg-metric-icon">
                        <HeatIcon />
                      </span>
                      <span className="pg-heat__status">
                        {severity === "critical"
                          ? "Critical"
                          : severity === "warning"
                            ? "Elevated"
                            : "Safe"}
                      </span>
                    </div>
                    <div className="pg-heat__reading">
                      <span>Physical heat</span>
                      <strong>
                        {temperature == null
                          ? "--"
                          : temperature.toLocaleString(undefined, {
                              maximumFractionDigits: 1,
                            })}
                        <small>°C</small>
                      </strong>
                    </div>
                    <div className="pg-heat__gauge">
                      <div
                        aria-label={`Temperature ${
                          temperature == null ? "unavailable" : `${heatFill}°C`
                        } of 100°C scale`}
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={heatFill}
                        className="pg-heat__track"
                        role="meter"
                      >
                        <span
                          style={{
                            width: `${heatFill}%`,
                            backgroundSize: heatFill
                              ? `${10000 / heatFill}% 100%`
                              : undefined,
                          }}
                        />
                        <i aria-hidden="true" />
                      </div>
                      <div className="pg-heat__scale" aria-hidden="true">
                        <span>0°</span>
                        <span>60°</span>
                        <span>100°</span>
                      </div>
                      <em>Critical threshold: &gt;60°C</em>
                    </div>
                  </article>
                </div>
              </div>
            </>
          ) : (
            <div className="pg-no-device">
              No monitoring hardware has been provisioned for this household.
            </div>
          )}
        </section>

        <section className="pg-history" aria-labelledby="history-title">
          <div className="pg-section-heading">
            <div>
              <span>Event log</span>
              <h2 id="history-title">Alert History</h2>
            </div>
            <strong
              className={`pg-active-badge${
                snapshot.unresolvedAlertCount ? " is-live" : ""
              }`}
            >
              <i aria-hidden="true" />
              {snapshot.unresolvedAlertCount} active
            </strong>
          </div>
          <div
            aria-label="Alert history feed"
            className="pg-history-list"
            role="region"
            tabIndex={0}
          >
            {history.length ? (
              history.map((event) => (
                <article
                  className={`pg-history-item pg-history-item--${event.severity} pg-history-item--state-${event.state.toLowerCase()}`}
                  key={event.id}
                >
                  <span className="pg-history-item__rail">
                    {event.severity === "normal" ? (
                      <CheckIcon />
                    ) : event.severity === "warning" ? (
                      <AlertIcon size={18} />
                    ) : (
                      <CloseIcon />
                    )}
                  </span>
                  <div className="pg-history-item__card">
                    <div className="pg-history-item__meta">
                      <span
                        className={`pg-history-state pg-history-state--${event.state.toLowerCase()}`}
                      >
                        {event.state}
                      </span>
                      <time dateTime={event.timestamp}>
                        {formatDashboardTime(
                          event.timestamp,
                          snapshot.household.timezone,
                        )}
                      </time>
                    </div>
                    <h3>{event.title}</h3>
                    <p>{event.detail}</p>
                  </div>
                </article>
              ))
            ) : (
              <div className="pg-history-empty">
                <ShieldIcon />
                <strong>No alert history yet</strong>
                <span>New safety events will appear here automatically.</span>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
