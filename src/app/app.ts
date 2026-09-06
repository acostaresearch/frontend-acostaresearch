import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Dialogo } from './shared/layout/dialogo';

@Component({
  imports: [Dialogo, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {}
