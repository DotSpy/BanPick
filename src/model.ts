export type Team = 'A' | 'B';
export type Action = 'pick' | 'ban' | 'choose';

export interface Item {
  id: string;
  name: string;
  image?: string;
  tags?: Record<string, string>;
}

export interface Pool {
  items: Item[];
}

export interface Tagging {
  assignment: 'chosen' | 'fixed' | 'none';
  tag?: string;
  values?: string[];
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
  /** Pick must match the team's assigned tag value. */
  restrict?: 'tag';
  /** Choice hidden from the opponent until `reveal`. */
  blind?: boolean;
  /** "end" or the index of the step after which a blind choice is shown. */
  reveal?: 'end' | number;
}

export interface Preset {
  version: 1;
  name: string;
  tagging: Tagging;
  pools: Record<string, Pool>;
  steps: Step[];
  pauses: { between: boolean };
}
