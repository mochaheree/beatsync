<script>
  let { value = $bindable(), class: klass = '', ...rest } = $props();
</script>

<input
  bind:value
  class="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm
         transition-[color,box-shadow] outline-none placeholder:text-muted-foreground
         focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/60
         disabled:opacity-45 {klass}"
  {...rest}
/>
