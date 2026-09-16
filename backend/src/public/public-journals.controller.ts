import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EditorialBoardService } from '../journals/editorial-board.service';
import { JournalPortalService } from '../journals/journal-portal.service';
import { PublicationCatalogService } from '../submissions/publication-catalog.service';

/**
 * The public press: portal → journal → issue → article, plus each journal's
 * editorial board.
 *
 * Unauthenticated like the rest of `public/*`, and throttled the same way.
 * Article rows go through `toPublicationListItem` so a card here is identical
 * to one in the catalog.
 */
@ApiTags('public')
@Controller('public/journals')
@Throttle({ public: {} })
export class PublicJournalsController {
  constructor(
    private readonly portal: JournalPortalService,
    private readonly catalog: PublicationCatalogService,
    private readonly board: EditorialBoardService,
  ) {}

  @Get()
  listJournals() {
    return this.portal.listJournals();
  }

  @Get(':slug')
  getJournal(@Param('slug') slug: string) {
    return this.portal.getJournalBySlug(slug);
  }

  /** The page URL given to DOAJ as the journal's editorial board. */
  @Get(':slug/editorial-board')
  getEditorialBoard(@Param('slug') slug: string) {
    return this.board.listPublic(slug);
  }

  @Get(':slug/issues/:year/:number')
  async getIssue(
    @Param('slug') slug: string,
    @Param('year', ParseIntPipe) year: number,
    @Param('number', ParseIntPipe) number: number,
  ) {
    // Mirrors the database CHECK constraints, so a nonsense URL is a 400 here
    // rather than a wasted query.
    if (year < 1900 || year > 2200 || number < 1) {
      throw new BadRequestException({
        message: 'Invalid issue address',
        code: 'VALIDATION_ERROR',
      });
    }
    const { journal, issue, articles } = await this.portal.getIssue(
      slug,
      year,
      number,
    );
    return {
      journal,
      issue,
      articles: articles.map((s) => this.catalog.toPublicationListItem(s)),
    };
  }
}
