import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '../../utils/cn';

/**
 * Button variants — OpenTrade primary interactive primitive.
 *
 * Per ADR-0011 the visual language is "restrained" — variants are tied to
 * semantic intent (primary action / secondary / destructive / etc.) rather
 * than arbitrary brand colours. Sizes follow the spacing scale: 32 / 40 / 48
 * px tall, which keeps the form rhythm consistent with `Input` and `Select`.
 *
 * Notable Web3 touch: the `focus-visible` ring uses the `--ring` token so it
 * feels at home in dark mode without an obnoxious glow.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium',
    'transition-colors duration-fast ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50',
    'select-none',
  ],
  {
    variants: {
      intent: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/90',
        outline:
          'border border-input bg-transparent text-foreground hover:bg-muted hover:text-foreground active:bg-muted/80',
        ghost: 'bg-transparent text-foreground hover:bg-muted active:bg-muted/80',
        danger: 'bg-danger text-danger-foreground hover:bg-danger/90 active:bg-danger/95',
      },
      size: {
        sm: 'h-8 gap-1.5 rounded-sm px-3 text-sm',
        md: 'h-10 gap-2 px-4 text-sm',
        lg: 'h-12 gap-2 px-6 text-base',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      intent: 'primary',
      size: 'md',
      fullWidth: false,
    },
  },
);

type ButtonBaseProps = {
  /** Render as the child component (e.g. `<Link>`) while keeping button styles. */
  asChild?: boolean;
  /** Icon rendered before the label (Lucide / SVG). */
  leadingIcon?: ReactNode;
  /** Icon rendered after the label. */
  trailingIcon?: ReactNode;
  /** Show a spinner and disable the button. */
  loading?: boolean;
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> &
  ButtonBaseProps;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    intent,
    size,
    fullWidth,
    asChild = false,
    leadingIcon,
    trailingIcon,
    loading = false,
    disabled,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  const isDisabled = disabled === true || loading;

  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ intent, size, fullWidth }), className)}
      disabled={isDisabled}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : leadingIcon}
      {children}
      {!loading && trailingIcon}
    </Comp>
  );
});

export { buttonVariants };
