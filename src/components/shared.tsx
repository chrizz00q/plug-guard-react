import type { ReactNode } from "react"

type IconProps = {
  children: ReactNode
  size?: number
}

export function FilledIcon({ children, size = 20 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  )
}


export const AlertIcon = ({ size = 22 }: { size?: number }) => (
  <FilledIcon size={size}>
    <path d="M1.8 20.5h20.4L12 2.8 1.8 20.5Zm11.2-3h-2v-2h2v2Zm0-4h-2v-5h2v5Z" />
  </FilledIcon>
)

export const CheckIcon = () => (
  <FilledIcon size={18}>
    <path d="m9.6 17.4-5-5 1.9-1.9 3.1 3.1 7.9-7.9 1.9 1.9-9.8 9.8Z" />
  </FilledIcon>
)

export const CloseIcon = () => (
  <FilledIcon size={18}>
    <path d="M6.4 4.5 12 10.1l5.6-5.6 1.9 1.9-5.6 5.6 5.6 5.6-1.9 1.9-5.6-5.6-5.6 5.6-1.9-1.9 5.6-5.6-5.6-5.6 1.9-1.9Z" />
  </FilledIcon>
)


export const deviceCatalog = [
  {
    id: "bedroom-appliance",
    image: "/device-images/bedroom-appliance.webp",
    label: "Bedroom Appliance",
    keywords: ["bedroom", "heater", "humidifier", "purifier", "lamp", "fan"],
  },
  {
    id: "living-room-appliance",
    image: "/device-images/living-room-appliance.webp",
    label: "Living Room Appliance",
    keywords: ["living", "console", "television", "tv", "speaker", "soundbar"],
  },
  {
    id: "kitchen-appliance",
    image: "/device-images/kitchen-appliance.webp",
    label: "Kitchen Appliance",
    keywords: ["kitchen", "microwave", "fridge", "coffee", "blender", "cooker"],
  },
  {
    id: "air-conditioner",
    image: "/device-images/air-conditioner.webp",
    label: "Air Conditioner",
    keywords: ["air conditioner", "aircon", "a/c", "hvac"],
  },
  {
    id: "computer",
    image: "/device-images/computer.webp",
    label: "Computer",
    keywords: ["computer", "laptop", "desktop", "pc", "office"],
  },
  {
    id: "charging-port",
    image: "/device-images/charging-port.webp",
    label: "Charging Port",
    keywords: ["charging", "charger", "ev", "e-bike", "power bank"],
  },
] as const

export type DeviceCatalogID = typeof deviceCatalog[number]["id"]

// Resolve catalog artwork for a monitored device: exact label first, then
// keyword matches on the device name, then on its room.
export function findCatalogDevice(name: string, room?: string | null) {
  const words = (value: string) => ` ${value.toLowerCase().replace(/[^a-z0-9/]+/g, " ")} `
  const exact = deviceCatalog.find(
    ({ label }) => label.toLowerCase() === name.trim().toLowerCase(),
  )
  if (exact) return exact
  for (const source of [name, room ?? ""]) {
    const text = words(source)
    const match = deviceCatalog.find(({ keywords }) =>
      keywords.some((keyword) => text.includes(words(keyword))),
    )
    if (match) return match
  }
  return undefined
}

