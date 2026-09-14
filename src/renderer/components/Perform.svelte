<script>
  import { settings, live } from '../lib/store.svelte.js';
  import { markDownbeat, relock, startMic, connectOsc, toggleArm } from '../lib/controller.svelte.js';
  import Button from './ui/Button.svelte';
  import FlagPennant from 'phosphor-svelte/lib/FlagPennant';
  import ArrowsClockwise from 'phosphor-svelte/lib/ArrowsClockwise';
  import Microphone from 'phosphor-svelte/lib/Microphone';
  import PlugsConnected from 'phosphor-svelte/lib/PlugsConnected';
  import Broadcast from 'phosphor-svelte/lib/Broadcast';
  import Stop from 'phosphor-svelte/lib/Stop';

  const beats = $derived(Array.from({ length: settings.tempo.beatsPerBar }, (_, i) => i));
  const ready = $derived(live.oscConnected && live.micRunning);
  const confPct = $derived(Math.round(live.confidence * 100));


  // What the next armed trigger will do, so the operator is never surprised.
  const upcoming = $derived.by(() => {
    if (!live.locked) return null;
    let best = null;
    for (const tr of settings.triggers) {
      if (!tr.enabled) continue;
      const every = Math.max(1, tr.everyBars | 0);
      const offset = tr.offsetBars | 0;
      let bars = 0;
      for (let n = 1; n <= 64; n++) {
        const bar = live.bar + n;
        const rel = bar - offset;
        if (rel >= 0 && rel % every === 0) { bars = n; break; }
      }
      if (!bars) continue;
      if (!best || bars < best.bars) best = { name: tr.name, layer: tr.layer, bars };
    }
    return best;
  });
  const armedLine = $derived.by(() => {
    const base = `Sending to ${live.oscTarget}`;
    if (!upcoming) return base;
    const n = upcoming.bars;
    return `${base} · next: ${upcoming.name} → layer ${upcoming.layer} in ${n} bar${n > 1 ? 's' : ''}`;
  });

</script>

<div class="mx-auto flex w-full max-w-[720px] flex-col items-center gap-8">
  <!-- Tempo: the one thing that has to read from across a dark room. -->
  <div class="relative flex flex-col items-center">
    <div class="relative flex size-[168px] items-center justify-center">
      <div class="absolute inset-0 rounded-full border border-border"></div>
      {#if live.micRunning}
        <!-- Keyed on the beat counter: each beat remounts the ring, which restarts
             the animation. Deriving the key straight from live.beatPulse avoids an
             effect that would read and write its own state. -->
        {#key live.beatPulse}
          <div class="beat-ring absolute inset-0 rounded-full border-2 border-primary-bright"></div>
        {/key}
      {/if}
      <div class="flex flex-col items-center">
        <span
          data-testid="bpm-value"
          class="font-mono text-[56px] font-semibold leading-none tabular-nums transition-colors
                 {live.locked ? 'text-primary-bright' : 'text-muted-foreground'}"
        >{live.bpm ? live.bpm.toFixed(1) : '--.-'}</span>
        <span class="mt-1 text-[11px] font-medium tracking-[0.18em] text-muted-foreground">BPM</span>
      </div>
    </div>

    <p data-testid="lock-status" class="mt-4 text-[13px] text-muted-foreground">
      {#if !live.micRunning}
        idle — mic is off
      {:else if live.locked}
        locked · bar {live.bar + 1} · beat {live.beatInBar + 1} · {confPct}% confidence
      {:else}
        acquiring tempo… {confPct}% confidence
      {/if}
    </p>
  </div>

  <!-- Beat position -->
  <div class="flex w-full max-w-[320px] gap-2">
    {#each beats as b (b)}
      <div
        class="h-1.5 flex-1 rounded-full transition-colors duration-75
               {live.micRunning && live.beatInBar === b
                 ? (b === 0 ? 'bg-primary-bright' : 'bg-muted-foreground')
                 : 'bg-secondary'}"
      ></div>
    {/each}
  </div>

  {#if ready}
    <!-- Arming is the single decision on this screen, so it gets the full width. -->
    <div class="flex w-full flex-col items-center gap-3">
      <Button
        variant={live.armed ? 'destructive' : 'default'}
        size="xl"
        class="w-full {live.armed ? 'armed-breathe' : ''}"
        onclick={toggleArm}
      >
        {#if live.armed}
          <Stop size={20} weight="fill" /> DISARM — stop driving Resolume
        {:else}
          <Broadcast size={20} weight="fill" /> ARM — start driving Resolume
        {/if}
      </Button>

      <p class="text-center text-[12px] text-muted-foreground">
        {live.armed ? armedLine : 'Nothing is sent automatically until you arm.'}
      </p>
    </div>

    <div class="flex w-full gap-2">
      <Button variant="outline" class="flex-1" onclick={markDownbeat} disabled={!live.micRunning}>
        <FlagPennant size={16} /> Set downbeat
      </Button>
      <Button variant="outline" class="flex-1" onclick={relock} disabled={!live.micRunning}>
        <ArrowsClockwise size={16} /> Re-lock tempo
      </Button>
    </div>
  {:else}
    <!-- Not ready: say exactly what is missing and fix it in one click. -->
    <div class="w-full rounded-lg border border-border bg-card p-6">
      <h3 class="font-heading text-[15px] font-semibold">Two things before you can arm</h3>
      <div class="mt-4 grid gap-3">
        <div class="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3">
          <span class="flex items-center gap-2.5 text-[13px]">
            <Microphone size={18} class={live.micRunning ? 'text-primary-bright' : 'text-muted-foreground'} />
            {live.micRunning ? `Listening — ${live.micLabel}` : 'Microphone is off'}
          </span>
          {#if !live.micRunning}
            <Button size="sm" onclick={startMic}>Start mic</Button>
          {/if}
        </div>
        <div class="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3">
          <span class="flex items-center gap-2.5 text-[13px]">
            <PlugsConnected size={18} class={live.oscConnected ? 'text-primary-bright' : 'text-muted-foreground'} />
            {live.oscConnected ? `OSC open → ${live.oscTarget}` : 'OSC socket is closed'}
          </span>
          {#if !live.oscConnected}
            <Button size="sm" onclick={connectOsc}>
              Open socket
            </Button>
          {/if}
        </div>
      </div>
      <p class="mt-4 text-[12px] leading-relaxed text-muted-foreground">
        OSC is one-way UDP — an open socket does not prove Resolume is listening.
        Use <span class="text-foreground">Test trigger</span> in Setup to confirm before you arm.
      </p>
    </div>
  {/if}

  {#if live.error}
    <p class="w-full rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
      {live.error}
    </p>
  {/if}
</div>
