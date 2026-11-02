import { CHANNELS, type Channel } from '../audio/engine';
import { MAX_PRESETS, MAX_PRESET_NAME, type SettingsStore } from '../app/settings';
import { SOURCE_MODES, type MusicPlayer, type SourceMode } from '../music/player';
import { STYLES, type StyleId } from '../music/styles';
import type { Track } from '../music/types';
import { $ } from './dom';
import { toast } from './toast';
import { mountSegmented } from './widgets';

const options = <T extends string>(table: Record<T, { name: string }>) => (Object.keys(table) as T[]).map(k => [k, table[k].name] as const);

/** Track details come from outside services, so links are only kept if they are plain web addresses. */
function safeLink(url: string | undefined, text: string): HTMLElement {
  if (!url || !/^https?:\/\//i.test(url)) {
    const span = document.createElement('span');
    span.textContent = text;
    return span;
  }
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = text;
  return a;
}

function creditLine(track: Track): HTMLElement {
  const li = document.createElement('li');
  li.append(safeLink(track.link, track.title), ` by ${track.artist}`);
  if (track.license) li.append(' · ', safeLink(track.licenseUrl, track.license));
  return li;
}

/** The Sound tab: music style and source, now playing, the ambient mixer and its presets, and credits. */
export function createSoundPanel(settings: SettingsStore, player: MusicPlayer, jamendoEnabled: boolean): () => void {
  const sourceOf = (): SourceMode => settings.value.sources[settings.value.style];
  const refreshers = [
    mountSegmented<StyleId>($('#segStyle'), options(STYLES), () => settings.value.style, style => settings.update({ style })),
    mountSegmented<SourceMode>($('#segSource'), options(SOURCE_MODES), sourceOf, mode => settings.update({ sources: { ...settings.value.sources, [settings.value.style]: mode } }))
  ];

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

  const title = $('#npTitle'), artist = $('#npArtist'), credit = $('#npCredit');
  const musicButton = $<HTMLButtonElement>('#btnMusic'), like = $<HTMLButtonElement>('#btnLike'), never = $<HTMLButtonElement>('#btnNever');
  const note = $('#musicNote');
  const renderNowPlaying = (): void => {
    const track = player.current;
    title.textContent = track?.title ?? (player.status === 'loading' ? 'Finding music…' : 'Music starts with the engine');
    artist.textContent = track?.artist ?? '';
    credit.replaceChildren(...(track?.license ? [safeLink(track.licenseUrl, track.license)] : []), ...(track?.link ? [track.license ? ' · ' : '', safeLink(track.link, 'More')] : []));
    musicButton.setAttribute('aria-label', settings.value.musicOn ? 'Pause music' : 'Play music');
    musicButton.querySelector('path')!.setAttribute('d', settings.value.musicOn ? 'M8 5v14M16 5v14' : 'M8 5v14l11-7z');
    const rateable = !!track && track.kind !== 'generated';
    like.disabled = never.disabled = !rateable;
    like.setAttribute('aria-pressed', String(player.liked));
    const wantsJamendo = sourceOf() === 'tracks' || sourceOf() === 'mix';
    note.hidden = jamendoEnabled || !wantsJamendo;
    note.textContent = 'Jamendo tracks need an API key (see the README), so local and generated music play instead.';
    $('#creditList').replaceChildren(...player.credits.map(creditLine));
  };

  musicButton.addEventListener('click', () => settings.update({ musicOn: !settings.value.musicOn }));
  $('#btnNext').addEventListener('click', () => player.next());
  like.addEventListener('click', () => player.toggleLike());
  never.addEventListener('click', () => player.ban());
  player.onChange(renderNowPlaying);

  const refresh = (): void => {
    for (const r of refreshers) r();
    for (const k of CHANNELS) sliders.get(k)!.value = String(settings.value.mix[k]);
    renderPresets();
    renderNowPlaying();
  };
  refresh();
  return refresh;
}
