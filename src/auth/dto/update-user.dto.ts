import { IsOptional, IsString, IsBoolean, IsIn } from 'class-validator';
import { VALID_ROLES } from '../schemas/user.schema';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  apellido?: string;

  @IsOptional()
  @IsIn([...VALID_ROLES])
  role?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
