import { Observable, ReplaySubject, Subject, Subscription } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';
import { QUnitDetails } from './test-details';

interface QUnitStage {
  name: string;
  details: QUnitDetails;
}

export class ResettableSubject extends Subject<QUnitStage> {
  private modifierSubj = new Subject<QUnitStage>();
  private subscription: Subscription;
  private factoryResultSubj: Subject<QUnitStage>;
  private factoryFn: () => Subject<QUnitStage>;
  private value$: Observable<QUnitStage>;

  constructor(factoryFn: () => Subject<QUnitStage> = () => new ReplaySubject<QUnitStage>(1)) {
    super();

    this.factoryFn = factoryFn;
    this.factoryResultSubj = this.factoryFn();
    this.subscription = this.modifierSubj.subscribe(this.factoryResultSubj);
    this.value$ = this.pipe(
      startWith(undefined),
      switchMap(() => this.factoryResultSubj)
    );
  }

  asObservable(): Observable<QUnitStage> {
    return this.value$;
  }

  reset(): void {
    this.subscription.unsubscribe();
    this.next(undefined as any as QUnitStage);
    this.factoryResultSubj = this.factoryFn();
    this.subscription = this.modifierSubj.subscribe(this.factoryResultSubj);
  }

  next(value: QUnitStage): void {
    this.modifierSubj.next(value);
  }
}

export const QUNIT_SUBJECT = new ResettableSubject();
export const QUNIT_SUBJECT_OBSERVABLE = QUNIT_SUBJECT.asObservable();
