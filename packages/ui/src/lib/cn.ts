import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes so a caller's `className` always wins over a
 * component's defaults. Same helper every fleet service had its own copy of.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
