<script>
  // shadcn button semantics, written for Svelte 5 rather than pulled in from
  // React. Same variant names so the vocabulary stays familiar.
  let {
    variant = 'default',
    size = 'default',
    class: klass = '',
    children,
    ...rest
  } = $props();

  const base =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium ' +
    'transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 ' +
    'disabled:pointer-events-none disabled:opacity-45 ' +
    "[&_svg]:pointer-events-none [&_svg]:shrink-0";

  const variants = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    outline: 'border border-border bg-transparent hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm',
  };

  const sizes = {
    sm: 'h-8 px-3 text-[13px]',
    default: 'h-9 px-4 text-sm',
    lg: 'h-11 px-6 text-[15px]',
    xl: 'h-14 px-8 text-base',
    icon: 'size-9',
  };
</script>

<button class="{base} {variants[variant]} {sizes[size]} {klass}" {...rest}>
  {@render children?.()}
</button>
