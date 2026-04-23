'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

interface AnimatedCounterProps {
  end: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  onComplete?: () => void;
}

export function AnimatedCounter({
  end,
  duration = 2,
  prefix = '',
  suffix = '',
  decimals = 0,
  onComplete
}: AnimatedCounterProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (!ref.current || isAnimating) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isAnimating) {
          setIsAnimating(true);
          
          const counter = { value: 0 };
          gsap.to(counter, {
            value: end,
            duration,
            ease: 'power2.out',
            onUpdate: () => {
              if (ref.current) {
                const formatted = counter.value.toFixed(decimals);
                ref.current.textContent = `${prefix}${formatted}${suffix}`;
              }
            },
            onComplete
          });
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [end, duration, prefix, suffix, decimals, isAnimating, onComplete]);

  return <div ref={ref} className="stat-number font-bold">{prefix}0{suffix}</div>;
}
