import type { DataSource } from 'typeorm';
import type { AiClientService } from '../ai/ai-client.service';
import type { RbacService } from '../rbac/rbac.service';
import type { SubmissionsService } from '../submissions/submissions.service';
import type { UsersService } from '../users/users.service';

/** Services the seed script resolves once from the Nest application context. */
export type SeedContext = {
  dataSource: DataSource;
  usersService: UsersService;
  rbacService: RbacService;
  submissionsService: SubmissionsService;
  aiClient: AiClientService;
};
