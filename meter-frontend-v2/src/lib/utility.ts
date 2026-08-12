// Kommunal turlar uchun YAGONA kanon manba — rang + o'zbekcha nom + birlik.
// Ilgari har sahifa o'z ranglarini/nomlarini ishlatardi (Dashboard/Analytics/DeviceDetail
// har xil edi). Endi hammasi shu yerdan oladi — izchillik va oson o'zgartirish uchun.

export type UtilityType =
  | 'electricity'
  | 'water'
  | 'gas'
  | 'soil'
  | 'air'
  | 'sound'
  | 'heating'

export const UTILITY_COLORS: Record<string, string> = {
  electricity: '#EAB308', // sariq
  water: '#06B6D4', // siyan
  gas: '#F97316', // to'q sariq
  soil: '#22C55E', // yashil
  air: '#10B981', // zumrad
  sound: '#A855F7', // binafsha
  heating: '#F43F5E', // qizil-pushti
}

export const UTILITY_LABELS: Record<string, string> = {
  electricity: 'Elektr',
  water: 'Suv',
  gas: 'Gaz',
  soil: "Yerto'la namligi",
  air: 'Havo sifati',
  sound: 'Ovoz',
  heating: 'Issiqlik',
}

export const UTILITY_UNITS: Record<string, string> = {
  electricity: 'V',
  water: 'bar',
  gas: 'bar',
  soil: '%',
  air: '%',
  sound: '%',
  heating: '°C',
}

export function utilityColor(type?: string | null): string {
  return (type && UTILITY_COLORS[type]) || '#94A3B8'
}

export function utilityLabel(type?: string | null): string {
  return (type && UTILITY_LABELS[type]) || type || '—'
}
