<script>
  import { settings, live } from '../lib/store.svelte.js';
  import { startMic, stopMic, getDevices } from '../lib/controller.svelte.js';
  import Card from './ui/Card.svelte';
  import Button from './ui/Button.svelte';
  import Field from './ui/Field.svelte';
  import Select from './ui/Select.svelte';
  import Badge from './ui/Badge.svelte';

  let devices = $state([]);
  const refresh = async () => { try { devices = await getDevices(); } catch { devices = []; } };
  $effect(() => { refresh(); });

  const meters = $derived([
    { name: 'Low', v: live.level.low },
    { name: 'Mid', v: live.level.mid },
    { name: 'High', v: live.level.high },
    { name: 'Onset', v: Math.min(1, live.level.flux * 6) },
  ]);
</script>

<Card title="Audio input" description="What BeatSync listens to.">
  {#snippet action()}
    <Badge tone={live.micRunning ? 'on' : 'muted'}>
      {live.micRunning ? `${live.sampleRate} Hz` : 'stopped'}
    </Badge>
  {/snippet}

  <div class="grid gap-5">
    <Field label="Device" for="mic-device">
      <Select id="mic-device" bind:value={settings.audio.deviceId} disabled={live.micRunning}>
        <option value="">System default</option>
        {#each devices as d (d.deviceId)}
          <option value={d.deviceId}>{d.label || 'Input ' + d.deviceId.slice(0, 6)}</option>
        {/each}
      </Select>
    </Field>

    <div class="grid grid-cols-2 gap-4">
      <Field label="Sensitivity {settings.audio.gain.toFixed(1)}×" for="mic-gain">
        <input id="mic-gain" type="range" min="0.2" max="5" step="0.1"
               class="w-full accent-primary-bright" bind:value={settings.audio.gain} />
      </Field>
      <Field label="Noise gate {settings.audio.noiseFloor.toFixed(3)}" for="mic-floor">
        <input id="mic-floor" type="range" min="0" max="0.15" step="0.005"
               class="w-full accent-primary-bright" bind:value={settings.audio.noiseFloor} />
      </Field>
    </div>

    <div class="grid gap-2.5">
      {#each meters as m (m.name)}
        <div class="flex items-center gap-3">
          <span class="w-12 text-[12px] text-muted-foreground">{m.name}</span>
          <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <div class="h-full rounded-full bg-primary-bright transition-[width] duration-75"
                 style="width:{Math.min(100, m.v * 100)}%"></div>
          </div>
        </div>
      {/each}
    </div>

    <div class="flex gap-2">
      {#if live.micRunning}
        <Button variant="destructive" class="flex-1" onclick={stopMic}>Stop mic</Button>
      {:else}
        <Button class="flex-1" onclick={() => startMic().then(refresh)}>Start mic</Button>
      {/if}
      <Button variant="outline" onclick={refresh}>Refresh devices</Button>
    </div>

    <p class="text-[12px] leading-relaxed text-muted-foreground">
      A line feed or virtual audio cable is far steadier than room mic — a mic also
      hears applause and talking.
    </p>
  </div>
</Card>
