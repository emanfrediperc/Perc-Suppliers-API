import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret')!,
    });
  }

  async validate(payload: any) {
    // Los challenge tokens de login 2FA (scope 'pre-2fa') NO son access tokens:
    // sólo sirven en los endpoints de login/totp, nunca como Bearer.
    if (payload.scope === 'pre-2fa') {
      throw new UnauthorizedException();
    }
    const user = await this.userModel.findById(payload.sub);
    if (
      !user ||
      !user.activo ||
      payload.tokenVersion !== (user.tokenVersion ?? 0)
    ) {
      throw new UnauthorizedException();
    }
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
