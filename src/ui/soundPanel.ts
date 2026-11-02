import { CHANNELS, type Channel } from '../audio/audioEngine';
import { MAX_PRESETS, MAX_PRESET_NAME, type SettingsStore } from '../app/settings';
import type { MusicPlayer } from '../music/player';
import { STYLES, type StyleId } from '../music/styles';
import { $ } from './dom';
import { toast } from './toast';
import { mountSegmented } from './widgets';

const options = <T extends string>(table: Record<T, { name: string }>) => (Object.keys(table) as T[]).map(k => [k, table[k].name] as const);

/** The Sound tab: music style, now playing, and the ambient mixer and its presets. */
export function createSoundPanel(settings: SettingsStore, player: MusicPlayer): () => void {
  const refreshStyle = mountSegmented<StyleId>($('#segStyle'), options(STYLES), () => settings.value.style, style => settings.update({ style }));

  const sliders = new Map<Channel, HTMLInputElement>();
  for (const row of document.querySelectorAll<HTMLElement>('.mix')) {
    const channel = row.dataset.mix as Channel;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.01';
    input.setAttribute('aria-label', `${row.textContent?.trim()} volume`);
    input.addEventListener('input', () => settings.update({ mix: { ...settings.value.mix, [channel]: Number(input.value) } }));
    row.appendChild(input);
    sliders.set(channel, input);
  }

  const presetList = $('#mixPresets');
  const renderPresets = (): void => {
    presetList.replaceChildren();
    for (const preset of settings.value.mixerPresets) {
      const load = document.createElement('button');
      load.textContent = preset.name;
      load.addEventListener('click', () => {
        settings.update({ mix: { ...preset.mix } });
        toast(`Mix "${preset.name}" loaded`);
      });
      const remove = document.createElement('button');
      remove.className = 'del';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Delete mix ${preset.name}`);
      remove.addEventListener('click', () => settings.update({ mixerPresets: settings.value.mixerPresets.filter(p => p !== preset) }));
      presetList.append(load, remove);
    }
  };
  $<HTMLFormElement>('#presetForm').addEventListener('submit', e => {
    e.preventDefault();
    const input = $<HTMLInputElement>('#presetName');
    const name = input.value.trim().slice(0, MAX_PRESET_NAME);
    if (!name) return;
    const others = settings.value.mixerPresets.filter(p => p.name !== name);
    if (others.length >= MAX_PRESETS) {
      toast(`Up to ${MAX_PRESETS} mixes; delete one first`);
      return;
    }
    settings.update({ mixerPresets: [...others, { name, mix: { ...settings.value.mix } }] });
    input.value = '';
    toast(`Mix "${name}" saved`);
  });

  const title = $('#npTitle'), detail = $('#npDetail'), musicButton = $<HTMLButtonElement>('#btnMusic');
  const renderNowPlaying = (): void => {
    title.textContent = `${STYLES[player.style].name} beats`;
    detail.textContent = `Variation ${player.variation} · ${!settings.value.musicOn ? 'switched off' : player.playing ? 'playing' : 'starts at your first tap'}`;
    musicButton.setAttribute('aria-label', settings.value.musicOn ? 'Pause music' : 'Play music');
    musicButton.querySelector('path')!.setAttribute('d', settings.value.musicOn ? 'M8 5v14M16 5v14' : 'M8 5v14l11-7z');
  };

  musicButton.addEventListener('click', () => settings.update({ musicOn: !settings.value.musicOn }));
  $('#btnNext').addEventListener('click', () => player.next());
  player.onChange(renderNowPlaying);

  const refresh = (): void => {
    refreshStyle();
    for (const k of CHANNELS) sliders.get(k)!.value = String(settings.value.mix[k]);
    renderPresets();
    renderNowPlaying();
  };
  refresh();
  return refresh;
}
