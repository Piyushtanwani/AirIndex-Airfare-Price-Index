import React from 'react'
import { motion } from 'framer-motion'

interface HotspotPulseProps {
  x: number
  y: number
  score: number // contribution score 0-100
  color: string
}

export const HotspotPulse: React.FC<HotspotPulseProps> = ({ x, y, score, color }) => {
  const baseRadius = 12 + (score / 100) * 16

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Concentric Pulse Ring 1 */}
      <motion.circle
        r={baseRadius}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        initial={{ r: baseRadius, opacity: 0.8 }}
        animate={{
          r: [baseRadius, baseRadius * 1.8, baseRadius * 2.5],
          opacity: [0.8, 0.3, 0],
        }}
        transition={{
          duration: 2.4,
          repeat: Infinity,
          ease: 'easeOut',
        }}
      />
      
      {/* Concentric Pulse Ring 2 (Staggered) */}
      <motion.circle
        r={baseRadius}
        fill="none"
        stroke={color}
        strokeWidth="1"
        initial={{ r: baseRadius, opacity: 0.6 }}
        animate={{
          r: [baseRadius, baseRadius * 1.5, baseRadius * 2.1],
          opacity: [0.6, 0.2, 0],
        }}
        transition={{
          duration: 2.4,
          delay: 0.8,
          repeat: Infinity,
          ease: 'easeOut',
        }}
      />

      {/* Center Ambient Glow */}
      <circle r={baseRadius * 0.7} fill={color} opacity={0.2} className="filter blur-[4px]" />
    </g>
  )
}
