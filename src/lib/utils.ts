import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Class joiner used by every shadcn component: clsx resolves conditionals,
 * tailwind-merge drops earlier utilities that a later one overrides, so a
 * caller's `className` always wins over a component's defaults.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
