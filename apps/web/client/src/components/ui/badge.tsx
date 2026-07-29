import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider',
  {
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary',
        medium: 'bg-accent/15 text-accent',
        low: 'bg-muted text-faint',
        positive: 'bg-positive/15 text-positive',
        negative: 'bg-negative/15 text-negative',
        outline: 'border border-rule text-muted-foreground',
      },
      size: {
        default: 'px-2.5 py-1',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
}

export { Badge, badgeVariants }
