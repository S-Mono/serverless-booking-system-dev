export interface BusinessHoursRange {
  start: string
  end: string
}

export interface WeekdayBusinessHour {
  is_open: boolean
  start: string
  end: string
}

export interface ShopConfigData {
  holiday_weekdays: number[]
  closed_dates: string[]
  business_hours: BusinessHoursRange
  weekday_business_hours: WeekdayBusinessHour[]
  time_slot_interval: number
  tax_rate: number
}

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

export const DEFAULT_BUSINESS_HOURS: BusinessHoursRange = {
  start: '09:00',
  end: '19:00'
}

const DEFAULT_TIME_SLOT_INTERVAL = 30
const DEFAULT_TAX_RATE = 10

const normalizeTimeString = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return fallback

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return fallback
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export const normalizeBusinessHours = (value: unknown, fallback: BusinessHoursRange = DEFAULT_BUSINESS_HOURS): BusinessHoursRange => {
  const source = value as Partial<BusinessHoursRange> | null | undefined
  const start = normalizeTimeString(source?.start, fallback.start)
  const end = normalizeTimeString(source?.end, fallback.end)
  return { start, end }
}

const normalizeWeekdayEntry = (
  value: unknown,
  fallback: BusinessHoursRange,
  isOpenDefault: boolean
): WeekdayBusinessHour => {
  const source = value as Partial<WeekdayBusinessHour> | null | undefined
  return {
    is_open: typeof source?.is_open === 'boolean' ? source.is_open : isOpenDefault,
    start: normalizeTimeString(source?.start, fallback.start),
    end: normalizeTimeString(source?.end, fallback.end)
  }
}

export const getDefaultWeekdayBusinessHours = (
  businessHours: BusinessHoursRange = DEFAULT_BUSINESS_HOURS,
  holidayWeekdays: number[] = []
): WeekdayBusinessHour[] => {
  return WEEKDAY_LABELS.map((_, index) => ({
    is_open: !holidayWeekdays.includes(index),
    start: businessHours.start,
    end: businessHours.end
  }))
}

export const cloneWeekdayBusinessHours = (weekdayBusinessHours: WeekdayBusinessHour[]) => {
  return weekdayBusinessHours.map(day => ({ ...day }))
}

export const normalizeWeekdayBusinessHours = (
  value: unknown,
  fallback: BusinessHoursRange = DEFAULT_BUSINESS_HOURS,
  holidayWeekdays: number[] = []
): WeekdayBusinessHour[] => {
  const sourceArray = Array.isArray(value) ? value : null
  const sourceObject = !sourceArray && value && typeof value === 'object' ? value as Record<string, unknown> : null

  return WEEKDAY_LABELS.map((_, index) => {
    const source = sourceArray ? sourceArray[index] : sourceObject?.[String(index)]
    return normalizeWeekdayEntry(source, fallback, !holidayWeekdays.includes(index))
  })
}

export const deriveHolidayWeekdays = (weekdayBusinessHours: WeekdayBusinessHour[]) => {
  return weekdayBusinessHours.flatMap((day, index) => day.is_open ? [] : [index])
}

export const deriveBusinessHoursSummary = (
  weekdayBusinessHours: WeekdayBusinessHour[],
  fallback: BusinessHoursRange = DEFAULT_BUSINESS_HOURS
): BusinessHoursRange => {
  const openDays = weekdayBusinessHours.filter(day => day.is_open)
  if (openDays.length === 0) return normalizeBusinessHours(fallback)

  const startMinutes = openDays.map(day => timeStringToMinutes(day.start))
  const endMinutes = openDays.map(day => timeStringToMinutes(day.end))

  return {
    start: minutesToTimeString(Math.min(...startMinutes)),
    end: minutesToTimeString(Math.max(...endMinutes))
  }
}

export const normalizeShopConfig = (value: unknown): ShopConfigData => {
  const source = (value ?? {}) as Record<string, unknown>
  const fallbackBusinessHours = normalizeBusinessHours(source.business_hours)
  const weekdayBusinessHours = normalizeWeekdayBusinessHours(
    source.weekday_business_hours,
    fallbackBusinessHours,
    Array.isArray(source.holiday_weekdays) ? source.holiday_weekdays as number[] : []
  )

  return {
    holiday_weekdays: deriveHolidayWeekdays(weekdayBusinessHours),
    closed_dates: Array.isArray(source.closed_dates)
      ? source.closed_dates.filter((date): date is string => typeof date === 'string').sort()
      : [],
    business_hours: deriveBusinessHoursSummary(weekdayBusinessHours, fallbackBusinessHours),
    weekday_business_hours: cloneWeekdayBusinessHours(weekdayBusinessHours),
    time_slot_interval: typeof source.time_slot_interval === 'number' && source.time_slot_interval > 0
      ? source.time_slot_interval
      : DEFAULT_TIME_SLOT_INTERVAL,
    tax_rate: typeof source.tax_rate === 'number' ? source.tax_rate : DEFAULT_TAX_RATE
  }
}

export const getDefaultShopConfig = () => normalizeShopConfig({})

export const getDateKey = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export const timeStringToMinutes = (time: string) => {
  const normalized = normalizeTimeString(time, DEFAULT_BUSINESS_HOURS.start)
  const [hours, minutes] = normalized.split(':').map(Number)
  return (hours ?? 0) * 60 + (minutes ?? 0)
}

export const minutesToTimeString = (minutes: number) => {
  const normalizedMinutes = Math.max(0, Math.min(23 * 60 + 59, minutes))
  const hours = Math.floor(normalizedMinutes / 60)
  const remainder = normalizedMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export const applyTimeToDate = (date: Date, time: string) => {
  const result = new Date(date)
  const minutes = timeStringToMinutes(time)
  result.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return result
}

export const getBusinessHoursForDate = (
  config: Pick<ShopConfigData, 'closed_dates' | 'weekday_business_hours'>,
  date: Date
): BusinessHoursRange | null => {
  if (config.closed_dates.includes(getDateKey(date))) return null
  const dayConfig = config.weekday_business_hours[date.getDay()]
  if (!dayConfig || !dayConfig.is_open) return null
  return {
    start: dayConfig.start,
    end: dayConfig.end
  }
}

export const getTimelineHourBounds = (
  config: Pick<ShopConfigData, 'business_hours' | 'closed_dates' | 'weekday_business_hours'>,
  date: Date
) => {
  const hours = getBusinessHoursForDate(config, date) ?? config.business_hours
  const startMinutes = timeStringToMinutes(hours.start)
  const endMinutes = Math.max(startMinutes + 60, timeStringToMinutes(hours.end))

  return {
    startHour: Math.floor(startMinutes / 60),
    endHour: Math.ceil(endMinutes / 60)
  }
}
