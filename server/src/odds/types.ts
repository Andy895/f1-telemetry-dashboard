/** One point of a driver's implied win probability: [ms since epoch, probability 0..1]. */
export type OddsPoint = [number, number];

/** Race-winner market prices for the drivers in the current session. */
export interface OddsBoard {
  source: 'kalshi' | 'polymarket';
  /** Market title, e.g. "Abu Dhabi Grand Prix Winner". */
  title: string;
  /** Link to the market page, shown as the source credit. */
  url: string;
  /** Price history per driver_number. */
  series: Record<string, OddsPoint[]>;
}

/** Everything a market source needs to provide. */
export interface OddsMarket {
  source: OddsBoard['source'];
  title: string;
  url: string;
  /** Market id per driver_number. */
  markets: Map<number, string>;
  /** Price history for one market over [from, to]. */
  history(marketId: string, from: number, to: number): Promise<OddsPoint[]>;
  /** Current price of every market, by market id. */
  current(): Promise<Map<string, number>>;
}

/** What we know about the race weekend to find its market. */
export interface MeetingInfo {
  name: string;
  year: number;
  /** Start of the main race, ms since epoch, if known. */
  raceStart: number | null;
}
