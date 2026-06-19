import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { OAuthIdentity } from '../entities/oauth-identity.entity';
import { RoleInvitation } from '../entities/role-invitation.entity';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RbacModule } from '../rbac/rbac.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessagingModule } from '../messaging/messaging.module';
import { UsersController } from './users.controller';
import { RoleInvitationsController } from './role-invitations.controller';
import { UsersService } from './users.service';
import { EmailVerifiedGuard } from './email-verified.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, OAuthIdentity, RoleInvitation]),
    RbacModule,
    forwardRef(() => AuthModule),
    NotificationsModule,
    MessagingModule,
  ],
  controllers: [UsersController, RoleInvitationsController],
  providers: [UsersService, PermissionsGuard, EmailVerifiedGuard],
  exports: [UsersService, EmailVerifiedGuard],
})
export class UsersModule {}
