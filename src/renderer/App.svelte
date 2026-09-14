<script>
  import { live, settings, persist } from './lib/store.svelte.js';
  import Perform from './components/Perform.svelte';
  import SetupAudio from './components/SetupAudio.svelte';
  import SetupResolume from './components/SetupResolume.svelte';
  import SetupTriggers from './components/SetupTriggers.svelte';
  import SetupSync from './components/SetupSync.svelte';
  import ActivityLog from './components/ActivityLog.svelte';
  import Donate from './components/Donate.svelte';
  import Microphone from 'phosphor-svelte/lib/Microphone';
  import MicrophoneSlash from 'phosphor-svelte/lib/MicrophoneSlash';
  import PlugsConnected from 'phosphor-svelte/lib/PlugsConnected';
  import Plugs from 'phosphor-svelte/lib/Plugs';
  import Broadcast from 'phosphor-svelte/lib/Broadcast';
  import Warning from 'phosphor-svelte/lib/Warning';
  import appIcon from '../../icon/app-icon.png';

  let tab = $state('perform');
  const tabs = [
    { id: 'perform', label: 'Perform' },
    { id: 'setup', label: 'Setup' },
    { id: 'activity', label: 'Activity' },
    { id: 'donate', label: 'Donate' },
  ];

  $effect(() => {
    const onUnload = () => persist();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  });
</script>

<div class="flex h-full flex-col">
  <!-- Doubles as the window title bar: 48px to match titleBarOverlay.height in
       src/main/index.cjs. -->
  <header class="drag-region flex h-12 shrink-0 items-center border-b border-border">
    <div class="titlebar-inner flex h-full items-center justify-between pr-4 pl-3">
    <div class="flex items-center gap-5">
      <div class="flex items-center gap-2.5">
        <img src={appIcon} alt="" class="size-[22px] rounded-[5px]" />
        <span class="font-heading text-[14px] tracking-tight">
          <span class="text-muted-foreground">CUEVO</span>
          <span class="font-semibold">BeatSync</span>
        </span>
      </div>

      <!-- Segmented control rather than underlined tabs: fewer pixels, reads as
           a mode switch, which is what it is. -->
      <nav class="no-drag flex gap-1 rounded-md bg-secondary p-1">
        {#each tabs as t (t.id)}
          <button
            class="rounded-sm px-3 py-1 text-[13px] font-medium transition-colors
                   {tab === t.id
                     ? 'bg-card text-foreground shadow-sm'
                     : 'text-muted-foreground hover:text-foreground'}"
            onclick={() => (tab = t.id)}
          >{t.label}</button>
        {/each}
      </nav>
    </div>

    <!-- Status never hides behind a tab: it is what you glance at mid-set. -->
    <div class="flex items-center gap-3.5 text-[12px]">
      {#if live.stalled}
        <span class="flex items-center gap-1.5 rounded-full border border-destructive/40
                     bg-destructive/15 px-2.5 py-1 text-destructive">
          <Warning size={13} weight="fill" /> frame loop stalled
        </span>
      {/if}

      <span class="flex items-center gap-1.5 {live.micRunning ? 'text-foreground' : 'text-muted-foreground'}">
        {#if live.micRunning}<Microphone size={14} />{:else}<MicrophoneSlash size={14} />{/if}
        mic
      </span>

      <span class="flex items-center gap-1.5 {live.oscConnected ? 'text-foreground' : 'text-muted-foreground'}">
        {#if live.oscConnected}<PlugsConnected size={14} />{:else}<Plugs size={14} />{/if}
        {live.oscTarget || `${settings.osc.host}:${settings.osc.port}`}
      </span>

      <span class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium
                   {live.armed
                     ? 'border-destructive/40 bg-destructive/15 text-destructive'
                     : 'border-border text-muted-foreground'}">
        <Broadcast size={13} weight={live.armed ? 'fill' : 'regular'} />
        {live.armed ? 'ARMED' : 'safe'}
      </span>

      <span class="font-mono tabular-nums {live.locked ? 'text-primary-bright' : 'text-muted-foreground'}">
        {live.bpm ? live.bpm.toFixed(1) : '--.-'}
      </span>
    </div>
    </div>
  </header>

  <main class="min-h-0 flex-1 overflow-y-auto px-5 py-6">
    {#if tab === 'perform'}
      <!-- The performance view is sparse on purpose; centring it keeps the
           tempo in the middle of the screen instead of hanging off the top. -->
      <div class="flex min-h-full items-center justify-center">
        <Perform />
      </div>
    {:else if tab === 'setup'}
      <div class="mx-auto grid w-full max-w-[960px] gap-4 md:grid-cols-2">
        <div class="grid content-start gap-4">
          <SetupAudio />
          <SetupResolume />
        </div>
        <div class="grid content-start gap-4">
          <SetupTriggers />
          <SetupSync />
        </div>
      </div>
    {:else if tab === 'activity'}
      <div class="mx-auto w-full max-w-[960px]">
        <ActivityLog />
      </div>
    {:else}
      <Donate />
    {/if}
  </main>
</div>
