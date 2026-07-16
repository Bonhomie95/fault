/** The six dials that describe Orun City. All 0-100. */
export interface CityMetrics {
  crimeRate: number;
  judicialTrust: number;
  wealthDisparity: number;
  organizedCrimePower: number;
  policeIntegrity: number;
  mediaPressure: number;
}

export interface CityStateView extends CityMetrics {
  activeFactions: string[];
}

export const CITY_METRIC_KEYS = [
  'crimeRate',
  'judicialTrust',
  'wealthDisparity',
  'organizedCrimePower',
  'policeIntegrity',
  'mediaPressure',
] as const satisfies readonly (keyof CityMetrics)[];

export type CityMetricKey = (typeof CITY_METRIC_KEYS)[number];
