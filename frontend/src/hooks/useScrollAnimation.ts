import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

type AnimationType = 'fadeInUp' | 'fadeInLeft' | 'fadeInRight' | 'scale' | 'slideInDown';

interface UseScrollAnimationProps {
  type?: AnimationType;
  duration?: number;
  delay?: number;
  threshold?: number;
  stagger?: number;
}

export const useScrollAnimation = ({
  type = 'fadeInUp',
  duration = 0.8,
  delay = 0,
  threshold = 0.1,
  stagger = 0
}: UseScrollAnimationProps = {}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const elements = ref.current.querySelectorAll('[data-animate]');
    if (elements.length === 0) return;

    const getAnimationProps = (animType: AnimationType): { from: Record<string, number>; duration: number; ease: string } => {
      const baseProps = { duration, ease: 'power3.out' };
      switch (animType) {
        case 'fadeInUp':
          return { ...baseProps, from: { y: 60, opacity: 0 } };
        case 'fadeInLeft':
          return { ...baseProps, from: { x: -60, opacity: 0 } };
        case 'fadeInRight':
          return { ...baseProps, from: { x: 60, opacity: 0 } };
        case 'scale':
          return { ...baseProps, from: { scale: 0.8, opacity: 0 } };
        case 'slideInDown':
          return { ...baseProps, from: { y: -40, opacity: 0 } };
        default:
          return { ...baseProps, from: { y: 60, opacity: 0 } };
      }
    };

    const animProps = getAnimationProps(type);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, index) => {
          if (entry.isIntersecting && !entry.target.classList.contains('animated')) {
            entry.target.classList.add('animated');
            gsap.fromTo(
              entry.target,
              animProps.from,
              {
                y: 0,
                x: 0,
                opacity: 1,
                duration,
                delay: delay + (stagger * index),
                ease: animProps.ease
              }
            );
          }
        });
      },
      { threshold }
    );

    elements.forEach((el) => observer.observe(el));

    return () => {
      elements.forEach((el) => observer.unobserve(el));
    };
  }, [type, duration, delay, threshold, stagger]);

  return ref;
};
