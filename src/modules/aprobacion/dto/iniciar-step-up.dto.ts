import { IsString, IsNotEmpty } from 'class-validator';

export class IniciarStepUpDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}
