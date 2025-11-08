import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PopupComponent } from './components/popup/popup.component';

@Component({
  selector: 'fg-root',
  standalone: true,
  imports: [PopupComponent],
  template: `<fg-popup />`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {}

