import { useEffect, useState } from 'react'

interface AnimatedNumberProps {
  value: number
  decimals?: number
  duration?: number // in ms
  className?: string
  prefix?: string
  suffix?: string
}

export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 600,
  className = '',
  prefix = '',
  suffix = '',
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value)

  useEffect(() => {
    let startTimestamp: number | null = null
    const startValue = displayValue
    const endValue = value

    if (startValue === endValue) return

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp
      const progress = Math.min((timestamp - startTimestamp) / duration, 1)

      // Ease-out expo easing for smooth deceleration
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      const current = startValue + (endValue - startValue) * easeProgress

      setDisplayValue(current)

      if (progress < 1) {
        window.requestAnimationFrame(step)
      } else {
        setDisplayValue(endValue)
      }
    }

    const animationFrame = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [value, duration])

  const formatted = displayValue.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return (
    <span className={`inline-block transition-all ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  )
}
