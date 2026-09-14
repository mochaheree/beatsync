<script>
  let { value = $bindable(), class: klass = '', children, ...rest } = $props();
</script>

<select
  bind:value
  class="h-9 w-full appearance-none rounded-md border border-input bg-transparent px-3 text-sm
         outline-none transition-[color,box-shadow]
         focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/60
         disabled:opacity-45 [&>option]:bg-popover [&>option]:text-popover-foreground {klass}"
  {...rest}
>
  {@render children?.()}
</select>
