import { useEffect, useMemo } from 'react'

export interface RegionZoneOptions {
  regions?: string[]
  zones?: string[]
  region_zones?: Record<string, string[]>
}

interface RegionZoneFilterProps {
  region: string
  zone: string
  options: RegionZoneOptions
  onRegionChange: (value: string) => void
  onZoneChange: (value: string) => void
  selectClassName?: string
  labelClassName?: string
  showLabels?: boolean
  regionPlaceholder?: string
  zonePlaceholder?: string
}

const defaultSelectClass = 'mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white'
const defaultLabelClass = 'block'

export default function RegionZoneFilter({
  region,
  zone,
  options,
  onRegionChange,
  onZoneChange,
  selectClassName = defaultSelectClass,
  labelClassName = defaultLabelClass,
  showLabels = true,
  regionPlaceholder = '全部大区',
  zonePlaceholder = '全部战区',
}: RegionZoneFilterProps) {
  const zoneOptions = useMemo(() => {
    if (!region) return options.zones || []
    return options.region_zones?.[region] || []
  }, [options.region_zones, options.zones, region])

  useEffect(() => {
    if (zone && !zoneOptions.includes(zone)) {
      onZoneChange('')
    }
  }, [onZoneChange, zone, zoneOptions])

  const handleRegionChange = (value: string) => {
    onRegionChange(value)
    onZoneChange('')
  }

  const labelTextClass = 'text-xs text-slate-500'
  const selectedZone = zone && zoneOptions.includes(zone) ? zone : ''

  return (
    <>
      <label className={labelClassName}>
        {showLabels && <span className={labelTextClass}>大区</span>}
        <select value={region} onChange={(event) => handleRegionChange(event.target.value)} className={selectClassName}>
          <option value="">{regionPlaceholder}</option>
          {(options.regions || []).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className={labelClassName}>
        {showLabels && <span className={labelTextClass}>战区</span>}
        <select value={selectedZone} onChange={(event) => onZoneChange(event.target.value)} className={selectClassName}>
          <option value="">{zonePlaceholder}</option>
          {zoneOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
    </>
  )
}
