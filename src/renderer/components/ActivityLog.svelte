<script>
  import { logs } from '../lib/store.svelte.js';
  import Card from './ui/Card.svelte';
  import Button from './ui/Button.svelte';

  const tone = {
    osc: 'text-primary-bright',
    beat: 'text-foreground',
    audio: 'text-muted-foreground',
    error: 'text-destructive',
  };
</script>

<Card title="Activity" description="Everything BeatSync sent or noticed, newest first.">
  {#snippet action()}
    <Button variant="outline" size="sm" onclick={() => (logs.items.length = 0)}>Clear</Button>
  {/snippet}

  <div class="max-h-[440px] overflow-y-auto font-mono text-[12px] leading-relaxed">
    {#each logs.items as l (l.id)}
      <div class="flex gap-3 border-b border-border/60 py-1.5 last:border-0">
        <span class="shrink-0 text-muted-foreground/60">{l.stamp}</span>
        <span class="w-10 shrink-0 {tone[l.kind] || 'text-muted-foreground'}">{l.kind}</span>
        <span class="text-foreground/85">{l.message}</span>
      </div>
    {/each}
    {#if logs.items.length === 0}
      <p class="py-10 text-center font-sans text-[13px] text-muted-foreground">Nothing logged yet.</p>
    {/if}
  </div>
</Card>
