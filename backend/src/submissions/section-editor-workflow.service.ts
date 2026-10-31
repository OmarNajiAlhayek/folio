import { Injectable } from '@nestjs/common';

/**
 * Papers are routed in `SubmissionRoutingService`, not here. The class stays
 * registered so modules and tests that still provide it keep compiling.
 */
@Injectable()
export class SectionEditorWorkflowService {}
