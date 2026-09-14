<script>
  import { settings, persist, live } from '../lib/store.svelte.js';
  import { probeTempo } from '../lib/controller.svelte.js';
  import Card from './ui/Card.svelte';
  import Button from './ui/Button.svelte';
  import Field from './ui/Field.svelte';
  import Input from './ui/Input.svelte';
  import Toggle from './ui/Toggle.svelte';

  // What Resolume displayed for each probe, typed in by the operator.
  let seen = $state({ lo: null, mid: null, hi: null });

  const applyCalibration = () => {
    if (seen.lo == null || seen.hi == null) return;
    settings.sync.tempoMin = Number(seen.lo);
    settings.sync.tempoMax = Number(seen.hi);
    persist();
  };

  // If the mapping is linear, 0.5 must land halfway between the endpoints.
  const midExpected = $derived(
    seen.lo != null && seen.hi != null ? (Number(seen.lo) + Number(seen.hi)) / 2 : null);
  const midOff = $derived(
    midExpected != null && seen.mid != null ? Math.abs(Number(seen.mid) - midExpected) : null);

  const probes = [
    { v: 0, label: 'Send 0.00', key: 'lo', placeholder: 'min BPM' },
    { v: 0.5, label: 'Send 0.50', key: 'mid', placeholder: 'mid BPM' },
    { v: 1, label: 'Send 1.00', key: 'hi', placeholder: 'max BPM' },
  ];
</script>

<Card title="Tempo and timing" description="How the beat clock behaves.">
  <div class="grid gap-5">
    <div class="grid grid-cols-2 gap-4">
      <Field label="BPM range min" for="min-bpm">
        <Input id="min-bpm" type="number" min="40" max="200"
               bind:value={settings.tempo.minBpm} onblur={persist} />
      </Field>
      <Field label="BPM range max" for="max-bpm">
        <Input id="max-bpm" type="number" min="60" max="300"
               bind:value={settings.tempo.maxBpm} onblur={persist} />
      </Field>
      <p class="col-span-2 -mt-1 rounded-md border border-primary-bright/25
                bg-primary-bright/5 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
        <span class="text-foreground">Set this tightly — it is the single biggest
        thing you control.</span>
        It constrains the search, not just the final answer. Left wide, a track
        can read as 3/2 of its real tempo: 100 BPM shows as 133. Measured on the
        real app, a blind 80–160 gets 6 of 10 tempi right; a range of about
        ±12% around the material gets 10 of 10. If you are playing around
        {Math.round((settings.tempo.minBpm + settings.tempo.maxBpm) / 2)} BPM,
        something like {Math.round(((settings.tempo.minBpm + settings.tempo.maxBpm) / 2) * 0.88)}–{Math.round(((settings.tempo.minBpm + settings.tempo.maxBpm) / 2) * 1.12)} is right.
      </p>
      <Field label="Beats per bar" for="bpb">
        <Input id="bpb" type="number" min="2" max="8"
               bind:value={settings.tempo.beatsPerBar} onblur={persist} />
      </Field>
      <Field label="Latency trim (ms)" for="offset"
             hint="Negative fires earlier. Tune against the projector, not the waveform.">
        <Input id="offset" type="number" min="-200" max="200" step="5"
               bind:value={settings.tempo.offsetMs} onblur={persist} />
      </Field>
    </div>

    <Field label="Lock threshold {settings.tempo.minConfidence.toFixed(2)}" for="minconf"
           hint="Lower locks faster but on weaker evidence.">
      <input id="minconf" type="range" min="0.05" max="0.8" step="0.05"
             class="w-full accent-primary-bright" bind:value={settings.tempo.minConfidence} onchange={persist} />
    </Field>

    <div class="grid gap-3 border-t border-border pt-5">
      <Toggle bind:checked={settings.sync.pushTempo} onchange={persist}
              label="Push detected BPM to Resolume"
              hint="Uses the range calibrated below." />
      <Toggle bind:checked={settings.sync.resyncOnDownbeat} onchange={persist}
              label="Send resync every 8 bars" />
    </div>
  </div>
</Card>

<Card title="Tempo range calibration"
      description="Resolume's tempo parameter is normalised 0–1, not a BPM — sending a raw 128 lands at 500.">
  <div class="grid gap-4">
    <p class="text-[12px] leading-relaxed text-muted-foreground">
      Send each probe, read the BPM Resolume shows, type it in, then Apply.
    </p>

    <div class="grid gap-2">
      {#each probes as p (p.key)}
        <div class="grid grid-cols-[112px_1fr] items-center gap-3">
          <Button variant="outline" size="sm" onclick={() => probeTempo(p.v)}
                  disabled={!live.oscConnected}>{p.label}</Button>
          <Input placeholder="Resolume shows… {p.placeholder}" type="number" bind:value={seen[p.key]} />
        </div>
      {/each}
    </div>

    {#if midOff != null}
      <p class="rounded-md border px-3 py-2 text-[12px] leading-relaxed
                {midOff > 15
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : 'border-primary-bright/30 bg-primary-bright/10 text-primary-bright'}">
        {#if midOff > 15}
          0.50 landed {midOff.toFixed(0)} BPM from the linear midpoint ({midExpected.toFixed(0)}).
          The mapping is not linear, so pushed tempo will drift — turn tempo push off and
          drive Resolume with clip triggers instead.
        {:else}
          Mapping looks linear — 0.50 is within {midOff.toFixed(0)} BPM of {midExpected.toFixed(0)}.
        {/if}
      </p>
    {/if}

    <div class="flex items-end gap-3">
      <Field label="Range min" for="tmin" class="w-28">
        <Input id="tmin" type="number" bind:value={settings.sync.tempoMin} onblur={persist} />
      </Field>
      <Field label="Range max" for="tmax" class="w-28">
        <Input id="tmax" type="number" bind:value={settings.sync.tempoMax} onblur={persist} />
      </Field>
      <Button onclick={applyCalibration} disabled={seen.lo == null || seen.hi == null}>
        Apply probes
      </Button>
    </div>
  </div>
</Card>
