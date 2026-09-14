<script>
  // Same content and structure as CUEVO Lyrics' donate tab, restyled to this
  // app's theme. Kept calm on purpose: BeatSync runs during a show, so a
  // donation page that pushes hard would feel out of place next to it.
  //
  // Fork note: everything specific to this project lives in this file --
  // the Saweria link, the QRIS name/NMID, and the contact list below.
  import Card from './ui/Card.svelte';
  import Button from './ui/Button.svelte';
  import qris from '../assets/qris.png';
  import Copy from 'phosphor-svelte/lib/Copy';
  import Check from 'phosphor-svelte/lib/Check';
  import ArrowSquareOut from 'phosphor-svelte/lib/ArrowSquareOut';
  import TiktokLogo from 'phosphor-svelte/lib/TiktokLogo';
  import InstagramLogo from 'phosphor-svelte/lib/InstagramLogo';
  import GithubLogo from 'phosphor-svelte/lib/GithubLogo';
  import EnvelopeSimple from 'phosphor-svelte/lib/EnvelopeSimple';

  const SAWERIA_URL = 'https://saweria.co/cuevo';
  const QRIS_NAME = 'Mocha Heree';
  const QRIS_NMID = 'NMID ID1026526607985';

  const CONTACTS = [
    { icon: TiktokLogo, label: 'TikTok', handle: '@gevan.py', url: 'https://www.tiktok.com/@gevan.py' },
    { icon: InstagramLogo, label: 'Instagram', handle: '@gevan.py', url: 'https://www.instagram.com/gevan.py/' },
    { icon: GithubLogo, label: 'GitHub', handle: 'mochaheree', url: 'https://github.com/mochaheree' },
    { icon: EnvelopeSimple, label: 'Email', handle: 'putra.gevan00@gmail.com', url: 'mailto:putra.gevan00@gmail.com' },
  ];

  let copied = $state(false);
  let copyTimer;

  async function copyLink() {
    // Routed through the main process: the renderer's own clipboard API is
    // denied by the permission handler in src/main/index.cjs (it only grants
    // microphone access), so calling it directly here would silently do
    // nothing while the button still claimed success.
    const res = await window.api.copyText(SAWERIA_URL);
    if (!res.ok) return;
    copied = true;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied = false), 1500);
  }
</script>

<div class="mx-auto grid w-full max-w-[960px] gap-4">
  <Card title="Support CUEVO BeatSync">
    <div class="grid gap-3 text-[13px] leading-relaxed text-muted-foreground">
      <p>
        If you found this project helpful, consider supporting it with a
        donation. Any amount is appreciated and helps keep it maintained and
        improved.
      </p>
      <p>
        Looking for a custom app, tool, or have an idea you'd like built?
        Feel free to reach out — see contacts below.
      </p>
    </div>
  </Card>

  <div class="grid gap-4 md:grid-cols-2">
    <Card title="Saweria" description="Opens in your browser. Accepts QRIS, bank transfer, and most Indonesian e-wallets.">
      <div class="grid gap-3">
        <div class="rounded-md border border-border bg-secondary/40 px-3 py-2.5 font-mono text-[12px] text-foreground/85">
          {SAWERIA_URL}
        </div>
        <div class="flex gap-2">
          <Button onclick={() => window.open(SAWERIA_URL, '_blank')}>
            <ArrowSquareOut size={15} /> Open Saweria
          </Button>
          <Button variant="outline" onclick={copyLink}>
            {#if copied}
              <Check size={15} class="text-primary-bright" /> Copied
            {:else}
              <Copy size={15} /> Copy link
            {/if}
          </Button>
        </div>
      </div>
    </Card>

    <Card title="QRIS" description="Scan with DANA, GoPay, OVO, ShopeePay, LinkAja, or any banking app.">
      <div class="grid gap-3">
        <!-- White backing: a QR code needs bright/dark contrast to scan, and on
             this dark card a transparent background can fail a real scan. -->
        <div class="flex justify-center rounded-md bg-white p-3">
          <img src={qris} alt="QRIS payment code" width="230" height="230" class="block" />
        </div>
        <div>
          <p class="text-[13px] font-medium text-foreground">{QRIS_NAME}</p>
          <p class="font-mono text-[11px] text-muted-foreground">{QRIS_NMID}</p>
        </div>
      </div>
    </Card>
  </div>

  <Card title="Contact">
    <div class="flex flex-wrap gap-2">
      {#each CONTACTS as c (c.label)}
        <Button variant="outline" size="sm" onclick={() => window.open(c.url, '_blank')}>
          <c.icon size={14} /> {c.label} <span class="text-muted-foreground">{c.handle}</span>
        </Button>
      {/each}
    </div>
  </Card>
</div>
