export interface QUnitTestCase {
  name: string;
  testId: string;
}

export interface QUnitModule {
  name: string;
  moduleId: string;
  tests: QUnitTestCase[];
}
