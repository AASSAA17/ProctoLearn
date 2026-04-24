/**
 * Heroicon-based navigation icon map.
 * Replaces emoji icons with proper SVG icons from @heroicons/react.
 */
import {
  HomeIcon,
  BookOpenIcon,
  ChartBarIcon,
  TrophyIcon,
  AcademicCapIcon,
  PuzzlePieceIcon,
  MagnifyingGlassIcon,
  Cog6ToothIcon,
  UserIcon,
  KeyIcon,
  ArrowRightStartOnRectangleIcon,
} from '@heroicons/react/24/outline';
import React from 'react';

const ICON_MAP: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  '🏠': HomeIcon,
  '📚': BookOpenIcon,
  '📊': ChartBarIcon,
  '🏆': TrophyIcon,
  '🎓': AcademicCapIcon,
  '🧩': PuzzlePieceIcon,
  '🔍': MagnifyingGlassIcon,
  '⚙️': Cog6ToothIcon,
  '👤': UserIcon,
  '🔑': KeyIcon,
  '🚪': ArrowRightStartOnRectangleIcon,
};

/**
 * Returns a Heroicon component for the given emoji key, or a fallback <span> with the emoji.
 * Usage:  <NavIcon icon="🏠" className="w-5 h-5" />
 */
export function NavIcon({ icon, className = 'w-5 h-5' }: { icon: string; className?: string }) {
  const IconComponent = ICON_MAP[icon];
  if (IconComponent) {
    return <IconComponent className={className} aria-hidden="true" />;
  }
  return <span className={className} role="img" aria-hidden="true">{icon}</span>;
}
