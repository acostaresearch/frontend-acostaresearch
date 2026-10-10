import { Component, input, Signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DecimalPipe } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { BibliografiaAdmin } from './bibliografia';

@Component({
  selector: 'app-corpus-vista',
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule],
  templateUrl: './corpus-vista.html',
  styleUrl: './corpus-vista.css',
})
export class CorpusVista {
  readonly bibliografia = input.required<BibliografiaAdmin>();
}
