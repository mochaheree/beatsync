<script>
  let { checked = $bindable(false), label = '', hint = '', onchange } = $props();
</script>

<label class="flex cursor-pointer items-start gap-3">
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onclick={() => { checked = !checked; onchange?.(); }}
    class="mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent
           transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60
           {checked ? 'bg-primary-bright' : 'bg-secondary'}"
  >
    <span class="pointer-events-none block size-4 rounded-full bg-foreground shadow transition-transform
                 {checked ? 'translate-x-4' : 'translate-x-0.5'}"></span>
  </button>
  <span class="grid gap-1">
    <span class="text-[13px] font-medium leading-none">{label}</span>
    {#if hint}<span class="text-[12px] leading-snug text-muted-foreground">{hint}</span>{/if}
  </span>
</label>
