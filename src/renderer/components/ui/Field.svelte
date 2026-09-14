<script>
  let { label = '', hint = '', for: htmlFor = '', class: klass = '', children } = $props();
</script>

<div class="grid gap-2 {klass}">
  {#if label}
    <label class="text-[13px] font-medium leading-none" for={htmlFor}>{label}</label>
  {/if}
  {@render children?.()}
  {#if hint}
    <p class="text-[12px] leading-snug text-muted-foreground">{hint}</p>
  {/if}
</div>
