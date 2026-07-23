# SkillSale Print Bridge

Android WebView APK that opens SkillSale staff UI and prints queue numbers to:

- **One TPS-80161** (thermal receipt, ESC/POS via `printer-lib`)
- **Zenpert 3R20** (label/sticker via `tscsdk`)

## Build APK

Open this folder in Android Studio, or:

```bash
./gradlew assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`

## Bridge API (`window.Android`)

| Method | Description |
|--------|-------------|
| `isPrintBridge()` | always `true` |
| `getSelectedPrinter()` | JSON `{name,mac,address,transport,type}` or `"null"` |
| `selectPrinter()` | open chooser: Bluetooth **or** Network IP |
| `setNetworkPrinter(ip)` | quick-save One over LAN (e.g. `192.168.8.20`) |
| `printQueueNumber(q)` | print queue; returns JSON `{code,message}` |

### Connection modes
- **Bluetooth** — Zenpert 3R20 or One paired over BT
- **Network / IP** — One TPS via Ethernet/Wi‑Fi (`DEVICE_TYPE_ETHERNET`), default IP `192.168.8.20`

## Notes

- Sideload only (not Play Store).
- Default URL: `https://order.skillsale.co/staff` (override prefs key `staff_url`).
- Vendor SDKs live in `app/libs/` (copied from Chaixi reference project).
