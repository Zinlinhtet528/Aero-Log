export interface FaultItem {
  time: string;
  phase: string;
  ata: string;
  description: string;
}

export interface FailureItem {
  time: string;
  source: string;
  identifier: string;
  description: string;
}

export interface FlightReport {
  id: string; // Unique ID for the app
  aircraftId: string;
  date: string;
  flightNumber: string;
  cityPair: string;
  faults: FaultItem[];
  failures: FailureItem[];
  rawText?: string;
  timestamp: number; // When it was added to the app
}

export enum AppStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface ProcessedResult {
  report: FlightReport | null;
  error?: string;
}