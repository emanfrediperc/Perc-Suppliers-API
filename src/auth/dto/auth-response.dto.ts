export class AuthResponseDto {
  access_token: string;
  user: {
    id: string;
    email: string;
    nombre: string;
    apellido: string;
    role: string;
    mustChangePassword: boolean;
  };
}
