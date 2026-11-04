import type { Preset } from '../model';
import { turnsOf } from '../turns';

export interface PreviewRow {
  n: number;
  team: string;
  text: string;
  timer: number;
}

/** Draft order shown in the builder; derived from the same expansion the engine uses. */
export function draftOrder(preset: Preset): PreviewRow[] {
  return turnsOf(preset).map((t, i) => {
    const flags = [t.restrict && `restricted by ${preset.tagging.tag}`, t.blind && 'blind', t.pause !== undefined && `pause ${t.pause}`]
      .filter(Boolean)
      .join(', ');
    return {
      n: i + 1,
      team: t.team,
      text: `${t.action} ${t.target}${flags ? ` (${flags})` : ''}`,
      timer: t.timer,
    };
  });
}
