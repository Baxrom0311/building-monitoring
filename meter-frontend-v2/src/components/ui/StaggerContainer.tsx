import { type ReactNode, Children } from 'react'

interface StaggerContainerProps {
  children: ReactNode
  className?: string
  staggerMs?: number
}

export function StaggerContainer({
  children,
  className = '',
  staggerMs = 40,
}: StaggerContainerProps) {
  const childrenArray = Children.toArray(children)

  return (
    <div className={className}>
      {childrenArray.map((child, index) => (
        <div
          key={index}
          className="animate-fade-in-up"
          style={{
            animationDelay: `${index * staggerMs}ms`,
            animationFillMode: 'both',
          }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}
