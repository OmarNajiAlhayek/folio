import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from '../entities/permission.entity';
import { Role } from '../entities/role.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { UserRole } from '../entities/user-role.entity';
import { RbacService } from './rbac.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Permission, Role, RolePermission, UserRole]),
  ],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
