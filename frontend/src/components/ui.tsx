'use client';

import React, { useId } from 'react';
import { cn } from '@/lib/cn';

/* ──────────────────────────────────────────────────────────────────────────────
 * Button
 * Usage:  <Button variant="primary" size="md">Click</Button>
 * ────────────────────────────────────────────────────────────────────────── */

const variants = {
  primary:
    'bg-violet-700 text-white shadow-sm hover:bg-violet-800 focus-visible:ring-violet-600',
  secondary:
    'border border-slate-200 bg-white text-slate-800 shadow-sm hover:bg-slate-50 focus-visible:ring-violet-600',
  danger:
    'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
  ghost:
    'bg-transparent text-slate-600 hover:bg-slate-100 focus-visible:ring-violet-600',
  success:
    'bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-500',
} as const;

const sizes = {
  sm: 'min-h-10 px-3 py-2 text-sm',
  md: 'min-h-11 px-4 py-2.5 text-sm',
  lg: 'min-h-12 px-6 py-3 text-base',
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors duration-150 motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

/* ──────────────────────────────────────────────────────────────────────────────
 * Card
 * ────────────────────────────────────────────────────────────────────────── */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: boolean;
}

export function Card({ className, padding = true, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'min-w-0 bg-white rounded-[20px] shadow-[0_2px_12px_rgba(23,27,43,0.04)] border border-slate-200',
        padding && 'p-5 sm:p-6',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Badge
 * ────────────────────────────────────────────────────────────────────────── */

const badgeVariants = {
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  neutral: 'bg-gray-100 text-gray-700',
} as const;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof badgeVariants;
}

export function Badge({ variant = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full leading-5',
        badgeVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Input
 * ────────────────────────────────────────────────────────────────────────── */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, id, 'aria-describedby': describedBy, 'aria-invalid': invalid, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    return (
    <div className="w-full">
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : invalid}
        aria-describedby={[describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined}
        className={cn(
          'min-h-11 w-full border rounded-xl bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-500 sm:text-sm',
          'focus:outline-none focus:ring-2 focus:ring-violet-600 focus:ring-offset-1 focus:border-violet-600',
          'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500',
          error ? 'border-red-400' : 'border-gray-300',
          className,
        )}
        {...props}
      />
      {error && <p id={errorId} role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
    );
  },
);
Input.displayName = 'Input';

/* ──────────────────────────────────────────────────────────────────────────────
 * Spinner
 * ────────────────────────────────────────────────────────────────────────── */

export function Spinner({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dim = { sm: 'h-5 w-5', md: 'h-8 w-8', lg: 'h-12 w-12' };
  return (
    <div
      className={cn('animate-spin motion-reduce:animate-none rounded-full border-[3px] border-violet-100 border-t-violet-700', dim[size], className)}
      role="status"
      aria-label="Жүктелуде"
    />
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * PageLoader – centered full-page spinner with optional text
 * ────────────────────────────────────────────────────────────────────────── */

export function PageLoader({ text = 'Жүктелуде...' }: { text?: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6" aria-busy="true">
      <div className="text-center">
        <Spinner size="lg" className="mx-auto mb-4" />
        <p className="text-slate-600 text-sm">{text}</p>
      </div>
    </div>
  );
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('rounded-xl bg-slate-100 animate-pulse motion-reduce:animate-none', className)} {...props} />;
}

export function EmptyState({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50/80 px-5 py-12 text-center">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {description && <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{description}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  );
}
