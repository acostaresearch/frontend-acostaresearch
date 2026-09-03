import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Marco visual compartido por las pantallas de autenticación. */
@Component({
  selector: 'app-auth-card',
  imports: [RouterLink],
  templateUrl: './auth-card.html',
  styleUrl: './auth-card.css',
})
export class AuthCard {
  readonly titulo = input.required<string>();
  readonly subtitulo = input<string>('');
}
