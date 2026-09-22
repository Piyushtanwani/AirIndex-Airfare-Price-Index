import React from 'react'
import { motion } from 'framer-motion'
import type { RouteData } from '../../types/map'
import { AIRPORT_MAP } from '../../data/airports'

interface FlightArcProps {
  route: RouteData
  projection: (coords: [number, number]) => [number, number] | null
  isHovered: boolean
  isSelected: boolean
  onHover: (route: RouteData | null, event?: React.MouseEvent) => void
  onClick: (route: RouteData) => void
}

export const FlightArc: React.FC<FlightArcProps> = ({
  route,
  projection,
  isHovered,
  isSelected,
  onHover,
  onClick,
}) => {
  const originApt = AIRPORT_MAP.get(route.origin)
  const destApt = AIRPORT_MAP.get(route.destination)

  if (!originApt || !destApt) return null

  const origXY = projection(originApt.coordinates)
  const destXY = projection(destApt.coordinates)

  if (!origXY || !destXY) return null

  const [x1, y1] = origXY
  const [x2, y2] = destXY

  // Calculate curved control point (bezier arc)
  const dx = x2 - x1
  const dy = y2 - y1
  
  // Offset control point perpendicular to line vector for a smooth arc
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const curvature = 0.25
  const cx = midX - dy * curvature
  const cy = midY + dx * curvature

  const pathD = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`

  // Determine line stroke color based on route status / inflation
  let strokeColor = '#2ED47A' // Green
  if (route.status === 'Hot') strokeColor = '#FF5A5F' // Red
  else if (route.status === 'Rising') strokeColor = '#FF9F43' // Orange
  else if (route.status === 'Stable') strokeColor = '#FFC107' // Yellow

  const strokeWidth = isHovered || isSelected ? 3.5 : 2
  const opacity = isHovered || isSelected ? 1 : 0.65

  return (
    <g
      className="cursor-pointer transition-all duration-300"
      onMouseEnter={(e) => onHover(route, e)}
      onMouseMove={(e) => onHover(route, e)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(route)}
    >
      {/* Outer interactive hit region for easy hover */}
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        strokeLinecap="round"
      />

      {/* Shadow / Glow line when hovered */}
      {(isHovered || isSelected) && (
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth={8}
          opacity={0.35}
          strokeLinecap="round"
          className="filter blur-[3px]"
        />
      )}

      {/* Base Flight Arc Line */}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeOpacity={opacity}
        strokeDasharray={isHovered ? 'none' : '6 4'}
        strokeLinecap="round"
      />

      {/* Animated Pulser Signal along the Arc */}
      <motion.circle
        r={isHovered ? 4 : 2.5}
        fill="#FFFFFF"
        filter={`drop-shadow(0 0 6px ${strokeColor})`}
        animate={{
          offsetDistance: ['0%', '100%'],
        }}
        transition={{
          duration: 3 + Math.random() * 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{
          offsetPath: `path('${pathD}')`,
        }}
      />
    </g>
  )
}
