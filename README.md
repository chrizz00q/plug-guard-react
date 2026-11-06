# PlugGuard (React + PHP/MySQL on XAMPP)

```
plugguard-react/
├── src/                      React app (Vite)
├── backend/plugguard-api/    PHP API  ->  copy into C:\xampp\htdocs\
└── firmware/                 ESP32 + PZEM-004T + DS18B20, PlatformIO project (see firmware/README.md)
```

## 1. Set up the backend (XAMPP)

1. Start **Apache** and **MySQL** in the XAMPP control panel.
2. Copy the folder `backend/plugguard-api` into `C:\xampp\htdocs\` so you have `C:\xampp\htdocs\plugguard-api\index.php`.
3. Open http://localhost/phpmyadmin, choose **Import**, pick `backend/plugguard-api/lib/schema.sql`, and click Go.
   (This creates the `plugguard` database and its tables, including `hubs` and `sensor_channels`.)
   **Upgrading an existing database?** Import, in this order, `lib/migrate_pairing.sql` (if you never did), `lib/migrate_sensor_hubs.sql`, then `lib/migrate_v2.sql` (once each; all safe to repeat; written for XAMPP's MariaDB). Existing devices keep working.
4. Check http://localhost/plugguard-api/dashboard shows `{"error":"UNAUTHENTICATED"}`. That means PHP + Apache routing work.
5. **Check the whole backend in one go:** `C:\xampp\php\php.exe tools\selftest.php` creates a throw-away account, a fake hub and a few devices, exercises every rule (picking channels, taken/unavailable channels, "no sensor" reasons, overheat, probe swap, overpower, hub removal) and prints PASS/FAIL per check.
6. **Offline alerts without anything running:** schedule `tools\watchdog.php` every minute (the command is in the file's header) so a dead hub or a stopped router still raises a "Device Offline" alert.

Settings live in `lib/config.php`. Put your own values (database password, LAN origins, webhook URL, `require_https`) in **`lib/config.local.php`** (copy `config.local.php.example`): it overrides `config.php`, is not meant to be shared, and keeps secrets out of the main file. Do not leave the database on `root` with an empty password beyond your own PC: create a dedicated MySQL user with rights on `plugguard` only.

## 2. Run the React app

```sh
npm install
npm run dev        # http://localhost:3000
```

Vite forwards `/api/*` to Apache, so the browser sees one origin and login cookies just work.
Sign up in the app. Devices get their readings from **sensor channels** on a **sensor hub** (one ESP32 with several PZEM + DS18B20 pairs):

1. **Pair a hub once.** Tap **Pair a sensor hub** (in the Sensors panel, or from the notification below). A short **pairing code** appears; the hardware trades it for its own key, so there is nothing long to copy.
2. **Add devices.** Tap **+**, choose the appliance and room, then **pick the channel it is wired to**. Each channel shows its live power and temperature; switch the appliance on and the channel that reacts is marked "Load detected". The device is set up immediately on the channel you pick. A channel without a temperature probe can be picked but is flagged: that device has no overheat protection.
3. If nothing can be picked, a notification explains why and what to do: no hub paired, hub offline, PZEM not answering, or all channels in use.
4. Deleting a device frees its channel for the next one.
5. Anything coming from a hub running the firmware's simulation mode is marked **SIMULATED** everywhere (banner, hub badge, device badge) and never triggers the alert webhook.

### Alerts

| Alert | When | Severity |
| --- | --- | --- |
| Extreme Overheat Detected | above 60 C (clears at 55 C) | critical |
| Safety Cutoff Tripped | the hub's local relay cut a channel | critical |
| High Power Draw | above `overpower_watts` (default 3300 W, clears at 90%) | warning |
| Device Offline | no report for 90 s | warning |
| Power Sensor Not Responding | the channel's PZEM went silent | warning |
| Temperature Probe Not Responding | PZEM works but the DS18B20 does not: no overheat protection | warning |
| Temperature Probe Changed | a different DS18B20 appeared on the channel | warning |

Set `alert_webhook_url` (e.g. a private `https://ntfy.sh/your-secret-topic`) in `config.local.php` to also get new alerts on your phone, even with the dashboard closed.

## 3. Send readings (pretend to be the hardware)

From a terminal (XAMPP's PHP lives in `C:\xampp\php`). Pair with the code from **Pair a sensor hub**, exactly like the ESP32 does:

```sh
cd backend\plugguard-api\tools
C:\xampp\php\php.exe simulate.php pair K7QM-4XPD                      # hub with 5 channels, all with sensors
C:\xampp\php\php.exe simulate.php pair K7QM-4XPD --online=2           # only channels 1-2 have sensors: the 3rd device you add gets the "no sensor" notification
C:\xampp\php\php.exe simulate.php pair K7QM-4XPD --hot=2              # channel 2 overheats -> critical alert (once a device is on it)
```

It prints the ID and key it received; reconnect later with `php simulate.php <hardwareId> <setupKey> [--channels=5] [--online=5] [--hot=N] [--api=URL]`.
The dashboard updates within about 4 seconds. The real ESP32 firmware in `firmware/` follows the same two steps:

1. `POST /plugguard-api/provision` with `{"pairingCode":"K7QM-4XPD","hardwareId":"PG-A1B2C3D4E5F6"}` returns `{"ok":true,"hardwareId":"...","setupKey":"..."}` once.
2. `POST /plugguard-api/telemetry` with headers `X-Hardware-Id` and `X-Setup-Key` and one entry per channel (channels without sensors are still listed, with `"pzem":false,"temp":false`):

```json
{"channels":[
  {"ch":1,"pzem":true,"temp":true,"voltageV":220,"watts":850,"frequencyHz":60,"currentA":3.9,"energyKWh":1.2,"powerFactorPercent":93,"temperatureC":41.5},
  {"ch":2,"pzem":false,"temp":false}
]}
```

A report can also carry `"simulated":true`, a per-channel `"rom"` (DS18B20 ID) and `"tripped"`, and a `"backlog"` of readings the hub kept while it could not reach the server (each with its `ageS`).

The old flat format (`{"voltageV":220,...}`) is still accepted from devices that were paired one-ESP32-per-device before this update. It is deprecated: pair a hub and re-create those devices on channels when convenient, then the old path can be deleted.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register`, `/auth/login`, `/auth/logout` | accounts (PHP sessions, `password_hash`) |
| GET | `/dashboard` | everything the dashboard needs in one JSON snapshot |
| POST / DELETE | `/devices` | add on the picked `hubId` + `channel` (`201`; `409 CHANNEL_TAKEN`, `CHANNEL_UNAVAILABLE`, or `NO_SENSOR_AVAILABLE` with a `reason`) / delete (frees its channel) |
| POST | `/devices/pairing` | Re-pair an older single-sensor device |
| POST / DELETE | `/hubs` | pair a new sensor hub (returns a one-time pairing code) / remove one (`409 HUB_IN_USE` while devices use it) |
| POST | `/hubs/pairing` | Re-pair a hub: new pairing code, channels and devices kept |
| POST | `/provision` | hardware only: trades a pairing code for its key (single-use, rate-limited per IP) |
| POST | `/alerts/acknowledge` | acknowledge an open alert |
| POST | `/telemetry` | hardware ingest (setup-key auth), per-channel `{"channels":[...]}`; runs the alert rules above. Wrong keys are throttled per IP |

## Where to make changes

| What | File |
| --- | --- |
| Dashboard UI | `src/components/SafetyDashboard.tsx` |
| Add-device dialog, channel picker, hub panel | `src/components/AddDeviceDialog.tsx`, `src/components/sensors.tsx` |
| Shared icons and appliance catalog | `src/components/shared.tsx` |
| Login screen | `src/components/AuthPanel.tsx` |
| Colors / layout | `src/styles/*.css` |
| Frontend to API calls | `src/lib/api.ts` |
| Endpoints | `backend/plugguard-api/index.php` |
| Alert rules (thresholds), webhook | `backend/plugguard-api/lib/alerts.php`, `config.php` |
| Pairing code rules, expiry, attempt limit | `lib/pairing.php`, `lib/config.php` |
| Which channel a new device gets, "no sensor" reasons | `backend/plugguard-api/lib/hubs.php` |
| DB tables | `backend/plugguard-api/lib/schema.sql` |

## Options

- `VITE_USE_MOCK=true` in `.env` runs the old in-browser fake backend (no XAMPP needed).
- Apache elsewhere or a different folder name: set `BACKEND_URL` / `BACKEND_PATH` in `.env`.
- Tests: `npm run test:mock` checks the in-browser backend's channel rules; `php tools/selftest.php` checks the real PHP backend; `sh firmware/test_host/run.sh` checks the firmware logic. None of them replaces trying it on real hardware.
- Dev tunnel or LAN name for the Vite server: `ALLOWED_HOSTS=my-tunnel.trycloudflare.com` in `.env`.
- Security built in: passwords hashed with bcrypt, prepared statements everywhere, HttpOnly session cookie, pairing codes and device keys stored only as SHA-256 hashes (the key is handed to the hardware once and never shown), pairing codes single-use with a 30-minute expiry, readings time-stamped by the server, JSON-only POSTs (blocks cross-site form posts), failed logins and failed hub keys throttled per IP (HTTP 429), optional `require_https`.
- Still on you before this leaves your home network: serve it over HTTPS and set `require_https`, use a dedicated MySQL user with a password, change the hub setup Wi-Fi password (`PORTAL_AP_PASSWORD`), and keep Apache/PHP updated. Throttling is per IP, so behind a proxy or tunnel every visitor shares one IP: terminate HTTPS and rate-limit at the proxy as well.

## Not carried over from the Figma export

Google sign-in, browser push notifications (use the alert webhook instead), and households/invites (each account owns its own devices).
