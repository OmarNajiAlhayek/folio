import { credentials } from '@grpc/grpc-js';
import { ClassifierServiceClient } from './grpc/gen/folio/ai/v1/classifier';
import { CopyeditServiceClient } from './grpc/gen/folio/ai/v1/copyedit';
import { KeywordServiceClient } from './grpc/gen/folio/ai/v1/keywords';
import { PlagiarismServiceClient } from './grpc/gen/folio/ai/v1/plagiarism';
import { ReviewerMatchingServiceClient } from './grpc/gen/folio/ai/v1/reviewer';
import { SimilarityServiceClient } from './grpc/gen/folio/ai/v1/similarity';

let client: ClassifierServiceClient | null = null;
let clientTarget: string | null = null;

let keywordClient: KeywordServiceClient | null = null;
let keywordClientTarget: string | null = null;

let plagiarismClient: PlagiarismServiceClient | null = null;
let plagiarismClientTarget: string | null = null;

let similarityClient: SimilarityServiceClient | null = null;
let similarityClientTarget: string | null = null;

let reviewerClient: ReviewerMatchingServiceClient | null = null;
let reviewerClientTarget: string | null = null;

let copyeditClient: CopyeditServiceClient | null = null;
let copyeditClientTarget: string | null = null;

export function getClassifierGrpcClient(
  host: string,
  port: number,
): ClassifierServiceClient {
  const target = `${host}:${port}`;
  if (client && clientTarget === target) {
    return client;
  }
  const prevClassifier = client;
  client = new ClassifierServiceClient(
    target,
    credentials.createInsecure() as ChannelCredentials,
  );
  clientTarget = target;
  prevClassifier?.close();
  return client;
}

export function getKeywordGrpcClient(
  host: string,
  port: number,
): KeywordServiceClient {
  const target = `${host}:${port}`;
  if (keywordClient && keywordClientTarget === target) {
    return keywordClient;
  }
  const prevKeyword = keywordClient;
  keywordClient = new KeywordServiceClient(
    target,
    credentials.createInsecure() as ChannelCredentials,
  );
  keywordClientTarget = target;
  prevKeyword?.close();
  return keywordClient;
}

export function getPlagiarismGrpcClient(
  host: string,
  port: number,
): PlagiarismServiceClient {
  const target = `${host}:${port}`;
  if (plagiarismClient && plagiarismClientTarget === target) {
    return plagiarismClient;
  }
  const prevPlagiarism = plagiarismClient;
  plagiarismClient = new PlagiarismServiceClient(
    target,
    credentials.createInsecure() as ChannelCredentials,
  );
  plagiarismClientTarget = target;
  prevPlagiarism?.close();
  return plagiarismClient;
}

export function closeClassifierGrpcClient(): void {
  if (client) {
    client.close();
    client = null;
    clientTarget = null;
  }
}

export function closeKeywordGrpcClient(): void {
  if (keywordClient) {
    keywordClient.close();
    keywordClient = null;
    keywordClientTarget = null;
  }
}

export function closePlagiarismGrpcClient(): void {
  if (plagiarismClient) {
    plagiarismClient.close();
    plagiarismClient = null;
    plagiarismClientTarget = null;
  }
}

export function getSimilarityGrpcClient(
  host: string,
  port: number,
): SimilarityServiceClient {
  const target = `${host}:${port}`;
  if (similarityClient && similarityClientTarget === target) {
    return similarityClient;
  }
  const prevSimilarity = similarityClient;
  similarityClient = new SimilarityServiceClient(
    target,
    credentials.createInsecure() as ChannelCredentials,
  );
  similarityClientTarget = target;
  prevSimilarity?.close();
  return similarityClient;
}

export function closeSimilarityGrpcClient(): void {
  if (similarityClient) {
    similarityClient.close();
    similarityClient = null;
    similarityClientTarget = null;
  }
}

export function getReviewerMatchingGrpcClient(
  host: string,
  port: number,
): ReviewerMatchingServiceClient {
  const target = `${host}:${port}`;
  if (reviewerClient && reviewerClientTarget === target) {
    return reviewerClient;
  }
  const prevReviewer = reviewerClient;
  reviewerClient = new ReviewerMatchingServiceClient(
    target,
    credentials.createInsecure() as ChannelCredentials,
  );
  reviewerClientTarget = target;
  prevReviewer?.close();
  return reviewerClient;
}

export function closeReviewerMatchingGrpcClient(): void {
  if (reviewerClient) {
    reviewerClient.close();
    reviewerClient = null;
    reviewerClientTarget = null;
  }
}

export function getCopyeditGrpcClient(
  host: string,
  port: number,
): CopyeditServiceClient {
  const target = `${host}:${port}`;
  if (copyeditClient && copyeditClientTarget === target) {
    return copyeditClient;
  }
  const prevCopyedit = copyeditClient;
  copyeditClient = new CopyeditServiceClient(
    target,
    credentials.createInsecure() as ChannelCredentials,
  );
  copyeditClientTarget = target;
  prevCopyedit?.close();
  return copyeditClient;
}

export function closeCopyeditGrpcClient(): void {
  if (copyeditClient) {
    copyeditClient.close();
    copyeditClient = null;
    copyeditClientTarget = null;
  }
}

export function closeAiGrpcClients(): void {
  closeClassifierGrpcClient();
  closeKeywordGrpcClient();
  closePlagiarismGrpcClient();
  closeSimilarityGrpcClient();
  closeReviewerMatchingGrpcClient();
  closeCopyeditGrpcClient();
}
