<script>
  let { title = '', description = '', class: klass = '', action, children } = $props();
</script>

<!-- Vega style: 1px border, generous padding, radius from the preset. -->
<section class="rounded-lg border border-border bg-card text-card-foreground {klass}">
  {#if title}
    <header class="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
      <div>
        <h2 class="font-heading text-[15px] font-semibold leading-none tracking-tight">{title}</h2>
        {#if description}
          <p class="mt-1.5 text-[13px] leading-snug text-muted-foreground">{description}</p>
        {/if}
      </div>
      {#if action}{@render action()}{/if}
    </header>
  {/if}
  <div class="px-6 {title ? 'pb-6' : 'py-6'}">
    {@render children?.()}
  </div>
</section>
