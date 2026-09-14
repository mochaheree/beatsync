<script>
  let { tone = 'muted', class: klass = '', children } = $props();

  const tones = {
    muted: 'border-border bg-secondary text-muted-foreground',
    on: 'border-primary-bright/30 bg-primary-bright/15 text-primary-bright',
    live: 'border-destructive/40 bg-destructive/15 text-destructive',
  };
</script>

<span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1
             text-[11px] font-medium tracking-wide {tones[tone]} {klass}">
  {@render children?.()}
</span>
