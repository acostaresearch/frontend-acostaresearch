export type Role = 'USER' | 'EDITOR' | 'ADMIN';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: UserStatus;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

/** Respuesta de `POST /auth/register`. */
export interface RegisterResponse {
  /** El usuario aún no existe: nace al verificar el código. */
  email: string;
  /** false si el alta quedó guardada pero el correo con el código no salió. */
  emailSent: boolean;
}

/** Respuesta de `POST /auth/login`. El refresh token viaja en cookie, no aquí. */
export interface LoginResponse {
  user: User;
  accessToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}
