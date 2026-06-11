import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { RbacModule } from '../rbac/rbac.module';
import { MessagingModule } from '../messaging/messaging.module';
import { AuthChallenge } from '../entities/auth-challenge.entity';
import { RevokedToken } from '../entities/revoked-token.entity';
import { RefreshSession } from '../entities/refresh-session.entity';
import { OAuthIdentity } from '../entities/oauth-identity.entity';
import { AuthService } from './auth.service';
import { OrcidOAuthService } from './orcid-oauth.service';
import { OrcidAuthService } from './orcid-auth.service';
import { AuthController } from './auth.controller';
import { AuthChallengesService } from './auth-challenges.service';
import { RevokedTokensService } from './revoked-tokens.service';
import { RefreshSessionsService } from './refresh-sessions.service';
import { JwtStrategy } from './strategies/jwt.strategy';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      RevokedToken,
      RefreshSession,
      AuthChallenge,
      OAuthIdentity,
    ]),
    UsersModule,
    RbacModule,
    MessagingModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '15m',
        } as JwtModuleOptions['signOptions'],
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OrcidOAuthService,
    OrcidAuthService,
    AuthChallengesService,
    RevokedTokensService,
    RefreshSessionsService,
    JwtStrategy,
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
