import React from 'react';
import { Crown, Ship, Car, Dog, Compass, Gem } from 'lucide-react';

export const AVAILABLE_TOKENS = [
  'Top Hat',
  'Battleship',
  'Race Car',
  'Scottie Dog',
  'Compass',
  'Diamond',
] as const;

export const TokenIcon: React.FC<{
  tokenName: string;
  color: string;
  size?: number;
}> = ({ tokenName, color, size = 16 }) => {
  const props = { size, strokeWidth: 2.2, style: { color } };
  switch (tokenName) {
    case 'Top Hat':
      return <Crown {...props} />;
    case 'Battleship':
      return <Ship {...props} />;
    case 'Race Car':
      return <Car {...props} />;
    case 'Scottie Dog':
      return <Dog {...props} />;
    case 'Compass':
      return <Compass {...props} />;
    case 'Diamond':
    default:
      return <Gem {...props} />;
  }
};

const PIP_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 25],
    [72, 25],
    [28, 50],
    [72, 50],
    [28, 75],
    [72, 75],
  ],
};

export const DieFace: React.FC<{ value: number; isDouble?: boolean; rolling?: boolean }> = ({
  value,
  isDouble = false,
  rolling = false,
}) => {
  const pips = PIP_POSITIONS[value] ?? PIP_POSITIONS[1];
  return (
    <div
      className={`relative w-12 h-12 rounded-lg bg-[#FDFBF7] border shadow-sm transition-transform duration-200 flex items-center justify-center ${
        isDouble ? 'border-amber-500 ring-2 ring-amber-400/40' : 'border-slate-300'
      } ${rolling ? 'scale-105 rotate-6' : 'scale-100 rotate-0'}`}
      aria-label={`Die showing ${value}`}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {pips.map(([cx, cy], idx) => (
          <circle
            key={idx}
            cx={cx}
            cy={cy}
            r={value === 1 ? 11 : 8.5}
            fill={value === 1 ? '#B91C1C' : '#1E293B'}
          />
        ))}
      </svg>
    </div>
  );
};
