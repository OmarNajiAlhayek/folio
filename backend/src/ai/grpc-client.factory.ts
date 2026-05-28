import { credentials, type ChannelCredentials } from '@grpc/grpc-js';
import { ClassifierServiceClient } from './grpc/gen/folio/ai/v1/classifier';
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

export function getClassifierGrpcClient(
  host: string,
  port: number,
): ClassifierServiceClient {
  const target = `${host}:${port}`;
  if (client && clientTarget === target) {
    return client;
  }
  if (client) {
    client.close();
    client = null;
  }
  clientTarget = target;
  client = new ClassifierServiceClient(
    target,
    credentials.createInsecure() as ChannelCredentials,
  );
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
  if (keywordClient) {
    keywordClient.close();
    keywordClient = null;
  }
  keywordClientTarget = target;
  keywordClient = new KeywordServiceClient(
    target,
    credentials.createInsecure() as ChannelCredentials,
  );
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
  if (plagiarismClient) {
    plagiarismClient.close();
    plagiarismClient = null;
  }
  plagiarismClientTarget = target;
  plagiarismClient = new PlagiarismServiceClient(
    target,
    credentials.createInsecure() as ChannelCredentials,
  );
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
  if (similarityClient) {
    similarityClient.close();
    similarityClient = null;
  }
  similarityClientTarget = target;
  similarityClient = new SimilarityServiceClient(
    target,
    credentials.createInsecure() as ChannelCredentials,
  );
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
  if (reviewerClient) {
    reviewerClient.close();
    reviewerClient = null;
  }
  reviewerClientTarget = target;
  reviewerClient = new ReviewerMatchingServiceClient(
    target,
    credentials.createInsecure() as ChannelCredentials,
  );
  return reviewerClient;
}

export function closeReviewerMatchingGrpcClient(): void {
  if (reviewerClient) {
    reviewerClient.close();
    reviewerClient = null;
    reviewerClientTarget = null;
  }
}

export function closeAiGrpcClients(): void {
  closeClassifierGrpcClient();
  closeKeywordGrpcClient();
  closePlagiarismGrpcClient();
  closeSimilarityGrpcClient();
  closeReviewerMatchingGrpcClient();
}
