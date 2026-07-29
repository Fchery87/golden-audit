import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full border border-rule bg-transparent px-3 font-mono text-sm',
        'focus:outline-none focus:ring-2 focus:ring-ring',
        'placeholder:text-faint',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full border border-rule bg-transparent p-3 font-mono text-xs leading-relaxed',
        'focus:outline-none focus:ring-2 focus:ring-ring',
        'placeholder:text-faint',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>

export function Label({ className, ...props }: LabelProps) {
  return (
    <label
      className={cn('flex flex-col gap-2 font-serif text-base', className)}
      {...props}
    />
  )
}
