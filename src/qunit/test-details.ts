export interface QUnitDetailsAssertions {
  result: boolean;
}

export interface QUnitDetails {
  module: string;
  name: string;
  total: number;
  passed: number;
  failed: number;
  skipped: string;
  todo: boolean;
  runtime: number;
  totalTests: number;
  result: boolean;
  message: string;
  assertions: QUnitDetailsAssertions[];
  testId: string;
  source: string;
  actual: string;
  expected: string;
}
