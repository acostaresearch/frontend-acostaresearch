import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Valida que dos controles coincidan y marca el error en el segundo, que es
 * donde el usuario espera verlo.
 */
export function matchFields(origen: string, confirmacion: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const control = group.get(origen);
    const control2 = group.get(confirmacion);
    if (!control || !control2) return null;

    if (control2.errors && !control2.errors['noCoincide']) {
      return null; // ya hay un error propio más específico
    }

    if (control.value !== control2.value) {
      control2.setErrors({ noCoincide: true });
      return { noCoincide: true };
    }

    control2.setErrors(null);
    return null;
  };
}
