export type Team = 'A' | 'B';
export type Action = 'pick' | 'ban' | 'choose';

export interface Item {
  id: string;
  name: string;
  image?: string;
  tags?: Record<string, string>;
}

export type IconSize = 'small' | 'medium' | 'large';

export interface Pool {
  items: Item[];
  /** Size of the item icons everywhere this pool's items are shown (default medium). */
  iconSize?: IconSize;
  /** global: any pick or ban removes the item for everyone (default). shared: each team has its own pool; a pick removes it for that team only. exclusive: like shared, but a pick removes it for both teams. In both, a ban removes it from the opponent's options only. */
  scope?: 'global' | 'shared' | 'exclusive';
}

export interface Tagging {
  assignment: 'chosen' | 'fixed' | 'none';
  tag?: string;
  values?: string[];
  /** Optional https icon per tag value, shown wherever a value is chosen. */
  images?: Record<string, string>;
  sameTag?: 'allow' | 'forbid';
  /** Fixed assignment: tag value held by each seat. */
  seats?: Record<Team, string>;
}

export interface Step {
  team: Team;
  action: Action;
  /** Required for pick and ban. */
  pool?: string;
  /** Required for choose: the tag whose value the team picks. */
  tag?: string;
  count: number;
  /** Seconds. */
  timer?: number;
  /** Seconds of timed pause before each turn of the step, or 'ready' to wait for both captains before each turn. */
  pause?: number | 'ready';
  /** Item must match the tag value of the team that owns the choice (the opponent for a ban on a non-global pool). */
  restrict?: 'tag';
  /** Choice hidden from the opponent until `reveal`. */
  blind?: boolean;
  /** "end" or the index of the step after which a blind choice is shown. */
  reveal?: 'end' | number;
  /** The acting captain may also resolve each turn of the step with a random available item (pick and ban only). */
  random?: boolean;
}

export interface Preset {
  version: 1;
  name: string;
  tagging: Tagging;
  pools: Record<string, Pool>;
  steps: Step[];
  pauses: { between: boolean };
}

/** One atomic action: a preset step with `count` n expands to n turns. */
export interface Turn {
  team: Team;
  action: Action;
  /** Pool name for pick and ban, tag name for choose. */
  target: string;
  timer: number;
  pause?: number | 'ready';
  restrict?: 'tag';
  blind?: boolean;
  reveal?: 'end' | number;
  random?: boolean;
  /** Index of the preset step this turn came from. */
  step: number;
}

export interface Entry {
  /** Index of the turn this entry fulfils. */
  index: number;
  team: Team;
  action: Action;
  target: string;
  itemId: string;
  auto: boolean;
  /** The captain used the Random button; the item was drawn from the available ones. */
  random?: boolean;
  /** Uid of the browser that committed a manual pick. Auto-picks have none. */
  by?: string;
}