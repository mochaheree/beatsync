<script>
  import { settings, live } from '../lib/store.svelte.js';
  import { connectOsc, disconnectOsc, testClip, tapTempo } from '../lib/controller.svelte.js';
  import Card from './ui/Card.svelte';
  import Button from './ui/Button.svelte';
  import Field from './ui/Field.svelte';
  import Input from './ui/Input.svelte';
  import Badge from './ui/Badge.svelte';

  let testLayer = $state(1);
  let testClipNo = $state(1);
</script>

<Card title="Resolume" description="Where the OSC messages go.">
  {#snippet action()}
    <Badge tone={live.oscConnected ? 'on' : 'muted'}>
      {live.oscConnected ? live.oscTarget : 'closed'}
    </Badge>
  {/snippet}

  <div class="grid gap-5">
    <div class="grid grid-cols-[1fr_110px] gap-3">
      <Field label="Host" for="osc-host">
        <Input id="osc-host" bind:value={settings.osc.host} disabled={live.oscConnected} />
      </Field>
      <Field label="Port" for="osc-port">
        <Input id="osc-port" type="number" bind:value={settings.osc.port} disabled={live.oscConnected} />
      </Field>
    </div>

    <div class="flex gap-2">
      {#if live.oscConnected}
        <Button variant="destructive" class="flex-1" onclick={disconnectOsc}>Disconnect</Button>
      {:else}
        <Button class="flex-1" onclick={connectOsc}>Open OSC socket</Button>
      {/if}
      <Button variant="outline" onclick={tapTempo} disabled={!live.oscConnected}>Tap</Button>
    </div>

    <div class="rounded-md border border-border p-4">
      <p class="text-[13px] font-medium">Confirm Resolume is really listening</p>
      <p class="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        Enable OSC Input on port {settings.osc.port} in Resolume Preferences, then fire a clip
        you know has content. This works without arming.
      </p>
      <div class="mt-3 flex items-end gap-2">
        <Field label="Layer" for="test-layer" class="w-20">
          <Input id="test-layer" type="number" min="1" max="8" bind:value={testLayer} />
        </Field>
        <Field label="Clip" for="test-clip" class="w-20">
          <Input id="test-clip" type="number" min="1" max="64" bind:value={testClipNo} />
        </Field>
        <Button variant="secondary" onclick={() => testClip(testLayer, testClipNo)}
                disabled={!live.oscConnected}>Test trigger</Button>
      </div>
    </div>
  </div>
</Card>
