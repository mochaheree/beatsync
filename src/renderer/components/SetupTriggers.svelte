<script>
  import { settings, persist } from '../lib/store.svelte.js';
  import { testClip } from '../lib/controller.svelte.js';
  import Card from './ui/Card.svelte';
  import Button from './ui/Button.svelte';
  import Field from './ui/Field.svelte';
  import Input from './ui/Input.svelte';
  import Select from './ui/Select.svelte';
  import Plus from 'phosphor-svelte/lib/Plus';
  import Trash from 'phosphor-svelte/lib/Trash';

  const barOptions = [1, 2, 4, 8, 16, 32];

  function add() {
    settings.triggers.push({
      id: crypto.randomUUID(),
      enabled: true,
      name: `Trigger ${settings.triggers.length + 1}`,
      everyBars: 4, offsetBars: 0, layer: 1,
      mode: 'cycle', clip: 1, clipFrom: 1, clipTo: 4,
    });
    persist();
  }

  function remove(id) {
    const i = settings.triggers.findIndex((t) => t.id === id);
    if (i >= 0) settings.triggers.splice(i, 1);
    persist();
  }

  // A one-line restatement of the form below it, so a rule can be read without
  // parsing four separate fields.
  const summary = (tr) => {
    const what = tr.mode === 'fixed'
      ? `clip ${tr.clip}`
      : `clips ${Math.min(tr.clipFrom, tr.clipTo)}–${Math.max(tr.clipFrom, tr.clipTo)} ${tr.mode}`;
    return `every ${tr.everyBars} bar${tr.everyBars > 1 ? 's' : ''} → layer ${tr.layer}, ${what}`;
  };
</script>

<Card title="Triggers" description="What fires, and how often. Only runs while armed.">
  {#snippet action()}
    <Button variant="outline" size="sm" onclick={add}><Plus size={14} /> Add</Button>
  {/snippet}

  <div class="grid gap-3">
    {#each settings.triggers as tr (tr.id)}
      <div class="rounded-md border border-border p-4 transition-opacity {tr.enabled ? '' : 'opacity-55'}">
        <div class="flex items-center gap-3">
          <input type="checkbox" class="size-4 accent-primary-bright" bind:checked={tr.enabled} onchange={persist} />
          <Input class="h-8 flex-1" bind:value={tr.name} onblur={persist} />
          <Button variant="ghost" size="sm"
                  onclick={() => testClip(tr.layer, tr.mode === 'fixed' ? tr.clip : tr.clipFrom)}>
            Test
          </Button>
          <Button variant="ghost" size="icon" class="size-8 text-muted-foreground hover:text-destructive"
                  onclick={() => remove(tr.id)} aria-label="Delete trigger">
            <Trash size={15} />
          </Button>
        </div>

        <p class="mt-2 ml-7 text-[12px] text-muted-foreground">{summary(tr)}</p>

        <div class="mt-4 grid grid-cols-4 gap-3">
          <Field label="Every" for="every-{tr.id}">
            <Select id="every-{tr.id}" bind:value={tr.everyBars} onchange={persist}>
              {#each barOptions as b (b)}<option value={b}>{b} bar{b > 1 ? 's' : ''}</option>{/each}
            </Select>
          </Field>
          <Field label="Offset" for="offset-{tr.id}">
            <Input id="offset-{tr.id}" type="number" min="0" bind:value={tr.offsetBars} onblur={persist} />
          </Field>
          <Field label="Layer" for="layer-{tr.id}">
            <Input id="layer-{tr.id}" type="number" min="1" max="8" bind:value={tr.layer} onblur={persist} />
          </Field>
          <Field label="Mode" for="mode-{tr.id}">
            <Select id="mode-{tr.id}" bind:value={tr.mode} onchange={persist}>
              <option value="fixed">Fixed</option>
              <option value="cycle">Cycle</option>
              <option value="random">Random</option>
            </Select>
          </Field>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-3">
          {#if tr.mode === 'fixed'}
            <Field label="Clip" for="clip-{tr.id}" class="col-span-2">
              <Input id="clip-{tr.id}" type="number" min="1" bind:value={tr.clip} onblur={persist} />
            </Field>
          {:else}
            <Field label="Clip from" for="from-{tr.id}">
              <Input id="from-{tr.id}" type="number" min="1" bind:value={tr.clipFrom} onblur={persist} />
            </Field>
            <Field label="Clip to" for="to-{tr.id}">
              <Input id="to-{tr.id}" type="number" min="1" bind:value={tr.clipTo} onblur={persist} />
            </Field>
          {/if}
        </div>
      </div>
    {/each}

    {#if settings.triggers.length === 0}
      <p class="py-8 text-center text-[13px] text-muted-foreground">
        No triggers yet — add one to have BeatSync drive clips.
      </p>
    {/if}
  </div>
</Card>
