import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { RoleInvitation } from '../entities/role-invitation.entity';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RbacModule } from '../rbac/rbac.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessagingModule } from '../messaging/messaging.module';
import { UsersController } from './users.controller';
import { RoleInvitationsController } from './role-invitations.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RoleInvitation]),
    RbacModule,
    NotificationsModule,
    MessagingModule,
  ],
  controllers: [UsersController, RoleInvitationsController],
  providers: [UsersService, PermissionsGuard],
  exports: [UsersService],
})
export class UsersModule {}
